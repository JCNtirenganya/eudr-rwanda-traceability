// One row model for every entity type, used by the explorer, the registry, the report and the CSV.
import {T,has,linkOf} from "./trace.js";
import {worst,day,N} from "./ui.js";
import {CFG} from "./config.js";
export const TYPES=[["farmer","Farmers"],["plot","Farms"],["station","Stations"],["delivery","Deliveries"],["lot","Lots"],["batch","Batches"],["exporter","Exporters"],["importer","Importers"]];
export const COLS={
 farmer:[["id","Farmer"],["sector","Sector"],["farms","Farms"],["area","Area (ha)"],["kg","2025 output (kg)"],["mapped","Last mapped"],["risk","Risk"]],
 plot:[["id","Farm"],["farmer","Farmer"],["sector","Sector"],["area","Area (ha)"],["mapped","Mapped on"],["risk","Risk"]],
 station:[["title","Station"],["district","District"],["sector","Sector"],["owner","Owner"],["capacity","Capacity (MT)"],["deliveries","Deliveries"]],
 delivery:[["id","Delivery"],["date","Date"],["farmer","Farmer"],["station","Station"],["kg","Weight (kg)"],["price","Price/kg"]],
 lot:[["id","Lot"],["date","Date"],["station","Station"],["cherry","Cherries (kg)"],["parchment","Parchment (kg)"],["status","Status"]],
 batch:[["id","Batch"],["date","Ship date"],["exporter","Exporter"],["importer","Importer"],["kg","Parchment (kg)"],["dds","DDS ref"]],
 exporter:[["title","Exporter"],["licence","Licence"],["district","District"],["batches","Batches"]],
 importer:[["title","Importer"],["country","Country"],["eori","EORI"],["batches","Batches"]]};
export const batchKg=b=>(T.blByBatch[b.batch_id]||[]).reduce((t,l)=>t+(T.lot[l]?.parchment_kg_out||0),0);
const memo=new WeakMap(),nmS=id=>T.stations[id]?.name||id;
export function rows(type,sc){
  const m=memo.get(sc)||{};memo.set(sc,m);if(m[type])return m[type];let out=[];
  if(type==="farmer"){const g={};sc.farms.forEach(f=>(g[f.fm]??=[]).push(f));
    out=Object.entries(g).map(([id,a])=>({id,title:"Farmer "+id,sub:`${a[0].sec} · ${a.length} farm(s) · ${a.reduce((t,f)=>t+f.ha,0).toFixed(2)} ha`,r:worst(a),src:a.some(f=>f.src==="recorded")?"recorded":"live",sector:a[0].sec,farms:a.length,area:+a.reduce((t,f)=>t+f.ha,0).toFixed(2),kg:Math.round(a.reduce((t,f)=>t+(f.kg||0),0)),mapped:Math.max(...a.map(f=>f.t||0)),risk:worst(a)}))}
  else if(type==="plot"){out=sc.farms.map(f=>({id:f.id,title:"Farm "+f.id,sub:`${f.sec}, ${f.cell||""} · ${f.ha} ha`,r:f.eudr,src:f.src||"live",link:sc.active?linkOf(sc,f.id):"",farmer:f.fm,sector:f.sec,area:f.ha,mapped:f.t||0,risk:f.eudr}));
    sc.maybe.P.forEach(id=>{const f=T.farmById[id];if(f&&!sc.plotHow?.has(id))out.push({id,title:"Farm "+id,sub:`${f.sec} · possible supplier`,r:f.eudr,src:"live",link:"inferred",farmer:f.fm,sector:f.sec,area:f.ha,mapped:f.t||0,risk:f.eudr})})}
  else if(type==="station"){const ids=sc.S?[...sc.S]:Object.keys(T.stations);
    out=ids.filter(i=>T.stations[i]).map(i=>{const s=T.stations[i],n=(T.delByStation[i]||[]).length;return{id:i,title:s.name,sub:`${s.sector}, ${s.district} · ${N(n)} deliveries`,src:s.src,district:s.district,sector:s.sector,owner:s.owner||"",capacity:s.capacity_mt??"",deliveries:n,link:""}});
    sc.maybe.S.forEach(i=>{if(!sc.S?.has(i)&&T.stations[i])out.push({id:i,title:T.stations[i].name,sub:"possible station (same sector)",src:T.stations[i].src,link:"inferred",district:T.stations[i].district,sector:T.stations[i].sector,owner:T.stations[i].owner||"",capacity:T.stations[i].capacity_mt??"",deliveries:0})})}
  else if(type==="delivery")out=Object.values(T.del).filter(d=>has(sc.D,d.delivery_id)).map(d=>({id:d.delivery_id,title:d.delivery_id,sub:`${d.delivery_date} · ${d.weight_kg} kg · farmer ${d.farmer_id}`,src:d.src,date:d.delivery_date,farmer:d.farmer_id,station:nmS(d.cws_id),kg:d.weight_kg,price:d.price_per_kg??"",flag:d.price_per_kg!=null&&CFG.MIN_CHERRY_PRICE!=null&&d.price_per_kg<CFG.MIN_CHERRY_PRICE}));
  else if(type==="lot")out=Object.values(T.lot).filter(l=>has(sc.L,l.lot_id)).map(l=>({id:l.lot_id,title:l.lot_id,sub:`${l.lot_date} · ${nmS(l.cws_id)} · ${N(l.cherry_kg_in)} kg cherries`,src:l.src,date:l.lot_date,station:nmS(l.cws_id),cherry:l.cherry_kg_in,parchment:l.parchment_kg_out??"",status:l.status||""}));
  else if(type==="batch")out=Object.values(T.bat).filter(b=>has(sc.B,b.batch_id)).map(b=>({id:b.batch_id,title:b.batch_id,sub:`${b.ship_date||"—"} · ${T.exp[b.exporter_id]?.name||b.exporter_id} → ${T.imp[b.importer_id]?.name||b.importer_id}`,src:b.src,date:b.ship_date||"",exporter:T.exp[b.exporter_id]?.name||b.exporter_id,importer:T.imp[b.importer_id]?.name||b.importer_id,kg:batchKg(b),dds:b.dds_ref||"",r:b.dds_ref?"":"review"}));
  else{const reg=type==="exporter"?T.exp:T.imp,k=type==="exporter"?T.batByExp:T.batByImp;
    out=Object.values(reg).filter(x=>has(type==="exporter"?sc.X:sc.M,x[type+"_id"])).map(x=>({id:x[type+"_id"],title:x.name,sub:`${(k[x[type+"_id"]]||[]).length} batch(es)${x.country?" · "+x.country:""}`,src:x.src,licence:x.licence_no||"",district:x.district||"",country:x.country||"",eori:x.eori||"",batches:(k[x[type+"_id"]]||[]).length}))}
  return m[type]=out}
