// Run: node tests/geo.mjs
import assert from "node:assert/strict";import * as G from "../src/geo.js";
let ok=0;const t=(n,f)=>{try{f();ok++;console.log("✓",n)}catch(e){console.log("✗",n,"\n ",e.message);process.exitCode=1}};
const sq=(lat,lng,m)=>{const dLat=m/110540,dLng=m/(111320*Math.cos(lat*Math.PI/180));return[[lat,lng],[lat,lng+dLng],[lat+dLat,lng+dLng],[lat+dLat,lng]]}; // ~m×m square, counter-clockwise on a map
t("a 100 m square is about 1 ha and 400 m around",()=>{const s=sq(-1.7,30.3,100);assert.ok(Math.abs(G.areaHa(s)-1)<.02,G.areaHa(s));assert.ok(Math.abs(G.perimeterM(s)-400)<3)});
t("a 20 m × 20 m plot (typical here) is 0.04 ha",()=>assert.ok(Math.abs(G.areaHa(sq(-1.7,30.3,20))-.04)<.002));
t("ring orientation is corrected to clockwise and the ring is closed (ArcGIS rule)",()=>{const s=sq(-1.7,30.3,50);assert.equal(G.isClockwise(s),false);const g=G.toEsriRing(s),r=g.rings[0];assert.deepEqual(r[0],r.at(-1));assert.equal(g.spatialReference.wkid,4326);
  const back=r.slice(0,-1).map(p=>[p[1],p[0]]);assert.equal(G.isClockwise(back),true);assert.equal(r[0][0]>29&&r[0][0]<31,true,"x is longitude")});
t("a bow-tie walk is detected; a clean square is not",()=>{const s=sq(-1.7,30.3,50);assert.equal(G.selfIntersects(s),false);const bow=[s[0],s[2],s[1],s[3]];assert.equal(G.selfIntersects(bow),true)});
t("overlap: shifted square overlaps, far square does not, nested counts",()=>{const a=sq(-1.7,30.3,50),b=sq(-1.70015,30.30015,50),c=sq(-1.71,30.31,50);assert.equal(G.ringsOverlap(a,b),true);assert.equal(G.ringsOverlap(a,c),false);assert.equal(G.ringsOverlap(a,sq(-1.69999,30.30001,5)),true)});
t("simplify drops walking jitter but keeps the corners",()=>{const s=sq(-1.7,30.3,60),dense=[];for(let i=0;i<s.length;i++){const a=s[i],b=s[(i+1)%s.length];for(let k=0;k<10;k++)dense.push([a[0]+(b[0]-a[0])*k/10+(k%2?2e-7:0),a[1]+(b[1]-a[1])*k/10])}
  const out=G.simplify(dense,1.5);assert.ok(out.length>=4&&out.length<=8,"kept "+out.length);assert.ok(Math.abs(G.areaHa(out)-G.areaHa(s))<.0005)});
t("averaging GPS fixes weights the accurate ones",()=>{const p=G.averagePoint([{lat:-1.7,lng:30.3,acc:5},{lat:-1.7001,lng:30.3001,acc:50}]);assert.ok(Math.abs(p.lat+1.7)<2e-5&&p.acc<5)});
console.log(`\n${ok} checks passed`);
