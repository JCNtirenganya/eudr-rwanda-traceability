// Farmer + farms questionnaire. Fields, labels and choices come from the farms layer itself (via the farm_recorded model).
// Steps: find (National ID) → farmer → one step per farm (answers + GPS boundary + live EUDR pre-screen) → review & save.
import {Data} from "./data/index.js";
import {T} from "./trace.js";
import {screen,farmInfo,findFarmerByNationalId} from "./data/live.js";
import {mountWalk} from "./gps.js";
import {toEsriRing,ringsOverlap} from "./geo.js";
import {villagePrefixes,idKey,nextFarmerId,nextPlotId,isFarmerId,isNationalId,isPhone} from "./ids.js";
import {validateRecord} from "./engine/schema.js";
import {renderField,hooks} from "./forms.js";
import {$,esc,N,toast,pill,combo,LBL} from "./ui.js";
const FARMER=["national_id","farmer_name","phone","farmer_id","cooperative_name","sale_channel","province","district","sector","cell","village"],AUTO=new Set(["plot_id","area_ha","survey_date","enumerator_id","geometry_valid","overlaps_other_plot","overlaps_protected_area","deforest_check_result","deforest_check_date","deforest_check_source","eudr_status","eudr_status_reason","station_id","station_name","gps_method","gps_accuracy_m","gps_points",...FARMER]);
const WORKERS=["worker_age_category","under16_hazardous_work","workers_free_to_leave","forced_labour_indicator"],WDEF={under16_hazardous_work:"No",workers_free_to_leave:"Yes",forced_labour_indicator:"No"};
const PRIOR=["Cropland","Forest/Wooded land","Grassland/Pasture","Other"],today=()=>new Date().toISOString().slice(0,10),yr=new Date().getFullYear();
let Q,dlg;
const model=()=>Data.models.farm_recorded,fld=k=>model().fields.find(f=>f.k===k);
// Layer field → question. Text fields whose answers are a short repeating list become choices; longer lists become suggestions.
function ask(f){const o={...f,w:false},v=farmInfo.values[f.k];
  if(f.k==="prior_land_use")return{...o,type:"choice",choices:PRIOR.map(c=>({code:c,label:c==="Other"?"Other (describe)":c}))};
  if(f.type==="text"&&v){const a=Object.entries(v).sort((x,y)=>y[1]-x[1]);if(a.length<=8)return{...o,type:"choice",choices:a.map(([c])=>({code:c,label:c}))}}
  if(f.k==="first_planting_year"||f.k==="last_planting_year")return{...o,type:"int",min:1900,max:yr};
  if(f.k==="trees_total")return{...o,type:"int",min:1};if(/^farmer_prod/.test(f.k))return{...o,min:0};return o}
const farmFields=()=>model().fields.filter(f=>!AUTO.has(f.k)&&f.type!=="file").map(ask).filter(f=>!WORKERS.includes(f.k)||Q.cur?.vals.hires_workers==="Yes");
const steps=()=>["find",...(Q.existing?[]:["farmer"]),...Q.farms.map((_,i)=>i),"review"];
function head(){const s=steps(),i=s.indexOf(Q.step),lab=x=>x==="find"?"Find farmer":x==="farmer"?"Farmer":x==="review"?"Review & save":"Farm "+(x+1);return`<div class="qsteps">${s.map((x,j)=>`<span class="${j===i?"on":j<i?"done":""}">${lab(x)}</span>`).join("")}</div>`}
function read(){const vals=Q.step==="farmer"?Q.farmer:Q.cur?.vals;if(!vals)return;dlg.querySelectorAll("[data-k]").forEach(el=>{const k=el.dataset.k;let v=el.value;const f=el.classList.contains("mc")?null:null;if(v==="")v=null;
    const t=fld(k)?.type;if(v!=null&&["int","decimal"].includes(t))v=+v;vals[k]=v})}
