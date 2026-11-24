// Network view: farmers (grouped per station, expandable) → stations → exporters → batches → importers. Pan/zoom. Dashed = indicative.
import {S,scope,select} from "./core.js";
import {T,has} from "./trace.js";
import {$,esc,N,COL,worst} from "./ui.js";
const expanded=new Set();let view={x:0,y:0,k:1},wired=false;
const LIMS=60,PER=30,COLS=["Farmers","Washing stations","Exporters","Export batches","EU importers"];
// Builds the network as an SVG string. interactive=false gives a static, print-ready picture (same layout, no controls).
export function buildGraph(sc,{interactive=true,expandAll=false}={}){
  const W=1000,bs=Object.values(T.bat).filter(b=>has(sc.B,b.batch_id));
  let sts=[...new Set([...(sc.S||Object.keys(T.stations).filter(i=>T.delByStation[i]||T.lotsByStation[i]))])].filter(i=>T.stations[i]);const capped=sts.length>LIMS;sts=sts.slice(0,LIMS);const stSet=new Set(sts);
  if(!sts.length&&!bs.length)return{empty:true}
  // farmers per station, from deliveries actually in scope
  const fm={};for(const i of sts)for(const d of T.delByStation[i]||[])if(has(sc.D,d.delivery_id)&&(!sc.F||sc.F.has(d.farmer_id)))(fm[i]??=new Set()).add(d.farmer_id);
  const exps=[...new Set(bs.map(b=>b.exporter_id))].filter(i=>T.exp[i]),imps=[...new Set(bs.map(b=>b.importer_id))].filter(i=>T.imp[i]);
  const c0=[];for(const i of sts){const s=fm[i];if(!s)continue;if((expandAll&&s.size<=8)||(interactive&&expanded.has(i))){const a=[...s];a.slice(0,PER).forEach(f=>c0.push({t:"farmer",id:f,st:i,l:"Farmer "+f,c:COL[worst(T.plotsOf[f]||[{eudr:"low"}])],src:"live"}));if(a.length>PER)c0.push({t:"grp",id:i,st:i,l:`+${N(a.length-PER)} more…`,c:"#9b958a",src:"live",collapse:1})}
    else c0.push({t:"grp",id:i,st:i,l:`${N(s.size)} farmer${s.size>1?"s":""} ▸`,c:COL[worst([...s].flatMap(f=>T.plotsOf[f]||[]))||"low"],src:"live"})}
  const cols=[c0,sts.map(i=>({t:"station",id:i,l:T.stations[i].name,c:T.stations[i].src==="recorded"?"#2b6cb0":"#1f6b50",src:T.stations[i].src})),exps.map(i=>({t:"exporter",id:i,l:T.exp[i].name,c:"#8b5e34",src:T.exp[i].src})),bs.slice(0,150).map(b=>({t:"batch",id:b.batch_id,l:b.batch_id,c:b.dds_ref?"#2f8f68":"#c8472f",src:b.src})),imps.map(i=>({t:"importer",id:i,l:T.imp[i].name,c:"#2b6cb0",src:T.imp[i].src}))];
  const H=Math.max(300,Math.max(...cols.map(c=>c.length))*22+70),P={};cols.forEach((c,i)=>c.forEach((n,j)=>P[n.t+":"+n.id+(n.t==="farmer"?"@"+n.st:"")]={...n,x:110+i*(W-220)/4,y:56+(j+.5)*(H-70)/c.length}));
  const E=[],e=(a,b,src)=>a&&b&&E.push([a,b,src]);
  for(const n of c0)e(P[n.t+":"+n.id+(n.t==="farmer"?"@"+n.st:"")],P["station:"+n.st],"confirmed");
  const seen=new Set();for(const b of bs.slice(0,150)){for(const l of T.blByBatch[b.batch_id]||[]){const s=T.lot[l]?.cws_id,k=s+"|"+b.exporter_id;if(P["station:"+s]&&!seen.has(k)){seen.add(k);e(P["station:"+s],P["exporter:"+b.exporter_id],b.src)}}
    e(P["exporter:"+b.exporter_id],P["batch:"+b.batch_id],b.src);e(P["batch:"+b.batch_id],P["importer:"+b.importer_id],b.src)}
  const sk=S.sel&&S.sel.type+":"+S.sel.id,hl=(a,b)=>sk&&(a.t+":"+a.id===sk||b.t+":"+b.id===sk);
  const inner=`${COLS.map((l,i)=>`<text class="ch" x="${110+i*(W-220)/4}" y="22" text-anchor="middle">${l}</text>`).join("")}
   ${E.map(([a,b,s])=>`<path class="e ${s==="indicative"?"ind":""} ${hl(a,b)?"hl":""}" d="M${a.x},${a.y}C${(a.x+b.x)/2},${a.y} ${(a.x+b.x)/2},${b.y} ${b.x},${b.y}"/>`).join("")}
   ${Object.values(P).map(n=>`<g class="n ${n.src==="indicative"?"ind":""}" data-t="${n.t}" data-id="${esc(n.id)}"><circle cx="${n.x}" cy="${n.y}" r="${sk===n.t+":"+n.id?9:n.t==="grp"?8:6}" fill="${n.c}" stroke="#fff" stroke-width="1.5"/><text x="${n.x+(n.x>W-200?-11:11)}" y="${n.y+4}" text-anchor="${n.x>W-200?"end":"start"}">${esc(n.l.slice(0,26))}</text><title>${esc(n.l)} · ${n.src}</title></g>`).join("")}`;
  const css=`<style>.gsvg .e{stroke:#888;stroke-opacity:.5;fill:none}.gsvg .e.ind{stroke-dasharray:4 3}.gsvg .e.hl{stroke:#1f6b50;stroke-opacity:1;stroke-width:2}.gsvg text{font:11px system-ui,sans-serif;fill:#222}.gsvg .ch{font-weight:700;fill:#666;text-transform:uppercase}.gsvg .n.ind circle{stroke-dasharray:3 2}</style>`;
  const svg=interactive?`<svg viewBox="0 0 ${W} ${H}" id="gsvg"><g id="gview" transform="translate(${view.x},${view.y}) scale(${view.k})">${inner}</g></svg>`:`<svg class="gsvg" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">${css}<g>${inner}</g></svg>`;
  return{svg,capped,total:sts.length,note:`${capped?`Showing the first ${LIMS} stations — narrow the focus to see the rest. `:""}Dashed = indicative`+(interactive?" · Click a farmer group to expand · Scroll to zoom, drag to pan":"")}}
