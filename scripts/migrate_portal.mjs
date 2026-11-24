// One-time migration: chain tables only (deliveries, lots, batches, exporters, importers, links).
// Real farms, farmers and CWS stay on the Portal and are not copied.
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_KEY, ARCGIS_TOKEN (or ARCGIS_USER + ARCGIS_PASSWORD).
import fs from "node:fs";
const SB=process.env.SUPABASE_URL?.replace(/\/$/,""),KEY=process.env.SUPABASE_SERVICE_KEY;
const PORTAL=process.env.PORTAL_URL||"https://gis.naeb.gov.rw/portal",OWNER=process.env.PORTAL_OWNER||"Coffee_Trace";
const {fromAttributes,toAttributes}=await import("../src/engine/schema.js");
const seed=JSON.parse(fs.readFileSync(new URL("../models/seed.json",import.meta.url)));
const BY_ID=Object.fromEntries([...seed.models,...seed.system].map(m=>[m.id,m]));
const CHAIN=new Set(["cherry_delivery","lot","lot_delivery","export_batch","batch_lot","exporter","importer"]);
const die=m=>{console.error("✗ "+m);process.exit(1)};
if(!SB||!KEY)die("SUPABASE_URL and SUPABASE_SERVICE_KEY are required.");

async function arc(path,p={}){
  const q=new URLSearchParams({f:"json",...p});
  if(q.get("token")==="")q.delete("token");
  const r=await fetch(path+"?"+q);if(!r.ok)throw new Error(`${path}: HTTP ${r.status}`);
  const d=await r.json();if(d.error)throw new Error(d.error.message||String(d.error));return d}
async function token(){
  if(process.env.ARCGIS_TOKEN)return process.env.ARCGIS_TOKEN;
  if(!process.env.ARCGIS_USER||!process.env.ARCGIS_PASSWORD)die("Set ARCGIS_TOKEN or ARCGIS_USER + ARCGIS_PASSWORD.");
  const p=new URLSearchParams({username:process.env.ARCGIS_USER,password:process.env.ARCGIS_PASSWORD,
    client:"requestip",expiration:"1440",f:"json"});
  const d=await(await fetch(`${PORTAL}/sharing/rest/generateToken`,{method:"POST",body:p})).json();
  if(d.error)die("Portal sign-in failed: "+d.error.message);return d.token}
const decode=t=>{try{const m=JSON.parse(t);return m?.id&&m?.fields?m:null}catch{return null}};
async function discover(tk){
  const out={};
  for(const q of[`tags:eudr-trace-model AND owner:${OWNER}`,`owner:${OWNER} AND type:"Feature Service" AND EUDR_Trace`]){
    let d;try{d=await arc(`${PORTAL}/sharing/rest/search`,{q,num:100,token:tk})}catch{continue}
    for(const it of d.results||[]){const m=/^EUDR_Trace_(.+)$/.exec(it.title||"");
      if(m&&it.url&&!out[m[1]])out[m[1]]={url:it.url.replace(/\/$/,"")+"/0",model:decode(it.description)||BY_ID[m[1]]||null}}
  }
  return out}
async function features(url,tk){
  const out=[];for(let o=0;;o+=1000){const d=await arc(url+"/query",{where:"1=1",outFields:"*",outSR:4326,
    returnGeometry:true,resultOffset:o,resultRecordCount:1000,token:tk});
    out.push(...d.features);if(!d.exceededTransferLimit&&d.features.length<1000)break}return out}
async function db(path,init={}){
  const r=await fetch(`${SB}/rest/v1/${path}`,{...init,headers:{apikey:KEY,Authorization:`Bearer ${KEY}`,
    "Content-Type":"application/json",...(init.headers||{})}});
  if(!r.ok)throw new Error(`Supabase ${path}: ${r.status} ${(await r.text()).slice(0,200)}`);
  const t=await r.text();return t?JSON.parse(t):null}
async function upsert(table,rows){
  for(let i=0;i<rows.length;i+=250)await db(table,{method:"POST",
    headers:{Prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify(rows.slice(i,i+250))})}

const tk=await token();
try{
  const found=await discover(tk),records=[];
  if(!Object.keys(found).length)die("No EUDR_Trace_* services were found under "+OWNER);
  for(const[id,svc]of Object.entries(found)){
    if(!CHAIN.has(id))continue;
    const m=svc.model;if(!m){console.log(`! ${id}: no model definition on the item and none in seed.json — skipped`);continue}
    const rows=await features(svc.url,tk);let kept=0;
    for(const f of rows){const a=f.attributes||{};const rawKey=a[m.key];
      if(rawKey==null||rawKey===""||a.is_deleted===1)continue;
      const rec=fromAttributes(m,a);delete rec._oid;
      const attrs=toAttributes(m,rec);
      records.push({model:id,rec_key:String(rawKey),attrs,
        data_source:rec.data_source||"recorded",
        created_user:rec.created_user||null,created_date:rec.created_date||null,
        last_edited_user:rec.last_edited_user||null,last_edited_date:rec.last_edited_date||null});
      kept++}
    console.log(`✓ ${id}: ${kept} row(s)`)}
  await upsert("records",records);
  console.log(`Done. ${records.length} chain record(s) migrated. Farm, farmer and CWS data stayed on the Portal.`);
}catch(e){die(e.message)}
