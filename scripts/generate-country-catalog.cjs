'use strict';
/* Copy the canonical singleplayer country data into server-only, dependency-free
 * modules. Changes to country-system.js must regenerate both versions together.
 * --check verifies that generated modules are not stale without writing files. */
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'country-system.js'),'utf8');
const match=source.match(/const COUNTRIES_RAW=Object\.freeze\((\[[\s\S]*?\])\);\s*function derived/);
if(!match)throw Error('Could not locate canonical singleplayer country profiles');
const records=vm.runInNewContext(match[1],Object.create(null),{timeout:3000});
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const canonical=records.map(input=>{
 if(!/^[a-z]{2}$/.test(input.id)||!Number.isFinite(input.taxRate)||!input.name)
  throw Error('Invalid canonical country profile');
 const income=Math.sqrt(clamp(input.gdpPpp/90026.5,.02,3));
 const price=clamp(input.priceLevel,.10,1.35);
 const wage=clamp(price*(.72+.28*income),.10,1.30);
 const demand=clamp(.84+.30*income,.88,1.15);
 return {id:input.id,name:input.name,region:input.region,taxRate:input.taxRate,
  inflationPct:input.inflationPct,priceLevel:input.priceLevel,
  rent:price,wage,demand,revenue:price,
  loanRate:clamp(.045+Math.max(0,input.inflationPct)/100+Math.max(0,1-income)*.035,.045,.45),
  marketVol:clamp(.86+Math.max(0,input.inflationPct)*.012+Math.max(0,1-income)*.12,.85,1.65),
  industry:input.industry};
});
if(canonical.length<30||new Set(canonical.map(x=>x.id)).size!==canonical.length)
 throw Error('Expected distinct country profiles matching singleplayer');
const json=JSON.stringify(canonical,null,1);
const marker='// Generated from country-system.js. Do not edit directly; run node scripts/generate-country-catalog.cjs.\n';
const files=[
 {path:'cloudflare/src/country-catalog.mjs',data:marker+'const COUNTRIES=Object.freeze('+json+');\nexport default COUNTRIES;\nexport {COUNTRIES};\n'},
 {path:'functions/country-catalog.js',data:marker+"'use strict';\nmodule.exports=Object.freeze("+json+');\n'}
];
for(const item of files){
 const filename=path.join(root,item.path);
 if(process.argv.includes('--check')){
  if(!fs.existsSync(filename)||fs.readFileSync(filename,'utf8')!==item.data)
   throw Error(item.path+' is stale; run node scripts/generate-country-catalog.cjs');
 }else fs.writeFileSync(filename,item.data);
}
console.log((process.argv.includes('--check')?'Verified ':'Generated ')+canonical.length+' country profiles');
