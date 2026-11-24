// Map view: all farm polygons are drawn as soon as they are loaded and stay visible; selection highlights, never gates.
import {S,scope,change,select,onChange,clearAll} from "./core.js";
import {T,provenance,chainSrc} from "./trace.js";
import {$,esc,N,COL,LBL,tag,link,combo,day} from "./ui.js";
import {TYPES,rows} from "./lists.js";
let map,FL={},stationMk={},grid={},dayCounts=[],cbs={},built=false;
const PAL=["#2b6cb0","#2f8f68","#e0a030","#c8472f","#7a5c3e","#6b46c1","#0f766e","#be185d"],hashN=s=>[...String(s)].reduce((h,c)=>(h*31+c.charCodeAt(0))>>>0,7);
const colorOf=f=>{const b=S.colorBy;if(b==="risk")return COL[f.eudr];
  if(b==="year"){if(!f.t)return COL.none;const m=Math.max(0,Math.min(5,Math.floor((Date.now()-f.t)/(30*864e5))));return["#1f4e79","#2b6cb0","#6fa8dc","#f1c27d","#e0a030","#b45309"][m]}
  if(b==="area")return f.ha<.05?"#9ad0b8":f.ha<.1?"#5db38f":f.ha<.25?"#2f8f68":f.ha<.5?"#1f6b50":"#0f3d2e";
  return PAL[hashN(f.district)%PAL.length]};
const LEG={risk:Object.entries({low:"Low risk",review:"Needs review",blocked:"Blocked"}).map(([k,l])=>[COL[k],l,k]),
  year:[["#1f4e79","< 1 month ago"],["#2b6cb0","1–2"],["#6fa8dc","2–3"],["#f1c27d","3–4"],["#e0a030","4–5"],["#b45309","older"]],
  area:[["#9ad0b8","< 0.05 ha"],["#5db38f","< 0.1"],["#2f8f68","< 0.25"],["#1f6b50","< 0.5"],["#0f3d2e","≥ 0.5"]],district:[]};
export function initMap(){
  map=L.map("map",{preferCanvas:true,zoomControl:true}).setView([-1.95,29.9],8);
  const sat=L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",{maxZoom:18,attribution:"Esri"}).addTo(map);
  const st=L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:"© OpenStreetMap"});
  const ter=L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",{maxZoom:18,attribution:"Esri"});
  L.control.layers({Satellite:sat,Streets:st,Terrain:ter},{},{position:"bottomright"}).addTo(map);
  map.on("click",e=>{const f=hit(e.latlng);if(f)select("plot",f.id)});built=false}
// Draw every polygon once (canvas, non-interactive: clicks are resolved through a spatial grid, so 27k shapes stay fast).
// Farm polygons are drawn once per load of the farms; stations are cheap and are redrawn after every save.
export function buildFarmLayer(){
  Object.values(FL).forEach(l=>map.removeLayer(l));FL={};grid={};const canvas=L.canvas({padding:.4});
  T.farms.forEach(f=>{if(!f.ring)return;FL[f.id]=L.polygon(f.ring,{renderer:canvas,interactive:false,smoothFactor:1.5,weight:1.5,color:colorOf(f),fillColor:colorOf(f),fillOpacity:.5}).addTo(map);
    const k=Math.floor(f.c[0]*500)+","+Math.floor(f.c[1]*500);(grid[k]??=[]).push(f)});
  dayCounts=Object.entries(T.farms.reduce((a,f)=>(f.day&&(a[f.day]=(a[f.day]||0)+1),a),{})).sort();built=true;fitAll()}
export function buildStationLayer(){
  Object.values(stationMk).forEach(l=>map.removeLayer(l));stationMk={};
  Object.values(T.stations).forEach(s=>{stationMk[s.id]=L.circleMarker([s.lat,s.lng],{radius:6,weight:2,color:"#fff",fillColor:s.src==="recorded"?"#2b6cb0":"#1f6b50",fillOpacity:1,bubblingMouseEvents:false}).addTo(map).on("click",()=>select("station",s.id)).bindTooltip(`${s.name} · ${s.district}`)})}
function hit(ll){const a=Math.floor(ll.lat*500),b=Math.floor(ll.lng*500);let best=null,bd=1.6e-4;
  for(let i=-1;i<=1;i++)for(let j=-1;j<=1;j++)for(const f of grid[`${a+i},${b+j}`]||[]){if(inside(f.ring,ll.lat,ll.lng))return f;const d=Math.hypot(f.c[0]-ll.lat,f.c[1]-ll.lng);if(d<bd){bd=d;best=f}}return best}
