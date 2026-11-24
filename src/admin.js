// Admin: one storage backend, a safe save test, and the demo preview switch.
import {CFG} from "./config.js";
import {Data,status,setBackend} from "./data/index.js";
import {$,esc,toast,tag} from "./ui.js";
export const ctx={reload:()=>{}};
let log="";const say=m=>{log+=m+"\n";const l=$("#log");if(l){l.textContent=log;l.scrollTop=1e9}};
const CHAIN=["cherry_delivery","lot","lot_delivery","export_batch","batch_lot","exporter","importer"];
export async function renderAdmin(){
  const me=Data.me,rows=await Promise.all(status().map(async s=>({...s,n:await Data.repo(s.id).count().catch(()=>"?")})));
  const demo=rows.filter(r=>r.mode==="demo").length;
  $("#v-admin").innerHTML=`<div class="vh"><h2>Data models</h2><span class="muted">${CFG.OFFLINE_DEMO?"Portal sign-in is working; Supabase is not connected yet. The data below is indicative and is not saved.":"Every record is stored in Supabase. The Portal is only the login and the home of personal data."}</span><span class="sp"></span>
   ${me.isAdmin&&!CFG.OFFLINE_DEMO?`<button class="ghost" id="demoToggle">${CHAIN.every(i=>Data.backend[i]==="demo")?"Stop previewing demo data":"Preview the chain with demo data"}</button> <button class="ghost" id="selfTest">Test saving</button>`:""}</div>
   <div class="cards"><div class="cc"><span class="muted">Signed in as</span><b>${esc(me.fullName)}</b> ${esc(me.role)}${me.stations.length?` · ${me.stations.length} station(s)`:""}</div>
   <div class="cc"><span class="muted">Storage</span><b>${CFG.OFFLINE_DEMO?"Offline demo":"Supabase"}</b>${CFG.OFFLINE_DEMO?"Indicative only; nothing is saved.":"All app-owned records."}</div>
   <div class="cc"><span class="muted">Portal data</span><b>Farms, farmers, CWS</b>Real plots, personal identity and washing stations stay in ArcGIS; the app reads them with your Portal login.</div>
   <div class="cc"><span class="muted">Data status</span><b>${rows.length-demo} stored · ${demo} demo</b>Demo rows are labelled Indicative and are not saved.</div></div>
   ${CFG.OFFLINE_DEMO?`<p class="err">⚠ Temporary offline demo: Portal sign-in is still required. Set CFG.OFFLINE_DEMO to false after Supabase is configured.</p>`:""}${Data.warnings.map(w=>`<p class="err">⚠ ${esc(w)}</p>`).join("")}
   <div class="scroll models"><table><thead><tr><th>Model</th><th>Records</th><th>Stored in</th><th></th></tr></thead><tbody>${rows.map(r=>{const m=Data.models[r.id]||Data.system[r.id];
     return`<tr><td><b>${esc(m.name)}</b><small class="muted">${m.fields.length} fields · key ${esc(m.key)}</small></td><td>${r.n}</td><td>${r.mode==="demo"?"Demo (not saved)":r.mode==="disabled"?"Portal only (disabled)":"Supabase"} ${tag(r.source)}</td>
     <td><button class="ghost" data-prev="${r.id}">Preview</button></td></tr>`}).join("")}</tbody></table></div>
   <div id="prev"></div><div class="log" id="log" ${log?"":"hidden"}>${esc(log)}</div>`;
  $("#v-admin").onclick=async e=>{if(e.target.id==="selfTest")return selfTest(e.target);
    if(e.target.id==="demoToggle"){const on=!CHAIN.every(i=>Data.backend[i]==="demo");for(const i of CHAIN)await setBackend(i,on?"demo":"auto");toast(on?"Demo data is on (this browser only). It is labelled Indicative.":"Back to stored data");return ctx.reload()}
    const v=e.target.closest("[data-prev]");if(v)return preview(v.dataset.prev)};
}
async function preview(id){const r=Data.repo(id),m=r.model,rows=(await r.list({limit:8}));
  $("#prev").innerHTML=`<h3 style="margin:16px 0 6px">${esc(m.plural)} — first ${rows.length}</h3><div class="scroll"><table><thead><tr>${m.listCols.map(c=>`<th>${esc(m.fields.find(f=>f.k===c)?.label||c)}</th>`).join("")}<th>Source</th></tr></thead><tbody>${rows.map(x=>`<tr>${m.listCols.map(c=>`<td>${esc(x[c])}</td>`).join("")}<td>${tag(x.data_source)}</td></tr>`).join("")||'<tr><td class="muted" colspan="9">No records yet.</td></tr>'}</tbody></table></div>`}
async function selfTest(btn){const lg=$("#log");lg.hidden=false;btn.disabled=true;const r=Data.repo("exporter");
  if(Data.raw.exporter.kind==="demo"){say("✗ Exporters are on Demo. Switch off demo preview first.");btn.disabled=false;return}
  const step=async(n,f)=>{try{const v=await f();say("✓ "+n);return v}catch(e){say("✗ "+n+": "+e.message);throw e}};
  try{say("— Save test on Exporters ("+Data.raw.exporter.kind+")");
    const a=await step("Create a test record",()=>r.create({name:"CONNECTION TEST (safe to ignore)",licence_no:"TEST-"+Date.now()}));
    await step("Read it back",async()=>{const g=await r.get(a.exporter_id);if(!g)throw new Error("not found after saving")});
    await step("Edit it",async()=>{const u=await r.update(a.exporter_id,{contact:"edited"});if(u.contact!=="edited")throw new Error("edit not saved")});
    await step("Delete it (soft delete: hidden, kept for audit)",()=>r.softDelete(a.exporter_id));
    await step("Confirm it no longer appears",async()=>{if(await r.get(a.exporter_id))throw new Error("still visible")});
    say("All steps passed — saving works for your account.")}catch{say("Stopped. Send me the lines above.")}
  btn.disabled=false}
