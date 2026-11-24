// Invented organisations used ONLY by demo (indicative) data, plus small deterministic helpers.
export const SEED_EXPORTERS=[
 {id:"EXP-01",name:"Gatsibo Highlands Exporters Ltd",licence:"EXP-RW-2026-101",contact:"M. Uwase",email:"info@gatsibo-highlands.example"},
 {id:"EXP-02",name:"Umutara Coffee Export SARL",licence:"EXP-RW-2026-118",contact:"J. Habimana",email:"export@umutara.example"},
 {id:"EXP-03",name:"Kivu Belt Traders Ltd",licence:"EXP-RW-2026-142",contact:"C. Mukamana",email:"trade@kivubelt.example"}];
export const SEED_IMPORTERS=[
 {id:"IMP-01",name:"NordCoffee Import GmbH",country:"Germany",eori:"DE123456789012345",contact:"H. Weber",email:"buying@nordcoffee.example"},
 {id:"IMP-02",name:"Nordic Roasters AB",country:"Sweden",eori:"SE556677889901",contact:"L. Andersson",email:"sourcing@nordicroasters.example"},
 {id:"IMP-03",name:"Amsterdam Coffee Traders B.V.",country:"Netherlands",eori:"NL987654321000",contact:"R. de Vries",email:"trade@amsterdamcoffee.example"},
 {id:"IMP-04",name:"Torrefazione Alpina S.p.A.",country:"Italy",eori:"IT01234567890",contact:"G. Rossi",email:"acquisti@alpina.example"}];
export const hash=s=>{let h=2166136261;for(const c of String(s)){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return h>>>0};
export const rng=a=>()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296};
