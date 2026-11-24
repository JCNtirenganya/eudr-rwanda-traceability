// Prior land use → forest / crops / grass / built / unknown. The survey offers 3 fixed options plus "Other: <free text>" (often Kinyarwanda).
// Edit RULES to teach the app a new word: order matters (first match wins). Anything not matched is "unknown" and goes to review, never silently "low".
export const RULES=[
  ["forest",/shyamba|amashyamba|\bforest\b|woodland|\bwooded\b/i],                     // ishyamba = forest/bush
  ["vacant",/ntacyo|ntacyarigihinzemo|ntibwahing|ntihahing|sambu|umushike|shinge|bihuru|ibigunda|umukenke|mwishi|agasozi|mubutayu|igihuru|ubutaka gusa|ntakintu|ntacyintu|ntoacyo|kurubuye|haragaso|kumucyenye|inshinje|dhinge/i],   // vacant land, no other crop (confirmed by NAEB): ntacyo, igisambu, umushike, ishinge/amashinge, ibihuru, ntibwahingwaga
  ["quarry",/amabuye|quarry/i],                                                          // a former quarry: not forest
  ["built",/tuwe|butuwe|miturire|inzu|residenc|habitation|\bhouse\b|settle/i],                              // hari hatuwe = a home was there
  ["crops",/ibishyimbo|bishyimbo|urutoki|insina|imyumbati|imibyare|myaka|ubuhinzi|ibitinguru|umyumbati|uritoki|ibishyumbo|guhingwa|ibisntizireraimbo|ibijumba|amasaka|ibirayi|ibigori|amashaza|kawa|ikawa|hahing|hahinz|\bcrop|\bbean|\bbanana|\bcassava|\bmaize|\bsorghum|\bpotato/i]];
const OPTIONS={"forest/wooded land":"forest","cropland":"crops","grassland/pasture":"grass"};
export function classify(prior){
  const p=String(prior||"").trim(),k=p.toLowerCase();if(!p)return{cls:"unknown",text:""};
  if(OPTIONS[k])return{cls:OPTIONS[k],text:""};
  const free=p.replace(/^other:?\s*/i,"");for(const[c,re]of RULES)if(re.test(free))return{cls:c,text:free};
  return{cls:"unknown",text:free}}
