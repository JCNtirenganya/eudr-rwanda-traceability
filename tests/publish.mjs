// Run: node tests/publish.mjs — publish + discovery against an in-memory fake portal (no JSON items allowed)
import assert from "node:assert/strict";import fs from "node:fs";
const mem=()=>({_:{},getItem(k){return this._[k]??null},setItem(k,v){this._[k]=String(v)},removeItem(k){delete this._[k]},clear(){this._={}}});
globalThis.sessionStorage=mem();sessionStorage.setItem("tk","T");sessionStorage.setItem("tkExp",Date.now()+1e6);
const {publishModel,discover}=await import("../src/data/publish.js");const seed=JSON.parse(fs.readFileSync("models/seed.json"));
const SVC="https://gis.naeb.gov.rw/server/rest/services/Hosted/EUDR_Trace_exporter/FeatureServer";const posts=[];let created=false,desc="",empty=false,failLayerOnce=false;
globalThis.fetch=async(url,o={})=>{const u=new URL(url),path=u.pathname,body=new URLSearchParams(o.body||"");const P=(k)=>body.get(k)??u.searchParams.get(k);let out={};
  if(o.method==="POST")posts.push({path,type:P("type"),body:Object.fromEntries(body)});
  if(path.endsWith("/content/users/Coffee_Trace"))out={folders:[{id:"F1",title:"Trace"}]};
  else if(path.endsWith("/search"))out={results:created?[{id:"svc1",title:"EUDR_Trace_exporter",url:SVC,description:desc}]:[]};
  else if(path.endsWith("/createService")){created=true;out={success:true,itemId:"svc1",serviceurl:SVC}}
  else if(path.endsWith("/FeatureServer/0")){if(empty)out={error:{code:400,message:"Invalid URL"}};else out={fields:[{name:"OBJECTID"},{name:"name"}]}}
  else if(path.endsWith("/addToDefinition")&&failLayerOnce&&body.get("addToDefinition").includes("drawingInfo")){failLayerOnce=false;out={error:{code:400,message:"drawingInfo not accepted"}}}
  else if(path.endsWith("/addToDefinition")&&empty){empty=false;out={success:true}}
  else if(path.endsWith("/items/svc1/update")){desc=P("description");out={success:true}}
  else out={success:true};
  return{ok:true,status:200,json:async()=>out}};
let ok=0;const t=(n,f)=>Promise.resolve(f()).then(()=>{ok++;console.log("✓",n)},e=>{console.log("✗",n,"\n ",e.message);process.exitCode=1});
const m=seed.models.find(x=>x.id==="exporter");const logs=[];
await t("publish creates the service, fields, tracking, and labels the item — never a JSON item",async()=>{empty=true;const r=await publishModel(m,x=>logs.push(x));
  assert.ok(r.created&&r.url===SVC+"/0");assert.ok(posts.every(p=>p.type!=="JSON"),"no JSON item type may be posted");
  const add=posts.find(p=>p.path.endsWith("/addToDefinition")&&p.body.addToDefinition.includes("OBJECTID"));assert.ok(add);const def=JSON.parse(add.body.addToDefinition).tables[0];
  assert.ok(def.fields.some(f=>f.name==="exporter_id")&&def.fields.some(f=>f.name==="is_deleted")&&def.editFieldsInfo&&def.hasAttachments);
  assert.ok(posts.some(p=>p.path.endsWith("/updateDefinition")),"editor tracking enabled");assert.ok(posts.some(p=>p.path.endsWith("/items/svc1/update")&&/eudr-trace-model/.test(p.body.tags)))});
await t("re-running adds only missing fields and creates nothing twice",async()=>{posts.length=0;const r=await publishModel(m);assert.equal(r.created,false);assert.ok(r.added.length>0&&!r.added.includes("name"));assert.ok(!posts.some(p=>p.path.endsWith("/createService")))});
await t("discover finds the published table by its title, with the model definition",async()=>{const d=await discover();assert.equal(d.exporter.serviceUrl,SVC+"/0");assert.equal(d.exporter.model.id,"exporter")});
await t("a half-created service (no layer yet) is repaired and then shared",async()=>{posts.length=0;empty=true;const r=await publishModel(m);assert.ok(posts.some(p=>p.path.endsWith("/addToDefinition")&&p.body.addToDefinition.includes("OBJECTID")));assert.ok(posts.some(p=>p.path.endsWith("/share")))});
await t("a layer definition the server refuses is retried in a simpler form",async()=>{posts.length=0;empty=true;failLayerOnce=true;const g=seed.models.find(x=>x.id==="cws_recorded");await publishModel(g);
  const adds=posts.filter(p=>p.path.endsWith("/addToDefinition"));assert.equal(adds.length,2);assert.ok(!adds[1].body.addToDefinition.includes("drawingInfo"))});
await t("models with personal data are NOT shared with the whole organisation",async()=>{posts.length=0;const f=seed.models.find(x=>x.id==="farmer_recorded");await publishModel(f);assert.ok(!posts.some(p=>p.path.endsWith("/share")))});
console.log(`\n${ok} checks passed`);
