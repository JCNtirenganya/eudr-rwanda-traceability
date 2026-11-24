// Model definition -> ArcGIS fields, validation, and the rules ArcGIS imposes on later changes.
import {CFG} from "../config.js";
export const RESERVED=new Set(["objectid","globalid","shape","created_user","created_date","last_edited_user","last_edited_date","data_source","is_deleted","deleted_by","deleted_at"]);
export const TYPES=["text","longtext","int","decimal","date","datetime","bool","choice","multichoice","link","file"];
const NAME=/^[a-z][a-z0-9_]{0,30}$/;
const SRC_CHOICES=[{code:"live",label:"Live"},{code:"recorded",label:"Recorded"},{code:"indicative",label:"Indicative"}];
const SQL={esriFieldTypeString:"sqlTypeNVarchar",esriFieldTypeInteger:"sqlTypeInteger",esriFieldTypeSmallInteger:"sqlTypeSmallInt",esriFieldTypeDouble:"sqlTypeFloat",esriFieldTypeDate:"sqlTypeTimestamp2"};
const dom=(name,list)=>({type:"codedValue",name,codedValues:list.map(c=>({name:c.label,code:c.code}))});
const stored=m=>m.fields.filter(f=>f.type!=="file");
export function arcType(f){return({text:["esriFieldTypeString",f.len||255],longtext:["esriFieldTypeString",4000],int:["esriFieldTypeInteger"],decimal:["esriFieldTypeDouble"],date:["esriFieldTypeDate"],datetime:["esriFieldTypeDate"],
  bool:["esriFieldTypeSmallInteger"],choice:["esriFieldTypeString",50],multichoice:["esriFieldTypeString",500],link:["esriFieldTypeString",64]})[f.type]}
export function toArcField(f,model){
  const[type,length]=arcType(f),o={name:f.k,type,alias:f.label||f.k,sqlType:SQL[type],nullable:!f.req,editable:!f.auto||f.k===model?.key,domain:null,defaultValue:null};
  if(length)o.length=length;
  if(f.type==="choice")o.domain=dom(`${model.id}_${f.k}`.slice(0,60),f.choices);
  if(f.type==="bool")o.domain=dom(`${model.id}_${f.k}`.slice(0,60),[{code:0,label:"No"},{code:1,label:"Yes"}]);
  if(f.default!=null&&f.type!=="date")o.defaultValue=f.type==="bool"?+f.default:f.default;
  return o}
export const systemFields=()=>[
  {name:"data_source",type:"esriFieldTypeString",alias:"Data source",sqlType:SQL.esriFieldTypeString,length:20,nullable:true,editable:true,domain:dom("data_source",SRC_CHOICES),defaultValue:"recorded"},
  {name:"is_deleted",type:"esriFieldTypeSmallInteger",alias:"Deleted",sqlType:SQL.esriFieldTypeSmallInteger,nullable:true,editable:true,domain:null,defaultValue:0},
  {name:"deleted_by",type:"esriFieldTypeString",alias:"Deleted by",sqlType:SQL.esriFieldTypeString,length:80,nullable:true,editable:true,domain:null,defaultValue:null},
  {name:"deleted_at",type:"esriFieldTypeDate",alias:"Deleted at",sqlType:SQL.esriFieldTypeDate,nullable:true,editable:true,domain:null,defaultValue:null}];
export const trackingFields=()=>[["created_user","Created by","esriFieldTypeString",128],["created_date","Created on","esriFieldTypeDate"],["last_edited_user","Edited by","esriFieldTypeString",128],["last_edited_date","Edited on","esriFieldTypeDate"]]
  .map(([name,alias,type,length])=>({name,alias,type,sqlType:SQL[type],nullable:true,editable:false,domain:null,defaultValue:null,...(length?{length}:{})}));
export const toArcFields=m=>[...stored(m).map(f=>toArcField(f,m)),...systemFields(),...(m.tracking?trackingFields():[])];
export const editFieldsInfo={creationDateField:"created_date",creatorField:"created_user",editDateField:"last_edited_date",editorField:"last_edited_user"};

export function validateModel(m,known=[]){
  const e=[],ks=new Set();
  if(!/^[a-z][a-z0-9_]{1,40}$/.test(m.id||""))e.push("Model id: lowercase letters, digits, underscore; starts with a letter.");
  if(!m.name)e.push("Model name is required.");
  if(!["table","layer"].includes(m.storage))e.push("Storage must be table or layer.");
  if(m.storage==="layer"&&!["point","line","polygon"].includes(m.geometry))e.push("A feature layer needs a geometry type (point, line or polygon).");
  (m.fields||[]).forEach(f=>{
    if(!NAME.test(f.k||""))e.push(`Field "${f.k}": use lowercase letters, digits, underscore (max 31 chars).`);
    else if(RESERVED.has(f.k))e.push(`Field "${f.k}" is reserved by the system.`);
    if(ks.has(f.k))e.push(`Field "${f.k}" is duplicated.`);ks.add(f.k);
    if(!TYPES.includes(f.type))e.push(`Field "${f.k}": unknown type ${f.type}.`);
    if((f.type==="choice"||f.type==="multichoice")&&!(f.choices||[]).length)e.push(`Field "${f.k}": add at least one choice.`);
    if(f.type==="link"&&!f.to)e.push(`Field "${f.k}": choose which model it links to.`);
    if(f.type==="link"&&f.to&&known.length&&!["cws","farmer","plot",...known].includes(f.to))e.push(`Field "${f.k}": links to unknown model ${f.to}.`)});
  if(!ks.has(m.key))e.push(`Key field "${m.key}" is missing.`);
  if(!ks.has(m.title))e.push(`Title field "${m.title}" is missing.`);
  return e}

