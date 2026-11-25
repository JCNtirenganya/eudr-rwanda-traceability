// The chain of custody: farmer/plot → delivery → lot → batch → exporter → importer, built from records only.
// A link exists only if a record says so ("confirmed"). Where there is no record, a possible link is shown separately as "inferred".
export const T={built:false};
const add=(m,k,v)=>{(m[k]??=[]).push(v)},KEYS=["F","S","D","L","B","X","M"];
const by=(a,k)=>Object.fromEntries(a.map(r=>[r[k],r]));
export function buildTrace({farms,stations,rows,srcOf={}}){
  const o=id=>rows[id]||[],tagged=(id,a)=>a.map(r=>({...r,src:srcOf[id]||r.data_source||"recorded"}));
  T.src={delivery:srcOf.cherry_delivery||"recorded",lot:srcOf.lot||"recorded",batch:srcOf.export_batch||"recorded",exporter:srcOf.exporter||"recorded",importer:srcOf.importer||"recorded",ld:srcOf.lot_delivery||"recorded",bl:srcOf.batch_lot||"recorded"};
  T.farms=farms;T.farmById=by(farms,"id");T.plotsOf={};farms.forEach(f=>add(T.plotsOf,f.fm,f));
  T.stations=Object.fromEntries(stations.map(s=>[s.id,{...s,src:s.src||"live"}]));
  T.sectorStations={};Object.values(T.stations).forEach(s=>add(T.sectorStations,s.district+"|"+s.sector,s.id));
  const del=tagged("cherry_delivery",o("cherry_delivery")),lot=tagged("lot",o("lot")),bat=tagged("export_batch",o("export_batch"));
  T.del=by(del,"delivery_id");T.lot=by(lot,"lot_id");T.bat=by(bat,"batch_id");T.exp=by(tagged("exporter",o("exporter")),"exporter_id");T.imp=by(tagged("importer",o("importer")),"importer_id");
  T.delByFarmer={};T.delByStation={};T.delByPlot={};del.forEach(d=>{add(T.delByFarmer,d.farmer_id,d);add(T.delByStation,d.cws_id,d);d.plot_id&&add(T.delByPlot,d.plot_id,d)});
  T.lotsByStation={};lot.forEach(l=>add(T.lotsByStation,l.cws_id,l));T.batByExp={};T.batByImp={};bat.forEach(b=>{add(T.batByExp,b.exporter_id,b);add(T.batByImp,b.importer_id,b)});
  T.ldByLot={};T.ldByDel={};o("lot_delivery").forEach(l=>{add(T.ldByLot,l.lot_id,l.delivery_id);add(T.ldByDel,l.delivery_id,l.lot_id)});
  T.blByBatch={};T.blByLot={};o("batch_lot").forEach(l=>{add(T.blByBatch,l.batch_id,l.lot_id);add(T.blByLot,l.lot_id,l.batch_id)});
  T.fcache={};T.built=true;return T}

// Everything that follows from a set of deliveries/lots/batches.
function derive(D,L,B,extra={}){
  const F=new Set(),S=new Set(),X=new Set(),M=new Set(),plotHow=new Map(extra.plotHow||[]);
  for(const d of D){const x=T.del[d];if(!x)continue;F.add(x.farmer_id);S.add(x.cws_id);
    if(x.plot_id)plotHow.set(x.plot_id,"confirmed");else(T.plotsOf[x.farmer_id]||[]).forEach(p=>{if(!plotHow.has(p.id))plotHow.set(p.id,"inferred")})}
  for(const l of L)T.lot[l]&&S.add(T.lot[l].cws_id);
  for(const b of B)if(T.bat[b]){X.add(T.bat[b].exporter_id);M.add(T.bat[b].importer_id)}
  (extra.F||[]).forEach(f=>F.add(f));(extra.S||[]).forEach(s=>S.add(s));(extra.X||[]).forEach(x=>X.add(x));(extra.M||[]).forEach(m=>M.add(m));
  return{D,L,B,F,S,X,M,plotHow}}
const down=(D,L,B)=>{for(const d of D)(T.ldByDel[d]||[]).forEach(l=>L.add(l));for(const l of L)(T.blByLot[l]||[]).forEach(b=>B.add(b))};
const up=(D,L,B)=>{for(const b of B)(T.blByBatch[b]||[]).forEach(l=>L.add(l));for(const l of L)(T.ldByLot[l]||[]).forEach(d=>D.add(d))};
export function chain(type,id){
  const D=new Set(),L=new Set(),B=new Set(),ex={F:[],S:[],X:[],M:[],plotHow:[]},maybe={S:new Set(),P:new Set()};
  const ofFarmer=f=>(T.delByFarmer[f]||[]).forEach(d=>D.add(d.delivery_id));
  if(type==="batch"){B.add(id);up(D,L,B);down(D,L,B)}
  else if(type==="lot"){L.add(id);up(D,L,B);down(D,L,B)}
  else if(type==="delivery"){D.add(id);down(D,L,B)}
  else if(type==="farmer"){ofFarmer(id);down(D,L,B);ex.F=[id];(T.plotsOf[id]||[]).forEach(p=>ex.plotHow.push([p.id,"owned"]))}
  else if(type==="plot"){const f=T.farmById[id];if(f){(T.delByPlot[id]||[]).forEach(d=>D.add(d.delivery_id));(T.delByFarmer[f.fm]||[]).filter(d=>!d.plot_id).forEach(d=>D.add(d.delivery_id));down(D,L,B);ex.F=[f.fm];ex.plotHow.push([id,"owned"])}}
  else if(type==="station"){(T.delByStation[id]||[]).forEach(d=>D.add(d.delivery_id));(T.lotsByStation[id]||[]).forEach(l=>L.add(l.lot_id));up(D,L,B);down(D,L,B);ex.S=[id]}
  else if(type==="exporter"||type==="importer"){((type==="exporter"?T.batByExp:T.batByImp)[id]||[]).forEach(b=>B.add(b.batch_id));up(D,L,B);down(D,L,B);(type==="exporter"?ex.X:ex.M).push(id)}
  const c=derive(D,L,B,ex);c.maybe=maybe;c.type=type;c.id=id;
  // Possible (inferred) links, kept apart: nothing recorded yet, so only same-sector candidates are offered.
  if((type==="farmer"||type==="plot")&&!D.size){const f=type==="plot"?T.farmById[id]:T.plotsOf[id]?.[0];if(f)(T.sectorStations[f.district+"|"+f.sec]||[]).forEach(s=>maybe.S.add(s))}
  if(type==="station"&&!D.size){const s=T.stations[id];if(s)T.farms.filter(f=>f.district===s.district&&f.sec===s.sector).forEach(f=>maybe.P.add(f.id))}
  return c}