const err=(k,t)=>{const e=dlg.querySelector(`[data-fk="${k}"] .ferr`);if(e)e.textContent=t};
function show(html,nav){dlg.innerHTML=`<form id="qf" novalidate><h3>Register a farmer &amp; map their farms</h3>${head()}${html}<p class="err" id="qerr" role="alert"></p><div class="row">${nav}</div></form>`;$("#qcancel")&&($("#qcancel").onclick=()=>{stop();dlg.close()});$("#qf").onsubmit=e=>{e.preventDefault();next()}}
let walk=null;const stop=()=>{walk?.stop();walk=null};
export function openFarmerQuestionnaire(){dlg=$("#modal");Q={step:"find",existing:false,farmer:{},farms:[],cur:null};if(!model())return toast("The recorded-farms table is not set up yet. An admin can create it in Admin.");view();dlg.showModal()}
function view(){stop();const s=Q.step;
  if(s==="find")return show(`<p class="qnote">Start with the farmer's <b>National ID</b>. If they are already registered, you will add a farm to them instead of creating a duplicate.</p><div class="fld"><label>National ID (16 digits) *<input data-k="national_id" inputmode="numeric" maxlength="16" value="${esc(Q.farmer.national_id||"")}"></label><span class="ferr"></span></div><div id="found"></div>`,'<button type="button" class="ghost" id="qcancel">Cancel</button><button>Continue</button>');
  if(s==="farmer"){const f=Q.farmer;const html=FARMER.filter(k=>fld(k)||k==="farmer_id").map(k=>{const mf=fld(k)||{k,label:"Farmer ID",type:"text",req:true,len:12};return renderField({...ask(mf),w:["cooperative_name","sale_channel"].includes(k)},f[k])}).join("");
    show(`<div class="grid2">${html}</div><div class="gpsrow"><button type="button" class="ghost" id="qsuggest">Suggest the next farmer ID for this village</button><span id="qsug" class="muted"></span></div><div class="fld w"><div class="lk" id="qstn"></div><small class="muted">The station this farmer sells to. This gives a confirmed farm-to-station link.</small></div>`,'<button type="button" class="ghost" id="qback">Back</button><button>Continue</button>');
    combo($("#qstn"),{label:"Washing station (optional)",get:()=>Object.values(T.stations).map(x=>({v:x.id,t:x.name,sub:`${x.sector}, ${x.district}`})),value:f.station_id||"",onPick:v=>{f.station_id=v;f.station_name=T.stations[v]?.name||""}});
    ["district","sector","cell","village"].forEach(k=>{const el=dlg.querySelector(`[data-k="${k}"]`);if(!el)return;el.setAttribute("list","dl_"+k);const dl=document.createElement("datalist");dl.id="dl_"+k;el.after(dl);
      const fill=()=>{const g=Object.fromEntries(["district","sector","cell"].map(x=>[x,dlg.querySelector(`[data-k="${x}"]`)?.value]));dl.innerHTML=[...new Set(T.farms.filter(x=>(k==="district"||x.district===g.district)&&(["district","sector"].includes(k)||x.sec===g.sector)&&(k!=="village"||x.cell===g.cell)).map(x=>({district:x.district,sector:x.sec,cell:x.cell,village:x.village}[k])).filter(Boolean))].sort().slice(0,300).map(v=>`<option value="${esc(v)}">`).join("")};el.addEventListener("focus",fill);el.addEventListener("input",fill)});
    $("#qback").onclick=()=>{read();Q.step="find";view()};$("#qsuggest").onclick=()=>{read();const f=Q.farmer,p=villagePrefixes(T.farms)[idKey(f.district,f.sector,f.cell,f.village)];const el=dlg.querySelector('[data-k="farmer_id"]');
      if(!p)return $("#qsug").textContent="This village has no farmers yet, so its ID prefix is unknown. Enter the 12-digit ID by hand.";const id=nextFarmerId(p,Object.keys(T.plotsOf));el.value=id||"";$("#qsug").textContent=id?`Next in this village: ${id}`:"This village has no free numbers."};return}
  if(s==="review")return reviewView();farmView(s)}
function farmView(i){const F=Q.farms[i];Q.cur=F;Q.lastHire=F.vals.hires_workers??null;const fs=farmFields(),pr=F.vals.prior_land_use;
  const html=fs.map(f=>renderField({...f,w:f.type==="longtext"},f.k==="prior_land_use"&&pr&&!PRIOR.slice(0,3).includes(pr)&&pr!=="Other"?"Other":F.vals[f.k]===undefined?"":F.vals[f.k])).join("")+`<div class="fld w" id="priorOther" ${pr&&(pr==="Other"||!PRIOR.slice(0,3).includes(pr))?"":"hidden"}><label>Describe the previous land use *<input id="priorTxt" value="${esc((F.vals.prior_land_use||"").replace(/^Other:?\s*/,""))}"></label><span class="ferr"></span></div>`;
  const f0=Q.farmer.farmer_name||"this farmer";
  show(`<p class="qnote"><b>Farm ${i+1}</b> of ${esc(f0)} · plot ID will be assigned automatically</p><div class="grid2">${html}</div><h4 class="qgrp">Boundary — walk it with the GPS</h4><div id="qwalk"></div><div id="qscreen" class="qnote" hidden></div>`,
    `<button type="button" class="ghost" id="qback">Back</button>${Q.farms.length>1?'<button type="button" class="ghost" id="qdrop">Remove this farm</button>':""}<button>${i===Q.farms.length-1?"Review":"Next farm"}</button>`);
  walk=mountWalk($("#qwalk"),{onChange:r=>{F.walk=r;F.pts=r.ring;screenNote(F)}});if(F.pts?.length)walk.set(F.pts);
  const upd=()=>{read();const po=$("#priorOther");const sel=dlg.querySelector('[data-k="prior_land_use"]');if(sel)po.hidden=sel.value!=="Other";if((F.vals.hires_workers??null)!==Q.lastHire)farmView(i);else screenNote(F)}; // re-render only when the worker questions must appear or disappear
  dlg.querySelector("#qf").addEventListener("change",upd);$("#qback").onclick=()=>{read();prior(F);const s=steps(),k=s.indexOf(i);Q.step=s[k-1];view()};$("#qdrop")?.addEventListener("click",()=>{Q.farms.splice(i,1);Q.step=Math.max(0,i-1);if(!Q.farms.length)Q.step="review";view()});screenNote(F)}
