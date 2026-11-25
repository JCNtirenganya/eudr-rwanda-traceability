// App shell: sign-in gate, loading (stations first, farms in the background), navigation, and re-rendering on every change.
import {CFG} from "./config.js";
import {signIn,onExpired,clearToken,token} from "./data/http.js";
import {loadCWS,loadFarms,recordedFarm} from "./data/live.js";
import {Data,init,status,setFarms} from "./data/index.js";
import {buildTrace,T} from "./trace.js";
import {S,scope,change,onChange,readHash,select,clearAll,dirty} from "./core.js";
import {$,$$,esc,toast,ic,N,COL,LBL} from "./ui.js";
import {initMap,buildFarmLayer,buildStationLayer,paint,renderPanels,wireMap,fitScope,resizeMap,mapReady,kpiHTML,timelineHTML} from "./map.js";
import {renderProfile,nameOf} from "./profile.js";
import {renderGraph} from "./graph.js";
import {renderRegistry,wireRegistry} from "./registry.js";
import {renderReportView,printReport,downloadCsv} from "./report.js";
import {wireSearch,resetSearch} from "./search.js";
import {renderAdmin,ctx} from "./admin.js";
import {hooks,newMenu,openForm,removeRecord,startEdit,resetForms,addFor} from "./forms.js";
import {mapCenter} from "./map.js";
import {openFarmerQuestionnaire} from "./quest.js";
let stations=[],farms=[],farmsDone=false,lastInd=true,builtFarms=null,farmError="";
const NAV=[["overview","Overview","db"],["map","Map","map"],["graph","Network","graph"],["registry","Registry","list"],["report","Reports","file"],["admin","Admin","db"]];

// ---- sign-in gate ----
onExpired(()=>new Promise(res=>{const d=$("#dlg");$("#dmsg").textContent="";d.showModal();
  $("#dform").onsubmit=async e=>{e.preventDefault();try{await signIn(CFG.PORTAL,$("#du").value.trim(),$("#dp").value);$("#dp").value="";d.close();res()}catch(x){$("#dmsg").textContent=x.message}}}));
$("#sform").onsubmit=async e=>{e.preventDefault();const b=$("#sgo");b.disabled=true;$("#smsg").textContent="";
  try{await signIn(CFG.PORTAL,$("#su").value.trim(),$("#sp").value);$("#sp").value="";await start()}catch(x){$("#smsg").textContent=x.message==="Failed to fetch"?"Cannot reach the portal.":x.message;b.disabled=false}};
$("#signout").onclick=()=>{clearToken();location.reload()};

// ---- loading ----
const rowsFor=async()=>{const rows={},srcOf={};for(const id of["cherry_delivery","lot","lot_delivery","export_batch","batch_lot","exporter","importer","cws_recorded","farm_recorded","station_recorded"]){if(!Data.raw[id])continue;
  const demo=Data.raw[id].kind==="demo";srcOf[id]=demo?"indicative":"recorded";rows[id]=demo&&!S.showInd?[]:await Data.repo(id).list().catch(()=>[])}return{rows,srcOf}};
async function rebuildTrace(){const{rows,srcOf}=await rowsFor(),rec=(rows.farm_recorded||[]).map(recordedFarm).filter(Boolean),all=rec.length?farms.concat(rec):farms,fkey=farms.length+":"+rec.length+":"+(rec.at(-1)?.id||"");buildTrace({farms:all,stations,rows,srcOf});dirty();resetSearch();resetForms();
  if(farmsDone&&S.sel&&!valid(S.sel))S.sel=null;if(mapReady()){if(builtFarms!==fkey){buildFarmLayer();builtFarms=fkey}buildStationLayer()}lastInd=S.showInd;render()}
const valid=({type,id})=>!!({plot:T.farmById,farmer:T.plotsOf,station:T.stations,delivery:T.del,lot:T.lot,batch:T.bat,exporter:T.exp,importer:T.imp}[type]||{})[id];
async function start(){
  $("#splash").hidden=true;$("#app").hidden=false;$("#rail").hidden=false;readHash();
  try{stations=await loadCWS();await init({farms:[],stations});}
  catch(e){$("#splash").hidden=false;$("#app").hidden=true;$("#rail").hidden=true;$("#smsg").textContent=(CFG.DEMO_CHAIN?"Could not read Portal farms/CWS: ":"Stations: ")+e.message;$("#sgo").disabled=false;return}
  $("#whoami").textContent=`${Data.me.fullName} · ${Data.me.role}`;$("#browse").open=localStorage.getItem("eudr.browse")==="1";initMap();await rebuildTrace();setView(S.view,true);
  loadFarmsInBackground()}
