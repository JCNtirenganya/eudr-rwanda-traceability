// Real farms, farmers and washing stations stay in ArcGIS Portal. The app reads them directly with
// the signed-in Portal token; Supabase holds only chain records.
import {CFG} from "../config.js";
import {req} from "./http.js";
import {classify} from "../landuse.js";
const PROV={South:"Southern",West:"Western",East:"Eastern",North:"Northern"};
const pick=(a,names)=>{for(const n of names)if(a[n]!=null&&a[n]!=="")return a[n];return null};
const PLOT_KEYS=["plot_id","Plot_ID","plotid","PlotID","PlotId","plot_no","Plot_No","parcel_id","Parcel_ID","farm_plot_id","FarmPlotID"];
const FARMER_KEYS=["farmer_id","Farmer_ID","farmerid","FarmerID","FarmerId","farmer_uid","farmer_code"];
const NID_KEYS=["national_id","National_ID","nationalid","NationalID","nid","NID","id_number","ID_Number"];
let nidField="",nidLayer="",farmLayerUrl="";
const unique=a=>[...new Set(a.filter(Boolean))];
const short=u=>String(u).replace(/^https?:\/\/[^/]+/,"").replace(/\/rest\/services\//,"/");
const serviceRoot=u=>String(u||"").replace(/\/FeatureServer\/\d+\/?$/i,"/FeatureServer").replace(/\/$/,"");
const farmRoots=()=>unique([
  serviceRoot(CFG.FARMS_URL),
  "https://gis.naeb.gov.rw/server/rest/services/EUDR_Data/FeatureServer",
  "https://gis.naeb.gov.rw/portal/sharing/servers/63a787f80563400fa9e46af7f006d714/rest/services/EUDR_Data/FeatureServer"
]);
function plotKey(a,fields){
  const v=pick(a,PLOT_KEYS);if(v!=null)return String(v);
  const f=(fields||[]).find(n=>/^(plot|parcel)/i.test(n)&&!/farmer/i.test(n));
  if(f&&a[f]!=null&&a[f]!=="")return String(a[f]);
  const oid=pick(a,["OBJECTID","objectid","ObjectId","FID","fid"]);
  return oid!=null?String(oid):null}

async function layerFeatures(url){
  const meta=await req(url),page=Math.min(meta.maxRecordCount||1000,1000),features=[];
  for(let o=0;;o+=page){
    const d=await req(url+"/query",{where:"1=1",outFields:"*",returnGeometry:true,outSR:4326,resultOffset:o,resultRecordCount:page});
    features.push(...(d.features||[]));
    if(!d.exceededTransferLimit&&(d.features||[]).length<page)break}
  return{features,fields:(meta.fields||[]).map(f=>f.name)}}

// The configured sublayer may be a table or may be hidden behind a different Portal/proxy URL.
// Find the first readable polygon layer once, then every screen uses that same layer.
async function farmLayer(){
  if(farmLayerUrl)return farmLayerUrl;
  const problems=[];
  for(const root of farmRoots()){
    let meta;
    try{meta=await req(root)}
    catch(e){problems.push(`${short(root)}: ${e.message}`);continue}
    const layers=meta.layers||[];
    const preferred=layers.find(l=>`${root}/${l.id}`===CFG.FARMS_URL&&/polygon/i.test(l.geometryType||""));
    const polygons=layers.filter(l=>/polygon/i.test(l.geometryType||""));
    const candidates=[...polygons].sort((a,b)=>a===preferred?-1:b===preferred?1:0).concat(meta.fields&&!polygons.length?[{}]:[]);
    const seen=new Set();
    for(const l of candidates){
      if(!l||seen.has(l.id??"root"))continue;seen.add(l.id??"root");
      const url=l.id!=null?`${root}/${l.id}`:root;
      try{
        const probe=await req(url+"/query",{where:"1=1",outFields:"*",returnGeometry:false,resultRecordCount:1});
        if((probe.features||[]).length){farmLayerUrl=url;farmInfo.source=url;farmInfo.layers=layers.map(x=>`${x.id}:${x.name||""}`);return url}
        problems.push(`${short(url)}: no rows`)
      }catch(e){problems.push(`${short(url)}: ${e.message}`)}
    }
  }
  throw new Error(`No readable farm polygon layer. ${problems.slice(0,4).join(" · ")}`)}

export async function loadCWS(){
  const{features}=await layerFeatures(CFG.CWS_URL);
  return features.map(({attributes:a,geometry:g})=>({type:"station",id:String(a.cws_uid||a.globalid||"").replace(/[{}]/g,"").toLowerCase(),name:(a.cws_name||a.name_of_cw||"").trim(),owner:"",
    ownership:a.type_of_ownership||a.type_of_ow,province:PROV[a.province]||a.province,district:a.district,sector:a.sector,cell:a.cell,village:a.village,capacity_mt:a.processing_capacity,year:a.year_of_establishment>1900?a.year_of_establishment:null,
    phone:"",email:"",src:"live",lat:a.y_coordinate??g?.y,lng:a.x_coordinate??g?.x})).filter(s=>s.lat&&s.lng)}

// Identity fields stay in ArcGIS. The questionnaire uses this with the Portal token the user already has.
export async function findFarmerByNationalId(nid){
  const url=await farmLayer(),q=String(nid).trim().replace(/'/g,"''");
  if(!nidField||nidLayer!==url){const m=await req(url),fields=(m.fields||[]).map(f=>f.name);nidField=NID_KEYS.find(k=>fields.includes(k))||fields.find(n=>/national.?id/i.test(n))||NID_KEYS[0];nidLayer=url}
  const d=await req(url+"/query",{where:`${nidField}='${q}'`,outFields:"*",returnGeometry:false,resultRecordCount:2});
  const a=d.features?.[0]?.attributes;if(!a)return null;
  return{farmer_id:String(pick(a,FARMER_KEYS)||""),farmer_name:a.farmer_name||"",national_id:String(pick(a,NID_KEYS)||nid),phone:String(a.phone||""),province:a.province,district:a.district,
    sector:a.sector,cell:a.cell,village:a.village,cooperative_name:a.cooperative_name||null,station_id:a.station_id||"",station_name:a.station_name||""}}

// EUDR deforestation pre-screen. The test is the land's condition on the cut-off date.
// Best evidence: the date the forest was converted to farmland. Fallback: first planting year — forest must be cleared before coffee
// is planted, so conversion can never be LATER than first planting. Hence planted ≤ 2020 proves conversion ≤ 2020, but planted > 2020 proves nothing.
// Everything is "declared" until the satellite check (deforest_check_*) confirms it. Pre-screening only, not a legal determination.
const CUTOFF=Date.UTC(2020,11,31,23,59,59);
export const farmInfo={convField:"",fields:[],unknownUse:{},values:{},source:"",layers:[]};
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
function toFarm({attributes:a,geometry:g},cf,id){
  const ring=g?.rings?.[0]?.map(p=>[p[1],p[0]]),conv=cf?toMs(a[cf]):null,[eudr,why]=screen(a,conv),t=+a.survey_date||0,farmer=pick(a,FARMER_KEYS)||"";
  return{type:"plot",src:"live",id:String(id),fm:String(farmer),nm:String(farmer),nid:"",phone:"",prov:a.province,coop:a.cooperative_name||"",stn:a.station_id||"",district:a.district,sec:a.sector,cell:a.cell,village:a.village,ha:a.area_ha||0,trees:a.trees_total,kg:a.farmer_prod_kg_2025>100000?null:a.farmer_prod_kg_2025,
    prior:a.prior_land_use,first:a.first_planting_year,conv,sp:a.coffee_species,reg:a.land_registered,ch:a.sale_channel,eudr,why,ring,t,day:t?new Date(t).toISOString().slice(0,10):"",
    c:ring&&[ring.reduce((s,p)=>s+p[0],0)/ring.length,ring.reduce((s,p)=>s+p[1],0)/ring.length]}}

export async function loadFarms(onProgress=()=>{}){
  const url=await farmLayer(),{features:rows,fields:names}=await layerFeatures(url);
  if(!rows.length)throw new Error(`Portal farm layer ${short(url)} returned no rows`);
  cf({convField:CFG.CONVERSION_FIELD},rows,names);const fields=farmInfo.fields;
  const seen=new Map();
  for(const f of rows){const a=f.attributes,id=plotKey(a,fields);if(id==null)continue;
    const lu=classify(a.prior_land_use);if(lu.cls==="unknown"&&lu.text)farmInfo.unknownUse[lu.text.toLowerCase()]=(farmInfo.unknownUse[lu.text.toLowerCase()]||0)+1;
    for(const k of SUGGEST){const v=a[k];if(v!=null&&v!=="")(farmInfo.values[k]??={})[v]=(farmInfo.values[k][v]||0)+1}
    seen.set(id,toFarm(f,farmInfo.convField,id))}
  if(!seen.size)throw new Error(`No farm plot field found in Portal layer (fields: ${fields.slice(0,30).join(", ")})`);
  onProgress(rows.length,rows.length);
  return[...seen.values()]}

function cf(s,rows,names){
  farmInfo.fields=names.length?names:Object.keys(rows[0]?.attributes||{});
  const detected=names.find(n=>/conver/i.test(n));
  farmInfo.convField=(s.convField||detected||"");
  farmInfo.unknownUse={};farmInfo.values={}}

