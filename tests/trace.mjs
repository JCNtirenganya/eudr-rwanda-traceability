// Run: node tests/trace.mjs — chain scoping on a small hand-made network
import assert from "node:assert/strict";
const {buildTrace,chain,scopeOf,provenance,chainSrc,farmerDown,linkOf,plotLink,T}=await import("../src/trace.js");
const farm=(id,fm,sec)=>({id,fm,district:"G",sec,eudr:"low",day:"2026-06-01",t:Date.parse("2026-06-01")});
const farms=[farm("P1","F1","A"),farm("P2","F1","A"),farm("P3","F2","A"),farm("P4","F3","B")];
const stations=[{id:"S1",name:"One",district:"G",sector:"A"},{id:"S2",name:"Two",district:"G",sector:"B"}];
const rows={cherry_delivery:[{delivery_id:"D1",cws_id:"S1",farmer_id:"F1",plot_id:"P1"},{delivery_id:"D2",cws_id:"S1",farmer_id:"F1",plot_id:null},{delivery_id:"D3",cws_id:"S1",farmer_id:"F2",plot_id:"P3"}],
 lot:[{lot_id:"L1",cws_id:"S1"}],lot_delivery:[{lot_id:"L1",delivery_id:"D1"},{lot_id:"L1",delivery_id:"D3"}],export_batch:[{batch_id:"B1",exporter_id:"E1",importer_id:"I1"}],batch_lot:[{batch_id:"B1",lot_id:"L1"}],
 exporter:[{exporter_id:"E1",name:"Exp"}],importer:[{importer_id:"I1",name:"Imp"}]};
buildTrace({farms,stations,rows,srcOf:{cherry_delivery:"recorded",lot:"recorded",export_batch:"indicative",exporter:"indicative",importer:"indicative"}});
let ok=0;const t=(n,f)=>{try{f();ok++;console.log("✓",n)}catch(e){console.log("✗",n,"\n ",e.message);process.exitCode=1}};
t("a plot follows only ITS deliveries, never other farms at the same station",()=>{const c=chain("plot","P1");assert.deepEqual([...c.F],["F1"]);assert.ok(!c.F.has("F2"));assert.ok(c.D.has("D1"));assert.ok(!c.D.has("D3"));assert.deepEqual([...c.B],["B1"]);assert.equal(c.plotHow.get("P1"),"confirmed");assert.equal(c.plotHow.get("P2"),"inferred","the farmer-level delivery D2 could be from P2: shown as inferred")});
t("a delivery with no plot makes the farmer's plots 'inferred' (farmer-level), not confirmed",()=>{const c=chain("farmer","F1");assert.equal(c.plotHow.get("P2"),"owned");const c2=chain("plot","P2");assert.equal(c2.plotHow.get("P2"),"owned");assert.ok(c2.D.has("D2"))});
t("a batch traces up to exactly the farmers whose deliveries are in its lots",()=>{const c=chain("batch","B1");assert.deepEqual([...c.F].sort(),["F1","F2"]);assert.ok(!c.F.has("F3"));assert.equal(c.plotHow.get("P1"),"confirmed");assert.ok(!c.plotHow.has("P2"),"D2 is not in any lot of this batch");assert.ok(!c.plotHow.has("P4"))});
t("exporter / importer / station reach the same farmers through records",()=>{for(const [ty,id] of [["exporter","E1"],["importer","I1"],["station","S1"]])assert.deepEqual([...chain(ty,id).F].sort(),["F1","F2"],ty)});
t("a farmer with no deliveries has an empty chain; same-sector stations are offered only as 'maybe'",()=>{const c=chain("farmer","F3");assert.equal(c.D.size,0);assert.equal(c.B.size,0);assert.deepEqual([...c.maybe.S],["S2"])});
t("a station with no deliveries lists same-sector farms only as 'maybe'",()=>{const c=chain("station","S2");assert.equal(c.D.size,0);assert.deepEqual([...c.maybe.P],["P4"])});
t("scope = intersection of selection and filters; attribute filters narrow farms",()=>{const S0={showInd:true};let sc=scopeOf({...S0,exp:"E1",stn:"S1"});assert.deepEqual(sc.farms.map(f=>f.id).sort(),["P1","P3"],"exporter ∩ station = plots on both chains");
  sc=scopeOf({...S0,sel:{type:"plot",id:"P3"},exp:"E1"});assert.deepEqual(sc.farms.map(f=>f.id),["P3"]);
  sc=scopeOf({...S0,sel:{type:"plot",id:"P1"},imp:"I9"});assert.equal(sc.farms.length,0);
  sc=scopeOf({...S0,district:"G",sector:"B"});assert.deepEqual(sc.farms.map(f=>f.id),["P4"]);assert.deepEqual([...sc.S],["S2"]);
  assert.equal(scopeOf(S0).active,false)});
t("provenance: a chain with any indicative link is indicative",()=>{const sc=scopeOf({showInd:true,sel:{type:"batch",id:"B1"}}),p=provenance(sc);assert.ok(p.indicative>0&&p.recorded>0&&p.live>0);assert.equal(chainSrc(p),"indicative");
  const sc2=scopeOf({showInd:true,sel:{type:"plot",id:"P3"}});const p2=provenance(sc2);assert.equal(chain("plot","P3").B.size,1)});
t("farmerDown gives the batches/exporters/importers for CSV rows",()=>{const d=farmerDown("F1");assert.deepEqual(d.B,["B1"]);assert.deepEqual(d.X,["E1"]);assert.deepEqual(farmerDown("F3").B,[])});
t("link status: confirmed / inferred / none are told apart, even for a selected farm",()=>{const sc=scopeOf({showInd:true,sel:{type:"plot",id:"P2"}});
  assert.equal(plotLink(T.farmById.P1),"confirmed");assert.equal(plotLink(T.farmById.P2),"inferred","farmer F1 has delivery D2 with no plot");assert.equal(plotLink(T.farmById.P4),"none");
  assert.equal(linkOf(scopeOf({showInd:true,sel:{type:"plot",id:"P4"}}),"P4"),"none","a selected farm with no delivery is NOT reported as confirmed")});
console.log(`\n${ok} checks passed`);
