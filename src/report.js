// Print / PDF / CSV: exactly the current scope (selection + filters) and its true chain. Nothing is truncated or padded.
import {S,scope} from "./core.js";
import {T,scopeOf,has,provenance,chainSrc,linkOf,plotLink,farmerDown} from "./trace.js";
import {$,esc,N,LBL,day,worst} from "./ui.js";
import {batchKg} from "./lists.js";
import {nameOf} from "./profile.js";
import {figuresHTML,whenImagesLoaded} from "./extract.js";
const hash=s=>[...String(s)].reduce((h,c)=>(h*31+c.charCodeAt(0))>>>0,7).toString(36).toUpperCase();
export const scopeFor=sel=>sel?scopeOf({showInd:true,sel}):scope();
export function describe(sc,sel){const p=[];const s=sel||S.sel;if(s)p.push(`${s.type==="plot"?"farm":s.type} ${nameOf(s.type,s.id)} (${s.id})`);
  if(!sel){if(S.imp)p.push("importer "+nameOf("importer",S.imp));if(S.exp)p.push("exporter "+nameOf("exporter",S.exp));if(S.stn)p.push("station "+nameOf("station",S.stn));
    if(S.district)p.push("district "+S.district);if(S.sector)p.push("sector "+S.sector);if(S.risk)p.push("risk: "+LBL[S.risk]);if(S.day)p.push("mapped on "+S.day);else if(S.since)p.push("mapped since "+day(S.since))}
  return p.join(" · ")||"Full network (no selection and no filter)"}
const farmLink=plotLink;
const farmSrc=f=>{const d=farmerDown(f.fm),s=new Set(["live"]);if(d.D.length)s.add(T.src.delivery);if(d.L.length)s.add(T.src.lot);if(d.B.length){s.add(T.src.batch);d.X.length&&s.add(T.src.exporter);d.M.length&&s.add(T.src.importer)}return s.has("indicative")?"indicative":s.has("recorded")?"recorded":"live"};
export function reportData(sc){
  const fm={};sc.farms.forEach(f=>(fm[f.fm]??=[]).push(f));const gets=(set,m)=>[...(set||Object.keys(m))].map(i=>m[i]).filter(Boolean);
  return{farms:sc.farms,farmers:Object.entries(fm),stations:[...(sc.S||Object.keys(T.stations))].map(i=>T.stations[i]).filter(Boolean),deliveries:gets(sc.D,T.del),lots:gets(sc.L,T.lot),batches:gets(sc.B,T.bat),
    exporters:gets(sc.X,T.exp),importers:gets(sc.M,T.imp),prov:provenance(sc),maybeS:[...sc.maybe.S].map(i=>T.stations[i]).filter(Boolean),maybeP:[...sc.maybe.P].map(i=>T.farmById[i]).filter(Boolean)}}
