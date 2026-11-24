// Shared state: what is selected/filtered. Every view reads it and re-renders on change. It lives in the URL hash.
import {scopeOf} from "./trace.js";
export const S={view:"map",tab:"farmer",sel:null,imp:"",exp:"",stn:"",district:"",sector:"",risk:"",day:"",since:0,showInd:true,rbase:"osm",colorBy:"risk",q:"",sk:{},sd:-1,lim:200,rq:"",rtab:"station",rsort:{k:"title",d:1},rpage:0};
const subs=[];export const onChange=f=>subs.push(f);let memo=null;
export const scope=()=>memo??=scopeOf(S);
export const dirty=()=>{memo=null};
const FK=["imp","exp","stn","district","sector","risk","day"];
export function writeHash(){const p=new URLSearchParams();p.set("v",S.view);if(S.sel)p.set("sel",S.sel.type+":"+S.sel.id);FK.forEach(k=>S[k]&&p.set(k,S[k]));if(S.colorBy!=="risk")p.set("c",S.colorBy);if(S.since)p.set("since",S.since);if(!S.showInd)p.set("ind","0");history.replaceState(null,"","#"+p)}
export function readHash(){const p=new URLSearchParams(location.hash.slice(1));S.view=p.get("v")||"map";FK.forEach(k=>S[k]=p.get(k)||"");S.colorBy=p.get("c")||"risk";S.since=+p.get("since")||0;S.showInd=p.get("ind")!=="0";
  const[t,...r]=(p.get("sel")||"").split(":");S.sel=t&&r.length?{type:t,id:r.join(":")}:null}
export function change(p={}){Object.assign(S,p);if(!("q"in p)&&!("lim"in p))S.lim=200;memo=null;writeHash();subs.forEach(f=>f())}
export const select=(type,id)=>change({sel:S.sel&&S.sel.type===type&&S.sel.id===id?null:{type,id}});
export const clearAll=()=>change({sel:null,imp:"",exp:"",stn:"",district:"",sector:"",risk:"",day:"",since:0,q:""});
