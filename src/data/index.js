// One door to chain data. Farms, farmers and CWS are read directly from Portal in live.js.
import {CFG} from "../config.js";
import {portalMe} from "./http.js";
import {SupabaseRepo} from "./supabase.js";
import {DemoRepo,GEN} from "./demo.js";
import {validateRecord} from "../engine/schema.js";

export const Data={models:{},repos:{},raw:{},me:null,ctx:{farms:[],stations:[]}};
export const CHAIN=["cherry_delivery","lot","lot_delivery","export_batch","batch_lot","exporter","importer"];
const LINK_PARENTS={lot_delivery:["lot","cherry_delivery"],batch_lot:["export_batch","lot"]};

// Identity comes only from Portal. No second login, no local role table.
export async function whoAmI(){
  const m=await portalMe(),admin=m.role==="org_admin"||m.username===CFG.OWNER;
  return{username:m.username,fullName:m.fullName||m.username,portalRole:m.role,isAdmin:admin,role:admin?"admin":"viewer",stations:[]}}

export async function init({farms,stations,fetchSeed=()=>fetch("models/seed.json").then(r=>r.json())}){
  Data.ctx={farms,stations};
  const seed=await fetchSeed();
  Data.models=Object.fromEntries(seed.models.map(m=>[m.id,m]));
  for(const id of CHAIN)build(id);
  Data.me=await whoAmI();
  return Data}

async function demoRows(id){
  const g=GEN[id];if(!g)return[];
  if(LINK_PARENTS[id]?.some(p=>Data.raw[p]?.kind!=="demo"))return[];
  return g({...Data.ctx,rows:p=>Data.raw[p].raw?Data.raw[p].raw():Data.repos[p].list()})}

function build(id){
  const m=Data.models[id],user=()=>Data.me?.username||"unknown";
  const r=CFG.DEMO_CHAIN?new DemoRepo(m,()=>demoRows(id)):new SupabaseRepo(m,user);
  Data.raw[id]=r;Data.repos[id]=guard(m,r)}

const status=()=>CHAIN.map(id=>{const m=Data.models[id],k=Data.raw[id]?.kind;
  return{id,name:m.plural,mode:k==="demo"?"demo":"supabase",source:k==="demo"?"indicative":"recorded"}});
export {status};

// Admins may write; everyone else reads. That is the whole permission model for now.
export function can(action,model){const me=Data.me;if(!me)return false;return action==="read"||me.isAdmin}

function guard(model,repo){
  const deny=()=>{throw new Error("Your account is not allowed to do this. Ask your Portal administrator.")};
  return{kind:()=>repo.kind,model,list:o=>repo.list(o),get:k=>repo.get(k),count:w=>repo.count(w),
    validate:r=>validateRecord(model,r),
    async create(rec){if(!can("create",model))deny();const v=validateRecord(model,rec);if(!v.ok)throw Object.assign(new Error("Please fix the highlighted fields."),{fields:v.errors});
      if(model.id==="cherry_delivery")rec={...rec,recorded_by:Data.me.username};return repo.create(rec)},
    async update(k,p){const cur=await repo.get(k);if(!can("update",model))deny();const v=validateRecord(model,{...cur,...p});if(!v.ok)throw Object.assign(new Error("Please fix the highlighted fields."),{fields:v.errors});
      return repo.update(k,p)},
    async softDelete(k){if(!can("delete",model))deny();return repo.softDelete(k)}}}

Data.repo=id=>Data.repos[id];
export function setFarms(farms){Data.ctx.farms=farms;for(const r of Object.values(Data.raw))if(r.kind==="demo")r._r=r._raw=undefined}
