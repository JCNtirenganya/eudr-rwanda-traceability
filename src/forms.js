// Record forms, generated from the model definitions. One engine; delivery, lot and batch add the pieces they need.
// A form never closes on an error and never loses what was typed.
import {Data} from "./data/index.js";
import {T,chain} from "./trace.js";
import {validateRecord} from "./engine/schema.js";
import {$,esc,N,combo,toast,pill,tag,worst,COL,LBL} from "./ui.js";
export const hooks={refresh:async()=>{},center:()=>null};
const today=()=>new Date().toISOString().slice(0,10),mask=n=>n?"•••• "+String(n).slice(-4):"";
const me=()=>Data.me,mine=id=>me().isAdmin||me().stations.includes(id);
const MODEL_OF={delivery:"cherry_delivery",lot:"lot",batch:"export_batch",exporter:"exporter",importer:"importer"};
const NEW=[["cherry_delivery","Record a cherry delivery"],["lot","New lot"],["export_batch","New export batch"],["exporter","New exporter"],["importer","New importer"]];
// Read-only Portal lookup; farms, farmers and CWS are never recorded here.
const QUEST=[["find_farmer","Find a farmer in Portal (read only)"]];
export const canNew=id=>!!Data.models[id]&&me().isAdmin;
export const newMenu=()=>[...QUEST,...NEW].filter(([id])=>id==="find_farmer"||canNew(id)).map(([id,l])=>[id,l+(Data.raw[id]?.kind==="demo"?"  (demo — not saved)":"")]);
// ---- who may change an existing record, and which model it belongs to
export function editInfo(type,id){const mid=MODEL_OF[type];if(!mid||Data.raw[mid]?.kind==="demo")return null;
  const rec=({delivery:T.del,lot:T.lot,batch:T.bat,exporter:T.exp,importer:T.imp}[type]||{})[id];if(!rec||rec.src==="indicative")return null;
  const m=Data.models[mid];return Data.me.isAdmin?{mid,model:m,rec}:null}
// ---- option lists for link fields
let fIdx=null;export const resetForms=()=>{fIdx=null};
const farmerOpts=()=>fIdx??=Object.entries(T.plotsOf).map(([fm,a])=>({v:fm,t:`${a[0].nm||"Farmer"} · ${fm}`,sub:`${mask(a[0].nid)} · ${a[0].sec} · ${a.length} farm(s)`,x:a[0].nid}));
const OPT={cws:()=>Object.values(T.stations).filter(s=>mine(s.id)).map(s=>({v:s.id,t:s.name,sub:`${s.sector}, ${s.district}`})),farmer:()=>farmerOpts(),
  plot:v=>(T.plotsOf[v.farmer_id]||[]).map(f=>({v:f.id,t:"Farm "+f.id,sub:`${f.ha} ha · ${f.sec}`})),exporter:()=>Object.values(T.exp).map(x=>({v:x.exporter_id,t:x.name,sub:x.licence_no})),
  importer:()=>Object.values(T.imp).map(x=>({v:x.importer_id,t:x.name,sub:x.country})),lot:()=>Object.values(T.lot).map(x=>({v:x.lot_id,t:x.lot_id,sub:x.lot_date})),
  cherry_delivery:()=>Object.values(T.del).map(x=>({v:x.delivery_id,t:x.delivery_id,sub:x.delivery_date})),export_batch:()=>Object.values(T.bat).map(x=>({v:x.batch_id,t:x.batch_id,sub:x.ship_date}))};
// ---- field HTML
const inp=(f,v)=>{const k=`data-k="${f.k}"`,r=f.req?" required":"";
  if(f.type==="longtext")return`<textarea ${k} rows="2">${esc(v)}</textarea>`;
  if(f.type==="choice")return`<select ${k}><option value=""></option>${f.choices.map(c=>`<option value="${esc(c.code)}" ${v===c.code?"selected":""}>${esc(c.label)}</option>`).join("")}</select>`;
  if(f.type==="bool")return`<select ${k}><option value=""></option><option value="1" ${v===true?"selected":""}>Yes</option><option value="0" ${v===false?"selected":""}>No</option></select>`;
  if(f.type==="multichoice")return`<div class="mc" ${k}>${f.choices.map(c=>`<label><input type="checkbox" value="${esc(c.code)}" ${(v||[]).includes(c.code)?"checked":""}> ${esc(c.label)}</label>`).join("")}</div>`;
  const t=f.type==="date"?"date":f.type==="datetime"?"datetime-local":["int","decimal"].includes(f.type)?"number":"text",st=f.type==="decimal"?' step="any"':f.type==="int"?' step="1"':"";
  return`<input ${k} type="${t}"${st} value="${esc(v)}"${f.min!=null?` min="${f.min}"`:""}${f.max!=null?` max="${f.max}"`:""}${f.len?` maxlength="${f.len}"`:""}${f.auto&&f.k!=="recorded_by"?"":""}>`};
