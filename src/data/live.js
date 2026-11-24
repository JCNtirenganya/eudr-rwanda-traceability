// Real farms, farmers and washing stations stay in ArcGIS Portal. The app reads them directly with
// the signed-in Portal token; Supabase holds only chain records.
import {CFG} from "../config.js";
import {req} from "./http.js";
import {demoBase} from "./demo.js";
import {classify} from "../landuse.js";
const PROV={South:"Southern",West:"Western",East:"Eastern",North:"Northern"};

async function layerFeatures(url){
  const meta=await req(url),page=Math.min(meta.maxRecordCount||1000,1000),features=[];
  for(let o=0;;o+=page){
    const d=await req(url+"/query",{where:"1=1",outFields:"*",returnGeometry:true,outSR:4326,resultOffset:o,resultRecordCount:page});
    features.push(...(d.features||[]));
    if(!d.exceededTransferLimit&&(d.features||[]).length<page)break}
  return{features,fields:(meta.fields||[]).map(f=>f.name)}}

export async function loadCWS(){
  if(CFG.OFFLINE_DEMO)return(await demoBase()).stations.map(s=>({...s}));
  const{features}=await layerFeatures(CFG.CWS_URL);
  return features.map(({attributes:a,geometry:g})=>({type:"station",id:String(a.cws_uid||a.globalid||"").replace(/[{}]/g,"").toLowerCase(),name:(a.cws_name||a.name_of_cw||"").trim(),owner:"",
    ownership:a.type_of_ownership||a.type_of_ow,province:PROV[a.province]||a.province,district:a.district,sector:a.sector,cell:a.cell,village:a.village,capacity_mt:a.processing_capacity,year:a.year_of_establishment>1900?a.year_of_establishment:null,
    phone:"",email:"",src:"live",lat:a.y_coordinate??g?.y,lng:a.x_coordinate??g?.x})).filter(s=>s.lat&&s.lng)}

async function farmsUrl(){
  if(CFG.FARMS_URL)return CFG.FARMS_URL;
  const it=await req(`${CFG.PORTAL}/sharing/rest/content/items/${CFG.FARMS_ITEM_ID}`);
  return/\/\d+$/.test(it.url)?it.url:`${it.url}/${CFG.FARMS_LAYER}`}
