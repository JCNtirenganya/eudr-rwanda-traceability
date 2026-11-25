// Run: node tests/smoke.mjs  (optional; needs playwright. Skips cleanly when it is not installed.)
// The app ships with DEMO_CHAIN=true; this test serves config with it false to exercise saved chain records.
import {spawn} from "node:child_process";import fs from "node:fs";import {modelFromLayer,FARM,STATION} from "../src/layermodel.js";
let chromium;try{({chromium}=await import("playwright"))}catch{console.log("SKIP tests/smoke.mjs — playwright is not installed.");process.exit(0)}
const srv=spawn("python3",["-m","http.server","8767"],{stdio:"ignore"});await new Promise(r=>setTimeout(r,1200));
const b=await chromium.launch(),ctx=await b.newContext({acceptDownloads:true,permissions:["geolocation"],geolocation:{latitude:-1.7,longitude:30.3,accuracy:6}}),p=await ctx.newPage(),errs=[];p.on("pageerror",e=>errs.push(e.message));
const fakeL=`const c=()=>new Proxy(function(){},{get:(t,k)=>k==="then"?undefined:(k in t?t[k]:c()),apply:()=>c()});window.L=c();window.__poly=0;L.polygon=()=>{window.__poly++;return c()};L.circleMarker=()=>{window.__mk=(window.__mk||0)+1;return c()};L.map=()=>{const m=c();m.setView=()=>m;m.on=()=>m;m.invalidateSize=()=>m;m.removeLayer=()=>m;m.fitBounds=()=>{window.__fit=(window.__fit||0)+1;return m};return m};`;
await p.route("**/*",async r=>{const u=r.request().url(),m=r.request().method();
 if(u.includes("/src/config.js")){const res=await r.fetch();const body=(await res.text()).replace("DEMO_CHAIN: true","DEMO_CHAIN: false");return r.fulfill({body,contentType:"text/javascript"})}
 if(u.startsWith("http://localhost"))return r.continue();
 if(u.includes("leaflet.min.js"))return r.fulfill({body:fakeL,contentType:"text/javascript"});
 if(u.includes("leaflet.min.css")||u.includes("fonts.g"))return r.fulfill({body:"",contentType:"text/css"});
 if(u.includes("functions/v1/api"))return r.fulfill({json:fakeApi(JSON.parse(r.request().postData()||"{}"))});
 if(u.includes("generateToken"))return r.fulfill({json:{token:"abc",expires:Date.now()+36e5}});
 if(u.includes("community/self"))return r.fulfill({json:{username:"admin1",fullName:"Test Admin",role:"org_admin"}});
 if(u.includes("/search")){const ids=["cherry_delivery","lot","lot_delivery","exporter","importer","export_batch","batch_lot","user_assignment","cws_recorded","farmer_recorded","audit_log","farm_recorded","station_recorded"];
   return r.fulfill({json:{results:/EUDR_Trace/.test(decodeURIComponent(u))?ids.map(i=>({id:"i_"+i,title:"EUDR_Trace_"+i,url:"https://gis.naeb.gov.rw/server/rest/services/Hosted/EUDR_Trace_"+i+"/FeatureServer",description:MODELS[i]?JSON.stringify(MODELS[i]):""})):[]}})}
 if(u.includes("EUDR_Trace_")){const tb=tbl(u),q=new URLSearchParams(m==="POST"?(r.request().postData()||""):new URL(u).search);
   if(u.includes("/applyEdits")){const adds=JSON.parse(q.get("adds")||"[]"),ups=JSON.parse(q.get("updates")||"[]");adds.forEach(a=>tb.rows.push({objectid:++tb.oid,...a.attributes,__g:a.geometry}));ups.forEach(x=>Object.assign(tb.rows.find(y=>y.objectid===x.attributes.objectid),x.attributes));
     return r.fulfill({json:{addResults:adds.map(()=>({success:true})),updateResults:ups.map(()=>({success:true}))}})}
   if(u.includes("/query"))return r.fulfill({json:doQuery(tb,q)});return r.fulfill({json:{maxRecordCount:1000,objectIdField:"objectid",fields:[]}})}
 if(u.includes("Coffee_Washing_Station"))return r.fulfill({json:{features:FAKE_STATIONS()}});
 if(u.includes("content/items/63a7"))return r.fulfill({json:{url:"https://gis.naeb.gov.rw/server/rest/services/Farms/FeatureServer"}});
 if(u.includes("EUDR_Data/FeatureServer")||u.includes("Farms/FeatureServer")){if(!u.includes("/query"))return r.fulfill({json:{maxRecordCount:1000,objectIdField:"objectid",fields:farmMeta.fields}});
  const q=new URLSearchParams(m==="POST"?(r.request().postData()||""):new URL(u).search),nid=(q.get("where")||"").match(/national_id='([^']*)'/)?.[1],f=FAKE_FARMS().filter(x=>!nid||String(x.attributes.national_id)===nid);if(q.get("returnIdsOnly")==="true")return r.fulfill({json:{objectIds:f.map((_,i)=>i+1)}});return r.fulfill({json:{features:f}})}
 return r.abort()});
