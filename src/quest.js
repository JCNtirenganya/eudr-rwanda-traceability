// Farmer lookup. Real farmer and farm data stays in ArcGIS Portal; the app only reads it with the
// signed-in Portal token. Nothing entered here is stored in Supabase or in the browser.
import {findFarmerByNationalId} from "./data/live.js";
import {T} from "./trace.js";
import {isNationalId} from "./ids.js";
import {$,esc,pill} from "./ui.js";
const mask=n=>n?"•••• "+String(n).slice(-4):"—";
let dlg;
export function openFarmerQuestionnaire(){
  dlg=$("#modal");
  dlg.innerHTML=`<form id="qf" novalidate><h3>Find a farmer in Portal</h3>
    <p class="qnote">Real farmer and farm records live in ArcGIS Portal. Enter the National ID to view them with your Portal sign-in.</p>
    <div class="fld"><label>National ID (16 digits) *<input data-k="national_id" inputmode="numeric" maxlength="16" autofocus></label><span class="ferr" id="qerr"></span></div>
    <div id="found"></div><div class="row"><button type="button" class="ghost" id="qcancel">Close</button><button>Find</button></div></form>`;
  $("#qcancel").onclick=()=>dlg.close();
  $("#qf").onsubmit=async e=>{
    e.preventDefault();const nid=dlg.querySelector('[data-k="national_id"]').value.trim(),err=$("#qerr"),found=$("#found");
    err.textContent="";found.textContent="";
    if(!isNationalId(nid))return err.textContent="A National ID has 16 digits.";
    found.textContent="Looking up the Portal…";
    let hit=null;
    try{hit=await findFarmerByNationalId(nid)}
    catch(x){found.textContent="";return err.textContent="Portal lookup failed: "+x.message}
    if(!hit?.farmer_id)return found.innerHTML='<p class="qnote">No farmer with that National ID was found in the Portal farms layer.</p>';
    const plots=T.plotsOf[hit.farmer_id]||[];
    found.innerHTML=`<div class="qnote"><b>${esc(hit.farmer_name||"Farmer")}</b> · farmer ID ${esc(hit.farmer_id)} · phone ${esc(mask(hit.phone))}<br>
      ${esc([hit.village,hit.cell,hit.sector,hit.district,hit.province].filter(Boolean).join(", "))}
      ${hit.station_name?` · sells to ${esc(hit.station_name)}`:""}</div>
      ${plots.length?`<table class="qtable"><thead><tr><th>Plot</th><th>Area</th><th>Sector</th><th>Prior use</th><th>Pre-screen</th></tr></thead><tbody>${plots.map(f=>`<tr><td>${esc(f.id)}</td><td>${f.ha??"—"} ha</td><td>${esc(f.sec||"")}</td><td>${esc(f.prior||"")}</td><td>${pill(f.eudr)}</td></tr>`).join("")}</tbody></table>`:'<p class="qnote">No farm polygons are mapped for this farmer yet.</p>'}
      <p class="muted small">Read only — nothing is saved here. Ask your GIS team to change the Portal farms layer.</p>`;
  };
  dlg.showModal();
}