function inside(r,y,x){let c=false;for(let i=0,j=r.length-1;i<r.length;j=i++)if((r[i][0]>y)!==(r[j][0]>y)&&x<(r[j][1]-r[i][1])*(y-r[i][0])/(r[j][0]-r[i][0])+r[i][1])c=!c;return c}
function fitAll(){const p=Object.values(T.stations).map(s=>[s.lat,s.lng]).concat(T.farms.filter(f=>f.c).slice(0,20000).map(f=>f.c));if(p.length)map.fitBounds(L.latLngBounds(p).pad(.1))}
export function fitScope(){const sc=scope();let p=sc.farms.filter(f=>f.c).map(f=>f.c);if(!p.length&&sc.S)p=[...sc.S].filter(i=>T.stations[i]).map(i=>[T.stations[i].lat,T.stations[i].lng]);
  if(p.length)map.fitBounds(L.latLngBounds(p).pad(.3),{maxZoom:16});else if(!sc.active)fitAll()}
export function paint(){if(!built)return;const sc=scope(),inS=new Set(sc.farms.map(f=>f.id)),selId=S.sel?.type==="plot"?S.sel.id:null,riskOn=S.risk;
  for(const f of T.farms){const l=FL[f.id];if(!l)continue;const on=!sc.active||inS.has(f.id),inf=sc.plotHow?.get(f.id)==="inferred",c=colorOf(f);
    l.setStyle({color:f.id===selId?"#fff":c,fillColor:c,weight:f.id===selId?4:inf?2:1.5,dashArray:inf?"3 3":null,fillOpacity:on?.55:.05,opacity:on?1:.12})}
  for(const[id,m]of Object.entries(stationMk)){const on=!sc.S||sc.S.has(id),sel=S.sel?.type==="station"&&S.sel.id===id;m.setStyle({radius:sel?11:on?7:4,fillOpacity:on?1:.25,opacity:on?1:.3,dashArray:T.stations[id].src==="indicative"?"2 2":null});if(sel)m.bringToFront()}
}
// ---------- explorer, filters, KPIs, timeline, legend ----------
const SORTS={farmer:[["mapped","Mapped date"],["id","ID"],["area","Area"],["kg","Output"]],plot:[["mapped","Mapped date"],["id","ID"],["area","Area"],["risk","Risk"]],station:[["title","Name"],["deliveries","Deliveries"],["capacity","Capacity"]],delivery:[["date","Date"],["kg","Weight"],["id","ID"]],lot:[["date","Date"],["cherry","Cherries"],["id","ID"]],batch:[["date","Date"],["kg","Volume"],["id","ID"]],exporter:[["title","Name"],["batches","Batches"]],importer:[["title","Name"],["batches","Batches"]]};
// Indicators live on the Overview page (not over the map): returns the KPI cards for a scope.
export function kpiHTML(sc=scope()){
  const prov=provenance(sc),fs=sc.farms,farmers=new Set(fs.map(f=>f.fm)).size,low=fs.filter(f=>f.eudr==="low").length;
  const k=(v,l,s)=>`<div class="k"><b>${v}</b><span>${l} ${s?tag(s):""}</span></div>`,nd=sc.D?sc.D.size:Object.keys(T.del).length,nb=sc.B?sc.B.size:Object.keys(T.bat).length,nl=sc.L?sc.L.size:Object.keys(T.lot).length;
  const kgB=[...(sc.B||Object.keys(T.bat))].reduce((t,b)=>t+(T.bat[b]?(T.blByBatch[b]||[]).reduce((u,l)=>u+(T.lot[l]?.parchment_kg_out||0),0):0),0);
  return k(N(farmers),"Farmers","live")+k(N(fs.length),"Farms","live")+k(N(fs.reduce((t,f)=>t+f.ha,0))+" ha","Mapped","live")+k(fs.length?Math.round(100*low/fs.length)+"%":"—","Low risk","live")
    +k(N(sc.S?sc.S.size:Object.keys(T.stations).length),"Stations","")+k(nd?N(nd):"—","Deliveries",nd?T.src.delivery:"")+k(nb?N(nb):"—","Batches",nb?T.src.batch:"")+k(kgB?N(kgB/1e3)+" t":"—","Exported",kgB?T.src.batch:"")
    +`<div class="k kp" title="Records in this view by source"><b>${chainSrc(prov)==="live"?"All real":Math.round(100*prov.indicative/(prov.live+prov.recorded+prov.indicative||1))+"% indicative"}</b><span>Data in view ${tag(chainSrc(prov))}</span></div>`;}
