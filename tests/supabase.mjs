// Supabase adapter: same round-trip as the old ArcGIS repo, and no personal fields leave the browser.
import assert from "node:assert/strict";import fs from "node:fs";
globalThis.sessionStorage={_:{},getItem(k){return this._[k]??null},setItem(k,v){this._[k]=String(v)},clear(){this._={}}};
sessionStorage.setItem("tk","T");sessionStorage.setItem("tkExp",Date.now()+1e6);
const {CFG}=await import("../src/config.js");CFG.API_URL="https://data.test/functions/v1/api";
const seed=JSON.parse(fs.readFileSync("models/seed.json"));
const {SupabaseRepo}=await import("../src/data/supabase.js");
let ok=0;const t=(n,f)=>Promise.resolve(f()).then(()=>{ok++;console.log("✓",n)},e=>{console.log("✗",n,"\n ",e.message);process.exitCode=1});

const rows=[];let id=0,calls=0;
const shape=r=>({...r.attrs,objectid:r.id,data_source:r.data_source,is_deleted:r.is_deleted?1:0,
  ...(r.geometry?{geometry:r.geometry}:{})});
globalThis.fetch=async(url,opt)=>{assert.ok(String(url).includes("/functions/v1/api"));assert.equal(opt.headers.Authorization,"Bearer T");calls++;
  const b=JSON.parse(opt.body);let value=null;
  if(b.action==="list")value=rows.filter(r=>r.model===b.model&&!r.is_deleted).map(shape);
  if(b.action==="count")value={count:rows.filter(r=>r.model===b.model&&!r.is_deleted).length};
  if(b.action==="get"){const r=rows.find(r=>r.model===b.model&&r.rec_key===b.key&&!r.is_deleted);value=r?shape(r):null}
  if(b.action==="create"){const r={id:++id,model:b.model,rec_key:b.key,attrs:b.attrs,geometry:b.geometry,
    data_source:"recorded",is_deleted:false};if(rows.some(x=>x.model===r.model&&x.rec_key===r.rec_key))throw new Error("duplicate key");rows.push(r);value=shape(r)}
  if(b.action==="update"){const r=rows.find(r=>r.model===b.model&&r.rec_key===b.key&&!r.is_deleted);Object.assign(r,{attrs:b.attrs,geometry:b.geometry});value=shape(r)}
  if(b.action==="softDelete"){rows.find(r=>r.model===b.model&&r.rec_key===b.key).is_deleted=true;value=true}
  return{ok:true,status:200,json:async()=>({ok:true,value})}};

const m=seed.models.find(x=>x.id==="exporter"),repo=new SupabaseRepo(m,()=>"tester");
await t("create → get stores a recorded exporter with a generated key",async()=>{const r=await repo.create({name:"Acme",licence_no:"L1"});
  assert.equal(r.data_source,"recorded");assert.ok(r.exporter_id.startsWith("EXP-"));assert.equal((await repo.get(r.exporter_id)).name,"Acme")});
await t("update then soft delete hides the record",async()=>{const [r]=await repo.list();await repo.update(r.exporter_id,{contact:"Z"});
  assert.equal((await repo.get(r.exporter_id)).contact,"Z");await repo.softDelete(r.exporter_id);
  assert.equal((await repo.list()).length,0);assert.equal(await repo.count(),0)});
await t("all requests go through the single function with the portal token",()=>assert.ok(calls>6));
await t("personal fields are not sent even if the form supplies them",async()=>{
  await repo.create({name:"No identities",licence_no:"L2",farmer_name:"Jane",phone:"078",national_id:"1199880000000000"});
  const row=rows.at(-1);assert.equal(row.model,"exporter");
  assert.ok(!("farmer_name" in row.attrs)&&!("national_id" in row.attrs))});
console.log(`\n${ok} checks passed`);