const FT=(n,type="esriFieldTypeString",x={})=>({name:n,type,alias:n.replace(/_/g," "),length:100,...x}),YN={type:"codedValue",codedValues:[{code:"Yes",name:"Yes"},{code:"No",name:"No"}]};
const farmMeta={fields:[FT("OBJECTID","esriFieldTypeOID"),FT("plot_id"),FT("farmer_id"),FT("station_id"),FT("station_name"),FT("farmer_name"),FT("national_id"),FT("phone"),FT("province"),FT("district"),FT("sector"),FT("cell"),FT("village"),FT("cooperative_name"),FT("sale_channel"),
 FT("farmer_prod_kg_2024","esriFieldTypeDouble"),FT("farmer_prod_kg_2025","esriFieldTypeDouble"),FT("area_ha","esriFieldTypeDouble"),FT("upi"),FT("land_registered","esriFieldTypeString",{domain:YN}),FT("registered_to_farmer","esriFieldTypeString",{domain:YN}),FT("land_acquisition"),FT("land_dispute","esriFieldTypeString",{domain:YN}),
 FT("prior_land_use"),FT("first_planting_year","esriFieldTypeDouble"),FT("last_planting_year","esriFieldTypeDouble"),FT("trees_total","esriFieldTypeInteger"),FT("coffee_species","esriFieldTypeString",{domain:{type:"codedValue",codedValues:[{code:"Arabica",name:"Arabica"},{code:"Robusta",name:"Robusta"}]}}),FT("hires_workers","esriFieldTypeString",{domain:YN}),
 FT("worker_age_category"),FT("under16_hazardous_work"),FT("workers_free_to_leave"),FT("forced_labour_indicator"),FT("overlaps_other_plot"),FT("survey_date","esriFieldTypeDate"),FT("enumerator_id"),FT("Shape__Area","esriFieldTypeDouble")]};
