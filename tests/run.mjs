// Run: node tests/run.mjs   (no framework; fake ArcGIS server in memory)
import assert from "node:assert/strict";import fs from "node:fs";
globalThis.sessionStorage={_:{},getItem(k){return this._[k]??null},setItem(k,v){this._[k]=String(v)},clear(){this._={}}};
sessionStorage.setItem("tk","T");sessionStorage.setItem("tkExp",Date.now()+1e6);
const seed=JSON.parse(fs.readFileSync("models/seed.json"));
const S=await import("../src/engine/schema.js");const {ArcGISRepo}=await import("../src/data/arcgis.js");
let ok=0;const t=(n,f)=>Promise.resolve(f()).then(()=>{ok++;console.log("✓",n)},e=>{console.log("✗",n,"\n ",e.message);process.exitCode=1});

await t("sign-in errors show Portal detail, not just a generic message",async()=>{const {ArcErr}=await import("../src/data/http.js");
  const e=new ArcErr({message:"Unable to generate token.",details:["Invalid username or password."]});assert.match(e.message,/Invalid username or password/)});

await t("every seed model validates",()=>{const ids=seed.models.map(m=>m.id);for(const m of [...seed.models,...seed.system])assert.deepEqual(S.validateModel(m,ids),[],m.id)});
await t("ArcGIS fields: choice gets coded domain, bool 0/1, tracking fields added",()=>{const m=seed.models[0],f=S.toArcFields(m),g=f.find(x=>x.name==="grade");
  assert.equal(g.domain.type,"codedValue");assert.ok(f.some(x=>x.name==="created_date")&&f.some(x=>x.name==="is_deleted"));assert.equal(f.find(x=>x.name==="weight_kg").type,"esriFieldTypeDouble")});
await t("record validation: required, range, choice",()=>{const m=seed.models[0],v=S.validateRecord(m,{weight_kg:0,grade:"Z"});
  assert.ok(v.errors.cws_id&&v.errors.farmer_id&&v.errors.delivery_date&&v.errors.weight_kg&&v.errors.grade)});
await t("price below NAEB minimum warns but never blocks; higher is fine",async()=>{const {CFG}=await import("../src/config.js");const orig=CFG.MIN_CHERRY_PRICE;CFG.MIN_CHERRY_PRICE=300;const m=seed.models[0];
  const base={cws_id:"c",farmer_id:"f",plot_id:"p",delivery_date:"2026-06-01",weight_kg:50};
  const lo=S.validateRecord(m,{...base,price_per_kg:250}),hi=S.validateRecord(m,{...base,price_per_kg:900});
  assert.ok(lo.ok&&lo.warnings.price_per_kg);assert.ok(hi.ok&&!hi.warnings.price_per_kg);CFG.MIN_CHERRY_PRICE=orig});
await t("yield outside 16–22% warns on lots",()=>{const m=seed.models[1];const v=S.validateRecord(m,{cws_id:"c",lot_date:"2026-06-01",cherry_kg_in:1000,parchment_kg_out:500,status:"open"});assert.ok(v.ok&&v.warnings.parchment_kg_out)});
await t("change rules: type change & non-empty delete blocked, add allowed",()=>{const a=structuredClone(seed.models[3]),b=structuredClone(a);
  b.fields.find(f=>f.k==="phone").type="int";b.fields=b.fields.filter(f=>f.k!=="email");b.fields.push({k:"website",label:"Website",type:"text"});b.fields.find(f=>f.k==="name").label="Legal name";
  const r=S.changeRules(a,b,{email:5});assert.equal(r.ok,false);assert.equal(r.blocked.length,2);assert.ok(r.notes.some(n=>/display name/.test(n)));assert.equal(r.added.length,1)});
await t("reserved/bad field names rejected",()=>{const m=structuredClone(seed.models[3]);m.fields.push({k:"Is Deleted",label:"x",type:"text"},{k:"created_date",label:"y",type:"text"});assert.equal(S.validateModel(m).length,2)});