function fromFarmers(Fs){const D=new Set(),L=new Set(),B=new Set();for(const f of Fs)(T.delByFarmer[f]||[]).forEach(d=>D.add(d.delivery_id));down(D,L,B);return derive(D,L,B)}

const inter=(a,b)=>!a?b:!b?a:new Set([...a].filter(x=>b.has(x)));
// What is "in scope" for the current selection + filters. Sets are null when nothing narrows them (= everything).
export function scopeOf(S){
  const seeds=[];if(S.sel)seeds.push(chain(S.sel.type,S.sel.id));if(S.imp)seeds.push(chain("importer",S.imp));if(S.exp)seeds.push(chain("exporter",S.exp));if(S.stn)seeds.push(chain("station",S.stn));
  const R={F:null,S:null,D:null,L:null,B:null,X:null,M:null};let plotHow=null,maybe={S:new Set(),P:new Set()};
  for(const c of seeds){KEYS.forEach(k=>R[k]=inter(R[k],c[k]));plotHow=plotHow?new Map([...plotHow].filter(([k])=>c.plotHow.has(k))):c.plotHow;c.maybe.S.forEach(x=>maybe.S.add(x));c.maybe.P.forEach(x=>maybe.P.add(x))}
  let farms=plotHow?[...plotHow.keys()].map(id=>T.farmById[id]).filter(Boolean):T.farms;
  const attr=!!(S.risk||S.district||S.sector||S.day||S.since);
  if(attr){farms=farms.filter(f=>(!S.risk||f.eudr===S.risk)&&(!S.district||f.district===S.district)&&(!S.sector||f.sec===S.sector)&&(!S.day||f.day===S.day)&&(!S.since||f.t>=S.since));
    const Fs=new Set(farms.map(f=>f.fm)),sub=fromFarmers(Fs);const geo=!!(S.district||S.sector);KEYS.forEach(k=>{if(k==="S"&&geo)return;R[k]=inter(R[k],k==="F"?Fs:sub[k])}); // stations follow the place filter, not only deliveries
    if(geo)R.S=inter(R.S,new Set(Object.values(T.stations).filter(s=>(!S.district||s.district===S.district)&&(!S.sector||s.sector===S.sector)).map(s=>s.id)))}
  if(!S.showInd)farms=farms; // indicative records are removed when the trace is built; farms are always live
  return{active:seeds.length>0||attr,seeds,...R,plotHow,maybe,farms,attr}}
export const has=(set,id)=>!set||set.has(id);

// Provenance: which records make up a scope, and are any of them demo?
export function provenance(sc){const n={live:0,recorded:0,indicative:0},add=(s,c=1)=>{if(c)n[s]+=c};
  const cnt=(set,all)=>set?set.size:all;
  sc.farms.forEach(f=>add(f.src||"live"));
  const S=sc.S?[...sc.S]:Object.keys(T.stations);S.forEach(i=>add(T.stations[i]?.src||"live"));
  add(T.src.delivery,cnt(sc.D,Object.keys(T.del).length));add(T.src.lot,cnt(sc.L,Object.keys(T.lot).length));add(T.src.batch,cnt(sc.B,Object.keys(T.bat).length));
  add(T.src.exporter,cnt(sc.X,Object.keys(T.exp).length));add(T.src.importer,cnt(sc.M,Object.keys(T.imp).length));return n}
export const chainSrc=p=>p.indicative?"indicative":p.recorded?"recorded":"live";
// Does a record link this farm to a delivery? "confirmed" = a delivery names the plot; "inferred" = the farmer has deliveries that name no plot; "none" = no delivery at all.
export const plotLink=f=>T.delByPlot[f.id]?.length?"confirmed":(T.delByFarmer[f.fm]||[]).some(d=>!d.plot_id)?"inferred":"none";
export const linkOf=(sc,plotId)=>{const h=sc.plotHow?.get(plotId);return h==="confirmed"||h==="inferred"?h:plotLink(T.farmById[plotId]||{id:plotId})};
// Downstream of one farmer, for CSV rows.
export function farmerDown(fm){return T.fcache[fm]??=(()=>{const D=new Set(),L=new Set(),B=new Set();(T.delByFarmer[fm]||[]).forEach(d=>D.add(d.delivery_id));down(D,L,B);
  return{D:[...D],L:[...L],B:[...B],X:[...new Set([...B].map(b=>T.bat[b]?.exporter_id))],M:[...new Set([...B].map(b=>T.bat[b]?.importer_id))],S:[...new Set([...D].map(d=>T.del[d].cws_id))]}})()}