// Identity fields stay in ArcGIS. The questionnaire uses this with the Portal token the user already has.
export async function findFarmerByNationalId(nid){
  const url=await farmsUrl(),q=String(nid).trim().replace(/'/g,"''"),d=await req(url+"/query",{where:`national_id='${q}'`,outFields:"*",returnGeometry:false,resultRecordCount:2});
  const a=d.features?.[0]?.attributes;if(!a)return null;
  return{farmer_id:String(a.farmer_id||""),farmer_name:a.farmer_name||"",national_id:String(a.national_id||nid),phone:String(a.phone||""),province:a.province,district:a.district,
    sector:a.sector,cell:a.cell,village:a.village,cooperative_name:a.cooperative_name||null,station_id:a.station_id||"",station_name:a.station_name||""}}

// EUDR deforestation pre-screen. The test is the land's condition on the cut-off date.
// Best evidence: the date the forest was converted to farmland. Fallback: first planting year — forest must be cleared before coffee
// is planted, so conversion can never be LATER than first planting. Hence planted ≤ 2020 proves conversion ≤ 2020, but planted > 2020 proves nothing.
// Everything is "declared" until the satellite check (deforest_check_*) confirms it. Pre-screening only, not a legal determination.
const CUTOFF=Date.UTC(2020,11,31,23,59,59);
export const farmInfo={convField:"",fields:[],unknownUse:{},values:{}};
const SUGGEST=["land_acquisition","land_dispute","registered_to_farmer","hires_workers","worker_age_category","cooperative_name","sale_channel","land_registered","coffee_species"];
export function toMs(v){if(v==null||v==="")return null;if(typeof v==="number")return v>1e11?v:(v>=1900&&v<=2100?Date.UTC(v,11,31):null);const t=Date.parse(v);return isNaN(t)?(/^\d{4}$/.test(String(v).trim())?Date.UTC(+v,11,31):null):t}
export function screen(a,conv){
  const lu=classify(a.prior_land_use),forest=lu.cls==="forest",y=a.first_planting_year>=1900&&a.first_planting_year<=2026?a.first_planting_year:null,via=lu.text?` (“${lu.text}” read as forest)`:"";
  if(a.overlaps_other_plot)return["blocked","Plot geometry: "+String(a.overlaps_other_plot).replace(/_/g," ")];
  if(lu.cls==="unknown"&&y!=null&&y<=2020)return["low",`Prior land use ${lu.text?`“${lu.text}” is not recognised, but`:"is not recorded, but"} coffee was first planted in ${y}, so the land was farmland before 31 Dec 2020 (declared, from first planting year). Satellite check pending.`];
  if(lu.cls==="unknown")return["review",lu.text?`Prior land use “${lu.text}” is not recognised and coffee was first planted ${y!=null?"in "+y:"in an unknown year"}: classify it, or confirm it was farmland before 31 Dec 2020.`:`Prior land use is missing and coffee was first planted ${y!=null?"in "+y:"in an unknown year"}: record it, or confirm it was farmland before 31 Dec 2020.`];
  if(!forest)return["low",lu.cls==="vacant"?"Land was vacant (no other crop) before coffee: not forest (declared). Satellite check pending.":lu.cls==="quarry"?"Land was a quarry before coffee: not forest (declared). Satellite check pending.":"Not forest before conversion. Satellite check pending."];
  if(conv!=null)return conv<=CUTOFF?["low","Forest"+via+" converted before 31 Dec 2020 (declared): deforestation-free. Satellite check pending."]:["blocked","Forest"+via+" converted after 31 Dec 2020 (declared): not deforestation-free."];
  if(y!=null&&y<=2020)return["low",`Forest${via}; coffee first planted in ${y}, so it was converted no later than that — before 31 Dec 2020 (declared, from first planting year). Satellite check pending.`];
  if(y!=null)return["review",`Forest${via}; coffee first planted in ${y}. Confirm the forest was converted to farmland before 31 Dec 2020 (planting after 2020 does not by itself mean conversion after 2020).`];
  return["review","Forest and no conversion date or valid first planting year recorded."]}
function toFarm({attributes:a,geometry:g},cf){
  const ring=g?.rings?.[0]?.map(p=>[p[1],p[0]]),conv=cf?toMs(a[cf]):null,[eudr,why]=screen(a,conv),t=+a.survey_date||0;
  return{type:"plot",src:"live",id:String(a.plot_id),fm:String(a.farmer_id),nm:String(a.farmer_id||""),nid:"",phone:"",prov:a.province,coop:a.cooperative_name||"",stn:a.station_id||"",district:a.district,sec:a.sector,cell:a.cell,village:a.village,ha:a.area_ha||0,trees:a.trees_total,kg:a.farmer_prod_kg_2025>100000?null:a.farmer_prod_kg_2025,
    prior:a.prior_land_use,first:a.first_planting_year,conv,sp:a.coffee_species,reg:a.land_registered,ch:a.sale_channel,eudr,why,ring,t,day:t?new Date(t).toISOString().slice(0,10):"",
    c:ring&&[ring.reduce((s,p)=>s+p[0],0)/ring.length,ring.reduce((s,p)=>s+p[1],0)/ring.length]}}

export async function loadFarms(onProgress=()=>{}){
  if(CFG.OFFLINE_DEMO){
    const rows=(await demoBase()).farms;
    farmInfo.convField="";farmInfo.fields=Object.keys(rows[0]||{});farmInfo.unknownUse={};farmInfo.values={};
    for(const f of rows){const lu=classify(f.prior);if(lu.cls==="unknown"&&lu.text){const k=lu.text.toLowerCase();farmInfo.unknownUse[k]=(farmInfo.unknownUse[k]||0)+1}}
    onProgress(rows.length,rows.length);
    return rows.map(f=>({...f}))}
  const{features:rows,fields:names}=await layerFeatures(await farmsUrl());
  cf({convField:CFG.CONVERSION_FIELD},rows,names);const fields=(names.length?names:Object.keys(rows[0]?.attributes||{}));
  const seen=new Map();
  for(const f of rows){const a=f.attributes;if(a.plot_id==null)continue;
    const lu=classify(a.prior_land_use);if(lu.cls==="unknown"&&lu.text)farmInfo.unknownUse[lu.text.toLowerCase()]=(farmInfo.unknownUse[lu.text.toLowerCase()]||0)+1;
    for(const k of SUGGEST){const v=a[k];if(v!=null&&v!=="")(farmInfo.values[k]??={})[v]=(farmInfo.values[k][v]||0)+1}
    seen.set(a.plot_id,toFarm(f,farmInfo.convField))}
  onProgress(rows.length,rows.length);
  return[...seen.values()]}

function cf(s,rows,names){
  farmInfo.fields=names.length?names:Object.keys(rows[0]?.attributes||{});
  const detected=names.find(n=>/conver/i.test(n));
  farmInfo.convField=(s.convField||detected||"");
  farmInfo.unknownUse={};farmInfo.values={}}

// Farms entered in this system become ordinary farm objects, screened by the same rules, tagged "recorded".
export function recordedFarm(r){const ring=r.geometry?.rings?.[0]?.map(p=>[p[1],p[0]]);if(!ring||ring.length<3)return null;
  const[eudr,why]=screen({prior_land_use:r.prior_land_use,first_planting_year:r.first_planting_year,overlaps_other_plot:r.overlaps_other_plot},null),t=toMs(r.survey_date)||toMs(r.created_date)||0,n=ring.length>1&&ring[0][0]===ring.at(-1)[0]?ring.slice(0,-1):ring;
  return{type:"plot",src:"recorded",id:String(r.plot_id),fm:String(r.farmer_id),nm:String(r.farmer_id||""),nid:"",phone:"",prov:r.province,coop:r.cooperative_name||"",stn:r.station_id||"",district:r.district,sec:r.sector,cell:r.cell,village:r.village,
    ha:r.area_ha||0,trees:r.trees_total,kg:r.farmer_prod_kg_2025,prior:r.prior_land_use,first:r.first_planting_year,conv:null,sp:r.coffee_species,reg:r.land_registered,ch:r.sale_channel,eudr,why,ring:n,t,day:t?new Date(t).toISOString().slice(0,10):"",
    c:[n.reduce((a,p)=>a+p[0],0)/n.length,n.reduce((a,p)=>a+p[1],0)/n.length]}}
export async function layerMetas(){if(CFG.OFFLINE_DEMO)return{farms:{fields:[]},stations:{fields:[]}};const[f,st]=await Promise.all([req(await farmsUrl()),req(CFG.CWS_URL)]);return{farms:f,stations:st}}
