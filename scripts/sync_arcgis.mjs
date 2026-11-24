// One-way importer: ArcGIS farms + CWS -> Supabase. Run by .github/workflows/sync.yml.
// Only de-identified fields are copied. farmer_name, phone and national_id never leave ArcGIS.
// Required secrets: SUPABASE_URL, SUPABASE_SERVICE_KEY, ARCGIS_TOKEN (or ARCGIS_USER + ARCGIS_PASSWORD).
const SB = process.env.SUPABASE_URL?.replace(/\/$/, "");
const KEY = process.env.SUPABASE_SERVICE_KEY;
const PORTAL = process.env.PORTAL_URL || "https://gis.naeb.gov.rw/portal";
const CWS_URL = process.env.CWS_URL || "https://gis.naeb.gov.rw/server/rest/services/Hosted/Coffee_Washing_Station/FeatureServer/0";
const FARMS_ITEM = process.env.FARMS_ITEM_ID || "63a787f80563400fa9e46af7f006d714";
const DROP = new Set(["farmer_name", "national_id", "phone", "telephone", "f_email", "owner_name"]);
const FARM_FIELDS = ["plot_id", "farmer_id", "province", "cooperative_name", "land_acquisition", "land_dispute",
  "registered_to_farmer", "hires_workers", "worker_age_category", "station_id", "station_name", "district", "sector",
  "cell", "village", "area_ha", "trees_total", "farmer_prod_kg_2025", "prior_land_use", "first_planting_year",
  "last_planting_year", "coffee_species", "land_registered", "sale_channel", "overlaps_other_plot", "survey_date",
  "enumerator_id", "geometry_valid", "under16_hazardous_work", "workers_free_to_leave", "forced_labour_indicator"];
const STATION_FIELDS = ["globalid", "cws_name", "name_of_cw", "type_of_ownership", "type_of_ow", "province",
  "district", "sector", "cell", "village", "processing_capacity", "year_of_establishment", "year_of_es",
  "processing", "x_coordinate", "y_coordinate"];

const die = m => { console.error("✗ " + m); process.exit(1) };
if (!SB || !KEY) die("SUPABASE_URL and SUPABASE_SERVICE_KEY are required.");

async function arcToken() {
  if (process.env.ARCGIS_TOKEN) return process.env.ARCGIS_TOKEN;
  if (!process.env.ARCGIS_USER || !process.env.ARCGIS_PASSWORD) die("Set ARCGIS_TOKEN or ARCGIS_USER + ARCGIS_PASSWORD.");
  const p = new URLSearchParams({ username: process.env.ARCGIS_USER, password: process.env.ARCGIS_PASSWORD,
    client: "requestip", expiration: "1440", f: "json" });
  const d = await (await fetch(`${PORTAL}/sharing/rest/generateToken`, { method: "POST", body: p })).json();
  if (d.error) die("Portal sign-in failed: " + d.error.message);
  return d.token;
}

async function arc(path, params = {}, token, post = false) {
  const p = new URLSearchParams({ f: "json", token, ...params });
  const r = await fetch(path + (post ? "" : "?" + p), post
    ? { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: p } : {});
  if (!r.ok) throw new Error(`${path} answered HTTP ${r.status}`);
  const d = await r.json();
  if (d.error) throw new Error(`${path}: ${d.error.message || d.error}`);
  return d;
}

async function farmsUrl(token) {
  if (process.env.FARMS_URL) return process.env.FARMS_URL;
  const it = await arc(`${PORTAL}/sharing/rest/content/items/${FARMS_ITEM}`, {}, token);
  return /\/\d+$/.test(it.url) ? it.url : `${it.url}/0`;
}

async function readLayer(url, token) {
  const meta = await arc(url, {}, token);
  const out = [];
  for (let offset = 0; ; offset += 1000) {
    const d = await arc(url + "/query", { where: "1=1", outFields: "*", outSR: 4326, returnGeometry: true,
      resultOffset: offset, resultRecordCount: 1000 }, token);
    out.push(...d.features);
    if (!d.exceededTransferLimit && d.features.length < 1000) break;
  }
  return { meta, features: out };
}

const clean = (a, keep, extra = []) => {
  const o = {};
  for (const k of [...keep, ...extra]) if (a[k] !== undefined && !DROP.has(k)) o[k] = a[k];
  return o;
};
const keyOf = a => String(a.cws_uid || a.globalid || "").replace(/[{}]/g, "").toLowerCase();

async function db(path, init = {}) {
  const r = await fetch(`${SB}/rest/v1/${path}`, { ...init, headers: {
    apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", ...(init.headers ?? {}),
  } });
  if (!r.ok) throw new Error(`Supabase ${path}: ${r.status} ${(await r.text()).slice(0, 200)}`);
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}

async function replaceSource(table, rows) {
  await db(`${table}?active=eq.true`, { method: "PATCH", body: JSON.stringify({ active: false }) });
  for (let i = 0; i < rows.length; i += 250) {
    await db(table, { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(rows.slice(i, i + 250)) });
  }
}

const token = await arcToken();
try {
  const [f, s] = await Promise.all([readLayer(await farmsUrl(token), token), readLayer(CWS_URL, token)]);
  const fields = (f.meta.fields || []).map(x => x.name);
  const conv = process.env.CONVERSION_FIELD || fields.find(n => /conver/i.test(n)) || "";
  const farms = [], stations = [];
  for (const { attributes: a, geometry: g } of f.features) {
    if (a.plot_id == null || /\btest/i.test(a.farmer_name || "")) continue;
    farms.push({ plot_id: String(a.plot_id), attrs: clean(a, FARM_FIELDS, conv ? [conv] : []), geometry: g ?? null,
      active: true, seen_at: new Date().toISOString() });
  }
  for (const { attributes: a, geometry: g } of s.features) {
    const id = keyOf(a);
    if (!id) continue;
    stations.push({ cws_uid: id, attrs: clean(a, STATION_FIELDS), geometry: g ?? null,
      active: true, seen_at: new Date().toISOString() });
  }
  await replaceSource("source_farms", farms);
  await replaceSource("source_stations", stations);
  await db("source_meta", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ id: true, conv_field: conv || null, farm_meta: f.meta, station_meta: s.meta,
      synced_at: new Date().toISOString() }) });
  console.log(`✓ Synced ${farms.length} farms and ${stations.length} washing stations (no personal data).`);
} catch (e) {
  die(e.message);
}
