// ArcGIS adapter. Every storage backend implements: list, get, create, update, softDelete, count.
import {req} from "./http.js";
import {toAttributes,fromAttributes,newKey} from "../engine/schema.js";
const LIVE="(is_deleted=0 OR is_deleted IS NULL)",q=s=>String(s).replace(/'/g,"''");
export class ArcGISRepo{
  constructor(model,url,user=()=>"unknown"){this.m=model;this.url=url;this.user=user;this.kind="live"}
  async meta(){return this._meta??=await req(this.url)}
  async query({where="1=1",order,limit,extra={}}={}){
    const meta=await this.meta(),page=Math.min(meta.maxRecordCount||1000,1000),out=[];
    for(let o=0;;o+=page){const d=await req(this.url+"/query",{where:`${LIVE} AND (${where})`,outFields:"*",returnGeometry:this.m.storage==="layer",outSR:4326,orderByFields:order,resultOffset:o,resultRecordCount:limit?Math.min(page,limit-out.length):page,...extra});
      out.push(...d.features.map(x=>({...fromAttributes(this.m,x.attributes),...(x.geometry?{geometry:x.geometry}:{})})));
      if(limit&&out.length>=limit||!d.exceededTransferLimit&&d.features.length<page)break}
    return out}
  list(o){return this.query(o)}
  async count(where="1=1"){return(await req(this.url+"/query",{where:`${LIVE} AND (${where})`,returnCountOnly:true})).count}
  async get(key){return(await this.query({where:`${this.m.key}='${q(key)}'`,limit:1}))[0]||null}
  async edit(body){const d=await req(this.url+"/applyEdits",{...body,rollbackOnFailure:true},{post:true});
    const bad=[...(d.addResults||[]),...(d.updateResults||[])].find(x=>!x.success);if(bad)throw new Error(bad.error?.description||"Save was rejected by the server.");return d}
  async unique(rec){for(const f of this.m.fields.filter(f=>f.unique&&rec[f.k]!=null&&rec[f.k]!=="")){
      const c=await this.count(`${f.k}='${q(rec[f.k])}'${rec._oid?` AND objectid<>${rec._oid}`:""}`);if(c)throw new Error(`${f.label} "${rec[f.k]}" already exists.`)}}
  async create(rec){rec={...rec};rec[this.m.key]||=newKey(this.m);rec.data_source="recorded";await this.unique(rec);
    const feat={attributes:{...toAttributes(this.m,rec),is_deleted:0,data_source:"recorded"}};if(rec.geometry)feat.geometry=rec.geometry;
    await this.edit({adds:[feat]});return this.get(rec[this.m.key])}
  async update(key,patch){const cur=await this.get(key);if(!cur)throw new Error("Record no longer exists.");
    const next={...cur,...patch};await this.unique({...next,_oid:cur._oid});
    const feat={attributes:{objectid:cur._oid,...toAttributes(this.m,patch)}};if(patch.geometry)feat.geometry=patch.geometry;
    await this.edit({updates:[feat]});return this.get(key)}
  async softDelete(key){const cur=await this.get(key);if(!cur)return;
    await this.edit({updates:[{attributes:{objectid:cur._oid,is_deleted:1,deleted_by:this.user(),deleted_at:Date.now()}}]})}
}