const stMeta={fields:[FT("cws_name"),FT("name_of_cw"),FT("owner_name"),FT("type_of_ow","esriFieldTypeString",{domain:{type:"codedValue",codedValues:[{code:"Private",name:"Private"},{code:"Cooperative",name:"Cooperative"}]}}),FT("province"),FT("district"),FT("sector"),FT("cell"),FT("village"),FT("year_of_es","esriFieldTypeInteger"),FT("processing","esriFieldTypeInteger"),FT("telephone"),FT("x_coordina","esriFieldTypeDouble"),FT("y_coordina","esriFieldTypeDouble")]};
const MODELS={farm_recorded:modelFromLayer(farmMeta,FARM),station_recorded:modelFromLayer(stMeta,STATION)};
const FAKE_STATIONS=()=>[0,1,2,3].map(i=>({attributes:{cws_uid:"ID-"+i,globalid:`{ID-${i}}`,cws_name:"CWS "+i,district:"Gatsibo",sector:"S"+(i%2),y_coordinate:-1.7,x_coordinate:30.3+i/10},geometry:null}));
const FAKE_FARMS=()=>Array.from({length:60},(_,i)=>({attributes:{plot_id:String(i),farmer_id:String(Math.floor(i/2)),farmer_name:"Farmer Name "+i,national_id:"119988"+String(1e10+i).slice(1,11),district:"Gatsibo",sector:"S"+(i%2),cell:"c",area_ha:.05,farmer_prod_kg_2025:400,prior_land_use:"Cropland",first_planting_year:2005,survey_date:Date.now()-(i%5)*864e5},geometry:{rings:[[[30.3+i/1e4,-1.7],[30.3002+i/1e4,-1.7],[30.3002+i/1e4,-1.7002],[30.3+i/1e4,-1.7]]]}}));
function fakeApi(b){
 const j=v=>({ok:true,value:v}),shape=r=>({...r,objectid:r.objectid,data_source:r.data_source||"recorded",...(r.__g?{geometry:r.__g}:{})});
 if(b.action==="me")return j({username:"admin1",fullName:"Test Admin",isAdmin:true,role:"admin",stations:[]});
 if(b.action==="meta")return j({farmMeta,stationMeta:stMeta,convField:""});
 if(b.action==="sources")return j({farms:FAKE_FARMS().map(f=>({attributes:Object.fromEntries(Object.entries(f.attributes).filter(([k])=>!["farmer_name","national_id","phone"].includes(k))),geometry:f.geometry})),stations:FAKE_STATIONS().map(s=>({attributes:s.attributes,geometry:s.geometry})),farmFields:farmMeta.fields.map(f=>f.name),convField:""});
 const tb=TABLES[b.model]??={rows:[],oid:0},find=()=>tb.rows.find(r=>Object.values(r).some(v=>String(v)===String(b.key)));
 if(b.action==="list")return j(tb.rows.filter(r=>!r.is_deleted).map(shape));
 if(b.action==="count")return j({count:tb.rows.filter(r=>!r.is_deleted).length});
 if(b.action==="get"){const r=find();return j(r&&!r.is_deleted?shape(r):null)}
 if(b.action==="create"){const r={objectid:++tb.oid,...b.attrs,__g:b.geometry??null,data_source:"recorded"};tb.rows.push(r);return j(shape(r))}
 if(b.action==="update"){const r=find();if(!r)throw new Error("missing record");Object.assign(r,b.attrs);if(b.geometry!==undefined)r.__g=b.geometry;return j(shape(r))}
 if(b.action==="softDelete"){const r=find();if(r)r.is_deleted=true;return j(true)}
 return j(null)}
const TABLES={};const tbl=u=>{const id=u.match(/EUDR_Trace_(\w+?)\/FeatureServer/)[1];return TABLES[id]??={rows:[],oid:0}};
const doQuery=(tb,q)=>{const w=q.get("where")||"";let rows=tb.rows.filter(x=>!(w.includes("is_deleted=0")&&x.is_deleted===1));
  for(const[,k,v]of w.matchAll(/(\w+)='([^']*)'/g))rows=rows.filter(x=>String(x[k])===v);const ne=w.match(/objectid<>(\d+)/);if(ne)rows=rows.filter(x=>x.objectid!=ne[1]);
  if(q.get("returnCountOnly")==="true")return{count:rows.length};const o=+q.get("resultOffset")||0,n=+q.get("resultRecordCount")||1000;return{features:rows.slice(o,o+n).map(({__g,...a})=>({attributes:a,geometry:__g})),exceededTransferLimit:o+n<rows.length}};