export const renderField=(f,v)=>FIELD(f,v);
const FIELD=(f,v)=>f.type==="link"?`<div class="fld ${f.w?"w":""}" data-fk="${f.k}"><div class="lk" data-lk="${f.k}"></div>${f.help?`<small class="muted">${esc(f.help)}</small>`:""}<span class="ferr"></span></div>`
  :`<div class="fld ${["longtext","multichoice"].includes(f.type)||f.w?"w":""}" data-fk="${f.k}"><label>${esc(f.label)}${f.req?" *":""}${inp(f,v)}</label>${f.help?`<small class="muted">${esc(f.help)}</small>`:""}<span class="ferr"></span></div>`;
// ---- the engine
export function openForm(modelId,{rec=null,defaults={},after=()=>{},title}={}){
  const m=Data.models[modelId],repo=Data.repo(modelId),edit=!!rec,vals={...defaults,...(rec||{})},demo=Data.raw[modelId].kind==="demo",dlg=$("#modal");
  let fields=m.fields.filter(f=>f.type!=="file"&&!f.auto);
  if(modelId==="cherry_delivery"){fields=fields.map(f=>f.k==="plot_id"?{...f,req:true,help:"One delivery = one farm. If the farmer brought cherries from two farms, record two deliveries."}:f);if(!edit){vals.delivery_date??=today();const a=Data.me.stations;if(a.length===1)vals.cws_id??=a[0]}}
  if(!edit)for(const f of fields)if(f.default!=null&&vals[f.k]==null)vals[f.k]=f.default; // model-defined defaults (e.g. status "open")
  if(modelId==="lot"&&!edit)vals.lot_date??=today();if(modelId==="export_batch"&&!edit)vals.ship_date??="";
  const pick=!edit&&(modelId==="lot"||modelId==="export_batch");
  dlg.innerHTML=`<form id="mf" novalidate><h3>${esc(title||(edit?"Edit ":"New ")+m.name.toLowerCase())}</h3>
   ${demo?'<p class="warnbox">This model is on <b>Demo</b>. What you enter is <b>not saved</b> and is labelled Indicative.</p>':""}
   ${modelId==="cherry_delivery"?'<div id="fcard" class="fcard"></div>':""}
   <div class="grid2">${fields.map(f=>FIELD(f,vals[f.k])).join("")}</div>
   ${pick?`<div class="pickbox"><b id="ptitle"></b><input id="pq" placeholder="Filter…"><div id="plist" class="chkl"></div><p id="psum" class="muted"></p></div>`:""}
   <p class="err" id="merr" role="alert"></p><div class="row"><button type="button" class="ghost" id="mcancel">Cancel</button>${modelId==="cherry_delivery"&&!edit?'<button type="button" class="ghost" id="msaveadd">Save &amp; add another</button>':""}<button id="msave">${edit?"Save changes":"Save"}</button></div></form>`;
  const link=k=>fields.find(f=>f.k===k);
  const refreshCard=()=>{const c=$("#fcard");if(!c)return;const a=T.plotsOf[vals.farmer_id];if(!a){c.innerHTML="";return}const pl=T.farmById[vals.plot_id],bad=a.filter(f=>f.eudr!=="low").length;
    c.innerHTML=`<b>${esc(a[0].nm||"Farmer")}</b> <span class="muted">${esc(vals.farmer_id)} · ${mask(a[0].nid)}</span><br>${a.length} farm(s) in ${esc(a[0].sec)}`+
      (pl?`<br>Selected farm <b>${esc(pl.id)}</b> · ${pl.ha} ha · ${pill(pl.eudr)}${pl.eudr!=="low"?`<br><span class="bad">${esc(pl.why)} Cherries from this farm may not be exportable to the EU until it is cleared.</span>`:""}`:(bad?`<br><span class="bad">${bad} of this farmer's farm(s) are flagged — choose the farm to see.</span>`:""))};
  const combos={};dlg.querySelectorAll("[data-lk]").forEach(h=>{const f=link(h.dataset.lk),src=f.to;
    combos[f.k]=combo(h,{label:f.label+(f.req?" *":""),ph:src==="farmer"?"Type a name, farmer ID or National ID…":src==="plot"?"Choose the farmer first, then the farm…":"Choose…",get:()=>(OPT[src]||(()=>[]))(vals),value:vals[f.k]||"",onPick:v=>{vals[f.k]=v;if(f.k==="farmer_id"){const pl=T.plotsOf[v]||[];vals.plot_id=pl.length===1?pl[0].id:"";combos.plot_id?.set(vals.plot_id)}if(f.k==="farmer_id"||f.k==="plot_id")refreshCard();if(f.k==="cws_id")redrawPick()}})});
  refreshCard();$("#mcancel").onclick=()=>dlg.close();
  // pick lists: deliveries for a lot, lots for a batch
  const chosen=new Set();let pitems=[];
  function redrawPick(){if(!pick)return;const q=($("#pq").value||"").toLowerCase();
    if(modelId==="lot"){const st=vals.cws_id;pitems=Object.values(T.del).filter(d=>d.cws_id===st&&!(T.ldByDel[d.delivery_id]||[]).length).map(d=>({id:d.delivery_id,t:`${d.delivery_id} · ${d.delivery_date} · farmer ${d.farmer_id}`,kg:d.weight_kg}));$("#ptitle").textContent=st?"Deliveries to put in this lot (not yet in any lot)":"Choose the washing station first"}
    else{pitems=Object.values(T.lot).filter(l=>!(T.blByLot[l.lot_id]||[]).length).map(l=>({id:l.lot_id,t:`${l.lot_id} · ${l.lot_date} · ${T.stations[l.cws_id]?.name||l.cws_id}`,kg:l.parchment_kg_out||0}));$("#ptitle").textContent="Lots to ship in this batch (not yet in a batch)"}
    for(const c of[...chosen])if(!pitems.some(p=>p.id===c))chosen.delete(c);
    $("#plist").innerHTML=pitems.filter(p=>!q||p.t.toLowerCase().includes(q)).slice(0,300).map(p=>`<label><input type="checkbox" value="${esc(p.id)}" ${chosen.has(p.id)?"checked":""}> ${esc(p.t)} <span class="muted">${N(p.kg)} kg</span></label>`).join("")||'<p class="muted pad">Nothing available.</p>';sumPick()}
  function sumPick(){const kg=pitems.filter(p=>chosen.has(p.id)).reduce((t,p)=>t+p.kg,0);let msg=`${chosen.size} selected · ${N(kg)} kg`;
    if(modelId==="lot"){const el=dlg.querySelector('[data-k="cherry_delivery_kg"]');const ci=dlg.querySelector('[data-k="cherry_kg_in"]');if(ci&&chosen.size)ci.value=Math.round(kg*10)/10}
    if(modelId==="export_batch"&&chosen.size){const c=[...chosen].flatMap(l=>[...chain("lot",l).plotHow.keys()]),fs=[...new Set(c)].map(i=>T.farmById[i]).filter(Boolean),bad=fs.filter(f=>f.eudr!=="low").length;
      msg+=` · ${fs.length} farms, ${bad?`<span class="bad">${bad} flagged — resolve before the DDS</span>`:"none flagged"}`}$("#psum").innerHTML=msg}
  if(pick){$("#pq").oninput=redrawPick;$("#plist").onchange=e=>{e.target.checked?chosen.add(e.target.value):chosen.delete(e.target.value);sumPick()};redrawPick()}
  const read=()=>{const o={...vals};dlg.querySelectorAll("[data-k]").forEach(el=>{const k=el.dataset.k;let v;
      if(el.classList.contains("mc"))v=[...el.querySelectorAll("input:checked")].map(x=>x.value);else v=el.value;
      const f=fields.find(x=>x.k===k);if(f?.type==="bool")v=v===""?null:v==="1";if(["int","decimal"].includes(f?.type)&&v!=="")v=+v;if(v==="")v=null;o[k]=v});return o};
  const showErr=(errs,msg)=>{dlg.querySelectorAll(".ferr").forEach(e=>e.textContent="");for(const[k,t]of Object.entries(errs||{})){const e=dlg.querySelector(`[data-fk="${k}"] .ferr`);if(e)e.textContent=t}$("#merr").textContent=msg||""};
  async function save(again){const b1=$("#msave"),b2=$("#msaveadd");b1.disabled=true;b2&&(b2.disabled=true);showErr({},"");
    try{const o=read();const v=validateRecord(m,o);const errs={...v.errors};
      if(modelId==="cherry_delivery"){if(o.plot_id&&o.farmer_id&&T.farmById[o.plot_id]&&T.farmById[o.plot_id].fm!==o.farmer_id)errs.plot_id="This farm does not belong to the selected farmer.";if(!errs.farmer_id&&o.farmer_id&&!T.plotsOf[o.farmer_id])errs.farmer_id="This farmer ID is not in the Portal farms layer.";
        if(v.warnings.price_per_kg&&!o.notes)errs.notes="Add a note explaining why the price is below the NAEB minimum.";
        if(o.receipt_no&&Object.values(T.del).some(d=>d.cws_id===o.cws_id&&d.receipt_no===o.receipt_no&&d.delivery_id!==rec?.delivery_id))errs.receipt_no="This receipt number is already used at this station."}
      if(Object.keys(errs).length||(pick&&!chosen.size)){showErr(errs,Object.keys(errs).length?"Please fix the highlighted fields.":modelId==="lot"?"Choose at least one delivery for this lot.":"Choose at least one lot for this batch.");throw 0}
      if(v.warnings.parchment_kg_out)toast("⚠ "+v.warnings.parchment_kg_out);
      let out;
      if(edit){const patch={};for(const f of fields)if(JSON.stringify(o[f.k]??null)!==JSON.stringify(rec[f.k]??null))patch[f.k]=o[f.k];out=await repo.update(rec[m.key],patch)}
      else{out=await repo.create(o);
        if(pick&&chosen.size){const lr=Data.repo(modelId==="lot"?"lot_delivery":"batch_lot"),made=[];
          try{for(const id of chosen)made.push(await lr.create(modelId==="lot"?{lot_id:out.lot_id,delivery_id:id,kg_allocated:T.del[id].weight_kg}:{batch_id:out.batch_id,lot_id:id,kg:T.lot[id].parchment_kg_out||0}))}
          catch(e){for(const x of made)await lr.softDelete(x.link_id).catch(()=>{});await repo.softDelete(out[m.key]).catch(()=>{});throw new Error(`Could not save the links (${e.message}). Nothing was saved; your entries are still here — press Save to try again.`)}}}
      toast(demo?"Added for this session only (demo, not saved)":edit?"Changes saved":"Saved");await hooks.refresh();after(out);
      if(again){const keep={cws_id:o.cws_id,delivery_date:o.delivery_date};dlg.close();openForm(modelId,{defaults:keep,after})}else dlg.close()}
    catch(e){if(e!==0){showErr(e.fields,e.message||"Could not save")}}finally{b1.disabled=false;b2&&(b2.disabled=false)}}
  $("#mf").onsubmit=e=>{e.preventDefault();save(false)};$("#msaveadd")?.addEventListener("click",()=>save(true));dlg.showModal();
  (dlg.querySelector("[data-lk] input")||dlg.querySelector("[data-k]"))?.focus()}
