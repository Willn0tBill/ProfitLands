/* ProfitLands Cloud Sync Guard — deterministic comparison of save revisions.
 * Does not read or write browser storage and does not alter the game economy.
 */
(function(){
'use strict';
const skipRoot=new Set(['savedAt','timeLeft','dayEndsAt','started','badgeBook']);
function canonical(input,depth=0){
 if(depth>40)throw Error('Save is nested too deeply');
 if(Array.isArray(input))return input.map(x=>canonical(x,depth+1));
 if(input&&typeof input==='object'){
  const out={};
  for(const k of Object.keys(input).sort()){
   if(depth===0&&skipRoot.has(k))continue;
   if(k==='__proto__'||k==='constructor'||k==='prototype')continue;
   out[k]=canonical(input[k],depth+1);
  }
  return out;
 }
 return input;
}
function fingerprint(value){
 if(!value||typeof value!=='object')return '';
 let string;
 try{string=JSON.stringify(canonical(value));}catch(e){return ''}
 // Dual 32-bit FNV-1a streams, with byte length; no save data is stored in the key.
 let a=2166136261,b=0x811c9dc7;
 for(let i=0;i<string.length;i++){
  const n=string.charCodeAt(i);
  a=Math.imul(a^n,16777619);
  b=Math.imul(b^(n+i%251),16777619);
 }
 return (a>>>0).toString(16).padStart(8,'0')+(b>>>0).toString(16).padStart(8,'0')+'-'+string.length;
}
function isBlankEmpire(state){
 if(!state||typeof state!=='object')return true;
 return Number(state.day)<=1&&(!Array.isArray(state.businesses)||state.businesses.length===0)&&
  !Number(state.property)&&!Object.values(state.stocks||{}).some(x=>Number(x?.shares)>0)&&
  Number(state.cash||1000)===1000;
}
function decide(local,cloud,knownBase=''){
 if(!cloud)return local?'local':'none';
 if(!local||isBlankEmpire(local))return 'cloud';
 const here=fingerprint(local),there=fingerprint(cloud);
 if(!here||!there)return 'conflict';
 if(here===there)return 'cloud';
 if(knownBase&&here===knownBase)return 'cloud';
 if(knownBase&&there===knownBase)return 'local';
 return 'conflict';
}
function revision(record){
 const r=Number(record?.revision);
 return Number.isSafeInteger(r)&&r>=0?r:0;
}
window.ProfitLandsCloudGuard=Object.freeze({canonical,fingerprint,isBlankEmpire,decide,revision});
})();