export function renderPanels(){
  const sc=scope();
  $("#tabs").innerHTML=TYPES.map(([t,l])=>`<button data-tab="${t}" class="${S.tab===t?"on":""}">${l} <small>${N(rows(t,sc).length)}</small></button>`).join("");
  const sk=S.sk[S.tab]||SORTS[S.tab][0][0];$("#sort").innerHTML=SORTS[S.tab].map(([v,l])=>`<option value="${v}" ${v===sk?"selected":""}>${l}</option>`).join("");
  const q=S.q.toLowerCase(),all=rows(S.tab,sc).filter(r=>!q||(r.title+" "+r.sub).toLowerCase().includes(q)).sort((a,b)=>{const x=a[sk]??"",y=b[sk]??"";return(typeof x==="number"&&typeof y==="number"?x-y:String(x).localeCompare(String(y)))*S.sd});
  $("#list").innerHTML=all.slice(0,S.lim).map(r=>`<li data-t="${S.tab}" data-id="${esc(r.id)}" class="${S.sel?.id===r.id&&S.sel.type===S.tab?"on":""}">${r.r?`<i class="dot" style="background:${COL[r.r]}"></i>`:""}<div>${esc(r.title)}<small>${esc(r.sub)}</small></div><span>${r.link?link(r.link):""}${tag(r.src)}</span></li>`).join("")
    +(all.length>S.lim?`<li class="more" id="more">Show ${Math.min(200,all.length-S.lim)} more of ${N(all.length-S.lim)}…</li>`:"")||'<li class="muted empty">Nothing here yet.'+emptyHint()+"</li>";
  filters();legend()}
const emptyHint=()=>S.tab==="delivery"||S.tab==="lot"||S.tab==="batch"?" Records appear once they are saved (or switch these models to Demo in Admin to preview).":"";
function filters(){const sc=scope();
  const ds=[...new Set(T.farms.map(f=>f.district).filter(Boolean))].sort(),sec=[...new Set(T.farms.filter(f=>!S.district||f.district===S.district).map(f=>f.sec).filter(Boolean))].sort();
  const defs=[["cDist","District",()=>ds.map(d=>({v:d,t:d})),"district"],["cSec","Sector",()=>sec.map(d=>({v:d,t:d})),"sector"],["cStn","Washing station",()=>Object.values(T.stations).map(s=>({v:s.id,t:s.name,sub:s.district})),"stn"],
    ["cExp","Exporter",()=>Object.values(T.exp).map(x=>({v:x.exporter_id,t:x.name,sub:tagText(x.src)})),"exp"],["cImp","Importer",()=>Object.values(T.imp).map(x=>({v:x.importer_id,t:x.name,sub:x.country})),"imp"]];
  for(const[id,label,get,key]of defs){if(!cbs[id])cbs[id]=combo($("#"+id),{label,get,value:S[key],onPick:v=>change({[key]:v,...(key==="district"?{sector:""}:{})})});else cbs[id].set(S[key])}
  const rel=n=>S.since&&Math.abs(S.since-(Date.now()-n*864e5))<864e5*1.5;$("#whenChips").innerHTML=[["Any time",0],["30 days",30],["7 days",7],["Today",1]].map(([l,d])=>`<button data-since="${d}" class="${(d===0&&!S.since&&!S.day)||(d&&rel(d)&&!S.day)?"on":""}">${l}</button>`).join("");
  $("#riskChips").innerHTML=["low","review","blocked"].map(r=>`<button data-risk="${r}" class="${S.risk===r?"on":""}"><i class="dot" style="background:${COL[r]}"></i>${LBL[r]}</button>`).join("");$("#showInd").checked=S.showInd}
