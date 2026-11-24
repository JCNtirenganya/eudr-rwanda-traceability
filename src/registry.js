// Registry: every entity type as a sortable, searchable, paged table. Rows open the profile.
import {S,scope,change,select} from "./core.js";
import {T} from "./trace.js";
import {$,esc,N,COL,LBL,tag,link,day} from "./ui.js";
import {TYPES,COLS,rows} from "./lists.js";
const PAGE=100,fmt=(k,v,r)=>k==="risk"?`<span class="pill" style="background:${COL[v]||COL.none}">${LBL[v]||"—"}</span>`:k==="mapped"?day(v):k==="price"?esc(v)+(r.flag?' <span class="bad" title="Below the NAEB minimum price">▼ below minimum</span>':""):k==="dds"?(v?esc(v):'<span class="bad">missing</span>'):typeof v==="number"?N(v):esc(v);
export function renderRegistry(){
  const sc=scope(),t=S.rtab,all=rows(t,sc),q=S.rq.toLowerCase(),{k,d}=S.rsort;
  const f=all.filter(r=>!q||Object.values(r).some(v=>typeof v!=="object"&&String(v).toLowerCase().includes(q))).sort((a,b)=>{const x=a[k]??"",y=b[k]??"";return(typeof x==="number"&&typeof y==="number"?x-y:String(x).localeCompare(String(y)))*d});
  const pages=Math.max(1,Math.ceil(f.length/PAGE)),pg=Math.min(S.rpage,pages-1),cols=COLS[t];
  $("#regtabs").innerHTML=TYPES.map(([id,l])=>`<button data-rt="${id}" class="${t===id?"on":""}">${l}</button>`).join("");$("#rq").value=S.rq;
  $("#rnote").innerHTML=sc.active?`Showing only what is in your current focus. <a href="#" id="rclear">Clear focus</a>`:"Showing everything you can see.";
  $("#rth").innerHTML="<tr>"+cols.map(([c,l])=>`<th class="s" data-rk="${c}">${l}${k===c?(d>0?" ▲":" ▼"):""}</th>`).join("")+"<th>Source</th><th>Link</th></tr>";
  $("#rtb").innerHTML=f.slice(pg*PAGE,pg*PAGE+PAGE).map(r=>`<tr data-id="${esc(r.id)}" class="${S.sel?.id===r.id?"on":""}">${cols.map(([c])=>`<td>${fmt(c,r[c],r)}</td>`).join("")}<td>${tag(r.src)}</td><td>${r.link?link(r.link):""}</td></tr>`).join("")||`<tr><td colspan="${cols.length+2}" class="empty">Nothing here yet.</td></tr>`;
  $("#rpager").innerHTML=`<span class="muted">${N(f.length)} rows · page ${pg+1} of ${pages}</span><button class="ghost" data-pg="-1" ${pg?"":"disabled"}>‹ Prev</button><button class="ghost" data-pg="1" ${pg<pages-1?"":"disabled"}>Next ›</button>`}
export function wireRegistry(){
  $("#regtabs").onclick=e=>{const b=e.target.closest("[data-rt]");b&&change({rtab:b.dataset.rt,rpage:0,rsort:{k:COLS[b.dataset.rt][0][0],d:1}})};
  $("#rq").oninput=e=>change({rq:e.target.value,rpage:0});$("#rth").onclick=e=>{const h=e.target.closest("[data-rk]");h&&change({rsort:{k:h.dataset.rk,d:S.rsort.k===h.dataset.rk?-S.rsort.d:1}})};
  $("#rtb").onclick=e=>{const tr=e.target.closest("tr[data-id]");tr&&select(S.rtab,tr.dataset.id)};
  $("#rpager").onclick=e=>{const b=e.target.closest("[data-pg]");b&&change({rpage:Math.max(0,S.rpage+ +b.dataset.pg)})};
  $("#rnote").onclick=e=>{if(e.target.id==="rclear"){e.preventDefault();import("./core.js").then(m=>m.clearAll())}}}