function prior(F){const sel=dlg.querySelector('[data-k="prior_land_use"]');if(sel&&sel.value==="Other"){const t=$("#priorTxt")?.value.trim();F.vals.prior_land_use=t?"Other: "+t:"Other"}}
function screenNote(F){const el=$("#qscreen");if(!el)return;const r=F.walk;if(!r||!r.ok){el.hidden=true;return}read();const v={...F.vals};if(v.prior_land_use==="Other"){const t=$("#priorTxt")?.value.trim();v.prior_land_use=t?"Other: "+t:"Other"}
  const[st,why]=screen({prior_land_use:v.prior_land_use,first_planting_year:v.first_planting_year,overlaps_other_plot:F.overlap?"overlap":null},null);el.hidden=false;el.innerHTML=`${r.area.toFixed(4)} ha · ${pill(st)}<br><span class="muted">${esc(why)}</span>`}
function checkFarm(F){const v=F.vals,errs={};const fs=farmFields();read();prior(F);
  for(const f of fs){const x=F.vals[f.k];if(f.req&&(x==null||x===""))errs[f.k]=`${f.label} is required.`}
  const dummy={...Q.farmer,...F.vals,plot_id:"x",area_ha:1};const r=validateRecord(model(),dummy);for(const[k,m]of Object.entries(r.errors))if(!AUTO.has(k)||k==="area_ha")errs[k]??=m;delete errs.area_ha;
  if(v.prior_land_use==="Other"&&!$("#priorTxt")?.value.trim()){$("#priorOther .ferr").textContent="Describe the previous land use.";errs.prior_land_use="Describe the previous land use."}
  if(+v.last_planting_year<+v.first_planting_year)errs.last_planting_year="Last planting year cannot be before the first.";
  if(!F.walk?.ok)errs._geom="Walk or tap the boundary first (at least 3 points, not crossing itself). EUDR needs the plot's geolocation.";
  F.overlap=false;if(F.walk?.ok){const ring=F.walk.ring;const la=ring.map(p=>p[0]),lo=ring.map(p=>p[1]),b=[Math.min(...la),Math.max(...la),Math.min(...lo),Math.max(...lo)];
    F.overlap=T.farms.some(o=>o.ring&&o.c[0]>=b[0]-3e-4&&o.c[0]<=b[1]+3e-4&&o.c[1]>=b[2]-3e-4&&o.c[1]<=b[3]+3e-4&&ringsOverlap(ring,o.ring))||Q.farms.some(o=>o!==F&&o.walk?.ok&&ringsOverlap(ring,o.walk.ring))}
  return errs}
function reviewView(){const rows=Q.farms.map((F,i)=>{const[st,why]=screen({prior_land_use:F.vals.prior_land_use,first_planting_year:F.vals.first_planting_year,overlaps_other_plot:F.overlap?"overlap":null},null);return`<tr><td>Farm ${i+1}</td><td>${F.walk.area.toFixed(4)} ha</td><td>${esc(F.vals.prior_land_use||"")}</td><td>${esc(F.vals.first_planting_year??"")}</td><td>${pill(st)}</td></tr>${F.overlap?`<tr><td colspan="5" class="bad">⚠ This boundary overlaps another mapped farm. It will be saved but blocked until resolved.</td></tr>`:""}`}).join("");
  const f=Q.farmer;show(`<p class="qnote"><b>${esc(f.farmer_name)}</b> · farmer ID ${esc(f.farmer_id)} · ${esc(f.village||"")}, ${esc(f.cell||"")}, ${esc(f.sector||"")}${f.station_name?` · sells to ${esc(f.station_name)}`:""}${Q.existing?" · <i>existing farmer</i>":""}</p>
   <table class="qtable"><thead><tr><th></th><th>Area</th><th>Previous use</th><th>First planted</th><th>Pre-screen</th></tr></thead><tbody>${rows}</tbody></table><p class="muted small">These are saved as <b>Recorded</b> farms. The EUDR result is a pre-screening, not a legal determination. Your GIS team can later merge them into the official farms layer.</p>`,
   '<button type="button" class="ghost" id="qback">Back</button><button type="button" class="ghost" id="qadd">+ Add another farm</button><button id="qsave">Save farmer and farm(s)</button>');
  $("#qback").onclick=()=>{Q.step=Q.farms.length-1;view()};$("#qadd").onclick=()=>{Q.farms.push({vals:{}});Q.step=Q.farms.length-1;view()};$("#qf").onsubmit=e=>{e.preventDefault();save()}}
