// Build a "recorded" model from a live layer's own field list, so the questionnaire and its table have EXACTLY the layer's structure.
import {RESERVED} from "./engine/schema.js";
const SKIP=/^(objectid|globalid|shape.*|created_user|created_date|last_edited_user|last_edited_date|creator|editor|creationdate|editdate)$/i;
const AS_TEXT=new Set(["farmer_id","plot_id","national_id","phone","station_id","upi"]);       // identifiers are never numbers
const PII=new Set(["farmer_name","national_id","phone"]);                                    // personal data: the table stays private, and the audit log omits these
const LEN={national_id:16,phone:9,farmer_id:12,plot_id:14,upi:40,station_id:40};
export function modelFromLayer(meta,o){
  const fields=[];
  for(const f of meta.fields||[]){const k=f.name.toLowerCase();
    if(SKIP.test(f.name)||!/^[a-z][a-z0-9_]{0,30}$/.test(k)||RESERVED.has(k)||k===o.key)continue;
    const dom=f.domain?.type==="codedValue"?f.domain.codedValues:null,T=f.type,x={k,label:f.alias&&f.alias!==f.name?f.alias:k.replace(/_/g," ").replace(/^./,c=>c.toUpperCase()),req:(o.required||[]).includes(k)};
    if(AS_TEXT.has(k)){x.type="text";x.len=LEN[k]}
    else if(dom&&T==="esriFieldTypeString"){x.type="choice";x.choices=dom.map(c=>({code:String(c.code),label:c.name}))}
    else if(T==="esriFieldTypeString"){x.type=(f.length||255)>255?"longtext":"text";x.len=Math.min(f.length||255,255)}
    else if(/Integer|SmallInteger|BigInteger/.test(T))x.type="int";
    else if(/Double|Single/.test(T))x.type="decimal";else if(T==="esriFieldTypeDate")x.type="date";else continue;
    if(PII.has(k))x.pii=true;fields.push(x)}
  const key={k:o.key,label:o.keyLabel||"ID",type:"text",req:true,unique:true,auto:true,len:o.keyLen||40};
  const gps=[{k:"gps_method",label:"How the location was captured",type:"text",len:20},{k:"gps_accuracy_m",label:"GPS accuracy (m)",type:"decimal"},{k:"gps_points",label:"GPS points",type:"int"}];
  return{id:o.id,name:o.name,plural:o.plural||o.name,icon:o.icon||"map",color:o.color||"#2f8f68",storage:"layer",geometry:o.geometry,key:o.key,title:o.title,listCols:o.listCols||[o.key,o.title],
    attachments:true,tracking:true,search:true,map:true,graph:false,mirror:true,mirrorOf:o.source||"",fields:[key,...fields,...gps.filter(g=>!fields.some(f=>f.k===g.k))]}}
export const FARM={id:"farm_recorded",name:"Farm (recorded)",plural:"Farms (recorded)",key:"plot_id",keyLabel:"Plot ID",keyLen:14,title:"farmer_name",geometry:"polygon",listCols:["plot_id","farmer_name","sector","area_ha"],
  required:["farmer_id","farmer_name","national_id","phone","district","sector","cell","village","prior_land_use","first_planting_year","last_planting_year","trees_total","coffee_species","land_registered","land_acquisition","land_dispute","hires_workers","area_ha"]};
export const STATION={id:"station_recorded",name:"Washing station (recorded)",plural:"Washing stations (recorded)",key:"cws_uid",keyLabel:"Station ID",title:"cws_name",geometry:"point",listCols:["cws_name","district","sector","processing"],
  required:["cws_name","owner_name","type_of_ow","district","sector","cell","village","year_of_es","processing"]};
