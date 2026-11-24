// GPS capture on the device. Boundary: walk it (a point every few metres) and/or tap each corner. Station: average several fixes.
import {dist,areaHa,perimeterM,simplify,selfIntersects,averagePoint} from "./geo.js";
import {esc} from "./ui.js";
const NO_GPS="This device or browser cannot give a location. Use a phone or tablet over HTTPS, and allow location access.";
const grade=a=>a==null?["—","muted"]:a<=8?["good","ok"]:a<=20?["fair","mid"]:["weak","bad"];
export function mountWalk(host,{maxAcc=20,minStep=3,onChange=()=>{}}={}){
  let pts=[],accs=[],watch=null,walking=false,fix=null,msg="";const dr=()=>host.querySelector("svg");
  host.innerHTML=`<div class="gps"><div class="gpsbar"><span id="gst">GPS: starting…</span><span id="gstat" class="muted"></span></div>
   <svg viewBox="0 0 200 120" class="gpsmap" aria-label="Boundary preview"></svg>
   <div class="gpsbtn"><button type="button" id="gwalk">Start walking</button><button type="button" id="gcorner" class="ghost">Add corner here</button><button type="button" id="gundo" class="ghost">Undo</button><button type="button" id="gclear" class="ghost">Clear</button></div>
   <p class="muted small">Walk along the edge of the plot, or stand at each corner and tap <b>Add corner here</b>. Aim for 4 or more points. Signal must be ±${maxAcc} m or better.</p>
   <details><summary>No GPS? Enter points by hand</summary><textarea id="gman" rows="4" placeholder="latitude, longitude — one point per line"></textarea><button type="button" id="gapply" class="ghost">Use these points</button></details></div>`;
  const $=s=>host.querySelector(s);
  function result(){const ring=pts.length>3?simplify(pts,1.5):pts,issues=[];if(ring.length<3)issues.push("Add at least 3 points.");else{if(selfIntersects(ring))issues.push("The boundary crosses itself. Undo back to the crossing, or clear and walk it again.");
      const a=areaHa(ring);if(a<.0005)issues.push("This plot is smaller than 5 m². Check the points.")}
    const ac=accs.length?accs.reduce((a,b)=>a+b,0)/accs.length:null;
    return{ring,raw:pts.length,area:ring.length>2?areaHa(ring):0,perimeter:perimeterM(ring),accuracy:ac,method:walking||pts.length>3?"walked":"corners",issues,ok:ring.length>=3&&!issues.length}}
  function draw(){const r=result(),s=dr();if(!pts.length){s.innerHTML='<text x="100" y="62" text-anchor="middle" class="gpsempty">no points yet</text>';stat(r);return}
    const la=pts.map(p=>p[0]),lo=pts.map(p=>p[1]),y0=Math.min(...la),y1=Math.max(...la),x0=Math.min(...lo),x1=Math.max(...lo),k=Math.min(180/Math.max(x1-x0,1e-7),100/Math.max(y1-y0,1e-7));
    const P=pts.map(p=>[10+(p[1]-x0)*k,110-(p[0]-y0)*k]);s.innerHTML=`<polygon points="${P.map(p=>p.join(",")).join(" ")}" class="${r.ok?"gpsok":"gpsbad"}"/>`+P.map((p,i)=>`<circle cx="${p[0]}" cy="${p[1]}" r="${i===P.length-1?3.5:2}"/>`).join("");stat(r)}
  const stat=r=>{$("#gstat").innerHTML=`${pts.length} point${pts.length===1?"":"s"} · ${r.area?r.area.toFixed(4)+" ha · ":""}${r.perimeter?Math.round(r.perimeter)+" m around":""}${r.issues.length?`<br><span class="bad">${esc(r.issues[0])}</span>`:""}`;onChange(r)};
  const status=()=>{const[g,c]=grade(fix?.acc);$("#gst").innerHTML=fix?`GPS: ±${fix.acc.toFixed(0)} m <span class="gq ${c}">${g}</span>${walking?" · walking":""}`:`GPS: ${msg||"waiting for a signal…"}`};
  function onPos(p){const c=p.coords;fix={lat:c.latitude,lng:c.longitude,acc:c.accuracy};msg="";status();if(!walking)return;if(c.accuracy>maxAcc)return;const pt=[c.latitude,c.longitude];if(!pts.length||dist(pts.at(-1),pt)>=minStep){pts.push(pt);accs.push(c.accuracy);draw()}}
  function start(){if(!navigator.geolocation){msg=NO_GPS;status();return}if(watch!=null)return;watch=navigator.geolocation.watchPosition(onPos,e=>{msg=e.code===1?"permission denied — allow location access":"no signal ("+e.message+")";status()},{enableHighAccuracy:true,maximumAge:0,timeout:30000})}
  $("#gwalk").onclick=()=>{start();walking=!walking;$("#gwalk").textContent=walking?"Pause":pts.length?"Resume walking":"Start walking";status()};
  $("#gcorner").onclick=()=>{start();if(!fix){msg="waiting for a signal…";status();return}if(fix.acc>maxAcc){msg=`signal is ±${fix.acc.toFixed(0)} m — wait for ±${maxAcc} m or better`;status();return}pts.push([fix.lat,fix.lng]);accs.push(fix.acc);draw()};
  $("#gundo").onclick=()=>{pts.pop();accs.pop();draw()};$("#gclear").onclick=()=>{pts=[];accs=[];walking=false;$("#gwalk").textContent="Start walking";draw()};
  $("#gapply").onclick=()=>{const p=$("#gman").value.split("\n").map(l=>l.split(/[,;\s]+/).map(Number)).filter(a=>a.length>=2&&a.every(Number.isFinite));pts=p.map(a=>[a[0],a[1]]);accs=p.map(()=>0);draw()};
  start();draw();status();
  return{result,stop:()=>{if(watch!=null)navigator.geolocation.clearWatch(watch);watch=null},set:p=>{pts=p.map(x=>[...x]);accs=p.map(()=>0);draw()}}}
// Average fixes for a point (washing station). Calls onDone({lat,lng,acc}) after `n` good fixes or when stopped.
export function capturePoint({n=6,maxAcc=25,onProgress=()=>{},onDone=()=>{},onError=()=>{}}={}){
  if(!navigator.geolocation){onError(NO_GPS);return{stop(){}}}const fixes=[];let id=null;
  const done=()=>{if(id!=null)navigator.geolocation.clearWatch(id);id=null;fixes.length?onDone(averagePoint(fixes)):onError("No good GPS fix yet. Move to open sky and try again.")};
  id=navigator.geolocation.watchPosition(p=>{const c=p.coords;if(c.accuracy>maxAcc){onProgress(fixes.length,n,c.accuracy,false);return}fixes.push({lat:c.latitude,lng:c.longitude,acc:c.accuracy});onProgress(fixes.length,n,c.accuracy,true);if(fixes.length>=n)done()},
    e=>onError(e.code===1?"Location permission denied. Allow location access for this site.":"GPS error: "+e.message),{enableHighAccuracy:true,maximumAge:0,timeout:30000});
  return{stop:done}}