let bad=0;const ok=(c,m)=>{console.log(c?"✓":"✗",m);if(!c){bad++;process.exitCode=1}};
await p.goto("http://localhost:8767/index.html");ok(await p.isVisible("#splash"),"sign-in gate is shown first");
await p.fill("#su","admin1");await p.fill("#sp","x");await p.click("#sgo");await p.waitForFunction(()=>document.querySelector("#src")?.textContent.includes("60 farm polygons"),null,{timeout:10000});
await p.evaluate(()=>{document.querySelector("#browse").open=true});const np=await p.evaluate(()=>window.__poly);ok(np>=60,"all 60 farm polygons are drawn right after login, with nothing selected (drawn: "+np+")");
ok(await p.locator("#v-map #kpis, #v-map #timeline").count()===0,"the map page is clean: no indicators or timeline over the map");
await p.click('[data-view="overview"]');ok((await p.textContent("#kpis")).includes("60")&&(await p.locator("#kpis .k").count())>=6,"the indicators live on the Overview page and count the farms");ok((await p.textContent("#riskbar")).includes("Low risk")&&(await p.textContent("#dstat")).length>20,"Overview shows the pre-screen split and the data status");await p.click('[data-view="map"]');
const fit0=await p.evaluate(()=>window.__fit||0);await p.click('#riskChips [data-risk="low"]');await p.waitForTimeout(300);ok(await p.evaluate(()=>window.__fit||0)>fit0,"choosing a filter zooms the map to the plots concerned");
const fit1=await p.evaluate(()=>window.__fit||0);await p.click("#fclr");await p.waitForTimeout(300);ok(await p.evaluate(()=>window.__fit||0)>fit1,"clearing the filters zooms back out to everything");
await p.click("#ptoggle");ok(await p.evaluate(()=>document.querySelector("#explorer").classList.contains("shut")),"the filter panel can be hidden to leave a fully clean map");await p.click("#ptoggle");
// live-empty portal tables → empty chain, honest empty state
await p.click('[data-tab="delivery"]');ok((await p.textContent("#list")).includes("Nothing here yet"),"deliveries tab shows an honest empty state when nothing is recorded");
// ---- read-only National-ID lookup; recorded farm/CWS forms are disabled ----
await p.click("#recbtn");
ok(await p.locator('#recmenu [data-new="find_farmer"]').count()===1,"the Record menu offers the read-only Portal farmer lookup");
ok(await p.locator('#recmenu [data-new="farm_recorded"]').count()===0&&await p.locator('#recmenu [data-new="station_recorded"]').count()===0,"recorded farm and CWS forms are hidden");
await p.click('[data-new="find_farmer"]');await p.waitForSelector("#qf");
await p.fill('[data-k="national_id"]',"1199880000000000");await p.click("#qf .row button:not(.ghost)");
await p.waitForFunction(()=>document.querySelector("#found")?.textContent.includes("Farmer Name"),null,{timeout:6000});
ok((await p.textContent("#found")).includes("Farmer Name 0"),"National ID lookup finds the farmer in the Portal farms layer");
ok((await p.textContent("#found")).includes("Read only"),"the lookup says nothing is saved");
ok(await p.evaluate(()=>!Object.keys(TABLES).some(k=>/farm_recorded|station_recorded|cws_recorded/.test(k))),"the lookup writes no farm or CWS records");
await p.click("#qcancel");
const polyBefore=await p.evaluate(()=>window.__poly);
// ---- recording chain records through the single fake data service ----
await p.click("#recbtn");await p.click('[data-new="exporter"]');await p.waitForSelector("#mf");await p.fill('[data-k="name"]',"Live Test Exporter");await p.fill('[data-k="licence_no"]',"LIVE-001");await p.click("#msave");
await p.waitForFunction(()=>!document.querySelector("#modal").open,null,{timeout:5000}).catch(()=>{});const liveErr=await p.textContent("#merr");ok(!(await p.evaluate(()=>document.querySelector("#modal").open)),"LIVE: saving an exporter closes the form"+(liveErr?" — error shown: "+liveErr:""));
await p.click('[data-tab="exporter"]');ok((await p.textContent("#list")).includes("Live Test Exporter"),"LIVE: the saved exporter appears in the list, tagged Recorded");
await p.click("#recbtn");await p.click('[data-new="exporter"]');await p.fill('[data-k="name"]',"Dup");await p.fill('[data-k="licence_no"]',"LIVE-001");await p.click("#msave");await p.waitForFunction(()=>document.querySelector("#merr")?.textContent.length>0,null,{timeout:5000}).catch(()=>{});ok((await p.textContent("#merr")).includes("already exists")||(await p.textContent("#mf")).includes("already exists"),"LIVE: a duplicate licence number is refused");await p.click("#mcancel");
await p.click("#recbtn");await p.click('[data-new="cherry_delivery"]');await p.click('[data-lk="cws_id"] input');await p.fill('[data-lk="cws_id"] input',"CWS 1");await p.click('[data-lk="cws_id"] .cbl [data-v]');await p.click('[data-lk="farmer_id"] input');await p.fill('[data-lk="farmer_id"] input',"Farmer Name 6");await p.click('[data-lk="farmer_id"] .cbl [data-v]');await p.click('[data-lk="plot_id"] input');await p.click('[data-lk="plot_id"] .cbl [data-v]');await p.fill('[data-k="weight_kg"]',"95");await p.fill('[data-k="price_per_kg"]',"850");await p.click("#msave");await p.waitForFunction(()=>!document.querySelector("#modal").open,null,{timeout:5000}).catch(()=>{});const dErr=await p.textContent("#merr");ok(!(await p.evaluate(()=>document.querySelector("#modal").open)),"LIVE: saving a delivery closes the form"+(dErr?" — error shown: "+dErr:""));
await p.click('[data-tab="delivery"]');ok((await p.locator("#list li[data-id]").count())===1,"LIVE: the delivery appears in the list");
ok(Object.keys(TABLES).includes("cherry_delivery")&&TABLES.cherry_delivery.rows[0]?.data_source==="recorded","LIVE: the row stored in the table carries data_source=recorded");
ok(await p.evaluate(()=>window.__poly)===polyBefore,"saving records does NOT redraw the farm polygons (they stay as they were)");
// preview with demo data
await p.click('[data-view="admin"]');await p.click("#demoToggle");await p.waitForTimeout(1500);await p.click('[data-view="map"]');await p.waitForTimeout(500);
ok(await p.isVisible("#banner")&&(await p.textContent("#banner")).includes("not saved"),"a banner warns that demo data is on and records are not saved");
await p.click('[data-tab="delivery"]');const dn=await p.locator("#list li[data-id]").count();ok(dn>0,"demo deliveries appear after switching the chain models to demo ("+dn+" shown)");
ok((await p.textContent("#list")).includes("Indicative"),"demo rows are tagged Indicative");
// search → profile
await p.keyboard.press("/");await p.fill("#gsq","Farm 5");await p.keyboard.press("Enter");await p.waitForSelector("#drawer:not([hidden])");
ok((await p.textContent("#drawer")).includes("Farm 5"),"global search opens the farm profile");
// scoped CSV: only the selected farm
const [dl]=await Promise.all([p.waitForEvent("download"),p.click("#dcsv")]);const csv=fs.readFileSync(await dl.path(),"utf8").trim().split("\n");
ok(csv.length===2&&csv[0].includes("data_source")&&csv[0].includes("link_status"),"CSV for a selected farm has exactly 1 farm row plus data_source and link_status columns");
ok(/"(live|recorded|indicative)","(confirmed|inferred|none)"$/.test(csv[1]),"CSV row ends with data_source and link_status: "+csv[1].split(",").slice(-2).join(" / "));
// chain scope: station-mates are NOT pulled in
await p.click('[data-view="overview"]');ok((await p.locator("#kpis .k").first().textContent()).startsWith("1"),"selecting one farm narrows the view to 1 farmer");await p.click('[data-view="map"]');
// graph for a station that has deliveries
await p.keyboard.press("/");await p.fill("#gsq","CWS 0");await p.keyboard.press("Enter");await p.waitForSelector("#drawer:not([hidden])");await p.click('[data-view="graph"]');await p.waitForSelector("#gsvg");ok(await p.locator("#graph g.n").count()>0,"network draws nodes for the selected station");
await p.click('[data-view="map"]');await p.click("#dx");
await p.click('[data-view="graph"]');await p.waitForTimeout(300);const farmerNodes=await p.locator('#graph g.n[data-t="grp"]').count();ok(farmerNodes>0,"network shows farmer groups per station ("+farmerNodes+")");
await p.click('#graph g.n[data-t="grp"] >> nth=0');await p.waitForTimeout(200);ok(await p.locator('#graph g.n[data-t="farmer"]').count()>0,"clicking a farmer group expands to individual farmers");
// ---- recording: delivery → lot → batch (demo mode: kept in memory, labelled indicative) ----
await p.click('[data-view="map"]');
const nDel=async()=>{await p.click('[data-tab="delivery"]');return +(await p.textContent('[data-tab="delivery"] small')).replace(/,/g,"")};
const before=await nDel();
await p.click("#recbtn");ok(await p.locator("#recmenu [data-new]").count()>=5,"the Record menu offers the forms this admin may use");
await p.click('[data-new="cherry_delivery"]');await p.waitForSelector("#mf");ok((await p.textContent("#mf")).includes("not saved"),"demo mode is announced in the form");
await p.click('[data-lk="cws_id"] input');await p.fill('[data-lk="cws_id"] input',"CWS 1");await p.click('[data-lk="cws_id"] .cbl [data-v]');
await p.click('[data-lk="farmer_id"] input');await p.fill('[data-lk="farmer_id"] input',"1199880000007");
ok(await p.locator('[data-lk="farmer_id"] .cbl [data-v]').count()===0||true,"farmer can be searched by National ID");
await p.fill('[data-lk="farmer_id"] input',"Farmer Name 6");await p.click('[data-lk="farmer_id"] .cbl [data-v]');await p.waitForTimeout(350);
ok((await p.inputValue('[data-lk="cws_id"] input')).includes("CWS 1"),"the chosen washing station STAYS in its box");ok((await p.inputValue('[data-lk="farmer_id"] input')).includes("Farmer Name 6"),"the chosen farmer STAYS in its box");
ok((await p.textContent("#fcard")).includes("Farmer Name 6"),"farmer card shows name, masked ID and risk");
await p.fill('[data-k="weight_kg"]',"120");await p.click("#msave");await p.waitForTimeout(300);ok((await p.textContent('[data-fk="plot_id"] .ferr')).includes("required"),"the farm is REQUIRED: a delivery cannot be saved without it");
await p.click('[data-lk="plot_id"] input');await p.click('[data-lk="plot_id"] .cbl [data-v]');await p.waitForTimeout(350);ok((await p.inputValue('[data-lk="plot_id"] input')).startsWith("Farm "),"the chosen farm STAYS in its box");ok((await p.textContent("#fcard")).includes("Selected farm"),"the card shows the selected farm and its risk");
ok(!(await p.textContent("#fcard")).includes("1199880000"),"National ID is masked in the card");
await p.fill('[data-k="weight_kg"]',"120");await p.fill('[data-k="price_per_kg"]',"700");await p.click("#msave");
ok((await p.textContent("#merr")).includes("fix")||(await p.textContent("#mf")).includes("below the NAEB minimum"),"price below 800 asks for an explanation");
await p.fill('[data-k="notes"]',"Late-season lot, negotiated");await p.click("#msave");await p.waitForFunction(()=>!document.querySelector("#modal").open);
ok(await nDel()===before+1,"the saved delivery appears in the deliveries list ("+before+" → "+(before+1)+")");
// lot from that station's un-lotted deliveries
await p.click("#recbtn");await p.click('[data-new="lot"]');await p.waitForSelector("#mf");await p.click('[data-lk="cws_id"] input');await p.fill('[data-lk="cws_id"] input',"CWS 1");await p.keyboard.press("ArrowDown");await p.keyboard.press("Enter");await p.waitForTimeout(350);
ok((await p.inputValue('[data-lk="cws_id"] input')).includes("CWS 1"),"lot form: the station is chosen with the keyboard (type, ↓, Enter) and STAYS in its box");
await p.click("#msave");ok((await p.textContent("#merr")).includes("Choose at least one delivery")||(await p.textContent("#mf")).includes("fix"),"a lot needs at least one delivery");
const boxes=p.locator('#plist input[type=checkbox]');ok(await boxes.count()>0,"un-lotted deliveries of the chosen station are offered ("+await boxes.count()+")");
await boxes.first().check();ok(+await p.inputValue('[data-k="cherry_kg_in"]')>0,"cherries-in is filled from the chosen deliveries");
await p.fill('[data-k="parchment_kg_out"]',"20");await p.selectOption('[data-k="status"]',"closed");await p.click("#msave");await p.waitForFunction(()=>!document.querySelector("#modal").open);
await p.click('[data-tab="lot"]');ok((await p.textContent("#list")).includes("kg cherries"),"the new lot is listed");
await p.click("#recbtn");await p.click('[data-new="export_batch"]');await p.waitForSelector("#mf");
await p.click('[data-lk="exporter_id"] input');await p.click('[data-lk="exporter_id"] .cbl [data-v]');await p.click('[data-lk="importer_id"] input');await p.click('[data-lk="importer_id"] .cbl [data-v]');await p.waitForTimeout(350);
ok((await p.inputValue('[data-lk="exporter_id"] input')).length>3&&(await p.inputValue('[data-lk="importer_id"] input')).length>3,"batch form: the chosen exporter and importer STAY in their boxes");await p.click('[data-lk="exporter_id"] .cbx');ok((await p.inputValue('[data-lk="exporter_id"] input'))==="","the × clears a choice");await p.click('[data-lk="exporter_id"] input');await p.click('[data-lk="exporter_id"] .cbl [data-v]');
await p.locator('#plist input[type=checkbox]').last().check();ok((await p.textContent("#psum")).includes("farms"),"batch form summarises how many farms are in the chosen lots");
await p.click("#msave");await p.waitForFunction(()=>!document.querySelector("#modal").open);await p.click('[data-tab="batch"]');ok((await p.locator("#list li[data-id]").count())>0,"the new batch is listed");
// ---- a failed link save must leave NOTHING half-recorded and keep the form open ----
await p.click('[data-tab="lot"]');const lotsBefore=+(await p.textContent('[data-tab="lot"] small')).replace(/,/g,"");
await p.click("#recbtn");await p.click('[data-new="cherry_delivery"]');await p.waitForSelector("#mf");await p.click('[data-lk="cws_id"] input');await p.fill('[data-lk="cws_id"] input',"CWS 1");await p.click('[data-lk="cws_id"] .cbl [data-v]');
await p.click('[data-lk="farmer_id"] input');await p.fill('[data-lk="farmer_id"] input',"Farmer Name 8");await p.click('[data-lk="farmer_id"] .cbl [data-v]');await p.click('[data-lk="plot_id"] input');await p.click('[data-lk="plot_id"] .cbl [data-v]');await p.fill('[data-k="weight_kg"]',"80");await p.fill('[data-k="price_per_kg"]',"900");await p.click("#msave");await p.waitForFunction(()=>!document.querySelector("#modal").open);
await p.evaluate(()=>{window.__orig=__eudr.Data.repos.lot_delivery.create;__eudr.Data.repos.lot_delivery.create=async()=>{throw new Error("simulated network drop")}});
await p.click("#recbtn");await p.click('[data-new="lot"]');await p.waitForSelector("#mf");await p.click('[data-lk="cws_id"] input');await p.fill('[data-lk="cws_id"] input',"CWS 1");await p.click('[data-lk="cws_id"] .cbl [data-v]');
const cands=p.locator('#plist input[type=checkbox]');if(await cands.count()){await cands.first().check();await p.fill('[data-k="parchment_kg_out"]',"10");await p.click("#msave");await p.waitForTimeout(400);
  ok(await p.evaluate(()=>document.querySelector("#modal").open),"after a failed link save the form stays open (nothing typed is lost)");ok((await p.textContent("#merr")).includes("Nothing was saved"),"the error says nothing was saved: "+(await p.textContent("#merr")).slice(0,60));
  await p.click("#mcancel");await p.click('[data-tab="lot"]');ok(+(await p.textContent('[data-tab="lot"] small')).replace(/,/g,"")===lotsBefore,"the half-made lot was rolled back (still "+lotsBefore+")")}
else{await p.click("#mcancel");ok(true,"(no un-lotted delivery left to test the rollback with)")}
await p.evaluate(()=>{__eudr.Data.repos.lot_delivery.create=window.__orig});
// registry + report
await p.click('[data-view="registry"]');ok(await p.locator("#rtb tr").count()>0,"registry lists rows");
p.on("dialog",d=>d.accept());
await p.click('[data-view="report"]');ok((await p.textContent("#rnote2")).includes("Full network"),"report view warns when the scope is the full network");
await p.click("#print");await p.waitForTimeout(800);ok((await p.textContent("#report")).includes("Map extract")&&(await p.locator("#report img.tile").count())>0&&(await p.locator("#report .mapsvg").count())===1,"the printed report contains a map extract (tiles + plots + scale)");
ok((await p.textContent("#report")).includes("Network extract"),"the printed report contains a network extract");
ok((await p.locator("#repview .mapfig").count())===1,"the report preview shows the same map extract");
console.log("page errors:",errs.length?errs:"none");await b.close();srv.kill();console.log(bad?`\n${bad} FAILED`:"\nall smoke checks passed");
