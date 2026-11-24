// Static, print-ready extracts of the current focus: a map (base tiles + vector plots) and the network. DOM-free string builders, unit-tested.
import {T} from "./trace.js";
import {COL,LBL,esc,N} from "./ui.js";
import {buildGraph} from "./graph.js";
const TS=256;
export const px=(lat,lng,z)=>{const n=TS*2**z,s=Math.sin(Math.max(-85.05,Math.min(85.05,lat))*Math.PI/180);return[(lng+180)/360*n,(0.5-Math.log((1+s)/(1-s))/(4*Math.PI))*n]};
export const BASEMAPS={osm:{name:"Streets",maxZ:19,attr:"© OpenStreetMap contributors",url:(z,x,y)=>`https://tile.openstreetmap.org/${z}/${x}/${y}.png`},
  sat:{name:"Satellite",maxZ:18,attr:"Imagery © Esri, Maxar, Earthstar Geographics",url:(z,x,y)=>`https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`}};
// Largest zoom at which the points fit the picture (with padding); never closer than a ~220 m window so a single plot keeps its surroundings.
export function fitView(pts,W,H,{maxZ=19,minSpanM=220,pad=.1}={}){
  let la0=Math.min(...pts.map(p=>p[0])),la1=Math.max(...pts.map(p=>p[0])),lo0=Math.min(...pts.map(p=>p[1])),lo1=Math.max(...pts.map(p=>p[1]));
  const mla=(la0+la1)/2,mlo=(lo0+lo1)/2,dLa=minSpanM/2/111320,dLo=minSpanM/2/(111320*Math.cos(mla*Math.PI/180));
  la0=Math.min(la0,mla-dLa);la1=Math.max(la1,mla+dLa);lo0=Math.min(lo0,mlo-dLo);lo1=Math.max(lo1,mlo+dLo);
  let z=maxZ;for(;z>2;z--){const[x0,y0]=px(la1,lo0,z),[x1,y1]=px(la0,lo1,z);if(x1-x0<=W*(1-2*pad)&&y1-y0<=H*(1-2*pad))break}
  const[ax,ay]=px(la1,lo0,z),[bx,by]=px(la0,lo1,z);return{z,ox:(ax+bx)/2-W/2,oy:(ay+by)/2-H/2,bounds:[la0,lo0,la1,lo1]}}
