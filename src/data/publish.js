// "Publish to portal": create (or top up) the hosted table/layer for a model, enable editor tracking,
// and save the model definition as a portal item so the app rediscovers it. Safe to run repeatedly.
import {CFG} from "../config.js";
import {req} from "./http.js";
import {toArcFields,editFieldsInfo} from "../engine/schema.js";
const S=CFG.PORTAL+"/sharing/rest",svcName=m=>"EUDR_Trace_"+m.id;
const adminUrl=u=>u.replace("/rest/services/","/rest/admin/services/");
const OID={name:"OBJECTID",type:"esriFieldTypeOID",alias:"OBJECTID",sqlType:"sqlTypeOther",nullable:false,editable:false,domain:null,defaultValue:null};
export async function folderId(){const d=await req(`${S}/content/users/${CFG.OWNER}`);const f=(d.folders||[]).find(x=>x.title===CFG.FOLDER);
  if(!f)throw new Error(`Portal folder "${CFG.FOLDER}" not found under ${CFG.OWNER}. Create it or sign in as ${CFG.OWNER}.`);return f.id}
async function findItem(title,type){const d=await req(S+"/search",{q:`title:"${title}" AND owner:${CFG.OWNER} AND type:"${type}"`,num:5});return d.results?.find(r=>r.title===title)||null}
const defn=(m,fields,simple=false)=>({name:svcName(m),type:m.storage==="layer"?"Feature Layer":"Table",displayField:m.title,description:m.name,defaultVisibility:true,isDataVersioned:false,hasAttachments:!!m.attachments,
  supportsRollbackOnFailureParameter:true,supportsAdvancedQueries:true,objectIdField:"OBJECTID",uniqueIdField:{name:"OBJECTID",isSystemMaintained:true},
  geometryType:m.storage==="layer"?{point:"esriGeometryPoint",line:"esriGeometryPolyline",polygon:"esriGeometryPolygon"}[m.geometry]:undefined,
  ...(m.storage==="layer"?{hasZ:false,hasM:false,...(simple?{}:{extent:{xmin:28.8,ymin:-3,xmax:31,ymax:-1,spatialReference:{wkid:4326}},drawingInfo:{renderer:{type:"simple",symbol:m.geometry==="polygon"?{type:"esriSFS",style:"esriSFSSolid",color:[47,143,104,90],outline:{type:"esriSLS",style:"esriSLSSolid",color:[47,143,104,255],width:1}}:m.geometry==="line"?{type:"esriSLS",style:"esriSLSSolid",color:[31,107,80,255],width:2}:{type:"esriSMS",style:"esriSMSCircle",color:[31,107,80,255],size:8}}}})}:{}),
  ...(m.tracking?{editFieldsInfo}:{}),fields:[OID,...fields]});
// The model definition lives on the service item itself (tags + description); no extra item type is needed.
const labelItem=(m,id)=>req(`${S}/content/users/${CFG.OWNER}/items/${id}/update`,{tags:`${CFG.TAG},${CFG.TAG}-model`,snippet:`EUDR traceability: ${m.name}`,description:JSON.stringify(m)},{post:true});
export async function publishModel(m,log=()=>{}){
  const folder=await folderId(),name=svcName(m),fields=toArcFields(m),key=m.storage==="layer"?"layers":"tables",pii=m.fields.some(f=>f.pii);
  let item=await findItem(name,"Feature Service"),created=false;
  if(!item){log(`Creating service ${name}…`);
    const c=await req(`${S}/content/users/${CFG.OWNER}/${folder}/createService`,{outputType:"featureService",createParameters:{name,serviceDescription:m.name,hasStaticData:false,maxRecordCount:2000,capabilities:"Query,Create,Update,Delete,Editing,Uploads",copyrightText:"NAEB",spatialReference:{wkid:4326},initialExtent:{xmin:28.8,ymin:-3,xmax:31,ymax:-1,spatialReference:{wkid:4326}},allowGeometryUpdates:true}},{post:true});
    if(!c.success)throw new Error("Service was not created.");item={id:c.itemId,url:c.serviceurl};created=true}
  const base=item.url.replace(/\/$/,""),url=base+"/0";let ex=null;try{ex=await req(url)}catch{}
  let added=[];
  if(!ex?.fields){ // brand new, or an earlier run stopped before the definition was added: (re)build it
    log(created?"Adding fields…":"Service exists but is empty — adding its definition…");
    try{await req(adminUrl(base)+"/addToDefinition",{addToDefinition:{[key]:[defn(m,fields)]}},{post:true})}
    catch(e){if(m.storage!=="layer")throw e;log(`First attempt refused (${e.message}). Retrying with a simpler layer definition…`);await req(adminUrl(base)+"/addToDefinition",{addToDefinition:{[key]:[defn(m,fields,true)]}},{post:true})}
    if(m.tracking)await req(adminUrl(base)+"/updateDefinition",{updateDefinition:{hasStaticData:false,editorTrackingInfo:{enableEditorTracking:true,enableOwnershipAccessControl:false,allowOthersToQuery:true,allowOthersToUpdate:true,allowOthersToDelete:false,allowAnonymousToUpdate:false,allowAnonymousToDelete:false}}},{post:true});
    ex=await req(url);added=fields.map(f=>f.name)}
  else{const have=new Set(ex.fields.map(f=>f.name));added=fields.filter(f=>!have.has(f.name)).map(f=>f.name);
    if(added.length){log(`Adding ${added.length} missing field(s)…`);await req(adminUrl(url)+"/addToDefinition",{addToDefinition:{fields:fields.filter(f=>added.includes(f.name))}},{post:true})}}
  await req(`${S}/content/users/${CFG.OWNER}/items/${item.id}/move`,{folder},{post:true}).catch(()=>{});
  if(pii)log("Not shared with the organisation: it holds personal data. Share it with a restricted group in the portal.");
  else await req(`${S}/content/users/${CFG.OWNER}/items/${item.id}/share`,{org:true,everyone:false},{post:true}).catch(e=>log("(could not share with the organisation: "+e.message+")"));
  await labelItem(m,item.id).then(()=>log("Labelled the service with its model definition."),e=>log("(could not label the item: "+e.message+")"));
  return{url,itemId:item.id,created,added}}
// Editors who are not the owner need update access: share the item with a group that has shared-update enabled.
export const shareWithGroup=(itemId,groupId)=>req(`${S}/content/users/${CFG.OWNER}/items/${itemId}/share`,{groups:groupId,org:true},{post:true});
// Finds published models: feature services titled EUDR_Trace_<model> owned by OWNER (visible to everyone they are shared with).
export async function discover(){
  const out={},parse=t=>{try{const j=JSON.parse(t);return j&&j.id&&j.fields?j:null}catch{return null}};
  for(const q of[`tags:${CFG.TAG}-model AND owner:${CFG.OWNER}`,`owner:${CFG.OWNER} AND type:"Feature Service" AND EUDR_Trace`]){
    try{const d=await req(S+"/search",{q,num:100});for(const it of d.results||[]){const m=/^EUDR_Trace_(.+)$/.exec(it.title||"");
      if(m&&it.url&&!out[m[1]])out[m[1]]={serviceUrl:it.url.replace(/\/$/,"")+"/0",itemId:it.id,model:parse(it.description)}}}catch{}}
  return out}
