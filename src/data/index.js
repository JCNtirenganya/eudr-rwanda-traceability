// The one door to data. UI code calls Data.repo("cherry_delivery").list() and never knows where records live.
import {CFG} from "../config.js";
import {portalMe} from "./http.js";
import {SupabaseRepo} from "./supabase.js";
import {DemoRepo,GEN} from "./demo.js";
import {validateRecord} from "../engine/schema.js";

export const Data={models:{},system:{},repos:{},raw:{},backend:{},me:null,ctx:{farms:[],stations:[],meta:{}},warnings:[]};
const LINK_PARENTS={lot_delivery:["lot","cherry_delivery"],batch_lot:["export_batch","lot"]};
// Supabase holds chain records only. Real farms, farmers and CWS stay on the Portal.
export const CHAIN=new Set(["cherry_delivery","lot","lot_delivery","export_batch","batch_lot","exporter","importer"]);
export const DISABLED=new Set(["cws_recorded","farmer_recorded","farm_recorded","station_recorded","user_assignment","audit_log"]);

// Identity always comes from Portal. Supabase only checks the same token before serving chain records.
export async function whoAmI(){
  const m=await portalMe(),isAdmin=m.role==="org_admin"||m.username===CFG.OWNER;
  return{username:m.username,fullName:m.fullName||m.username,portalRole:m.role,isAdmin,role:isAdmin?"admin":"viewer",stations:[]}}

class DisabledRepo{
  constructor(model){this.m=model;this.kind="disabled";this.blocked=true}
  async list(){return[]}
  async count(){return 0}
  async get(){return null}
  async create(){throw new Error("This table is disabled: real farms, farmers and CWS stay on the Portal.")}
  async update(){throw new Error("This table is disabled.")}
  async softDelete(){throw new Error("This table is disabled.")}
}

export async function init({farms,stations,fetchSeed=()=>fetch("models/seed.json").then(r=>r.json())}){
  Data.ctx={farms,stations,meta:{}};const seed=await fetchSeed();
  Data.models=Object.fromEntries(seed.models.map(m=>[m.id,m]));Data.system=Object.fromEntries(seed.system.map(m=>[m.id,m]));
  Data.warnings=[];
  try{Data.backend=JSON.parse(localStorage.getItem("eudr.backend")||"{}")}catch{Data.backend={}}
  // Farms/CWS are read from the Portal directly. No questionnaire model is built from a Supabase mirror.
  Data.ctx.meta={convField:CFG.CONVERSION_FIELD||"",farmMeta:{fields:[]},stationMeta:{fields:[]},syncedAt:null};
  Data.all={...Data.models,...Data.system};for(const id of Object.keys(Data.all))build(id);
  Data.me=await whoAmI();
  return Data}

async function demoRows(id){
  const g=GEN[id];if(!g)return[];
  if(LINK_PARENTS[id]?.some(p=>Data.raw[p]?.kind!=="demo"))return[];
  return g({...Data.ctx,rows:p=>Data.raw[p].raw?Data.raw[p].raw():Data.repos[p].list()})}

// Backend per model: disabled support tables, then demo chain records, then Supabase chain records.
const user=()=>Data.me?.username||"unknown";
function build(id){
  const m=Data.all[id];let r;
  if(DISABLED.has(id))r=new DisabledRepo(m);
  else if(CFG.DEMO_CHAIN||Data.backend?.[id]==="demo")r=new DemoRepo(m,()=>demoRows(id));
  else r=new SupabaseRepo(m,user);
  Data.raw[id]=r;Data.repos[id]=guard(m,r)}
export async function setBackend(id,kind){
  if(DISABLED.has(id))throw new Error("This table is disabled; real farms and CWS stay on the Portal.");
  if(CFG.DEMO_CHAIN)throw new Error("Demo chain mode is active; storage can be switched once Supabase is configured.");
  if(!Data.me?.isAdmin)throw new Error("Only admins can change the preview setting.");
  Data.backend??={};if(kind==="demo")Data.backend[id]="demo";else delete Data.backend[id];
  localStorage.setItem("eudr.backend",JSON.stringify(Data.backend));Data.warnings=[];Object.keys(Data.all).forEach(build)}
const status=()=>Object.entries(Data.all).map(([id,m])=>{const k=Data.raw[id]?.kind;return{id,name:m.plural,mode:k==="demo"?"demo":k==="disabled"?"disabled":"supabase",source:k==="demo"?"indicative":k==="disabled"?"not stored":"recorded",url:"",hasPortal:false}});
export {status};

// Permissions: admins do everything; editors only touch cherry records of their own stations; viewers read.
const STATION_SCOPED=new Set(["cherry_delivery","lot"]);
export function can(action,model,rec){const me=Data.me;if(!me)return false;if(DISABLED.has(model.id))return false;if(me.isAdmin)return true;if(action==="read")return true;
  if(model.mirror&&action==="create")return me.role==="editor";
  if(model.adminOnly||me.role!=="editor")return false;
  if(STATION_SCOPED.has(model.id))return me.stations.includes(rec?.cws_id);
  if(model.id==="lot_delivery")return true;
  return false}
export const redact=(model,r)=>{if(!r)return r;const o={...r};for(const f of model.fields)if(f.pii)delete o[f.k];delete o.geometry;return o};
function guard(model,repo){
  const deny=()=>{throw new Error("Your account is not allowed to do this. Ask your Portal administrator.")};
  return{kind:()=>repo.kind,model,list:o=>repo.list(o),get:k=>repo.get(k),count:w=>repo.count(w),
    validate:r=>validateRecord(model,r),
    async create(rec){if(!can("create",model,rec))deny();if(repo.blocked)throw new Error("Storage for this data is not connected.");const v=validateRecord(model,rec);if(!v.ok)throw Object.assign(new Error("Please fix the highlighted fields."),{fields:v.errors});
      if(model.id==="cherry_delivery")rec={...rec,recorded_by:Data.me.username};return repo.create(rec)},
    async update(k,p){if(repo.blocked)throw new Error("Storage for this data is not connected.");const cur=await repo.get(k);if(!can("update",model,cur))deny();const v=validateRecord(model,{...cur,...p});if(!v.ok)throw Object.assign(new Error("Please fix the highlighted fields."),{fields:v.errors});
      return repo.update(k,p)},
    async softDelete(k){if(repo.blocked)throw new Error("Storage for this data is not connected.");const cur=await repo.get(k);if(!can("delete",model,cur))deny();return repo.softDelete(k)}}}
Data.repo=id=>Data.repos[id];

export function setFarms(farms){Data.ctx.farms=farms;for(const r of Object.values(Data.raw))if(r.kind==="demo")r._r=r._raw=undefined}