const tagText=s=>({live:"real",recorded:"recorded",indicative:"indicative"}[s]||"");
export function timelineHTML(){if(!dayCounts.length)return'<p class="muted">No mapping dates yet.</p>';
  const last=dayCounts.slice(-60),mx=Math.max(...last.map(d=>d[1])),w=100/last.length,tot=T.farms.length,n=day=>Date.now()-n*864e5;
  const rel=(n)=>S.since&&Math.abs(S.since-(Date.now()-n*864e5))<864e5*1.5;
  return `<div class="tl"><b>When mapped</b><span class="muted">${S.day?`${N(dayCounts.find(d=>d[0]===S.day)?.[1]||0)} farms on ${S.day}`:S.since?"since "+day(S.since):`${N(tot)} farms · ${dayCounts[0][0]} → ${dayCounts.at(-1)[0]}`}</span><span class="sp"></span>
   ${[["All",0],["30 days",30],["7 days",7],["Today",1]].map(([l,d])=>`<button data-since="${d}" class="${(d===0&&!S.since&&!S.day)||(d&&rel(d)&&!S.day)?"on":""}">${l}</button>`).join("")}</div>
   <svg viewBox="0 0 100 24" preserveAspectRatio="none">${last.map((d,i)=>`<rect data-day="${d[0]}" x="${i*w+.15}" width="${w-.3}" y="${24-22*d[1]/mx}" height="${22*d[1]/mx}" fill="${S.day===d[0]?"#c8472f":"#2f8f68"}"><title>${d[0]}: ${d[1]} farms</title></rect>`).join("")}</svg>`}
function legend(){const L_=LEG[S.colorBy]||[],open=$("#legend").open;$("#legend").innerHTML=`<summary>${L_.slice(0,6).map(([c])=>`<i class="dot" style="background:${c}"></i>`).join("")} Legend</summary><label>Colour farms by<select id="colorBy">${[["risk","EUDR risk"],["year","When mapped"],["area","Area"],["district","District"]].map(([v,l])=>`<option value="${v}" ${S.colorBy===v?"selected":""}>${l}</option>`).join("")}</select></label>`
  +L_.map(([c,l,r])=>`<div class="lg"><i class="dot" style="background:${c}"></i>${l}</div>`).join("")+`<div class="lg"><i class="dot" style="background:#1f6b50;border:2px solid #fff"></i>Station <span class="tag real">real</span></div><div class="lg"><i class="dot" style="background:#2b6cb0;border:2px solid #fff"></i>Station <span class="tag recorded">recorded</span></div><div class="lg muted">Dashed outline = inferred / indicative</div>`}
export function wireMap(){
  $("#tabs").onclick=e=>{const b=e.target.closest("[data-tab]");b&&change({tab:b.dataset.tab})};
  $("#list").onclick=e=>{if(e.target.id==="more")return change({lim:S.lim+200});const li=e.target.closest("li[data-id]");if(li){select(li.dataset.t,li.dataset.id);fitScope()}};
  $("#q").oninput=e=>change({q:e.target.value});$("#sort").onchange=e=>change({sk:{...S.sk,[S.tab]:e.target.value}});$("#sdir").onclick=()=>change({sd:-S.sd});
  $("#riskChips").onclick=e=>{const b=e.target.closest("[data-risk]");b&&change({risk:S.risk===b.dataset.risk?"":b.dataset.risk})};
  $("#showInd").onchange=e=>change({showInd:e.target.checked});$("#fclr").onclick=e=>{e.preventDefault();clearAll()};
  const whenClick=e=>{const r=e.target.closest("[data-day]"),b=e.target.closest("[data-since]");if(r)change({day:S.day===r.dataset.day?"":r.dataset.day,since:0});
    if(b){const d=+b.dataset.since;change({day:"",since:d?Date.now()-d*864e5:0})}};
  $("#timeline").onclick=whenClick;$("#whenChips").onclick=whenClick;
  $("#legend").onchange=e=>{if(e.target.id==="colorBy")change({colorBy:e.target.value})};
  $("#mapfit").onclick=fitScope;$("#ptoggle").onclick=()=>{const p=$("#explorer");p.classList.toggle("shut");$("#ptoggle").classList.toggle("shut",p.classList.contains("shut"));$("#ptoggle").textContent=p.classList.contains("shut")?"☰ Filters":"✕"};$("#browse").addEventListener("toggle",()=>localStorage.setItem("eudr.browse",$("#browse").open?"1":"0"))}
export const resizeMap=()=>setTimeout(()=>map?.invalidateSize(),60);
export const mapReady=()=>!!map;
export const mapCenter=()=>map?map.getCenter():null;