export async function startEdit(type,id){const info=editInfo(type,id);if(!info)return;try{const rec=await Data.repo(info.mid).get(id);if(!rec)return toast("This record no longer exists.");openForm(info.mid,{rec})}catch(e){toast(e.message)}}
export const addFor=type=>{const mid=MODEL_OF[type];return mid&&canNew(mid)?mid:null};
export async function removeRecord(type,id){const info=editInfo(type,id);if(!info)return;const{mid,model}=info;
  if(type==="delivery"&&(T.ldByDel[id]||[]).length)return toast("This delivery is in a lot. Remove the lot first.");
  if(type==="lot"&&(T.blByLot[id]||[]).length)return toast("This lot is in a batch. Remove the batch first.");
  if(!confirm(`Delete ${model.name.toLowerCase()} ${id}? It is hidden, not erased, and the deletion is logged.`))return;
  try{if(type==="lot")for(const d of T.ldByLot[id]||[]){const l=(await Data.repo("lot_delivery").list()).find(x=>x.lot_id===id&&x.delivery_id===d);l&&await Data.repo("lot_delivery").softDelete(l.link_id)}
    if(type==="batch")for(const l of T.blByBatch[id]||[]){const r=(await Data.repo("batch_lot").list()).find(x=>x.batch_id===id&&x.lot_id===l);r&&await Data.repo("batch_lot").softDelete(r.link_id)}
    await Data.repo(mid).softDelete(id);toast("Deleted");await hooks.refresh()}catch(e){toast(e.message)}}