export function reportHTML(sc,label,{limit=0,rid,figures=""}={}){
  const d=reportData(sc),when=new Date().toISOString().replace("T"," ").slice(0,16)+" UTC",id=rid||"RPT-"+hash(label+when+d.farms.length);
  const cap=a=>limit?a.slice(0,limit):a,note=a=>limit&&a.length>limit?`<p class="muted"><i>Preview shows ${limit} of ${N(a.length)} rows. Print and CSV contain all ${N(a.length)}.</i></p>`:"";
  const tb=(h,a,fn,title)=>`<h2>${title} <small>(${N(a.length)})</small></h2>${a.length?`<table><thead><tr>${h.map(x=>`<th>${x}</th>`).join("")}</tr></thead><tbody>${cap(a).map(x=>`<tr>${fn(x).map(c=>`<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table>${note(a)}`:'<p class="muted">None recorded in this scope.</p>'}`;
  const rc={low:0,review:0,blocked:0},why={};d.farms.forEach(f=>{rc[f.eudr]++;if(f.eudr!=="low")why[f.why]=(why[f.why]||0)+1});
  const conf=d.farms.filter(f=>linkOf(sc,f.id)==="confirmed").length,inf=d.farms.filter(f=>linkOf(sc,f.id)==="inferred").length,none=d.farms.length-conf-inf;
  const sName=i=>esc(T.stations[i]?.name||i);
  return`<h1>EUDR due-diligence pre-screening report — Rwandan coffee (HS 0901)</h1>
  <table class="kv"><tr><th>Scope</th><td>${esc(label)}</td></tr><tr><th>Report ID</th><td>${id}</td></tr><tr><th>Generated</th><td>${when}</td></tr>
  <tr><th>Data provenance</th><td>${N(d.prov.live)} real · ${N(d.prov.recorded)} recorded · ${N(d.prov.indicative)} indicative records — this chain is <b>${chainSrc(d.prov)}</b></td></tr>
  <tr><th>Link status</th><td>${N(conf)} farm(s) confirmed by a delivery record · ${N(inf)} inferred (a delivery did not name the plot) · ${N(none)} with no delivery recorded</td></tr></table>
  ${d.prov.indicative?'<p class="warnbox">This scope contains <b>indicative (demonstration) records</b>. It must not be used as evidence.</p>':""}
  ${figures}
  <h2>1 Risk assessment</h2><table><thead><tr><th>Status</th><th>Farms</th><th>Share</th></tr></thead><tbody>${Object.entries(rc).map(([k,v])=>`<tr><td>${LBL[k]}</td><td>${N(v)}</td><td>${d.farms.length?Math.round(100*v/d.farms.length)+"%":"—"}</td></tr>`).join("")}</tbody></table>
  ${Object.keys(why).length?`<table><thead><tr><th>Flag</th><th>Farms</th></tr></thead><tbody>${Object.entries(why).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`<tr><td>${esc(k)}</td><td>${N(v)}</td></tr>`).join("")}</tbody></table>`:""}
  <p>Flags are a pre-screening aid, <b>not a legal EUDR determination</b>. Satellite deforestation verification (cut-off 31 Dec 2020) is pending for every plot.</p>
  ${tb(["Farmer","Sector","Farms","Area (ha)","Status","Source"],d.farmers,([k,a])=>[esc(k),esc(a[0].sec),a.length,a.reduce((t,f)=>t+f.ha,0).toFixed(2),LBL[worst(a)],a.some(f=>f.src==="recorded")?"Recorded":"Real"],"2 Farmers")}
  ${tb(["Farm","Farmer","Area (ha)","Centroid (lat, lon)","Prior use","First planted","Mapped on","Status","Link","Source"],d.farms,f=>[esc(f.id),esc(f.fm),f.ha,f.c?f.c.map(x=>x.toFixed(5)).join(", "):"—",esc(f.prior),f.first??"—",day(f.t),LBL[f.eudr],linkOf(sc,f.id),f.src==="recorded"?"Recorded":"Real"],"3 Plots of production (geolocation)")}
  ${tb(["Station","Sector","District","Source"],d.stations,s=>[esc(s.name),esc(s.sector),esc(s.district),s.src],"4 Washing stations")}
  ${tb(["Delivery","Date","Farmer","Station","Weight (kg)","Price/kg","Source"],d.deliveries,x=>[x.delivery_id,x.delivery_date,esc(x.farmer_id),sName(x.cws_id),x.weight_kg,x.price_per_kg??"—",x.src],"5 Cherry deliveries")}
  ${tb(["Lot","Date","Station","Cherries (kg)","Parchment (kg)","Source"],d.lots,x=>[x.lot_id,x.lot_date,sName(x.cws_id),N(x.cherry_kg_in),x.parchment_kg_out!=null?N(x.parchment_kg_out):"—",x.src],"6 Lots")}
  ${tb(["Role","Name","Reference","Source"],[...d.exporters.map(x=>["Exporter",x.name,x.licence_no,x.src]),...d.importers.map(x=>["Importer",x.name,x.eori,x.src])],r=>r.map(esc),"7 Supply-chain operators")}
  ${tb(["Batch","Ship date","Exporter","Importer","Volume (kg)","DDS ref","Source"],d.batches,b=>[b.batch_id,b.ship_date||"—",esc(T.exp[b.exporter_id]?.name||b.exporter_id),esc(T.imp[b.importer_id]?.name||b.importer_id),N(batchKg(b)),b.dds_ref?esc(b.dds_ref):"<b>MISSING</b>",b.src],"8 Export batches")}
  ${d.maybeS.length||d.maybeP.length?`<h2>9 Possible links (inferred, not confirmed)</h2><p>No record links these. Listed for follow-up only.</p><p>${d.maybeS.map(s=>esc(s.name)).join(", ")}${d.maybeP.length?`${N(d.maybeP.length)} farm(s) mapped in the same sector`:""}</p>`:""}
  <p class="muted">Counts above are complete for this scope. Source: Real = NAEB GIS layers · Recorded = entered in this system · Indicative = demonstration data.</p>`}
const q=v=>`"${String(v??"").replace(/"/g,'""')}"`;
export function csvText(sc){
  const h=["plot_id","farmer_id","district","sector","cell","area_ha","trees","prior_land_use","first_planting_year","mapped_date","eudr_status","eudr_reason","centroid_lat","centroid_lon","stations","deliveries","lots","batches","exporters","importers","data_source","link_status"];
  const nm=(m,k,i)=>m[i]?.[k]||i,out=[h.join(",")];
  for(const f of sc.farms){const x=farmerDown(f.fm);out.push([f.id,f.fm,f.district,f.sec,f.cell,f.ha,f.trees,f.prior,f.first,day(f.t),f.eudr,f.why,f.c?.[0].toFixed(6),f.c?.[1].toFixed(6),
    x.S.map(i=>T.stations[i]?.name||i).join("; "),x.D.length,x.L.join("; "),x.B.join("; "),x.X.map(i=>nm(T.exp,"name",i)).join("; "),x.M.map(i=>nm(T.imp,"name",i)).join("; "),farmSrc(f),linkOf(sc,f.id)].map(q).join(","))}
  return"\ufeff"+out.join("\n")}
export async function printReport(sel){const sc=scopeFor(sel),label=describe(sc,sel);
  if(!sel&&!sc.active&&!confirm(`Scope: FULL NETWORK\n\nNo selection and no filter are active, so this report will include everything (${N(sc.farms.length)} farms). Continue?`))return;
  const rows=sc.farms.length+(sc.D?sc.D.size:Object.keys(T.del).length);if(rows>5000&&!confirm(`This report has about ${N(rows)} rows and may take a while to print. Continue?`))return;
  $("#report").innerHTML=reportHTML(sc,label,{figures:figuresHTML(sc,S.rbase||"osm")});await whenImagesLoaded($("#report"));setTimeout(()=>print(),80)}
export function downloadCsv(sel){const sc=scopeFor(sel),label=describe(sc,sel);
  if(!sel&&!sc.active&&!confirm(`Scope: FULL NETWORK\n\nExport all ${N(sc.farms.length)} farms?`))return;
  const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csvText(sc)],{type:"text/csv;charset=utf-8"}));a.download=`eudr-${(sel?sel.type+"-"+sel.id:"scope").replace(/[^\w-]/g,"")}.csv`;a.click();return label}
export function renderReportView(){const sc=scope(),label=describe(sc);
  $("#rnote2").innerHTML=sc.active?`<b>Scope:</b> ${esc(label)}`:`<b>Scope: Full network.</b> Nothing is selected or filtered. Select something on the map or in a list to report on just that chain.`;
  $("#rbase").value=S.rbase||"osm";$("#repview").innerHTML=reportHTML(sc,label,{limit:40,rid:"PREVIEW",figures:figuresHTML(sc,S.rbase||"osm")})}
