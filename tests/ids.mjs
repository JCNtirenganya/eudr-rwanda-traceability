// Run: node tests/ids.mjs
import assert from "node:assert/strict";import {villagePrefixes,idKey,nextFarmerId,nextPlotId,isFarmerId,isPlotId,isNationalId,isPhone} from "../src/ids.js";
const f=(fm,v)=>({fm,district:"Gatsibo",sec:"Murambi",cell:"C",village:v});let ok=0;const t=(n,fn)=>{try{fn();ok++;console.log("✓",n)}catch(e){console.log("✗",n,"\n ",e.message);process.exitCode=1}};
const farms=[f("530904080166","V1"),f("530904080012","V1"),f("530904080166","V1"),f("530904089999","V1"),f("531102050069","V2")];
t("each village's 8-digit prefix is learned from existing ids",()=>{const p=villagePrefixes(farms);assert.equal(p[idKey("Gatsibo","Murambi","C","V1")],"53090408");assert.equal(p[idKey("Gatsibo","Murambi","C","V2")],"53110205")});
t("the next farmer id is highest sequence + 1, zero-padded to 12 digits",()=>{assert.equal(nextFarmerId("53090408",["530904080166","530904080012","531102050069"]),"530904080167","other villages' ids are ignored");});
t("a village with no farmers yet starts at 0001; a full village returns null",()=>{assert.equal(nextFarmerId("53090408",[]),"530904080001");assert.equal(nextFarmerId("53090408",["530904089999"]),null)});
t("the next plot id is the farmer id + next plot number",()=>{assert.equal(nextPlotId("530904080166",["53090408016601","53090408016602","53090408001201"]),"53090408016603");assert.equal(nextPlotId("530904080166",[]),"53090408016601");assert.equal(nextPlotId("530904080166",["53090408016601"],["53090408016602"]),"53090408016603")});
t("format checks: 12-digit farmer id, 14-digit plot id, 16-digit national id, 9-digit phone",()=>{assert.ok(isFarmerId("530904080166")&&!isFarmerId("5309040801"));assert.ok(isPlotId("53090408016601"));assert.ok(isNationalId("1198880198102455")&&!isNationalId("11988801981024"));assert.ok(isPhone("728658841")&&!isPhone("0728658841"))});
console.log(`\n${ok} checks passed`);
