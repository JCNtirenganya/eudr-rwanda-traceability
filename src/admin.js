// One screen: who you are, where chain records live, and how many are there.
import {CFG} from "./config.js";
import {Data,status} from "./data/index.js";
import {$,esc,tag} from "./ui.js";
export const ctx={reload:()=>{}};

export async function renderAdmin(){
  const rows=await Promise.all(status().map(async s=>({...s,n:await Data.repo(s.id).count().catch(()=>"?")})));
  const me=Data.me,demo=rows.filter(r=>r.mode==="demo").length;
  $("#v-admin").innerHTML=`<div class="vh"><h2>Data status</h2><span class="muted">Farms, farmers and washing stations stay in Portal. Only the seven chain tables are app-owned.</span></div>
   <div class="cards"><div class="cc"><span class="muted">Signed in as</span><b>${esc(me.fullName)}</b> ${esc(me.role)}</div>
    <div class="cc"><span class="muted">Chain storage</span><b>${CFG.DEMO_CHAIN?"Demo chain":"Supabase"}</b>${CFG.DEMO_CHAIN?"Indicative rows, not saved.":"Saved in Supabase."}</div>
    <div class="cc"><span class="muted">Portal data</span><b>Live</b>Farms, farmers and CWS come from your Portal login.</div>
    <div class="cc"><span class="muted">Chain models</span><b>${rows.length-demo} stored · ${demo} demo</b>Seven tables, nothing else.</div></div>
   ${CFG.DEMO_CHAIN?'<p class="err">⚠ Supabase is not connected yet. Set the keys in config.js and switch DEMO_CHAIN to false to save chain records.</p>':""}
   <div class="scroll models"><table><thead><tr><th>Table</th><th>Records</th><th>Stored in</th></tr></thead><tbody>${rows.map(r=>`<tr><td><b>${esc(r.name)}</b></td><td>${r.n}</td><td>${r.mode==="demo"?"Demo (not saved)":"Supabase"} ${tag(r.source)}</td></tr>`).join("")}</tbody></table></div>`}
