// Run: node tests/github.mjs  — GitHub pilot storage against an in-memory fake of the Contents API
import assert from "node:assert/strict";import fs from "node:fs";
const mem=()=>({_:{},getItem(k){return this._[k]??null},setItem(k,v){this._[k]=String(v)},removeItem(k){delete this._[k]},clear(){this._={}}});
globalThis.localStorage=mem();globalThis.sessionStorage=mem();
const G=await import("../src/data/github.js");const seed=JSON.parse(fs.readFileSync("models/seed.json"));
G.ghSet("naeb/coffee-data","main","tok");
const files={};let shaN=0,isPrivate=true,staleOnce=false;
globalThis.fetch=async(url,o={})=>{const u=new URL(url),path=u.pathname,res=(s,b,h={})=>({ok:s<300,status:s,headers:{get:k=>h[k]??null},json:async()=>b,text:async()=>JSON.stringify(b)});
  if(path==="/repos/naeb/coffee-data")return res(200,{private:isPrivate,permissions:{push:true}});
  const m=path.match(/\/contents\/(.+)$/);if(!m)return res(404,{});const p=decodeURIComponent(m[1]);
  if(!o.method||o.method==="GET")return files[p]?res(200,{sha:files[p].sha,size:files[p].text.length,content:Buffer.from(files[p].text).toString("base64")}):res(404,{});
  const b=JSON.parse(o.body);if(files[p]&&b.sha!==files[p].sha)return res(409,{});if(!files[p]&&b.sha)return res(422,{});
  if(staleOnce&&files[p]){staleOnce=false;files[p].sha="other"+(++shaN);return res(409,{})}
  files[p]={sha:"s"+(++shaN),text:Buffer.from(b.content,"base64").toString()};return res(200,{content:{sha:files[p].sha}})};
let ok=0;const t=(n,f)=>Promise.resolve(f()).then(()=>{ok++;console.log("✓",n)},e=>{console.log("✗",n,"\n ",e.message);process.exitCode=1});
const m=seed.models[3],mk=u=>new G.GitHubRepo(m,()=>u);
await t("connection test passes for a private repo with write access",async()=>{assert.equal((await G.ghTest()).private,true)});
await t("a PUBLIC repo is refused",async()=>{isPrivate=false;await assert.rejects(G.ghTest(),/must be PRIVATE/);isPrivate=true});
await t("create / get / update / soft delete round-trip, recorded + audit fields",async()=>{const r=mk("ana");const a=await r.create({name:"Acme",licence_no:"L1"});
  assert.equal(a.data_source,"recorded");assert.equal(a.created_user,"ana");assert.equal((await r.get(a.exporter_id)).name,"Acme");
  await r.update(a.exporter_id,{contact:"Z"});assert.equal((await mk("bob").get(a.exporter_id)).contact,"Z");
  await r.softDelete(a.exporter_id);assert.equal((await mk("bob").list()).length,0)});
await t("unique licence enforced across users",async()=>{await mk("ana").create({name:"B",licence_no:"L2"});await assert.rejects(mk("bob").create({name:"C",licence_no:"L2"}),/already exists/)});
await t("a concurrent save is retried and BOTH records survive",async()=>{const a=mk("ana"),b=mk("bob");await a.list();await b.list();
  await a.create({name:"One",licence_no:"L3"});await b.create({name:"Two",licence_no:"L4"});const names=(await mk("x").list()).map(x=>x.name);assert.ok(names.includes("One")&&names.includes("Two"))});
await t("a conflict on the very write is retried transparently",async()=>{staleOnce=true;const r=await mk("ana").create({name:"Retry",licence_no:"L5"});assert.equal(r.name,"Retry")});
await t("records file stays one-record-per-line (clean diffs)",()=>{const txt=files["data/exporter.json"].text;assert.ok(txt.split("\n").length>3)});
console.log(`\n${ok} checks passed`);
