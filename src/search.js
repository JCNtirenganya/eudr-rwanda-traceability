// Global search palette (Ctrl/Cmd+K or "/"): every entity type, grouped, jump to its profile.
import {T} from "./trace.js";
import {select} from "./core.js";
import {$,esc,tag} from "./ui.js";
let idx=null,sel=0,flat=[];
const LBL={farmer:"Farmers",plot:"Farms",station:"Stations",delivery:"Deliveries",lot:"Lots",batch:"Batches",exporter:"Exporters",importer:"Importers"};
export const resetSearch=()=>{idx=null};
function build(){const a=[],seen=new Set();
  for(const f of T.farms){a.push({t:"plot",id:f.id,title:"Farm "+f.id,sub:`${f.sec}, ${f.district} · farmer ${f.fm}`,src:"live",x:`${f.id} farm ${f.fm} ${f.sec} ${f.cell||""} ${f.district}`.toLowerCase()});if(!seen.has(f.fm)){seen.add(f.fm);a.push({t:"farmer",id:f.fm,title:"Farmer "+f.fm,sub:`${f.sec}, ${f.district}`,src:"live",x:`farmer ${f.fm} ${f.sec}`.toLowerCase()})}}
  Object.values(T.stations).forEach(s=>a.push({t:"station",id:s.id,title:s.name,sub:`${s.sector}, ${s.district}`,src:s.src,x:`${s.name} ${s.owner||""} ${s.sector} ${s.district}`.toLowerCase()}));
  Object.values(T.del).forEach(d=>a.push({t:"delivery",id:d.delivery_id,title:d.delivery_id,sub:`${d.delivery_date} · ${d.weight_kg} kg`,src:d.src,x:`${d.delivery_id} ${d.receipt_no||""} ${d.farmer_id}`.toLowerCase()}));
  Object.values(T.lot).forEach(l=>a.push({t:"lot",id:l.lot_id,title:l.lot_id,sub:l.lot_date,src:l.src,x:l.lot_id.toLowerCase()}));
  Object.values(T.bat).forEach(b=>a.push({t:"batch",id:b.batch_id,title:b.batch_id,sub:`${b.container||""} ${b.dds_ref||""}`,src:b.src,x:`${b.batch_id} ${b.container||""} ${b.dds_ref||""}`.toLowerCase()}));
  Object.values(T.exp).forEach(x=>a.push({t:"exporter",id:x.exporter_id,title:x.name,sub:x.licence_no||"",src:x.src,x:`${x.name} ${x.licence_no||""}`.toLowerCase()}));
  Object.values(T.imp).forEach(x=>a.push({t:"importer",id:x.importer_id,title:x.name,sub:`${x.country||""} ${x.eori||""}`,src:x.src,x:`${x.name} ${x.country||""} ${x.eori||""}`.toLowerCase()}));return idx=a}
function results(){const q=$("#gsq").value.trim().toLowerCase(),a=idx||build(),g={};flat=[];
  if(!q){$("#gsr").innerHTML='<p class="muted pad">Type a farm, farmer, station, delivery, lot, batch, exporter or importer.</p>';return}
  const w=q.split(/\s+/),score=r=>{const t=r.title.toLowerCase();return t===q?0:t.startsWith(q)?1:2},hits=[];for(const r of a)if(w.every(t=>r.x.includes(t)))hits.push(r);
  hits.sort((x,y)=>score(x)-score(y));for(const r of hits)(g[r.t]??=[]).length<6&&g[r.t].push(r);
  const order=Object.keys(LBL).filter(t=>g[t]).sort((x,y)=>score(g[x][0])-score(g[y][0])); // the group with the best match comes first
  $("#gsr").innerHTML=order.map(t=>[t,LBL[t]]).map(([t,l])=>`<h5>${l}</h5>`+g[t].map(r=>{flat.push(r);return`<div class="it" data-i="${flat.length-1}"><b>${esc(r.title)}</b><small>${esc(r.sub)}</small>${tag(r.src)}</div>`}).join("")).join("")||'<p class="muted pad">No match.</p>';sel=0;mark()}
const mark=()=>{[...document.querySelectorAll("#gsr .it")].forEach((e,i)=>e.classList.toggle("on",i===sel));document.querySelector("#gsr .it.on")?.scrollIntoView({block:"nearest"})};
const go=r=>{$("#gs").close();document.dispatchEvent(new CustomEvent("jump",{detail:r}));select(r.t,r.id)};
export function wireSearch(){
  const open=()=>{$("#gs").showModal();$("#gsq").value="";results();$("#gsq").focus()};$("#gsb").onclick=open;
  document.addEventListener("keydown",e=>{const typing=/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName);if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="k"){e.preventDefault();open()}else if(e.key==="/"&&!typing){e.preventDefault();open()}});
  $("#gsq").oninput=results;$("#gsq").onkeydown=e=>{if(e.key==="ArrowDown"){sel=Math.min(sel+1,flat.length-1);mark();e.preventDefault()}else if(e.key==="ArrowUp"){sel=Math.max(sel-1,0);mark();e.preventDefault()}else if(e.key==="Enter"&&flat[sel])go(flat[sel])};
  $("#gsr").onclick=e=>{const i=e.target.closest(".it");i&&go(flat[+i.dataset.i])}}
