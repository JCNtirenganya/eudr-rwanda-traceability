// The one door to data. UI code calls Data.repo("cherry_delivery").list() and never knows where records live.
import {CFG} from "../config.js";
import {sb,portalMe} from "./http.js";
import {SupabaseRepo} from "./supabase.js";
import {DemoRepo,GEN} from "./demo.js";
import {modelFromLayer,FARM,STATION} from "../layermodel.js";
import {validateRecord} from "../engine/schema.js";

export const Data={models:{},system:{},repos:{},raw:{},backend:{},me:null,ctx:{farms:[],stations:[],meta:{}},warnings:[]};
const LINK_PARENTS={lot_delivery:["lot","cherry_delivery"],batch_lot:["export_batch","lot"]};
// Identity stays in ArcGIS. These fields are shown in the questionnaire but never stored by the app.
const NO_SYNC=new Set(["farmer_name","national_id","phone","telephone","f_email","owner_name"]);

// Identity always comes from Portal. In offline-demo mode we skip the Supabase identity call
// because the Edge Function is not deployed yet; the Portal token is still mandatory.
export async function whoAmI(){
  if(!CFG.OFFLINE_DEMO)return sb({action:"me"});
  const m=await portalMe(),isAdmin=m.role==="org_admin"||m.username===CFG.OWNER;
  return{username:m.username,fullName:m.fullName||m.username,portalRole:m.role,isAdmin,role:isAdmin?"admin":"viewer",stations:[]}}

function questionnaireModels(meta){
  const out={};
  if(meta?.farmMeta?.fields?.length){
    const m=modelFromLayer(meta.farmMeta,{...FARM,source:"ArcGIS farms"});
    out.farm_recorded={...m,title:"farmer_id",listCols:["plot_id","farmer_id","sector","area_ha"],
      fields:m.fields.filter(f=>!NO_SYNC.has(f.k))};
  }
  if(meta?.stationMeta?.fields?.length){
    const m=modelFromLayer(meta.stationMeta,{...STATION,source:"ArcGIS CWS"});
    out.station_recorded={...m,fields:m.fields.filter(f=>!NO_SYNC.has(f.k))};
  }
  return out;
}

export async function init({farms,stations,fetchSeed=()=>fetch("models/seed.json").then(r=>r.json())}){
  Data.ctx={farms,stations,meta:{}};const seed=await fetchSeed();
  Data.models=Object.fromEntries(seed.models.map(m=>[m.id,m]));Data.system=Object.fromEntries(seed.system.map(m=>[m.id,m]));
  Data.warnings=[];
  try{Data.backend=JSON.parse(localStorage.getItem("eudr.backend")||"{}")}catch{Data.backend={}}
  if(CFG.OFFLINE_DEMO){
    // No Supabase yet: keep the seed models and let the National-ID lookup still go straight to ArcGIS.
    Data.ctx.meta={convField:"",farmMeta:{fields:[]},stationMeta:{fields:[]},syncedAt:null};
  }else{
    try{Data.ctx.meta=await sb({action:"meta"});Object.assign(Data.models,questionnaireModels(Data.ctx.meta))}
    catch(e){Data.warnings.push("The recorded-farm questionnaires could not be loaded: "+e.message)}
  }
  Data.all={...Data.models,...Data.system};for(const id of Object.keys(Data.all))build(id);
  Data.me=await whoAmI();
  return Data}

async function demoRows(id){
  const g=GEN[id];if(!g)return[];
  if(LINK_PARENTS[id]?.some(p=>Data.raw[p]?.kind!=="demo"))return[];
  return g({...Data.ctx,rows:p=>Data.raw[p].raw?Data.raw[p].raw():Data.repos[p].list()})}

// Backend per model: an explicit demo choice in the browser wins; otherwise Supabase.
const user=()=>Data.me?.username||"unknown";
function build(id){
  const m=Data.all[id],want=CFG.OFFLINE_DEMO?"demo":(Data.backend?.[id]||"supabase");let r;
  if(want==="demo")r=new DemoRepo(m,()=>demoRows(id));
  else r=new SupabaseRepo(m,user);
  Data.raw[id]=r;Data.repos[id]=guard(m,r)}
export async function setBackend(id,kind){
  if(CFG.OFFLINE_DEMO)throw new Error("Offline demo is active; storage can be switched once Supabase is configured.");
  if(!Data.me?.isAdmin)throw new Error("Only admins can change the preview setting.");
  Data.backend??={};if(kind==="demo")Data.backend[id]="demo";else delete Data.backend[id];
  localStorage.setItem("eudr.backend",JSON.stringify(Data.backend));Data.warnings=[];Object.keys(Data.all).forEach(build)}
const status=()=>Object.entries(Data.all).map(([id,m])=>{const k=Data.raw[id]?.kind;return{id,name:m.plural,mode:k==="demo"?"demo":"supabase",source:k==="demo"?"indicative":"recorded",url:"",hasPortal:false}});
export {status};

// Permissions: admins do everything; editors only touch cherry records of their own stations; viewers read.
const STATION_SCOPED=new Set(["cherry_delivery","lot"]);
export function can(action,model,rec){const me=Data.me;if(!me)return false;if(me.isAdmin)return true;if(action==="read")return true;
  if(model.mirror&&action==="create")return me.role==="editor";
  if(model.adminOnly||me.role!=="editor")return false;
  if(STATION_SCOPED.has(model.id))return me.stations.includes(rec?.cws_id);
  if(model.id==="lot_delivery")return true;
  return false}
export const redact=(model,r)=>{if(!r)return r;const o={...r};for(const f of model.fields)if(f.pii)delete o[f.k];delete o.geometry;return o};
function guard(model,repo){
  const audit=async(action,key,before,after)=>{const a=Data.raw?.audit_log;if(!a||a.kind==="demo")return;
    try{await a.create({action,model:model.id,record_id:key,username:Data.me?.username||"unknown",at:new Date().toISOString(),before:before?JSON.stringify(redact(model,before)):null,after:after?JSON.stringify(redact(model,after)):null})}catch{}};
  const deny=()=>{throw new Error("Your account is not allowed to do this. Ask an admin (or check your station assignment).")};
  return{kind:()=>repo.kind,model,list:o=>repo.list(o),get:k=>repo.get(k),count:w=>repo.count(w),
    validate:r=>validateRecord(model,r),
    async create(rec){if(!can("create",model,rec))deny();if(repo.blocked)throw new Error("Storage for this data is not connected.");const v=validateRecord(model,rec);if(!v.ok)throw Object.assign(new Error("Please fix the highlighted fields."),{fields:v.errors});
      if(model.id==="cherry_delivery")rec={...rec,recorded_by:Data.me.username};const out=await repo.create(rec);await audit("create",out[model.key],null,out);return out},
    async update(k,p){if(repo.blocked)throw new Error("Storage for this data is not connected.");const cur=await repo.get(k);if(!can("update",model,cur))deny();const v=validateRecord(model,{...cur,...p});if(!v.ok)throw Object.assign(new Error("Please fix the highlighted fields."),{fields:v.errors});
      const out=await repo.update(k,p);await audit("update",k,cur,out);return out},
    async softDelete(k){if(repo.blocked)throw new Error("Storage for this data is not connected.");const cur=await repo.get(k);if(!can("delete",model,cur))deny();await repo.softDelete(k);await audit("delete",k,cur,null)}}}
Data.repo=id=>Data.repos[id];

export function setFarms(farms){Data.ctx.farms=farms;for(const r of Object.values(Data.raw))if(r.kind==="demo")r._r=r._raw=undefined}