// ---- fake ArcGIS feature table with paging, applyEdits, soft delete, uniqueness ----
const rows=[];let oid=0;
const lit=(w,k)=>{const m=w.match(new RegExp(k+"='([^']*)'"));return m&&m[1]};
globalThis.fetch=async(url,opt)=>{const u=new URL(url);const p=new URLSearchParams(opt?.body||u.search);const path=u.pathname;let out;
  if(path.endsWith("/FeatureServer/0"))out={maxRecordCount:1000,objectIdField:"objectid",fields:[]};
  else if(path.endsWith("/query")){const w=p.get("where")||"";let r=rows.filter(x=>!(w.includes("is_deleted=0")&&x.is_deleted));
    const k=lit(w,"licence_no"),dk=lit(w,"exporter_id");if(k)r=r.filter(x=>x.licence_no===k);if(dk)r=r.filter(x=>x.exporter_id===dk);const ne=w.match(/objectid<>(\d+)/);if(ne)r=r.filter(x=>x.objectid!=ne[1]);
    if(p.get("returnCountOnly")==="true")out={count:r.length};else{const o=+p.get("resultOffset")||0,n=+p.get("resultRecordCount")||1000;out={features:r.slice(o,o+n).map(a=>({attributes:a})),exceededTransferLimit:o+n<r.length}}}
  else if(path.endsWith("/applyEdits")){const adds=JSON.parse(p.get("adds")||"[]"),ups=JSON.parse(p.get("updates")||"[]");
    adds.forEach(a=>rows.push({objectid:++oid,...a.attributes}));ups.forEach(u=>Object.assign(rows.find(x=>x.objectid===u.attributes.objectid),u.attributes));
    out={addResults:adds.map(()=>({success:true})),updateResults:ups.map(()=>({success:true}))}}
  return{ok:true,json:async()=>out}};
const m=seed.models[3],repo=new ArcGISRepo(m,"https://x/server/rest/services/Hosted/EUDR_Trace_exporter/FeatureServer/0",()=>"tester");
await t("repo create → get, tagged recorded",async()=>{const r=await repo.create({name:"Acme",licence_no:"L1"});assert.equal(r.data_source,"recorded");assert.ok(r.exporter_id.startsWith("EXP-"));assert.equal((await repo.get(r.exporter_id)).name,"Acme")});
await t("unique licence enforced",async()=>{await assert.rejects(repo.create({name:"Dup",licence_no:"L1"}),/already exists/)});
await t("update then soft delete hides record",async()=>{const [r]=await repo.list();await repo.update(r.exporter_id,{contact:"Z"});assert.equal((await repo.get(r.exporter_id)).contact,"Z");await repo.softDelete(r.exporter_id);assert.equal((await repo.list()).length,0);assert.equal(rows[0].deleted_by,"tester")});
await t("paging reads every record (2500)",async()=>{for(let i=0;i<2500;i++)rows.push({objectid:++oid,exporter_id:"E"+i,name:"n"+i,is_deleted:0});assert.equal((await repo.list()).length,2500)});

// ---- demo chain coherence ----
const {GEN}=await import("../src/data/demo.js");
const farms=Array.from({length:600},(_,i)=>({id:"P"+i,fm:"F"+Math.floor(i/2),district:"Gatsibo",sec:"S"+(i%4),kg:400}));const stations=Array.from({length:6},(_,i)=>({id:"cws"+i,district:"Gatsibo",sector:"S"+(i%4)}));
const memo={};const rowsOf=async id=>memo[id]??=await GEN[id]({farms,stations,rows:rowsOf});
await t("demo chain: deliveries → lots → batches are consistent and indicative",async()=>{
  const d=await rowsOf("cherry_delivery"),l=await rowsOf("lot"),ld=await rowsOf("lot_delivery"),b=await rowsOf("export_batch"),bl=await rowsOf("batch_lot");
  assert.ok(d.length>=300&&l.length&&b.length);assert.ok([...d,...l,...ld,...b,...bl].every(x=>x.data_source==="indicative"));
  const dids=new Set(d.map(x=>x.delivery_id)),lids=new Set(l.map(x=>x.lot_id)),bids=new Set(b.map(x=>x.batch_id));
  assert.ok(ld.every(x=>dids.has(x.delivery_id)&&lids.has(x.lot_id)));assert.ok(bl.every(x=>lids.has(x.lot_id)&&bids.has(x.batch_id)));
  const sumLot=Object.fromEntries(l.map(x=>[x.lot_id,x.cherry_kg_in]));const got={};ld.forEach(x=>got[x.lot_id]=(got[x.lot_id]||0)+x.kg_allocated);
  for(const k in sumLot)assert.ok(Math.abs(sumLot[k]-got[k])<d.length,"lot kg ≈ allocated deliveries "+k)});
