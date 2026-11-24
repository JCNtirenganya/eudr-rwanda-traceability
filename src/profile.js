// Profile drawer: one layout for every entity, with its true chain (confirmed) and possible links (inferred) kept apart.
import {S,select} from "./core.js";
import {T,chain,provenance,chainSrc} from "./trace.js";
import {$,esc,N,COL,LBL,tag,link,pill,chip,day,worst} from "./ui.js";
import {batchKg} from "./lists.js";
import {editInfo} from "./forms.js";
const nm={farmer:id=>"Farmer "+id,plot:id=>"Farm "+id,station:id=>T.stations[id]?.name||id,delivery:id=>id,lot:id=>id,batch:id=>id,exporter:id=>T.exp[id]?.name||id,importer:id=>T.imp[id]?.name||id};
const LIM=14,chips=(t,ids)=>{const a=[...ids];return a.slice(0,LIM).map(i=>chip(t,i,nm[t](i))).join("")+(a.length>LIM?`<span class="muted"> +${N(a.length-LIM)} more</span>`:"")||'<span class="muted">none recorded</span>'};
const fact=(l,v,s,w)=>`<div class="f ${w?"w":""}"><span>${l} ${s?tag(s):""}</span><b>${v===""||v==null?"—":v}</b></div>`;
export function profileOf(type,id){
  const c=chain(type,id),srcOf=T.src;let title,sub,src="live",risk,facts="",extra="";
  if(type==="plot"){const f=T.farmById[id];if(!f)return null;title="Farm "+id;sub=`${f.sec}, ${f.district}`;risk=f.eudr;src=f.src||"live";
    facts=fact("Farmer",chip("farmer",f.fm,f.fm))+fact("Area",f.ha+" ha")+fact("Trees",f.trees)+fact("Prior land use",esc(f.prior))+fact("First planted",f.first)+fact("2025 output",f.kg!=null?N(f.kg)+" kg":"")+fact("Mapped on",day(f.t))+(f.stn?fact("Registered with station",chip("station",f.stn,nm.station(f.stn))):"")+fact("Centroid",f.c?f.c.map(x=>x.toFixed(5)).join(", "):"")+fact("EUDR pre-screen",esc(f.why),"",1)}
  else if(type==="farmer"){const a=T.plotsOf[id];if(!a)return null;title="Farmer "+id;sub=`${a[0].sec}, ${a[0].district}`;risk=worst(a);
    facts=fact("Farms",chips("plot",a.map(f=>f.id)),"",1)+fact("Total area",a.reduce((t,f)=>t+f.ha,0).toFixed(2)+" ha")+fact("2025 output",N(a.reduce((t,f)=>t+(f.kg||0),0))+" kg")+fact("Low risk",`${a.filter(f=>f.eudr==="low").length}/${a.length} farms`)+fact("Last mapped",day(Math.max(...a.map(f=>f.t||0))))}
  else if(type==="station"){const s=T.stations[id];if(!s)return null;title=s.name;sub=`${s.sector}, ${s.district}`;src=s.src;
    facts=fact("Owner",esc(s.owner))+fact("Capacity",s.capacity_mt!=null?s.capacity_mt+" MT":"")+fact("Established",s.year)+fact("Phone",esc(s.phone))+fact("Email",esc(s.email),"",1)+fact("Deliveries",N((T.delByStation[id]||[]).length),(T.delByStation[id]||[]).length?srcOf.delivery:"")+fact("Lots",N((T.lotsByStation[id]||[]).length),(T.lotsByStation[id]||[]).length?srcOf.lot:"")}
  else if(type==="delivery"){const d=T.del[id];if(!d)return null;title=id;sub=d.delivery_date;src=d.src;
    facts=fact("Farmer",chip("farmer",d.farmer_id,d.farmer_id))+fact("Station",chip("station",d.cws_id,nm.station(d.cws_id)))+fact("Plot",d.plot_id?chip("plot",d.plot_id,d.plot_id):"all plots of the farmer (less precise)")+fact("Weight",d.weight_kg+" kg")+fact("Grade",d.grade)+fact("Price",d.price_per_kg!=null?d.price_per_kg+" RWF/kg":"")+fact("Receipt",esc(d.receipt_no))+fact("Recorded by",esc(d.recorded_by||d.created_user))}
  else if(type==="lot"){const l=T.lot[id];if(!l)return null;title=id;sub=l.lot_date;src=l.src;const y=l.cherry_kg_in&&l.parchment_kg_out?(100*l.parchment_kg_out/l.cherry_kg_in).toFixed(1)+"%":"";
    facts=fact("Station",chip("station",l.cws_id,nm.station(l.cws_id)))+fact("Status",l.status)+fact("Cherries in",N(l.cherry_kg_in)+" kg")+fact("Parchment out",l.parchment_kg_out!=null?N(l.parchment_kg_out)+" kg":"")+fact("Yield",y)+fact("Process",l.process)}
  else if(type==="batch"){const b=T.bat[id];if(!b)return null;title=id;sub=b.ship_date||"";src=b.src;
    facts=fact("Exporter",chip("exporter",b.exporter_id,nm.exporter(b.exporter_id)))+fact("Importer",chip("importer",b.importer_id,nm.importer(b.importer_id)))+fact("Container",esc(b.container))+fact("Volume",N(batchKg(b))+" kg parchment")+fact("DDS reference",b.dds_ref?esc(b.dds_ref):'<span class="bad">missing — cannot be placed on the EU market</span>',"",1)+fact("Status",b.status)}
  else{const x=(type==="exporter"?T.exp:T.imp)[id];if(!x)return null;title=x.name;sub=x.country||x.district||"";src=x.src;const bs=(type==="exporter"?T.batByExp:T.batByImp)[id]||[];
    facts=fact(type==="exporter"?"Licence":"EORI",esc(x.licence_no||x.eori))+fact("Contact",esc(x.contact))+fact("Phone",esc(x.phone))+fact("Email",esc(x.email))+fact("Batches",bs.length?chips("batch",bs.map(b=>b.batch_id)):"",bs.length?srcOf.batch:"",1)+fact("Volume",N(bs.reduce((t,b)=>t+batchKg(b),0))+" kg")}
  // chain
  const sections=[["Farmers","farmer",c.F],["Stations","station",c.S],["Deliveries","delivery",c.D],["Lots","lot",c.L],["Batches","batch",c.B],["Exporters","exporter",c.X],["Importers","importer",c.M]].filter(([,t,s])=>t!==type&&s.size);
  extra=sections.map(([l,t,s])=>`<h4>${l} in this chain <small>${N(s.size)}</small></h4><div>${chips(t,s)}</div>`).join("");
  const conf=[...c.plotHow].filter(([,h])=>h==="confirmed").length,inf=[...c.plotHow].filter(([,h])=>h==="inferred").length;
  if(type!=="plot"&&c.plotHow.size)extra+=`<h4>Farms in this chain</h4><p>${link("confirmed")} ${N(conf)} farm(s) named in a delivery${inf?` · ${link("inferred")} ${N(inf)} farm(s) of farmers whose delivery did not name a plot`:""}</p>`;
  const maybe=[...c.maybe.S].length?`<h4>Possible stations <small>${link("inferred")}</small></h4><p class="muted">No delivery is recorded for this farm. Stations in the same sector:</p><div>${chips("station",c.maybe.S)}</div>`:c.maybe.P.size?`<h4>Possible suppliers <small>${link("inferred")}</small></h4><p class="muted">No delivery is recorded here yet. ${N(c.maybe.P.size)} farms are mapped in this station's sector; they are not linked until deliveries are recorded.</p>`:"";
  const empty=!sections.length&&!maybe&&!["exporter","importer"].includes(type)?`<p class="muted">No deliveries, lots or batches are recorded for this ${type==="plot"?"farm":type} yet.</p>`:"";
  const ps=[...c.plotHow.keys()].map(i=>T.farmById[i]).filter(Boolean),prov=provenance({farms:ps,S:c.S,D:c.D,L:c.L,B:c.B,X:c.X,M:c.M});
  return{type,id,title,sub,src,risk,facts,extra:extra+maybe+empty,chainSrc:chainSrc(prov),prov,c}}