export function renderGraph(){const host=$("#graph"),g=buildGraph(scope());
  if(g.empty){host.innerHTML='<p class="empty">Nothing to draw yet. Deliveries, lots and batches appear here once they are recorded. Meanwhile you can preview the network with demo data (Admin → Data models).</p>';return}
  host.innerHTML=`<div class="gz"><button data-z="in">+</button><button data-z="out">−</button><button data-z="reset">⟲</button></div>${g.svg}<div class="gnote muted">${g.note}</div>`;
  if(!wired){wired=true;wire()}}
function wire(){const host=$("#graph");let drag=null;
  host.onclick=e=>{const z=e.target.closest("[data-z]");if(z){view=z.dataset.z==="reset"?{x:0,y:0,k:1}:{...view,k:view.k*(z.dataset.z==="in"?1.3:1/1.3)};return apply()}
    const n=e.target.closest("g.n");if(!n||drag?.moved)return;const{t,id}=n.dataset;if(t==="grp"){expanded.has(id)?expanded.delete(id):expanded.add(id);return renderGraph()}select(t,id)};
  host.onwheel=e=>{if(!e.target.closest("svg"))return;e.preventDefault();view={...view,k:Math.max(.4,Math.min(4,view.k*(e.deltaY<0?1.12:1/1.12)))};apply()};
  host.onpointerdown=e=>{if(e.target.closest("g.n")||e.target.closest(".gz"))return;drag={x:e.clientX,y:e.clientY,vx:view.x,vy:view.y,moved:false}};
  host.onpointermove=e=>{if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.abs(dx)+Math.abs(dy)>3)drag.moved=true;view={...view,x:drag.vx+dx,y:drag.vy+dy};apply()};
  host.onpointerup=host.onpointerleave=()=>{setTimeout(()=>drag=null,0)}}
const apply=()=>{const g=$("#gview");g&&g.setAttribute("transform",`translate(${view.x},${view.y}) scale(${view.k})`)};
