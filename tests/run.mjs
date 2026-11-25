// Run: node tests/run.mjs — no framework, no live services.
import assert from "node:assert/strict";import fs from "node:fs";
const mem=()=>({_:{},getItem(k){return this._[k]??null},setItem(k,v){this._[k]=String(v)},clear(){this._={}},removeItem(k){delete this._[k]}});
globalThis.sessionStorage=mem();globalThis.localStorage=mem();
sessionStorage.setItem("tk","T");sessionStorage.setItem("tkExp",Date.now()+1e6);
const seed=JSON.parse(fs.readFileSync("models/seed.json"));
const {CFG}=await import("../src/config.js");
const S=await import("../src/engine/schema.js");
let ok=0;const t=(n,f)=>Promise.resolve(f()).then(()=>{ok++;console.log("✓",n)},e=>{console.log("✗",n,"\n ",e.message);process.exitCode=1});

await t("sign-in errors show Portal detail, not just a generic message",async()=>{
  const {ArcErr}=await import("../src/data/http.js");
  const e=new ArcErr({message:"Unable to generate token.",details:["Invalid username or password."]});
  assert.match(e.message,/Invalid username or password/)});

await t("the model is exactly the seven chain tables",()=>{
  assert.deepEqual(seed.models.map(m=>m.id),["cherry_delivery","lot","lot_delivery","exporter","importer","export_batch","batch_lot"]);
  for(const m of seed.models){assert.ok(m.key&&m.fields.some(f=>f.k===m.key));assert.ok(m.fields.every(f=>!/farmer_name|national_id/.test(f.k)))}});

await t("record validation: required, range, choice",()=>{
  const m=seed.models[0],v=S.validateRecord(m,{weight_kg:0,grade:"Z"});
  assert.ok(v.errors.cws_id&&v.errors.farmer_id&&v.errors.delivery_date&&v.errors.weight_kg&&v.errors.grade)});

await t("price below NAEB minimum warns but never blocks",()=>{
  const m=seed.models[0],b={cws_id:"c",farmer_id:"f",plot_id:"p",delivery_date:"2026-06-01",weight_kg:50};
  assert.ok(S.validateRecord(m,{...b,price_per_kg:799}).warnings.price_per_kg);
  assert.ok(!S.validateRecord(m,{...b,price_per_kg:800}).warnings.price_per_kg)});

await t("yield outside 16–22% warns on lots",()=>{
  const m=seed.models[1],v=S.validateRecord(m,{cws_id:"c",lot_date:"2026-06-01",cherry_kg_in:1000,parchment_kg_out:500,status:"open"});
  assert.ok(v.ok&&v.warnings.parchment_kg_out)});

const {screen,toMs}=await import("../src/data/live.js");
const {classify}=await import("../src/landuse.js");
const F={prior_land_use:"Forest/Wooded land"},CUTOFF=Date.UTC(2020,11,31);

await t("land use: survey options and clear Kinyarwanda words are classified",()=>{
  const c=x=>classify(x).cls;
  assert.equal(c("Forest/Wooded land"),"forest");assert.equal(c("Other: Ishyamba"),"forest");
  assert.equal(c("Cropland"),"crops");assert.equal(c("Other: Ibishyimbo"),"crops");
  assert.equal(c("Grassland/Pasture"),"grass");assert.equal(c("Other: Hari hatuwe"),"built");
  assert.equal(c("Other: Ntacyo"),"vacant");assert.equal(c("Other: Hacukurwagamo amabuye"),"quarry");
  assert.equal(c("Other: Something new"),"unknown")});

await t("deforestation screen: cut-off date, planting fallback and geometry block",()=>{
  assert.equal(screen(F,CUTOFF)[0],"low");
  assert.equal(screen(F,Date.UTC(2021,0,1))[0],"blocked");
  assert.equal(screen({...F,first_planting_year:2018},null)[0],"low");
  assert.equal(screen({...F,first_planting_year:2022},null)[0],"review");
  assert.equal(screen({prior_land_use:"Cropland"},null)[0],"low");
  assert.equal(screen({...F,overlaps_other_plot:"overlap"},CUTOFF)[0],"blocked")});

await t("conversion date parsing: epoch ms, ISO date and bare year",()=>{
  assert.equal(toMs(Date.UTC(2019,3,2)),Date.UTC(2019,3,2));
  assert.equal(toMs("2019-04-02"),Date.parse("2019-04-02"));
  assert.equal(toMs(2019),Date.UTC(2019,11,31));assert.equal(toMs(""),null)});

