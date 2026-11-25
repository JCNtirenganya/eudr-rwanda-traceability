// Optional browser smoke: node tests/smoke.mjs (skips cleanly without Playwright).
import {spawn} from "node:child_process";
let chromium;try{({chromium}=await import("playwright"))}catch{console.log("SKIP tests/smoke.mjs — playwright is not installed.");process.exit(0)}
const srv=spawn("python3",["-m","http.server","8767"],{stdio:"ignore"});await new Promise(r=>setTimeout(r,1200));
const b=await chromium.launch(),ctx=await b.newContext(),p=await ctx.newPage(),errs=[];p.on("pageerror",e=>errs.push(e.message));
let bad=0;const ok=(c,m)=>{console.log(c?"✓":"✗",m);if(!c){bad++;process.exitCode=1}};
const fakeL=`const c=()=>new Proxy(function(){},{get:(t,k)=>k==="then"?undefined:(k in t?t[k]:c()),apply:()=>c()});window.L=c();window.__poly=0;L.polygon=()=>{window.__poly++;return c()};L.circleMarker=()=>c();L.map=()=>{const m=c();m.setView=()=>m;m.on=()=>m;m.invalidateSize=()=>m;m.removeLayer=()=>m;m.fitBounds=()=>m;return m};`;
const farmMeta={fields:[{name:"plot_id"},{name:"farmer_id"},{name:"national_id"},{name:"farmer_name"},{name:"phone"},{name:"district"},{name:"sector"},{name:"prior_land_use"},{name:"first_planting_year"},{name:"area_ha"},{name:"survey_date"}]};
const farmRows=Array.from({length:60},(_,i)=>({attributes:{plot_id:"P"+i,farmer_id:"F"+i,national_id:"1199880000000000",farmer_name:"Farmer "+i,phone:"078",district:"Gatsibo",sector:"S"+(i%2),prior_land_use:"Cropland",first_planting_year:2005,area_ha:.05,survey_date:Date.now()},geometry:{rings:[[[30.3+i/1e4,-1.7],[30.3002+i/1e4,-1.7],[30.3002+i/1e4,-1.7002],[30.3+i/1e4,-1.7]]]}}));
await p.route("**/*",async r=>{const u=r.request().url();
  if(u.startsWith("http://localhost"))return r.continue();
  if(u.includes("leaflet.min.js"))return r.fulfill({body:fakeL,contentType:"text/javascript"});
  if(u.includes("leaflet.min.css")||u.includes("fonts.g"))return r.fulfill({body:"",contentType:"text/css"});
  if(u.includes("generateToken"))return r.fulfill({json:{token:"abc",expires:Date.now()+36e5}});
  if(u.includes("community/self"))return r.fulfill({json:{username:"admin1",fullName:"Test Admin",role:"org_admin"}});
  if(u.includes("Coffee_Washing_Station"))return r.fulfill({json:{features:[{attributes:{cws_uid:"S1",cws_name:"CWS 1",y_coordinate:-1.7,x_coordinate:30.3},geometry:null}]}});
  if(u.includes("EUDR_Data/FeatureServer")){
    if(!u.includes("/query"))return r.fulfill({json:{maxRecordCount:1000,fields:farmMeta.fields}});
    const q=new URLSearchParams(new URL(u).search),nid=(q.get("where")||"").match(/national_id='([^']*)'/)?.[1];
    const rows=nid?farmRows.filter(x=>x.attributes.national_id===nid):farmRows;
    return r.fulfill({json:{features:rows}})}});
await p.goto("http://localhost:8767/index.html");
ok(await p.isVisible("#splash"),"sign-in gate is shown first");
await p.fill("#su","admin1");await p.fill("#sp","x");await p.click("#sgo");
await p.waitForFunction(()=>document.querySelector("#src")?.textContent.includes("60 farm polygons"),null,{timeout:10000});
ok(await p.evaluate(()=>window.__poly)>=60,"all 60 Portal farm polygons are drawn after login");
await p.click("#recbtn");
ok(await p.locator('#recmenu [data-new="find_farmer"]').count()===1,"the Record menu offers the read-only Portal farmer lookup");
ok(await p.locator('#recmenu [data-new^="farm_"], #recmenu [data-new^="station_"]').count()===0,"no farm or station recording forms are offered");
await p.click('[data-new="find_farmer"]');await p.waitForSelector("#qf");
await p.fill('[data-k="national_id"]',"1199880000000000");await p.click("#qf .row button:not(.ghost)");
await p.waitForFunction(()=>document.querySelector("#found")?.textContent.includes("Farmer 0"),null,{timeout:6000});
ok((await p.textContent("#found")).includes("Read only"),"National ID lookup is read-only and finds the Portal farmer");
console.log("page errors:",errs.length?errs:"none");await b.close();srv.kill();
console.log(bad?`\n${bad} FAILED`:"\nall smoke checks passed");