async function loadFarmsInBackground(){
  try{farms=await loadFarms((d,n)=>{$("#src").textContent=`Loading farm polygons ${N(d)} / ${N(n)}…`});setFarms(farms);farmsDone=true;farmError="";await rebuildTrace();fitScope();banner()}
  catch(e){farmError=e.message;$("#src").innerHTML=`⚠ Farm polygons did not load: ${esc(farmError)} <button class="ghost" id="retryFarms">Retry</button>`;$("#retryFarms").onclick=loadFarmsInBackground}}
ctx.reload=async()=>{await init({farms,stations});await rebuildTrace()};
const banner=()=>{const dm=status().filter(x=>x.mode==="demo"&&["cherry_delivery","lot","lot_delivery","export_batch","batch_lot","exporter","importer"].includes(x.id)),bn=$("#banner");
  if(CFG.DEMO_CHAIN){bn.hidden=false;bn.innerHTML="<b>Demo chain records</b> Farms, farmers and CWS are read live from Portal. Supabase is not connected yet, so chain records are indicative and anything you record here is <b>not saved</b>."}
  else{bn.hidden=!dm.length;bn.innerHTML=dm.length?`<b>Demo data is switched on in this browser</b> for ${dm.length} model(s). Anything you record on them is <b>not saved</b> and is labelled Indicative. <a href="#" id="bnLive">Switch to live data</a>`:""}
  const st=status(),demo=st.filter(s=>s.mode==="demo").length;$("#src").innerHTML=`<span class="dotlive"></span> ${N(farms.length)} farm polygons · ${stations.length} stations`+(farmError?` <span class="tag indicative">⚠ ${esc(farmError)} <button class="ghost" id="retryFarms">Retry</button></span>`:"");
  if(farmError)$("#retryFarms").onclick=loadFarmsInBackground;
  $("#dpill").innerHTML=CFG.DEMO_CHAIN?`<span class="tag indicative">demo chain</span>`:demo?`<span class="tag indicative">${demo} of ${st.length} models on demo</span>`:`<span class="tag real">all models live</span>`;$("#dpill").title="Data status — open Admin for details"};

// ---- views ----
function setView(v,first){S.view=v;$$(".view").forEach(e=>e.classList.toggle("on",e.id==="v-"+v));$$("#navs button").forEach(b=>b.classList.toggle("on",b.dataset.view===v));
  if(v==="map"){resizeMap();if(farmsDone&&(first||scope().active))setTimeout(fitScope,60)}render()}
function renderOverview(){const sc=scope(),fs=sc.farms,c={low:0,review:0,blocked:0};fs.forEach(f=>c[f.eudr]++);const n=fs.length||1;
  $("#ovnote").textContent=sc.active?"For your current focus (change it on the Map).":"For the whole network.";$("#kpis").innerHTML=kpiHTML(sc);$("#timeline").innerHTML=timelineHTML();
  $("#riskbar").innerHTML=`<div class="rbar">${["low","review","blocked"].map(k=>`<i style="width:${100*c[k]/n}%;background:${COL[k]}" title="${LBL[k]}"></i>`).join("")}</div>${["low","review","blocked"].map(k=>`<div class="dline"><span><i class="dot" style="background:${COL[k]};display:inline-block"></i> ${LBL[k]}</span><b>${N(c[k])} <span class="muted">(${fs.length?Math.round(100*c[k]/n):0}%)</span></b></div>`).join("")}<p class="muted small">Pre-screening, not a legal EUDR determination.</p>`;
  $("#dstat").innerHTML=status().map(x=>`<div class="dline"><span>${esc(x.name)}</span><span>${x.mode==="demo"?'<span class="tag indicative">Demo</span>':x.mode==="disabled"?'<span class="tag">Portal only</span>':'<span class="tag real">Supabase</span>'}</span></div>`).join("")}
function render(){
  if(!T.built)return;banner();const v=S.view;
  if(v==="overview")renderOverview();else if(v==="map"){renderPanels();paint()}else if(v==="graph")renderGraph();else if(v==="registry"){renderRegistry();$("#radd").hidden=!REGMODEL(S.rtab)}else if(v==="report")renderReportView();else if(v==="admin")renderAdmin();
  renderProfile();crumbs()}