const nice=m=>[5,10,20,50,100,200,500,1000,2000,5000,10000,20000,50000].filter(v=>v<=m).pop()||5;
export function mapExtract(sc,{W=640,H=400,basemap="osm"}={}){
  const bm=BASEMAPS[basemap]||BASEMAPS.osm,inS=new Set(sc.farms.map(f=>f.id));
  const stIds=sc.S?[...sc.S]:Object.keys(T.stations);let pts=sc.farms.filter(f=>f.c).map(f=>f.c);
  if(!pts.length)pts=stIds.filter(i=>T.stations[i]).map(i=>[T.stations[i].lat,T.stations[i].lng]);
  if(!pts.length)pts=T.farms.filter(f=>f.c).map(f=>f.c);if(!pts.length)return{html:'<p class="muted">Nothing to map yet.</p>',info:null};
  const v=fitView(pts,W,H,{maxZ:bm.maxZ}),{z,ox,oy}=v,P=(lat,lng)=>{const[x,y]=px(lat,lng,z);return[+(x-ox).toFixed(1),+(y-oy).toFixed(1)]},inView=([x,y])=>x>-20&&y>-20&&x<W+20&&y<H+20;
  const n=2**z,tiles=[];for(let ty=Math.floor(oy/TS);ty<=Math.floor((oy+H)/TS);ty++)for(let tx=Math.floor(ox/TS);tx<=Math.floor((ox+W)/TS);tx++){if(ty<0||ty>=n)continue;tiles.push(`<img class="tile" alt="" src="${bm.url(z,((tx%n)+n)%n,ty)}" style="left:${(tx*TS-ox).toFixed(1)}px;top:${(ty*TS-oy).toFixed(1)}px">`)}
  const dots=sc.farms.length>4000,ring=f=>"M"+f.ring.map(p=>P(p[0],p[1]).join(",")).join("L")+"Z";let shown=0,ctx=0,ctxSvg="",farmSvg="";
  if(sc.active){for(const f of T.farms){if(inS.has(f.id)||!f.c||ctx>=2500)continue;const q=P(f.c[0],f.c[1]);if(!inView(q))continue;ctx++;ctxSvg+=dots||!f.ring?`<circle cx="${q[0]}" cy="${q[1]}" r="1.6"/>`:`<path d="${ring(f)}"/>`}}
  for(const f of sc.farms){if(!f.c)continue;const q=P(f.c[0],f.c[1]);if(!inView(q))continue;shown++;const c=COL[f.eudr]||COL.none,inf=sc.plotHow?.get(f.id)==="inferred";
    farmSvg+=dots||!f.ring?`<circle cx="${q[0]}" cy="${q[1]}" r="2.2" fill="${c}"/>`:`<path d="${ring(f)}" fill="${c}" fill-opacity=".45" stroke="${c}" stroke-width="1.6"${inf?' stroke-dasharray="3 2"':""}/>`}
  let stSvg="",nl=0;for(const i of stIds){const s=T.stations[i];if(!s)continue;const q=P(s.lat,s.lng);if(!inView(q))continue;stSvg+=`<circle cx="${q[0]}" cy="${q[1]}" r="5.5" fill="${s.src==="recorded"?"#2b6cb0":"#1f6b50"}" stroke="#fff" stroke-width="2"/>`;
    if(nl++<20)stSvg+=`<text x="${q[0]+8}" y="${q[1]+4}" class="st">${esc(s.name.slice(0,28))}</text>`}
  const mpp=156543.03392*Math.cos((v.bounds[0]+v.bounds[2])/2*Math.PI/180)/n,len=nice(mpp*140),barW=len/mpp,lab=len>=1000?len/1000+" km":len+" m";
  const svg=`<svg class="mapsvg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"><g fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="1"><g fill="#555" fill-opacity=".35" stroke="#444" stroke-opacity=".5">${ctxSvg}</g></g>${farmSvg}${stSvg}
   <g transform="translate(14,${H-26})"><rect x="-6" y="-12" width="${barW+22}" height="30" fill="#fff" fill-opacity=".85"/><path d="M0,6 H${barW} M0,1 V11 M${barW},1 V11" stroke="#000" stroke-width="2" fill="none"/><text x="0" y="-2" class="sc">${lab}</text></g>
   <g transform="translate(${W-30},34)"><circle r="16" fill="#fff" fill-opacity=".85"/><path d="M0,-12 L6,8 L0,4 L-6,8 Z" fill="#222"/><text y="-17" text-anchor="middle" class="sc">N</text></g></svg>`;
  const leg=["low","review","blocked"].map(k=>`<span><i style="background:${COL[k]}"></i>${LBL[k]}</span>`).join("")+'<span><i class="stn"></i>Washing station</span>'+(sc.active&&ctx?'<span><i style="background:#999"></i>Other farms (context)</span>':"");
  return{html:`<div class="mapfig" style="width:${W}px;height:${H}px">${tiles.join("")}${svg}</div><div class="figleg">${leg}</div><div class="figcap">${N(shown)} farm(s) shown${ctx?` · ${N(ctx)} other farms in view for context`:""} · zoom ${z} · ${esc(bm.name)} · ${esc(bm.attr)}</div>`,info:{z,shown,ctx,tiles:tiles.length,bounds:v.bounds,len}}}
export const graphExtract=sc=>{const g=buildGraph(sc,{interactive:false,expandAll:true});return g.empty?'<p class="muted">No deliveries, lots or batches are recorded in this scope, so there is no network to draw.</p>':`${g.svg}<div class="figcap">${esc(g.note)}${g.capped?` · ${g.total} stations drawn`:""}</div>`};
export const figuresHTML=(sc,basemap)=>`<h2>Map extract</h2><figure class="fig">${mapExtract(sc,{basemap}).html}</figure><h2>Network extract</h2><figure class="fig">${graphExtract(sc)}</figure>`;
export const whenImagesLoaded=(root,ms=7000)=>new Promise(res=>{const imgs=[...root.querySelectorAll("img.tile")].filter(i=>!i.complete);if(!imgs.length)return res();let n=imgs.length;const done=()=>{if(--n<=0)res()};imgs.forEach(i=>{i.addEventListener("load",done);i.addEventListener("error",done)});setTimeout(res,ms)});