const isEmpty=v=>v==null||v===""||(Array.isArray(v)&&!v.length);
export function validateRecord(m,r){
  const errors={},warnings={};
  for(const f of m.fields){if(f.type==="file"||f.auto)continue;const v=r[f.k],L=f.label||f.k;
    if(isEmpty(v)){if(f.req)errors[f.k]=`${L} is required.`;continue}
    if(["int","decimal"].includes(f.type)){const n=+v;if(!Number.isFinite(n)||(f.type==="int"&&!Number.isInteger(n))){errors[f.k]=`${L} must be a ${f.type==="int"?"whole ":""}number.`;continue}
      if(f.min!=null&&n<f.min)errors[f.k]=`${L} must be at least ${f.min}.`;else if(f.max!=null&&n>f.max)errors[f.k]=`${L} must be at most ${f.max}.`;
      else if(f.floor&&CFG[f.floor]!=null&&n<CFG[f.floor])warnings[f.k]=`${L} is below the NAEB minimum (${CFG[f.floor]}). Add a note explaining why.`}
    if(["text","longtext"].includes(f.type)&&String(v).length>(arcType(f)[1]))errors[f.k]=`${L} is too long (max ${arcType(f)[1]}).`;
    if(["date","datetime"].includes(f.type)&&isNaN(Date.parse(v)))errors[f.k]=`${L} is not a valid date.`;
    if(f.type==="choice"&&!f.choices.some(c=>c.code===v))errors[f.k]=`${L}: choose one of the listed options.`;
    if(f.type==="multichoice"&&[].concat(v).some(x=>!f.choices.some(c=>c.code===x)))errors[f.k]=`${L}: contains an unknown option.`}
  if(m.yieldRange&&+r.cherry_kg_in>0&&+r.parchment_kg_out>0){const y=r.parchment_kg_out/r.cherry_kg_in;if(y<m.yieldRange[0]||y>m.yieldRange[1])warnings.parchment_kg_out=`Yield ${(y*100).toFixed(1)}% is outside the usual ${m.yieldRange[0]*100}–${m.yieldRange[1]*100}%. Please double-check.`}
  return{errors,warnings,ok:!Object.keys(errors).length}}

const toMs=v=>typeof v==="number"?v:Date.parse(v);
export function toAttributes(m,r){const a={};
  for(const f of stored(m)){let v=r[f.k];if(v===undefined)continue;if(isEmpty(v)){a[f.k]=null;continue}
    a[f.k]=["date","datetime"].includes(f.type)?toMs(v):["int","decimal"].includes(f.type)?+v:f.type==="bool"?+!!v:f.type==="multichoice"?[].concat(v).join(","):v}
  for(const k of["data_source","is_deleted","deleted_by"])if(r[k]!==undefined)a[k]=r[k];if(r.deleted_at!==undefined)a.deleted_at=r.deleted_at;return a}
export function fromAttributes(m,a){const r={_oid:a.objectid??a.OBJECTID};
  for(const f of stored(m)){const v=a[f.k];r[f.k]=v==null?null:f.type==="date"?new Date(v).toISOString().slice(0,10):f.type==="datetime"?new Date(v).toISOString():f.type==="bool"?!!v:f.type==="multichoice"?String(v).split(",").filter(Boolean):v}
  r.data_source=a.data_source||"recorded";r.is_deleted=a.is_deleted||0;
  for(const k of["created_user","created_date","last_edited_user","last_edited_date"])if(a[k]!=null)r[k]=k.endsWith("date")?new Date(a[k]).toISOString():a[k];
  return r}
export const newKey=m=>m.id.slice(0,3).toUpperCase()+"-"+Date.now().toString(36).toUpperCase().slice(-6)+Math.random().toString(36).slice(2,4).toUpperCase();

// What may change once a model is published (ArcGIS rules). nonEmpty: {fieldName: count of rows with a value}.
export function changeRules(oldM,newM,nonEmpty={}){
  const blocked=[],notes=[],byK=Object.fromEntries(newM.fields.map(f=>[f.k,f]));
  if(oldM.storage!==newM.storage)blocked.push("Storage type (table ↔ layer) cannot change after publishing. Create a new model instead.");
  if(oldM.geometry!==newM.geometry)blocked.push("Geometry type cannot change after publishing.");
  for(const f of oldM.fields){const n=byK[f.k];
    if(!n){if(f.type==="file"||nonEmpty[f.k]===0)notes.push(`"${f.label}" will be removed (it holds no data).`);else blocked.push(`"${f.label}" holds data and cannot be deleted. Hide it from lists instead.`)}
    else{if(n.type!==f.type)blocked.push(`"${f.label}": field type cannot change (${f.type} → ${n.type}).`);
      else if(arcType(n)[1]<arcType(f)[1])blocked.push(`"${f.label}": text length cannot be reduced.`);
      if(n.label!==f.label)notes.push(`"${f.label}" → "${n.label}": only the display name changes; the stored field name stays "${f.k}".`)}}
  const added=newM.fields.filter(f=>!oldM.fields.some(o=>o.k===f.k)&&f.type!=="file");
  if(added.length)notes.push(`${added.length} new field(s) will be added: ${added.map(f=>f.label).join(", ")}.`);
  return{ok:!blocked.length,blocked,notes,added}}
