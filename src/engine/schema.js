// Only what the chain app needs: validate a record, convert dates/numbers for Supabase, and make keys.
import {CFG} from "../config.js";
const stored=m=>m.fields.filter(f=>f.type!=="file");
const textLen=f=>f.len||(f.type==="longtext"?4000:f.type==="choice"?50:f.type==="multichoice"?500:255);
const isEmpty=v=>v==null||v===""||(Array.isArray(v)&&!v.length);
const toMs=v=>typeof v==="number"?v:Date.parse(v);

export function validateRecord(m,r){
  const errors={},warnings={};
  for(const f of m.fields){
    if(f.type==="file"||f.auto)continue;
    const v=r[f.k],L=f.label||f.k;
    if(isEmpty(v)){if(f.req)errors[f.k]=`${L} is required.`;continue}
    if(["int","decimal"].includes(f.type)){
      const n=+v;
      if(!Number.isFinite(n)||(f.type==="int"&&!Number.isInteger(n))){errors[f.k]=`${L} must be a ${f.type==="int"?"whole ":""}number.`;continue}
      if(f.min!=null&&n<f.min)errors[f.k]=`${L} must be at least ${f.min}.`;
      else if(f.max!=null&&n>f.max)errors[f.k]=`${L} must be at most ${f.max}.`;
      else if(f.floor&&CFG[f.floor]!=null&&n<CFG[f.floor])warnings[f.k]=`${L} is below the NAEB minimum (${CFG[f.floor]}). Add a note explaining why.`}
    if(["text","longtext"].includes(f.type)&&String(v).length>textLen(f))errors[f.k]=`${L} is too long (max ${textLen(f)}).`;
    if(["date","datetime"].includes(f.type)&&isNaN(Date.parse(v)))errors[f.k]=`${L} is not a valid date.`;
    if(f.type==="choice"&&!f.choices.some(c=>c.code===v))errors[f.k]=`${L}: choose one of the listed options.`;
    if(f.type==="multichoice"&&[].concat(v).some(x=>!f.choices.some(c=>c.code===x)))errors[f.k]=`${L}: contains an unknown option.`}
  if(m.yieldRange&&+r.cherry_kg_in>0&&+r.parchment_kg_out>0){
    const y=r.parchment_kg_out/r.cherry_kg_in;
    if(y<m.yieldRange[0]||y>m.yieldRange[1])warnings.parchment_kg_out=`Yield ${(y*100).toFixed(1)}% is outside the usual ${m.yieldRange[0]*100}–${m.yieldRange[1]*100}%. Please double-check.`}
  return{errors,warnings,ok:!Object.keys(errors).length}}

export function toAttributes(m,r){
  const a={};
  for(const f of stored(m)){
    let v=r[f.k];if(v===undefined)continue;
    if(isEmpty(v)){a[f.k]=null;continue}
    a[f.k]=["date","datetime"].includes(f.type)?toMs(v):["int","decimal"].includes(f.type)?+v:f.type==="bool"?+!!v:f.type==="multichoice"?[].concat(v).join(","):v}
  for(const k of["data_source","is_deleted","deleted_by","deleted_at"])if(r[k]!==undefined)a[k]=r[k];
  return a}

export function fromAttributes(m,a){
  const r={_oid:a.objectid??a.OBJECTID};
  for(const f of stored(m)){
    const v=a[f.k];
    r[f.k]=v==null?null:f.type==="date"?new Date(v).toISOString().slice(0,10):f.type==="datetime"?new Date(v).toISOString():f.type==="bool"?!!v:f.type==="multichoice"?String(v).split(",").filter(Boolean):v}
  r.data_source=a.data_source||"recorded";r.is_deleted=a.is_deleted||0;
  for(const k of["created_user","created_date","last_edited_user","last_edited_date"])if(a[k]!=null)r[k]=k.endsWith("date")?new Date(a[k]).toISOString():a[k];
  return r}

export const newKey=m=>m.id.slice(0,3).toUpperCase()+"-"+Date.now().toString(36).toUpperCase().slice(-6)+Math.random().toString(36).slice(2,4).toUpperCase();
