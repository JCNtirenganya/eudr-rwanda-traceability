// Supabase adapter. Same interface as ArcGISRepo: list, get, create, update, softDelete, count.
// Models and field conversions stay exactly as they are; only the transport changes.
import {sb} from "./http.js";
import {toAttributes,fromAttributes,newKey} from "../engine/schema.js";

export class SupabaseRepo{
  constructor(model,user=()=>"unknown"){this.m=model;this.user=user;this.kind="supabase"}
  shape(r){return{...fromAttributes(this.m,r),...(r.geometry?{geometry:r.geometry}:{})}}
  async list(o={}){
    let rows=await sb({action:"list",model:this.m.id});
    if(o.order){const[k,dir]=String(o.order).split(/\s+/),s=(dir||"asc").toLowerCase()==="desc"?-1:1;
      rows=[...rows].sort((a,b)=>s*String(a[k]??"").localeCompare(String(b[k]??"")))}
    if(o.limit)rows=rows.slice(0,o.limit);
    return rows.map(r=>this.shape(r))}
  async count(){return(await sb({action:"count",model:this.m.id})).count}
  async get(key){const r=await sb({action:"get",model:this.m.id,key});return r?this.shape(r):null}
  async unique(rec){
    for(const f of this.m.fields.filter(f=>f.unique&&rec[f.k]!=null&&rec[f.k]!=="")){
      const rows=await this.list();
      if(rows.some(x=>x[f.k]===rec[f.k]&&x[this.m.key]!==rec._key))throw new Error(`${f.label} "${rec[f.k]}" already exists.`)}}
  async create(rec){rec={...rec};rec[this.m.key]||=newKey(this.m);const key=rec[this.m.key];rec.data_source="recorded";
    await this.unique({...rec,_key:key});
    const out=await sb({action:"create",model:this.m.id,key,attrs:toAttributes(this.m,rec),geometry:rec.geometry||null,user:this.user()});
    return this.shape(out)}
  async update(key,patch){
    const cur=await this.get(key);if(!cur)throw new Error("Record no longer exists.");
    const next={...cur,...patch};await this.unique({...next,_key:key});
    const out=await sb({action:"update",model:this.m.id,key,attrs:toAttributes(this.m,next),geometry:patch.geometry!==undefined?patch.geometry:cur.geometry||null,user:this.user()});
    return this.shape(out)}
  async softDelete(key){await sb({action:"softDelete",model:this.m.id,key,user:this.user()})}
}
