// One place for every request: portal token handling and the Supabase data call.
import {CFG} from "../config.js";
export class NetErr extends Error{}
export class ArcErr extends Error{constructor(e){super(e.message||"ArcGIS error");this.code=e.code;this.details=e.details}}
const SS=globalThis.sessionStorage;let expiredHandler=null;
export const onExpired=f=>expiredHandler=f;
export const token=()=>SS&&Date.now()<+SS.getItem("tkExp")?SS.getItem("tk"):null;
export const setToken=(t,exp)=>{SS.setItem("tk",t);SS.setItem("tkExp",exp||Date.now()+72e5)};
export const clearToken=()=>SS?.clear();
const where=u=>{try{return new URL(u).pathname.split("/").slice(-4).join("/")}catch{return u}};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const apiUrl=()=>CFG.API_URL||CFG.SUPABASE_URL.replace(/\/$/,"")+"/functions/v1/api";

// Every app-owned record goes through one small function. It validates the Portal token
// and uses the service key inside Supabase, so no database credentials reach the browser.
export async function sb(body,{retry=true}={}){
  let r;
  try{r=await fetch(apiUrl(),{method:"POST",headers:{"Content-Type":"application/json",apikey:CFG.SUPABASE_ANON_KEY,Authorization:`Bearer ${token()||""}`},body:JSON.stringify(body)})}
  catch{throw new NetErr("Cannot reach the data service. Check your connection.")}
  if(r.status===401||r.status===403){if(retry&&expiredHandler){await expiredHandler();return sb(body,{retry:false})}throw new Error("Your Portal session is no longer valid.")}
  if(!r.ok)throw new Error(`Data service answered HTTP ${r.status} for …/${where(apiUrl())}`);
  const d=await r.json();
  if(!d.ok){if(/expired|session/i.test(d.error||"")&&retry&&expiredHandler){await expiredHandler();return sb(body,{retry:false})}throw new Error(d.error||"Data request failed")}
  return d.value;
}

export async function req(url,params={},{post=false,retry=true,attempt=0}={}){
  const p=new URLSearchParams({f:"json"});for(const[k,v]of Object.entries(params))if(v!==undefined)p.set(k,typeof v==="object"?JSON.stringify(v):v);
  const tk=token();if(tk)p.set("token",tk);
  let r;try{r=post?await fetch(url,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:p}):await fetch(url+(url.includes("?")?"&":"?")+p)}
  catch{throw new NetErr("Cannot reach NAEB GIS. Check your connection; if it persists the server may not allow this site (CORS).")}
  if([502,503,504].includes(r.status)&&attempt<3){await sleep(1000*2**attempt);return req(url,params,{post,retry,attempt:attempt+1})}
  if(!r.ok)throw new Error(`NAEB server answered HTTP ${r.status} for …/${where(url)}${r.status===504?" (the server took too long)":""}`);
  const d=await r.json();
  if(d.error){if([498,499].includes(d.error.code)&&retry&&expiredHandler){await expiredHandler();return req(url,params,{post,retry:false,attempt})}throw new ArcErr(d.error)}
  return d}
export async function signIn(portal,user,pass){
  const r=await fetch(`${portal}/sharing/rest/generateToken`,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({username:user,password:pass,client:"referer",referer:location.origin,expiration:"120",f:"json"})}).catch(()=>{throw new NetErr("Cannot reach the portal (network or CORS).")});
  const d=await r.json();if(d.error)throw new ArcErr(d.error);setToken(d.token,d.expires)}