const {GEN}=await import("../src/data/demo.js");
const farms=Array.from({length:600},(_,i)=>({id:"P"+i,fm:"F"+Math.floor(i/2),district:"Gatsibo",sec:"S"+(i%4),kg:400}));
const stations=Array.from({length:6},(_,i)=>({id:"cws"+i,district:"Gatsibo",sector:"S"+(i%4)}));
const memo={};const rowsOf=async id=>memo[id]??=GEN[id]({farms,stations,rows:rowsOf});

await t("demo chain: deliveries → lots → batches are consistent and indicative",async()=>{
  const d=await rowsOf("cherry_delivery"),l=await rowsOf("lot"),ld=await rowsOf("lot_delivery"),b=await rowsOf("export_batch"),bl=await rowsOf("batch_lot");
  assert.ok(d.length>=300&&l.length&&b.length);
  assert.ok([...d,...l,...ld,...b,...bl].every(x=>x.data_source==="indicative"));
  const dids=new Set(d.map(x=>x.delivery_id)),lids=new Set(l.map(x=>x.lot_id)),bids=new Set(b.map(x=>x.batch_id));
  assert.ok(ld.every(x=>dids.has(x.delivery_id)&&lids.has(x.lot_id)));
  assert.ok(bl.every(x=>lids.has(x.lot_id)&&bids.has(x.batch_id)))});

await t("demo chain opens with Portal identity and no Supabase calls",async()=>{
  const real=globalThis.fetch,j=o=>({ok:true,status:200,json:async()=>o});
  let apiCalls=0,selfCalls=0;CFG.DEMO_CHAIN=true;
  globalThis.fetch=async(u,opt)=>{const s=String(u);
    if(s.includes("functions/v1/api")){apiCalls++;return j({ok:true,value:[]})}
    if(s.includes("community/self")){selfCalls++;return j({username:"u",fullName:"U",role:"org_admin"})}
    return j({})};
  try{
    const {Data,init}=await import("../src/data/index.js");
    await init({farms,stations,fetchSeed:async()=>seed});
    assert.equal(apiCalls,0);assert.ok(selfCalls>=1);
    assert.equal(Data.me.username,"u");assert.equal(Data.me.isAdmin,true);
    assert.ok(Object.values(Data.raw).every(r=>r.kind==="demo"));
    const ld=await Data.repo("lot_delivery").list(),bl=await Data.repo("batch_lot").list();
    assert.ok(ld.length>0&&bl.length>0)}finally{globalThis.fetch=real}});

await t("farm loader discovers the polygon layer instead of trusting sublayer 0",async()=>{
  const real=globalThis.fetch,j=o=>({ok:true,status:200,json:async()=>o});
  const feat={attributes:{plot_id:"P1",farmer_id:"F1",prior_land_use:"Cropland",first_planting_year:2010,survey_date:Date.now(),OBJECTID:1},geometry:{rings:[[[30,-1],[30.001,-1],[30.001,-1.001],[30,-1]]]}};
  const fields=[{name:"plot_id"},{name:"farmer_id"},{name:"prior_land_use"},{name:"first_planting_year"}];
  const seen=[];
  globalThis.fetch=async(u)=>{
    const s=String(u),p=new URLSearchParams(new URL(s).search);seen.push(s);
    if(/\/FeatureServer\/1\/query/.test(s))return j({features:[feat]});
    if(/\/FeatureServer\/0\/query/.test(s))return j({features:[]});
    if(/\/FeatureServer\/1(\?|$)/.test(s))return j({fields,maxRecordCount:1000,geometryType:"Polygon"});
    if(/\/FeatureServer(\?|$)/.test(s))return j({layers:[{id:0,name:"Farmers",geometryType:"Table"},{id:1,name:"Farm plots",geometryType:"Polygon"}]});
    return j({})};
  try{
    const {loadFarms,farmInfo}=await import("../src/data/live.js");
    const rows=await loadFarms();
    assert.equal(rows.length,1);assert.equal(rows[0].id,"P1");assert.ok(rows[0].ring);
    assert.match(farmInfo.source,/\/FeatureServer\/1$/);
    assert.ok(seen.some(u=>/\/FeatureServer\/1\/query/.test(u)));
    assert.ok(!seen.some(u=>/\/FeatureServer\/0\/query/.test(u)),"a table sublayer is skipped");
  }finally{globalThis.fetch=real}});

console.log(`\n${ok} checks passed`);
