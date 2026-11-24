// Pilot storage: records live as JSON files in a PRIVATE GitHub repo (data/<model>.json), written through the Contents API.
// Each user supplies a fine-grained token (Contents: read/write on that one repo); it stays in this tab's sessionStorage.
import {newKey} from "../engine/schema.js";
const API="https://api.github.com",LS=globalThis.localStorage,SS=globalThis.sessionStorage;
export const ghConf=()=>({repo:LS?.getItem("gh.repo")||"",branch:LS?.getItem("gh.branch")||"main",dir:"data"});
export const ghSet=(repo,branch,token)=>{LS.setItem("gh.repo",repo.trim());LS.setItem("gh.branch",(branch||"main").trim());SS.setItem("gh.token",token.trim())};
export const ghClear=()=>{SS.removeItem("gh.token")};
export const ghReady=()=>!!(ghConf().repo&&SS?.getItem("gh.token"));
export class GhErr extends Error{constructor(m,status){super(m);this.status=status}}
const b64=s=>btoa(unescape(encodeURIComponent(s))),unb64=s=>decodeURIComponent(escape(atob(s.replace(/\n/g,""))));
async function api(path,opt={}){
  let r;try{r=await fetch(API+path,{...opt,headers:{Accept:"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28",Authorization:"Bearer "+SS.getItem("gh.token"),...(opt.headers||{})}})}
  catch{throw new GhErr("Cannot reach GitHub. Check your connection.",0)}
  if(r.status===401)throw new GhErr("GitHub rejected the token (wrong or expired). Reconnect GitHub.",401);
  if(r.status===403&&r.headers.get("x-ratelimit-remaining")==="0")throw new GhErr("GitHub rate limit reached. Wait a few minutes.",403);
  return r}
export async function ghTest(){
  const{repo}=ghConf(),r=await api(`/repos/${repo}`);
  if(r.status===404)throw new GhErr(`Repository ${repo} not found, or the token has no access to it.`,404);
  if(!r.ok)throw new GhErr("GitHub answered "+r.status,r.status);const d=await r.json();
  if(!d.private)throw new GhErr("The data repository must be PRIVATE. Records include farmer and delivery information.",0);
  if(d.permissions&&!d.permissions.push)throw new GhErr("This token can read but not write. Give it Contents: read and write.",0);
  return d}
async function getFile(path){const{repo,branch}=ghConf(),r=await api(`/repos/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`);
  if(r.status===404)return null;if(!r.ok)throw new GhErr("Could not read "+path+" ("+r.status+")",r.status);const j=await r.json();
  let text=j.content?unb64(j.content):"";
  if(!text&&j.size>0){const b=await api(`/repos/${repo}/git/blobs/${j.sha}`,{headers:{Accept:"application/vnd.github.raw+json"}});text=await b.text()}
  return{sha:j.sha,json:text?JSON.parse(text):{}}}
async function putFile(path,obj,sha,msg){const{repo,branch}=ghConf(),
  text=obj.records?'{"records":{\n'+Object.entries(obj.records).map(([k,v])=>JSON.stringify(k)+":"+JSON.stringify(v)).join(",\n")+"\n}}":JSON.stringify(obj,null,1);
  const r=await api(`/repos/${repo}/contents/${path}`,{method:"PUT",body:JSON.stringify({message:msg,content:b64(text),branch,...(sha?{sha}:{})})});
  if(r.status===409||r.status===422)throw new GhErr("conflict",409);if(!r.ok)throw new GhErr("Could not save ("+r.status+")",r.status);return(await r.json()).content.sha}
export class GitHubRepo{
  constructor(model,user=()=>"unknown"){this.m=model;this.user=user;this.kind="github";this.path=ghConf().dir+"/"+model.id+".json"}
  async load(){const f=await getFile(this.path);this.sha=f?.sha;return this.data=f?.json?.records?f.json:{records:{}}}
  async all(){return Object.values((this.data||await this.load()).records)}
  async list({limit}={}){const a=(await this.all()).filter(r=>!r.is_deleted);return limit?a.slice(0,limit):a}
  async count(){return(await this.list()).length}
  async get(k){return(await this.list()).find(r=>r[this.m.key]===k)||null}
  async write(msg,mutate){for(let i=0;i<4;i++){await this.load();const out=mutate(this.data.records);
    try{this.sha=await putFile(this.path,this.data,this.sha,msg+" · "+this.user());return out}catch(e){if(e.status!==409)throw e}}
    throw new GhErr("Someone else saved at the same moment. Nothing was lost on your screen — press Save again.",409)}
  create(rec){const m=this.m;return this.write(`Add ${m.id}`,rs=>{const r={...rec,data_source:"recorded",is_deleted:0,created_user:this.user(),created_date:new Date().toISOString()};r[m.key]||=newKey(m);
    for(const f of m.fields.filter(f=>f.unique&&r[f.k]))if(Object.values(rs).some(x=>!x.is_deleted&&x[f.k]===r[f.k]))throw new Error(`${f.label} "${r[f.k]}" already exists.`);
    if(rs[r[m.key]])throw new Error("That ID already exists.");rs[r[m.key]]=r;return r})}
  update(k,p){const m=this.m;return this.write(`Edit ${m.id}`,rs=>{const cur=rs[k];if(!cur||cur.is_deleted)throw new Error("Record no longer exists.");const r={...cur,...p,last_edited_user:this.user(),last_edited_date:new Date().toISOString()};
    for(const f of m.fields.filter(f=>f.unique&&r[f.k]))if(Object.values(rs).some(x=>x!==cur&&!x.is_deleted&&x[f.k]===r[f.k]))throw new Error(`${f.label} "${r[f.k]}" already exists.`);rs[k]=r;return r})}
  softDelete(k){return this.write(`Delete ${this.m.id}`,rs=>{if(rs[k])Object.assign(rs[k],{is_deleted:1,deleted_by:this.user(),deleted_at:new Date().toISOString()})})}
}