async function next(){const err_=$("#qerr");err_.textContent="";dlg.querySelectorAll(".ferr").forEach(e=>e.textContent="");const s=Q.step;
  if(s==="find"){const el=dlg.querySelector('[data-k="national_id"]'),nid=el.value.trim();Q.farmer.national_id=nid;if(!isNationalId(nid))return err("national_id","A National ID has 16 digits.");
    $("#found").textContent="Looking up the Portal…";
    let hit=null;try{hit=await findFarmerByNationalId(nid)}catch(x){$("#found").textContent="";return err("national_id","Portal lookup failed: "+x.message)}
    if(hit?.farmer_id){$("#found").innerHTML=`<div class="qnote"><b>${esc(hit.farmer_name)}</b> is already registered (farmer ID ${esc(hit.farmer_id)}).<br><button type="button" id="qaddto">Add a farm to this farmer</button></div>`;
      $("#qaddto").onclick=()=>{Q.existing=true;Q.farmer=hit;Q.farms=[{vals:{}}];Q.step=0;view()};return}
    $("#found").textContent="";Q.existing=false;Q.step="farmer";return view()}
  if(s==="farmer"){read();const f=Q.farmer,e={};for(const k of["farmer_name","province","district","sector","cell","village"])if(!f[k])e[k]="Required.";if(!f.farmer_name||String(f.farmer_name).trim().length<3)e.farmer_name="Enter the farmer's full name.";
    if(!isPhone(f.phone))e.phone="A phone number has 9 digits (without the leading 0).";if(!isFarmerId(f.farmer_id))e.farmer_id="A farmer ID has 12 digits. Use “Suggest” or enter it.";else if(T.plotsOf[f.farmer_id])e.farmer_id="This farmer ID is already used.";
    if(Object.keys(e).length){for(const[k,m]of Object.entries(e))err(k,m);return err_.textContent="Please fix the highlighted fields."}if(!Q.farms.length)Q.farms=[{vals:{}}];Q.step=0;return view()}
  if(typeof s==="number"){const F=Q.farms[s],e=checkFarm(F);const g=e._geom;delete e._geom;if(Object.keys(e).length||g){for(const[k,m]of Object.entries(e))err(k,m);return err_.textContent=g||"Please fix the highlighted fields."}
    if(s===Q.farms.length-1)Q.step="review";else Q.step=s+1;return view()}}
async function save(){const b=$("#qsave"),e=$("#qerr");b.disabled=true;e.textContent="";const repo=Data.repo("farm_recorded"),made=[],ids=[];
  try{for(const F of Q.farms){const plot_id=nextPlotId(Q.farmer.farmer_id,T.farms.map(f=>f.id),ids);if(!plot_id)throw new Error("This farmer already has 99 plots.");ids.push(plot_id);
      const rec={...Q.farmer,...F.vals,plot_id,area_ha:+F.walk.area.toFixed(4),survey_date:today(),enumerator_id:Data.me.username,geometry_valid:1,overlaps_other_plot:F.overlap?"overlap":null,gps_method:F.walk.method,gps_accuracy_m:F.walk.accuracy!=null?+F.walk.accuracy.toFixed(1):null,gps_points:F.walk.raw,geometry:toEsriRing(F.walk.ring)};
      for(const k of WORKERS)if(F.vals.hires_workers!=="Yes"&&WDEF[k]!==undefined)rec[k]=WDEF[k];if(rec.hires_workers!=="Yes")rec.worker_age_category=null;
      made.push(await repo.create(rec))}
    stop();dlg.close();toast(`Saved ${made.length} farm(s) for ${Q.farmer.farmer_name}`);await hooks.refresh()}
  catch(x){for(const m of made)await repo.softDelete(m.plot_id).catch(()=>{});e.textContent=(x.message||"Could not save")+(made.length?" Nothing was saved; your answers are still here — press Save to try again.":"");b.disabled=false}}
