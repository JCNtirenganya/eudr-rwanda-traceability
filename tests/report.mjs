// Run: node tests/report.mjs — print/CSV scope: only the selection and its true chain
import assert from "node:assert/strict";
globalThis.location={hash:"",pathname:"/",search:""};globalThis.history={replaceState(){}};
const {buildTrace,scopeOf}=await import("../src/trace.js");const R=await import("../src/report.js");
const farm=(id,fm,sec)=>({id,fm,district:"G",sec,cell:"c",ha:.1,eudr:"low",why:"ok",prior:"Cropland",first:2005,day:"2026-06-01",t:Date.parse("2026-06-01"),c:[-1.7,30.3]});
const farms=[farm("P1","F1","A"),farm("P2","F1","A"),farm("P3","F2","A"),farm("P4","F3","B")];
const stations=[{id:"S1",name:"Station One",district:"G",sector:"A"},{id:"S2",name:"Station Two",district:"G",sector:"B"}];
const rows={cherry_delivery:[{delivery_id:"D1",cws_id:"S1",farmer_id:"F1",plot_id:"P1",delivery_date:"2026-06-02",weight_kg:50},{delivery_id:"D3",cws_id:"S1",farmer_id:"F2",plot_id:"P3",delivery_date:"2026-06-02",weight_kg:60},{delivery_id:"D9",cws_id:"S2",farmer_id:"F3",plot_id:"P4",delivery_date:"2026-06-03",weight_kg:70}],
 lot:[{lot_id:"L1",cws_id:"S1",lot_date:"2026-06-03",cherry_kg_in:110,parchment_kg_out:20},{lot_id:"L2",cws_id:"S2",lot_date:"2026-06-04",cherry_kg_in:70,parchment_kg_out:13}],
 lot_delivery:[{lot_id:"L1",delivery_id:"D1"},{lot_id:"L1",delivery_id:"D3"},{lot_id:"L2",delivery_id:"D9"}],export_batch:[{batch_id:"B1",exporter_id:"E1",importer_id:"I1",dds_ref:"DDS-1"},{batch_id:"B2",exporter_id:"E2",importer_id:"I2"}],
 batch_lot:[{batch_id:"B1",lot_id:"L1"},{batch_id:"B2",lot_id:"L2"}],exporter:[{exporter_id:"E1",name:"Exp One"},{exporter_id:"E2",name:"Exp Two"}],importer:[{importer_id:"I1",name:"Imp One"},{importer_id:"I2",name:"Imp Two"}]};
buildTrace({farms,stations,rows,srcOf:{cherry_delivery:"recorded",lot:"recorded",export_batch:"recorded",exporter:"recorded",importer:"recorded",lot_delivery:"recorded",batch_lot:"recorded"}});
let ok=0;const t=(n,f)=>{try{f();ok++;console.log("✓",n)}catch(e){console.log("✗",n,"\n ",e.message);process.exitCode=1}};
const html=sel=>R.reportHTML(R.scopeFor(sel),R.describe(R.scopeFor(sel),sel)),csv=sel=>R.csvText(R.scopeFor(sel)).replace("\ufeff","").trim().split("\n");
t("report for farm P3 lists P3, its farmer, station, delivery, lot, batch, exporter, importer — and nothing else",()=>{const h=html({type:"plot",id:"P3"});
  for(const need of ["P3","F2","Station One","D3","L1","B1","Exp One","Imp One"])assert.ok(h.includes(need),"missing "+need);
  for(const no of ["P1","P2","P4","F1","F3","D1","D9","L2","B2","Exp Two","Imp Two","Station Two"])assert.ok(!new RegExp(">"+no+"<").test(h)&&!h.includes(">"+no),"must not include "+no)});
t("the pooled lot's OTHER farmer does not appear in a farm's report (a lot is shared, a farm's chain is not)",()=>{assert.ok(!html({type:"plot",id:"P3"}).includes("F1"))});
t("CSV for one farm = header + one row; stays one row with its true chain",()=>{const c=csv({type:"plot",id:"P3"});assert.equal(c.length,2);assert.ok(c[1].includes('"B1"')&&c[1].includes("Exp One")&&c[1].includes("Imp One"));assert.ok(c[1].endsWith('"recorded","confirmed"'))});
t("CSV for batch B1 = exactly the farms in its lot",()=>{const c=csv({type:"batch",id:"B1"});assert.deepEqual(c.slice(1).map(r=>r.split(",")[0].replace(/"/g,"")).sort(),["P1","P3"])});
t("report states counts and provenance, and warns when indicative data is present",()=>{const h=html({type:"batch",id:"B1"});assert.ok(h.includes("Report ID")&&h.includes("Data provenance")&&h.includes("Link status"));assert.ok(!h.includes("indicative (demonstration) records"));
  buildTrace({farms,stations,rows,srcOf:{cherry_delivery:"indicative",lot:"indicative",export_batch:"indicative",exporter:"indicative",importer:"indicative",lot_delivery:"indicative",batch_lot:"indicative"}});assert.ok(html({type:"batch",id:"B1"}).includes("indicative (demonstration) records"))});
t("no truncation: a scope with 500 farms prints all 500",()=>{const many=Array.from({length:500},(_,i)=>farm("X"+i,"FX"+i,"A"));buildTrace({farms:many,stations,rows:{},srcOf:{}});const sc=scopeOf({showInd:true});
  const h=R.reportHTML(sc,"all");assert.equal((h.match(/<td>X\d+<\/td>/g)||[]).length,500);assert.equal(R.csvText(sc).trim().split("\n").length,501)});
console.log(`\n${ok} checks passed`);