await t("offline demo base supplies indicative farms and stations",async()=>{const {demoBase}=await import("../src/data/demo.js"),b=await demoBase();
  assert.ok(b.farms.length>=100&&b.stations.length>=20);assert.equal(await demoBase(),b,"base is cached");
  assert.ok(b.farms.every(f=>f.type==="plot"&&f.src==="indicative"&&f.ring.length>=4&&f.eudr));
  assert.ok(b.stations.every(s=>s.type==="station"&&s.src==="indicative"&&s.lat&&s.lng));
  for(const r of["low","review","blocked"])assert.ok(b.farms.some(f=>f.eudr===r),r)});
console.log(`\n${ok} checks passed`);

await t("audit log never receives personal fields",async()=>{const {redact}=await import("../src/data/index.js");const fm=seed.models.find(x=>x.id==="farmer_recorded");
  const o=redact(fm,{full_name:"Jane",phone:"078",district:"Gatsibo",geometry:{x:1,y:2}});assert.deepEqual(Object.keys(o),["district"])});
await t("price floor is 800 RWF/kg: 799 warns, 800 and 1200 do not",async()=>{const {CFG}=await import("../src/config.js");assert.equal(CFG.MIN_CHERRY_PRICE,800);const m=seed.models[0],b={cws_id:"c",farmer_id:"f",plot_id:"p",delivery_date:"2026-06-01",weight_kg:50};
  assert.ok(S.validateRecord(m,{...b,price_per_kg:799}).warnings.price_per_kg);assert.ok(!S.validateRecord(m,{...b,price_per_kg:800}).warnings.price_per_kg);assert.ok(!S.validateRecord(m,{...b,price_per_kg:1200}).warnings.price_per_kg)});
{const {screen,toMs}=await import("../src/data/live.js");const F={prior_land_use:"Forest/Wooded land"},C=Date.UTC(2020,11,31);
 await t("land use: the three survey options and clear Kinyarwanda words are classified; unclear words are unknown",async()=>{const {classify}=await import("../src/landuse.js");const {screen}=await import("../src/data/live.js");
   const c=x=>classify(x).cls;assert.equal(c("Forest/Wooded land"),"forest");assert.equal(c("Cropland"),"crops");assert.equal(c("Grassland/Pasture"),"grass");assert.equal(c("Other: Ishyamba"),"forest");assert.equal(c("Other: HARISHYAMBA"),"forest");
   assert.equal(c("Other: Ibishyimbo"),"crops");assert.equal(c("Other: hahingwaga imyumbati"),"crops");assert.equal(c("Other: Hari hatuwe"),"built");assert.equal(c("Other: Ntacyo"),"vacant");for(const w of["Igisambu","HARIGISAMBU","Umushike","Ishinge","Amashinge","Inshinge","Harishinge","Ibihuru","HARIBIHURU GUSA","Ntibwahingwaga"])assert.equal(c("Other: "+w),"vacant",w);assert.equal(c("Other: Imibyare"),"crops");for(const w of["Kwarugutema ibigunda","UMUKENKE","Hari mwishijye","Hari agasozi","Hari mubutayu","Harimo igihuru","Ubutaka gusa"])assert.equal(c("Other: "+w),"vacant",w);for(const w of["Imyaka yabugufi","Ubuhinzi busanzwe","Harihateye indi myaka","Ibisntizireraimbo"])assert.equal(c("Other: "+w),"crops",w);assert.equal(c("Other: Something new"),"unknown");for(const w of["Ntoacyo","Ntakintu cyarikirimo","Ntacyintu cyarigihari"])assert.equal(c("Other: "+w),"vacant",w);for(const w of["Umyumbati","Uritoki","Ibishyumbo","ubutaka bwo guhingwa"])assert.equal(c("Other: "+w),"crops",w);for(const w of["Residencial","Habitation","harimumiturire"])assert.equal(c("Other: "+w),"built",w);assert.equal(c("Other: Ntabwo bizwi"),"unknown");assert.equal(c("Other: Haraha leta"),"unknown");assert.equal(c("Other: Ibitinguru"),"crops");for(const w of["Kurubuye","Haragaso kumucyenye","Ibanga ryi inshinje","Haridhinge","Hari idhinge"])assert.equal(c("Other: "+w),"vacant",w);assert.equal(c("Other: Hacukurwagamo amabuye"),"quarry");assert.equal(screen({prior_land_use:"Other: Hacukurwagamo amabuye"},null)[0],"low");assert.equal(c("Other: Ntacyarigihinzemo"),"vacant");assert.equal(c("Other: Zzunknownword"),"unknown");assert.equal(c(""),"unknown")});
 await t("free-text forest (ishyamba) gets the forest rule; unknown free text goes to review, never silently low",()=>{const o={prior_land_use:"Other: Ishyamba"};assert.equal(screen(o,null)[0],"review");assert.equal(screen({...o,first_planting_year:2015},null)[0],"low");assert.equal(screen(o,Date.UTC(2022,0,1))[0],"blocked");
   const u=screen({prior_land_use:"Other: Zzunknownword",first_planting_year:2022},null);assert.equal(u[0],"review");assert.ok(/not recognised/.test(u[1]));assert.equal(screen({prior_land_use:"Other: Zzunknownword"},null)[0],"review");assert.equal(screen({prior_land_use:"Other: Ntacyo",first_planting_year:2022},null)[0],"low","vacant land is not forest, whenever coffee was planted");assert.equal(screen({prior_land_use:"Other: Ibishyimbo"},null)[0],"low")});
 await t("unrecognised or missing prior land use is cleared when coffee was first planted on or before 2020 (it was farmland by then)",()=>{
   assert.equal(screen({prior_land_use:"Other: Zzunknownword",first_planting_year:2015},null)[0],"low");assert.equal(screen({prior_land_use:"Other: Zzunknownword",first_planting_year:2020},null)[0],"low");assert.equal(screen({prior_land_use:"",first_planting_year:2010},null)[0],"low");
   assert.equal(screen({prior_land_use:"Other: Zzunknownword",first_planting_year:2021},null)[0],"review");assert.equal(screen({prior_land_use:"Other: Zzunknownword",first_planting_year:20000},null)[0],"review")});
 await t("a delivery MUST name the farm: without plot_id it is invalid",async()=>{const m=seed.models[0],b={cws_id:"c",farmer_id:"f",delivery_date:"2026-06-01",weight_kg:50};assert.ok(S.validateRecord(m,b).errors.plot_id);assert.ok(S.validateRecord(m,{...b,plot_id:"p"}).ok)});
 await t("fallback on first planting year: planted ≤ 2020 on forest land is low; planted after 2020 needs REVIEW, never blocked",()=>{assert.equal(screen({...F,first_planting_year:2018},null)[0],"low");assert.equal(screen({...F,first_planting_year:2020},null)[0],"low");
   assert.equal(screen({...F,first_planting_year:2022},null)[0],"review");assert.equal(screen({...F,first_planting_year:20000},null)[0],"review");assert.equal(screen(F,null)[0],"review");assert.equal(screen({prior_land_use:"Cropland",first_planting_year:2023},null)[0],"low")});
 await t("a real conversion date overrides the first-planting fallback",()=>{assert.equal(screen({...F,first_planting_year:2023},Date.UTC(2019,0,1))[0],"low");assert.equal(screen({...F,first_planting_year:2015},Date.UTC(2022,0,1))[0],"blocked")});
 await t("deforestation screen: forest converted ON or BEFORE 31 Dec 2020 is deforestation-free",()=>{assert.equal(screen(F,Date.UTC(2020,11,31,12))[0],"low");assert.equal(screen(F,Date.UTC(2018,5,1))[0],"low")});
 await t("forest converted AFTER 31 Dec 2020 is blocked; forest with no date needs review; non-forest is low",()=>{assert.equal(screen(F,Date.UTC(2021,0,1))[0],"blocked");assert.equal(screen(F,null)[0],"review","no date and no planting year");assert.equal(screen({prior_land_use:"Cropland"},null)[0],"low")});
 await t("a plot geometry problem still blocks, whatever the date",()=>{assert.equal(screen({...F,overlaps_other_plot:"overlap"},Date.UTC(2015,0,1))[0],"blocked")});
 await t("planting year no longer decides the result (planting after 2020 on pre-2021 farmland is fine)",()=>{assert.equal(screen({...F,first_planting_year:2023},Date.UTC(2019,0,1))[0],"low")});
 await t("conversion date parsing: epoch ms, ISO date, and a bare year",()=>{assert.equal(toMs(Date.UTC(2019,3,2)),Date.UTC(2019,3,2));assert.equal(toMs("2019-04-02"),Date.parse("2019-04-02"));assert.equal(toMs(2019),Date.UTC(2019,11,31));assert.equal(toMs(""),null);assert.equal(toMs(2021),Date.UTC(2021,11,31))})}
