// farmer_id = district(2) sector(2) cell(2) village(2) sequence(4)   e.g. 530904080166
// plot_id   = farmer_id + plot number(2)                              e.g. 53090408016601   (true for every plot in the farms layer)
export const isFarmerId=s=>/^\d{12}$/.test(String(s)),isPlotId=s=>/^\d{14}$/.test(String(s)),isNationalId=s=>/^\d{16}$/.test(String(s)),isPhone=s=>/^\d{9}$/.test(String(s));
// Learn which 8-digit prefix each village uses, from IDs already in use (most common wins).
export function villagePrefixes(farms){const m={};for(const f of farms){if(!isFarmerId(f.fm))continue;const k=[f.district,f.sec,f.cell,f.village].join("|"),p=f.fm.slice(0,8);((m[k]??={})[p]=(m[k][p]||0)+1)}
  return Object.fromEntries(Object.entries(m).map(([k,c])=>[k,Object.entries(c).sort((a,b)=>b[1]-a[1])[0][0]]))}
export const idKey=(district,sector,cell,village)=>[district,sector,cell,village].join("|");
export function nextFarmerId(prefix8,farmerIds){const used=farmerIds.filter(i=>i.startsWith(prefix8)).map(i=>+i.slice(8)),n=(used.length?Math.max(...used):0)+1;return n>9999?null:prefix8+String(n).padStart(4,"0")}
export function nextPlotId(farmerId,plotIds,already=[]){const used=[...plotIds,...already].filter(i=>i.startsWith(farmerId)).map(i=>+i.slice(12)),n=(used.length?Math.max(...used):0)+1;return n>99?null:farmerId+String(n).padStart(2,"0")}
