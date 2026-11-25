export const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
export const esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
export const N=n=>Math.round(n||0).toLocaleString();
export const COL={low:"#2f8f68",review:"#e0a030",blocked:"#c8472f",none:"#9b958a"};
export const LBL={low:"Low risk",review:"Needs review",blocked:"Blocked",none:"No data"};
const SRC={live:["Real","real","Read live from NAEB's existing layers"],recorded:["Recorded","recorded","Entered in this system and stored in Supabase"],indicative:["Indicative","indicative","Generated or inferred for demonstration — not a real record"],mixed:["Mixed","mixed","Contains real/recorded and indicative records"]};
export const tag=s=>SRC[s]?`<span class="tag ${SRC[s][1]}" title="${SRC[s][2]}">${SRC[s][0]}</span>`:"";
export const link=l=>`<span class="tag ${l==="inferred"?"indicative":"real"}" title="${l==="inferred"?"No record links these: shown as a possibility only":"A record links these"}">${l==="inferred"?"inferred":"confirmed"}</span>`;
export const pill=r=>`<span class="pill" style="background:${COL[r]}">${LBL[r]}</span>`;
export const chip=(t,id,l)=>`<span class="chip" data-t="${t}" data-id="${esc(id)}">${esc(l)}</span>`;
const IC={map:"M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14",graph:"M5 7a2 2 0 1 0 0 .01M19 7a2 2 0 1 0 0 .01M12 18a2 2 0 1 0 0 .01M7 8l4 8M17 8l-4 8",list:"M4 6h16M4 12h16M4 18h16",file:"M7 3h8l4 4v14H7zM15 3v4h4M10 12h6M10 16h6",db:"M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3",search:"M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-5-5",x:"M6 6l12 12M18 6 6 18"};
export const ic=n=>`<svg class="ic" viewBox="0 0 24 24"><path d="${IC[n]}"/></svg>`;
export const toast=m=>{const t=$("#toast");t.textContent=m;t.classList.add("on");setTimeout(()=>t.classList.remove("on"),2600)};
export const day=t=>t?new Date(t).toISOString().slice(0,10):"—";
export const worst=a=>a.some(f=>f.eudr==="blocked")?"blocked":a.some(f=>f.eudr==="review")?"review":"low";
// Searchable dropdown (replaces <select>): get() → [{v,t,sub,x}]. Remembers its choice; works by touch and keyboard.
export function combo(host,{label,get,value="",onPick,ph="Any"}){
  host.innerHTML=`<label>${esc(label)}<div class="cbw"><input autocomplete="off" placeholder="${esc(ph)}" role="combobox" aria-expanded="false"><button type="button" class="cbx" hidden aria-label="Clear">×</button></div></label><div class="cbl" hidden role="listbox"></div>`;
  const inp=host.querySelector("input"),lst=host.querySelector(".cbl"),x=host.querySelector(".cbx");let cur=value,opts=[],hi=-1;
  const nameOf=v=>v?(get().find(o=>o.v===v)?.t||v):"";
  const paint=()=>{lst.querySelectorAll("[data-v]").forEach((d,i)=>d.classList.toggle("hi",i===hi));lst.querySelector(".hi")?.scrollIntoView({block:"nearest"})};
  const show=()=>{const q=inp.value.toLowerCase();opts=get().filter(a=>!q||(a.t+" "+(a.sub||"")+" "+(a.x||"")).toLowerCase().includes(q)).slice(0,60);hi=opts.length?0:-1;
    lst.innerHTML=opts.map(a=>`<div data-v="${esc(a.v)}" role="option">${esc(a.t)}${a.sub?`<small>${esc(a.sub)}</small>`:""}</div>`).join("")||'<div class="muted none">No match</div>';lst.hidden=false;inp.setAttribute("aria-expanded","true");paint()};
  const close=()=>{lst.hidden=true;inp.setAttribute("aria-expanded","false")};
  const choose=v=>{cur=v;inp.value=nameOf(v);inp.classList.toggle("picked",!!v);x.hidden=!v;close();onPick(v);inp.blur()};
  inp.value=nameOf(cur);inp.classList.toggle("picked",!!cur);x.hidden=!cur;
  inp.onfocus=()=>{inp.select();show()};inp.oninput=show;
  inp.onkeydown=e=>{if(e.key==="ArrowDown"){hi=Math.min(hi+1,opts.length-1);paint();e.preventDefault()}else if(e.key==="ArrowUp"){hi=Math.max(hi-1,0);paint();e.preventDefault()}
    else if(e.key==="Enter"&&!lst.hidden){e.preventDefault();e.stopPropagation();if(opts[hi])choose(opts[hi].v)}else if(e.key==="Escape"&&!lst.hidden){e.stopPropagation();close();inp.value=nameOf(cur)}};
  lst.onpointerdown=e=>{const d=e.target.closest("[data-v]");if(d){e.preventDefault();choose(d.dataset.v)}};
  x.onclick=()=>{choose("")};
  inp.onblur=()=>setTimeout(()=>{close();inp.value=nameOf(cur)},160);
  return{set:v=>{cur=v;inp.value=nameOf(v);inp.classList.toggle("picked",!!v);x.hidden=!v},get:()=>cur}}