function crumbs(){const c=[];const add=(k,l,clear)=>c.push(`<span class="crumb">${esc(l)}<button data-clear='${JSON.stringify(clear)}' aria-label="Remove">×</button></span>`);
  if(S.sel)add("sel",`${S.sel.type==="plot"?"farm":S.sel.type}: ${nameOf(S.sel.type,S.sel.id)}`,{sel:null});if(S.imp)add("imp","Importer: "+nameOf("importer",S.imp),{imp:""});if(S.exp)add("exp","Exporter: "+nameOf("exporter",S.exp),{exp:""});
  if(S.stn)add("stn","Station: "+nameOf("station",S.stn),{stn:""});if(S.district)add("d","District: "+S.district,{district:"",sector:""});if(S.sector)add("s","Sector: "+S.sector,{sector:""});
  if(S.risk)add("r",S.risk,{risk:""});if(S.day)add("day","Mapped "+S.day,{day:""});if(S.since)add("since","Mapped since "+new Date(S.since).toISOString().slice(0,10),{since:0});
  $("#crumbs").innerHTML=c.join("");}
// Any change to a filter zooms the map to the plots it concerns.
let lastSig="";const sig=()=>[S.imp,S.exp,S.stn,S.district,S.sector,S.risk,S.day,S.since].join("|");
onChange(()=>{if(lastInd!==S.showInd)rebuildTrace();else render();const g=sig();if(g!==lastSig){lastSig=g;if(S.view==="map"&&farmsDone)setTimeout(fitScope,30)}});

// ---- recording ----
hooks.refresh=rebuildTrace;hooks.center=mapCenter;
const REGMODEL=t=>addFor(t);
$("#recbtn").onclick=e=>{e.stopPropagation();const m=newMenu(),el=$("#recmenu");el.innerHTML=m.length?m.map(([id,l])=>`<button data-new="${id}">${l}</button>`).join(""):'<p class="muted pad">Your account can view data but not record it. Ask an admin for access.</p>';el.hidden=!el.hidden};
document.addEventListener("click",e=>{const n=e.target.closest("[data-new]");if(n){$("#recmenu").hidden=true;n.dataset.new==="find_farmer"?openFarmerQuestionnaire():openForm(n.dataset.new)}else if(!e.target.closest(".menuwrap"))$("#recmenu").hidden=true;
  if(e.target.id==="radd"){const mid=REGMODEL(S.rtab);mid&&openForm(mid)}
  if(e.target.id==="dedit")startEdit(S.sel.type,S.sel.id);if(e.target.id==="ddel")removeRecord(S.sel.type,S.sel.id).then(()=>change({sel:null}))});
document.addEventListener("click",async e=>{if(CFG.DEMO_CHAIN)return;if(e.target.id==="bnLive"){e.preventDefault();const{setBackend}=await import("./data/index.js");for(const id of["cherry_delivery","lot","lot_delivery","export_batch","batch_lot","exporter","importer"])await setBackend(id,"auto");toast("Back to live data");await ctx.reload()}});
// Nothing fails silently: any unexpected error is shown, with detail you can send.
const oops=m=>{console.error(m);toast("Something went wrong: "+String(m?.message||m).slice(0,140))};
addEventListener("error",e=>oops(e.error||e.message));addEventListener("unhandledrejection",e=>oops(e.reason));
// ---- wiring ----
$("#navs").innerHTML=NAV.map(([v,l,i])=>`<button data-view="${v}" title="${l}">${ic(i)}<span>${l}</span></button>`).join("");$("#gsi").innerHTML=ic("search");
$("#navs").onclick=e=>{const b=e.target.closest("[data-view]");if(b){S.view=b.dataset.view;change({view:b.dataset.view});setView(b.dataset.view)}};
$("#crumbs").onclick=e=>{const b=e.target.closest("[data-clear]");b&&change(JSON.parse(b.dataset.clear))};
$("#dpill").onclick=()=>{S.view="admin";setView("admin")};
document.addEventListener("click",e=>{const el=e.target.closest("#drawer [data-t]");if(el){select(el.dataset.t,el.dataset.id);return fitIf()}
  if(e.target.id==="dx")return change({sel:null});if(e.target.id==="dzoom"){setView("map");return fitScope()}if(e.target.id==="dnet")return setView("graph");
  if(e.target.id==="dprint")return printReport(S.sel);if(e.target.id==="dcsv")return downloadCsv(S.sel)});
const fitIf=()=>{if(S.view==="map")fitScope()};
document.addEventListener("jump",()=>{if(S.view==="map")setTimeout(fitScope,50);else if(S.view==="admin"||S.view==="report")setView("map")});
$("#graph").addEventListener("click",e=>{});$("#rbase").onchange=e=>change({rbase:e.target.value});$("#print").onclick=()=>printReport();$("#csv").onclick=()=>downloadCsv();
$("#link").onclick=()=>navigator.clipboard.writeText(location.href).then(()=>toast("Link to this view copied"),()=>toast("Copy the address bar instead"));
wireMap();wireRegistry();wireSearch();
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!document.querySelector("dialog[open]"))change({sel:null})});
globalThis.__eudr={Data,T}; // debug/test handle
if(token())start();