// ---- regression: link models must be non-empty when read through the real Data registry (demo mode) ----
{const mem=()=>({_:{},getItem(k){return this._[k]??null},setItem(k,v){this._[k]=String(v)},removeItem(k){delete this._[k]}});globalThis.localStorage=mem();
 localStorage.setItem("eudr.backend",JSON.stringify(Object.fromEntries(["cherry_delivery","lot","lot_delivery","export_batch","batch_lot"].map(x=>[x,"demo"]))));
 const real=globalThis.fetch;const j=o=>({ok:true,status:200,json:async()=>o});const {CFG}=await import("../src/config.js");CFG.OFFLINE_DEMO=true;let apiCalls=0,selfCalls=0;
 globalThis.fetch=async(u,opt)=>{const s=String(u);
   if(s.includes("functions/v1/api")){apiCalls++;const b=JSON.parse(opt.body);
     if(b.action==="me")return j({ok:true,value:{username:"u",fullName:"U",isAdmin:true,role:"admin",stations:[]}});
     if(b.action==="meta")return j({ok:true,value:{farmMeta:{fields:[]},stationMeta:{fields:[]},convField:""}});
     if(b.action==="count")return j({ok:true,value:{count:0}});
     return j({ok:true,value:b.action==="list"?[]:null})}
   if(s.includes("community/self")){selfCalls++;return j({username:"u",fullName:"U",role:"org_admin"})}return j({})};
 const {Data,DISABLED,init}=await import("../src/data/index.js");
 await init({farms,stations:stations.map(s=>({...s,type:"station"})),fetchSeed:async()=>seed});
  await t("offline demo opens with Portal identity and no Supabase calls",()=>{assert.equal(apiCalls,0);assert.ok(selfCalls>=1);assert.equal(Data.me.username,"u");assert.equal(Data.me.fullName,"U");assert.equal(Data.me.isAdmin,true);assert.ok(Object.entries(Data.raw).filter(([id])=>!DISABLED.has(id)).every(([,r])=>r.kind==="demo"));
     assert.ok(Object.entries(Data.raw).filter(([id])=>DISABLED.has(id)).every(([,r])=>r.kind==="disabled"))});
  await t("disabled support tables cannot be written",async()=>{for(const id of DISABLED){const r=Data.repo(id);if(r)await assert.rejects(r.create({}),/not allowed|disabled/)}});
 await t("registry: lot–delivery and batch–lot demo links are non-empty and consistent",async()=>{
   const nd=await Data.repo("cherry_delivery").count(),nl=await Data.repo("lot").count(),ld=await Data.repo("lot_delivery").list(),bl=await Data.repo("batch_lot").list(),nb=await Data.repo("export_batch").count();
   assert.ok(nd>0&&nl>0&&nb>0);assert.equal(ld.length,nd,"one link per delivery");assert.ok(bl.length>=nb);assert.ok(Object.keys(ld[0]).every(k=>!k.startsWith("_")))});
 globalThis.fetch=real}
console.log(`\n${ok} checks passed`);