export function renderProfile(){
  const el=$("#drawer"),s=S.sel;if(!s){el.hidden=true;return}const p=profileOf(s.type,s.id);if(!p){el.hidden=true;return}el.hidden=false;
  el.innerHTML=`<div class="dh"><div class="av" style="background:${p.type==="plot"||p.type==="farmer"?COL[p.risk||"low"]:"var(--pri)"}">${esc((p.title.match(/\b\w/g)||["?"]).slice(0,2).join("").toUpperCase())}</div><div><small>${p.type==="plot"?"farm":p.type}</small><h3>${esc(p.title)}</h3><span class="muted">${esc(p.sub)}</span></div><button class="x" id="dx" aria-label="Close">×</button></div>
  <div class="db"><div class="tags">${tag(p.src)}${p.risk?pill(p.risk):""}${p.chainSrc!==p.src?`<span class="muted">chain: </span>${tag(p.chainSrc)}`:""}</div><div class="facts">${p.facts}</div>${p.extra}</div>
  <div class="df"><button id="dzoom">Show on map</button><button class="ghost" id="dnet">Network</button><button class="ghost" id="dprint">Print profile</button><button class="ghost" id="dcsv">CSV</button>${editInfo(p.type,p.id)?'<button class="ghost" id="dedit">Edit</button><button class="ghost" id="ddel">Delete</button>':""}</div>`}
export const nameOf=(t,id)=>nm[t]?nm[t](id):id;
