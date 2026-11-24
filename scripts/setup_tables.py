"""Create the traceability tables in NAEB's portal from models/seed.json (or your own model JSON files).
Alternative to the in-app "Publish to portal" button, for when the browser route hits permission or CORS limits.
Safe to re-run: existing services are kept and only missing fields are added.

    pip install arcgis
    python scripts/setup_tables.py --user Coffee_Trace            # password is prompted
    python scripts/setup_tables.py --user Coffee_Trace --only exporter importer
"""
import argparse, getpass, json, pathlib
from arcgis.gis import GIS
from arcgis.features import FeatureLayerCollection

PORTAL, OWNER, FOLDER, TAG = "https://gis.naeb.gov.rw/portal", "Coffee_Trace", "Trace", "eudr-trace"
ARC = {"text": ("esriFieldTypeString", None), "longtext": ("esriFieldTypeString", 4000), "int": ("esriFieldTypeInteger", None),
       "decimal": ("esriFieldTypeDouble", None), "date": ("esriFieldTypeDate", None), "datetime": ("esriFieldTypeDate", None),
       "bool": ("esriFieldTypeSmallInteger", None), "choice": ("esriFieldTypeString", 50), "multichoice": ("esriFieldTypeString", 500),
       "link": ("esriFieldTypeString", 64)}
SQL = {"esriFieldTypeString": "sqlTypeNVarchar", "esriFieldTypeInteger": "sqlTypeInteger", "esriFieldTypeSmallInteger": "sqlTypeSmallInt",
       "esriFieldTypeDouble": "sqlTypeFloat", "esriFieldTypeDate": "sqlTypeTimestamp2"}
GEOM = {"point": "esriGeometryPoint", "line": "esriGeometryPolyline", "polygon": "esriGeometryPolygon"}

def domain(name, items):
    return {"type": "codedValue", "name": name[:60], "codedValues": [{"name": n, "code": c} for c, n in items]}

def field(name, alias, t, nullable=True, length=None, dom=None, default=None):
    d = {"name": name, "type": t, "alias": alias, "sqlType": SQL[t], "nullable": nullable, "editable": True, "domain": dom, "defaultValue": default}
    if t == "esriFieldTypeString": d["length"] = length or 255
    return d

def arc_fields(m):
    out = []
    for f in m["fields"]:
        if f["type"] == "file": continue
        t, ln = ARC[f["type"]]
        dom = domain(f"{m['id']}_{f['k']}", [(c["code"], c["label"]) for c in f["choices"]]) if f["type"] == "choice" else \
              domain(f"{m['id']}_{f['k']}", [(0, "No"), (1, "Yes")]) if f["type"] == "bool" else None
        out.append(field(f["k"], f.get("label", f["k"]), t, not f.get("req"), f.get("len") if f["type"] == "text" else ln, dom, f.get("default")))
    out += [field("data_source", "Data source", "esriFieldTypeString", True, 20, domain("data_source", [("live", "Live"), ("recorded", "Recorded"), ("indicative", "Indicative")]), "recorded"),
            field("is_deleted", "Deleted", "esriFieldTypeSmallInteger", default=0), field("deleted_by", "Deleted by", "esriFieldTypeString", length=80),
            field("deleted_at", "Deleted at", "esriFieldTypeDate")]
    if m.get("tracking", True):
        out += [field("created_user", "Created by", "esriFieldTypeString", length=128), field("created_date", "Created on", "esriFieldTypeDate"),
                field("last_edited_user", "Edited by", "esriFieldTypeString", length=128), field("last_edited_date", "Edited on", "esriFieldTypeDate")]
        for f in out[-4:]: f["editable"] = False
    return out

def definition(m, name):
    d = {"name": name, "type": "Feature Layer" if m["storage"] == "layer" else "Table", "displayField": m["title"], "description": m["name"],
         "objectIdField": "OBJECTID", "uniqueIdField": {"name": "OBJECTID", "isSystemMaintained": True}, "hasAttachments": bool(m.get("attachments")),
         "fields": [{"name": "OBJECTID", "type": "esriFieldTypeOID", "alias": "OBJECTID", "sqlType": "sqlTypeOther", "nullable": False, "editable": False, "domain": None, "defaultValue": None}] + arc_fields(m)}
    if m["storage"] == "layer":
        d["geometryType"] = GEOM[m["geometry"]]
        d["extent"] = {"xmin": 28.8, "ymin": -3, "xmax": 31, "ymax": -1, "spatialReference": {"wkid": 4326}}
    if m.get("tracking", True):
        d["editFieldsInfo"] = {"creationDateField": "created_date", "creatorField": "created_user", "editDateField": "last_edited_date", "editorField": "last_edited_user"}
    return d

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--user", default=OWNER); ap.add_argument("--models", default="models/seed.json"); ap.add_argument("--only", nargs="*")
    a = ap.parse_args()
    gis = GIS(PORTAL, a.user, getpass.getpass(f"Password for {a.user}: "))
    spec = json.load(open(a.models))
    if FOLDER not in [f["title"] for f in gis.users.me.folders]: gis.content.folders.create(FOLDER) if hasattr(gis.content, "folders") else gis.content.create_folder(FOLDER)
    for m in spec["models"] + spec.get("system", []):
        if a.only and m["id"] not in a.only: continue
        name = "EUDR_Trace_" + m["id"]
        found = gis.content.search(f'title:"{name}" AND owner:{OWNER}', item_type="Feature Service")
        if found:
            item = found[0]; lyr = (item.layers or item.tables)[0]; have = {f["name"] for f in lyr.properties.fields}
            missing = [f for f in arc_fields(m) if f["name"] not in have]
            if missing: lyr.manager.add_to_definition({"fields": missing})
            print(f"= {name}: exists, added {len(missing)} field(s)")
        else:
            item = gis.content.create_service(name, service_description=m["name"], has_static_data=False, folder=FOLDER, capabilities="Query,Create,Update,Delete,Editing,Uploads", wkid=4326)
            flc = FeatureLayerCollection.fromitem(item)
            flc.manager.add_to_definition({"layers" if m["storage"] == "layer" else "tables": [definition(m, name)]})
            if m.get("tracking", True):
                flc.manager.update_definition({"hasStaticData": False, "editorTrackingInfo": {"enableEditorTracking": True, "enableOwnershipAccessControl": False,
                    "allowOthersToQuery": True, "allowOthersToUpdate": True, "allowOthersToDelete": False, "allowAnonymousToUpdate": False, "allowAnonymousToDelete": False}})
            item.share(org=True); print(f"+ {name}: created")
        url = f"{item.url}/0"
        # The model definition is stored on the service item itself (this portal rejects the "JSON" item type).
        item.update({"tags": f"{TAG},{TAG}-model", "snippet": f"EUDR traceability: {m['name']}", "description": json.dumps(m)})
    print("Done. The web app finds the EUDR_Trace_* services automatically on next sign-in.")

if __name__ == "__main__": main()
