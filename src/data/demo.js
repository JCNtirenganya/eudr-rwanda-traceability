// Indicative (demo) data. Generated per MODEL from the real farms/stations so chains stay coherent, and always tagged "indicative".
import {SEED_EXPORTERS,SEED_IMPORTERS,hash,rng} from "../chain.js";
import {newKey} from "../engine/schema.js";
const day=(d0,n)=>new Date(Date.UTC(2026,5,1)+(d0+n)*864e5).toISOString().slice(0,10);
const ind=r=>({...r,data_source:"indicative",is_deleted:0});
const pad=(n,w)=>String(n).padStart(w,"0");

// Local, cached fallback rows used by the unit test only. The app never uses these for farms or CWS:
// it reads the real Portal layers with the signed-in user's token. No personal identity is invented.
const SITES=[
  ["Northern","Musanze","Musanze","Kivumu","-1.5050","29.6350"],
  ["Northern","Burera","Rugarama","Rugarama","-1.4660","29.7040"],
  ["Western","Rusizi","Kamembwe","Kamembwe","-2.4850","28.9150"],
  ["Western","Karongi","Rubavu","Rubavu","-2.0600","29.3600"],
  ["Southern","Huye","Tumba","Tumba","-2.5950","29.7400"],
  ["Southern","Nyaruguru","Kivu","Kivu","-2.7400","29.5900"],
  ["Eastern","Gatsibo","Kiziguro","Kiziguro","-1.7300","30.3900"],
  ["Eastern","Kayonza","Kabarore","Kabarore","-1.8900","30.5600"],
  ["Kigali","Gasabo","Kimironko","Kimironko","-1.9300","30.0900"],
];
let base=null;
export async function demoBase(){
  if(base)return base;
  const stations=[],farms=[];
  SITES.forEach(([province,district,sector,cell,lat,lng],si)=>{
    for(let k=0;k<3;k++){
      const n=si*3+k+1,id="CWS-"+pad(n,3),ly=+lat+(k-1)*0.012,lx=+lng+((si+k)%3-1)*0.014;
      stations.push({type:"station",id,name:`Indicative CWS ${pad(n,3)}`,owner:"",ownership:"Cooperative",province,district,
        sector,cell,village:cell,capacity_mt:120+hash(id)%380,year:2004+hash(id+"year")%18,
        phone:"",email:"",src:"indicative",lat:ly,lng:lx});
      for(let j=0;j<12;j++){
        const q=n*100+j+1,pid="PL-"+pad(q,5),fm="FRM-"+pad(Math.ceil(q/2),5),x=lx+((j%4)-1.5)*0.009,y=ly+(Math.floor(j/4)-1)*0.009;
        const ring=[[x-0.003,y-0.002],[x+0.003,y-0.002],[x+0.003,y+0.002],[x-0.003,y+0.002],[x-0.003,y-0.002]];
        const forest=q%5===0||q%5===4,late=forest&&q%3===0,geometryIssue=q%17===0;
        const prior=forest?"Forest/Wooded land":q%5===1?"Cropland":q%5===2?"Grassland/Pasture":q%5===3?"Other: Ntacyo":"Cropland";
        const first=forest?(late?2022:2015):2010+q%12,eudr=geometryIssue?"blocked":late?"blocked":forest?"review":"low";
        const why=geometryIssue?"Indicative plot overlaps another plot.":late?"Indicative forest converted after 31 Dec 2020.":forest?"Indicative forest needs a conversion date.":"Indicative pre-2020 farmland; satellite check pending.";
        farms.push({type:"plot",src:"indicative",id:pid,fm,nm:fm,nid:"",phone:"",prov:province,coop:"Indicative cooperative",
          stn:id,district,sec:sector,cell,village:cell,ha:Math.round((0.4+hash(pid)%120)/10)/10,trees:180+hash(pid+"t")%600,
          kg:350+hash(pid+"kg")%900,prior,first,conv:late?Date.UTC(2022,0,15):null,sp:"Arabica",reg:q%2?"Yes":"No",
          ch:"Cooperative",eudr,why,ring,t:Date.UTC(2026,5,1+q%25),day:day(q%25,0),c:[x,y]});
      }
    }
  });
  return base={farms,stations};
}
// The generators read their parents through ctx.rows(modelId), so they work whether a parent is live or demo.
export const GEN={
  async cherry_delivery({farms,stations}){const r=rng(11),pool={};stations.forEach(s=>{(pool[s.district+"|"+s.sector]??=[]).push(s.id);(pool[s.district]??=[]).push(s.id)});
    const by={};farms.forEach(f=>(by[f.fm]??=[]).push(f));const out=[];let i=0;
    for(const[fm,pl]of Object.entries(by)){const p=pool[pl[0].district+"|"+pl[0].sec]||pool[pl[0].district]||stations.map(s=>s.id),st=p[hash(fm)%p.length],n=1+hash(fm+"n")%3,tot=pl.reduce((t,f)=>t+(f.kg||40),0);
      for(let k=0;k<n;k++){const plot=pl[k%pl.length].id; // every delivery names the farm it came from
        out.push(ind({delivery_id:"DLV-"+String(++i).padStart(6,"0"),cws_id:st,farmer_id:fm,plot_id:plot,delivery_date:day(10+Math.floor(r()*80),0),weight_kg:Math.round(tot/n*10)/10,grade:"ABC"[Math.floor(r()*3)],price_per_kg:Math.round(300+r()*60),receipt_no:"R"+Math.floor(1e4+r()*9e4)}))}}
    return out},
  async lot({rows}){const dl=await rows("cherry_delivery"),g={};
    dl.forEach(d=>{const wk=Math.floor(Date.parse(d.delivery_date)/6048e5),k=d.cws_id+"|"+wk;(g[k]??=[]).push(d)});
    return Object.entries(g).sort().map(([k,a],i)=>{const kg=a.reduce((t,d)=>t+d.weight_kg,0);return ind({lot_id:"LOT-"+String(i+1).padStart(5,"0"),cws_id:a[0].cws_id,lot_date:a.map(d=>d.delivery_date).sort().pop(),cherry_kg_in:Math.round(kg),parchment_kg_out:Math.round(kg*(.17+hash(k)%30/1000)),process:["washed","natural","honey"][hash(k)%3],status:"closed",_dels:a.map(d=>d.delivery_id)})})},
  async lot_delivery({rows}){const out=[];let i=0;for(const l of await rows("lot"))for(const d of l._dels||[])out.push(ind({link_id:"LD-"+String(++i).padStart(6,"0"),lot_id:l.lot_id,delivery_id:d,kg_allocated:0}));
    const dl=Object.fromEntries((await rows("cherry_delivery")).map(d=>[d.delivery_id,d.weight_kg]));out.forEach(x=>x.kg_allocated=dl[x.delivery_id]??0);return out},
  async exporter(){return SEED_EXPORTERS.map(e=>ind({exporter_id:e.id,name:e.name,licence_no:e.licence,contact:e.contact,email:e.email,district:"Gatsibo"}))},
  async importer(){return SEED_IMPORTERS.map(e=>ind({importer_id:e.id,name:e.name,country:e.country,eori:e.eori,contact:e.contact,email:e.email}))},
  async export_batch({rows}){const lots=await rows("lot"),r=rng(7),by={};
    lots.forEach(l=>(by[SEED_EXPORTERS[hash(l.cws_id)%3].id]??=[]).push(l));const out=[];let i=0;
    for(const[ex,ls]of Object.entries(by)){let cur=[],w=0;const emit=()=>{i++;out.push(ind({batch_id:"BATCH-"+String(i).padStart(4,"0"),exporter_id:ex,importer_id:SEED_IMPORTERS[hash(ex+i)%4].id,container:"MSKU"+Math.floor(1e6+r()*9e6),ship_date:day(95+Math.floor(r()*40),0),dds_ref:i%3?`DDS-2026-${Math.floor(1e5+r()*9e5)}`:null,status:i%3?"shipped":"planned",_lots:cur}));cur=[];w=0};
      for(const l of ls){if(cur.length&&w+l.parchment_kg_out>19200)emit();cur.push(l);w+=l.parchment_kg_out}if(cur.length)emit()}
    return out},
  async batch_lot({rows}){const out=[];let i=0;for(const b of await rows("export_batch"))for(const l of b._lots||[])out.push(ind({link_id:"BL-"+String(++i).padStart(6,"0"),batch_id:b.batch_id,lot_id:l.lot_id,kg:l.parchment_kg_out}));return out}};
const strip=r=>{const{_dels,_lots,...x}=r;return x};
// In-memory repo with the same interface as ArcGISRepo. Writes last for this session only and are labelled indicative.
export class DemoRepo{
  constructor(model,load){this.m=model;this.load=load;this.kind="demo"}
  async raw(){return this._raw??=await this.load()}            // un-stripped rows: link generators need the hidden _dels/_lots
  async all(){return this._r??=(await this.raw()).map(strip)}
  async list({where,limit}={}){const a=(await this.all()).filter(r=>!r.is_deleted);return limit?a.slice(0,limit):a}
  async count(){return(await this.list()).length}
  async get(k){return(await this.list()).find(r=>r[this.m.key]===k)||null}
  async create(rec){const r={...rec,data_source:"indicative",is_deleted:0};r[this.m.key]||=newKey(this.m);(await this.all()).push(r);return r}
  async update(k,p){const r=await this.get(k);Object.assign(r,p);return r}
  async softDelete(k){const r=await this.get(k);if(r)r.is_deleted=1}
}
