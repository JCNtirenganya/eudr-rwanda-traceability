// Plain geometry for plots walked with GPS. Points are [lat, lng]. Pure functions, unit-tested.
const R=6371008.8,rad=Math.PI/180;
export const dist=(a,b)=>{const dLat=(b[0]-a[0])*rad,dLng=(b[1]-a[1])*rad,x=Math.sin(dLat/2)**2+Math.cos(a[0]*rad)*Math.cos(b[0]*rad)*Math.sin(dLng/2)**2;return 2*R*Math.asin(Math.sqrt(x))};
const proj=pts=>{const la=pts.reduce((t,p)=>t+p[0],0)/pts.length,lo=pts.reduce((t,p)=>t+p[1],0)/pts.length;return pts.map(p=>[(p[1]-lo)*rad*R*Math.cos(la*rad),(p[0]-la)*rad*R])};
const shoelace=xy=>{let s=0;for(let i=0,j=xy.length-1;i<xy.length;j=i++)s+=xy[j][0]*xy[i][1]-xy[i][0]*xy[j][1];return s/2}; // >0 = counter-clockwise (x east, y north)
export const areaM2=pts=>pts.length<3?0:Math.abs(shoelace(proj(pts)));
export const areaHa=pts=>areaM2(pts)/1e4;
export const perimeterM=(pts,close=true)=>{let s=0;for(let i=1;i<pts.length;i++)s+=dist(pts[i-1],pts[i]);if(close&&pts.length>2)s+=dist(pts.at(-1),pts[0]);return s};
export const isClockwise=pts=>shoelace(proj(pts))<0;
export const centroid=pts=>[pts.reduce((t,p)=>t+p[0],0)/pts.length,pts.reduce((t,p)=>t+p[1],0)/pts.length];
// Douglas–Peucker, tolerance in metres
export function simplify(pts,tol=1.5){if(pts.length<4)return pts;const xy=proj(pts),keep=new Array(pts.length).fill(false);keep[0]=keep[pts.length-1]=true;
  const seg=(p,a,b)=>{const dx=b[0]-a[0],dy=b[1]-a[1],l=dx*dx+dy*dy;if(!l)return Math.hypot(p[0]-a[0],p[1]-a[1]);const t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/l));return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy)};
  const rec=(i,j)=>{let m=0,k=-1;for(let n=i+1;n<j;n++){const d=seg(xy[n],xy[i],xy[j]);if(d>m){m=d;k=n}}if(m>tol&&k>-1){keep[k]=true;rec(i,k);rec(k,j)}};rec(0,pts.length-1);return pts.filter((_,i)=>keep[i])}
const ccw=(a,b,c)=>(c[1]-a[1])*(b[0]-a[0])-(b[1]-a[1])*(c[0]-a[0]);
const cross=(a,b,c,d)=>ccw(a,c,d)*ccw(b,c,d)<0&&ccw(a,b,c)*ccw(a,b,d)<0;
// true if any two non-adjacent edges of the ring cross (a "bow-tie" or looped walk)
export function selfIntersects(pts){const n=pts.length,xy=proj(pts);for(let i=0;i<n;i++){const a=xy[i],b=xy[(i+1)%n];for(let j=i+2;j<n;j++){if(i===0&&j===n-1)continue;if(cross(a,b,xy[j],xy[(j+1)%n]))return true}}return false}
export function pointInRing(p,ring){let c=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++)if((ring[i][0]>p[0])!==(ring[j][0]>p[0])&&p[1]<(ring[j][1]-ring[i][1])*(p[0]-ring[i][0])/(ring[j][0]-ring[i][0])+ring[i][1])c=!c;return c}
export function ringsOverlap(a,b){if(a.some(p=>pointInRing(p,b))||b.some(p=>pointInRing(p,a)))return true;const all=[...a,...b],xy=proj(all),A=xy.slice(0,a.length),B=xy.slice(a.length);
  for(let i=0;i<A.length;i++)for(let j=0;j<B.length;j++)if(cross(A[i],A[(i+1)%A.length],B[j],B[(j+1)%B.length]))return true;return false}
export const toEsriRing=pts=>{const r=isClockwise(pts)?pts:[...pts].reverse(),o=r.map(p=>[+p[1].toFixed(7),+p[0].toFixed(7)]);o.push(o[0]);return{rings:[o],spatialReference:{wkid:4326}}}; // ArcGIS outer rings are clockwise and closed
// Average several GPS fixes into one point (used for a washing-station location)
export const averagePoint=fixes=>{const w=fixes.map(f=>1/Math.max(f.acc,1)**2),s=w.reduce((a,b)=>a+b,0);return{lat:fixes.reduce((t,f,i)=>t+f.lat*w[i],0)/s,lng:fixes.reduce((t,f,i)=>t+f.lng*w[i],0)/s,acc:Math.sqrt(1/s)}};
