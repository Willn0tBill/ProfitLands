/* Request-shape anti-cheat boundary. The game server is authoritative; this
 * rejects common client-state injection and pathological JSON inputs before DB IO.
 * It is intentionally not a replacement for operation-specific economy checks.
 */
const FORBIDDEN_KEYS=new Set(['__proto__','prototype','constructor']);
const CLIENT_STATE_KEYS=new Set(['cash','netWorth','incomePerSecond','player','players','receipts','state','wallet','balance','lastSettledAt','dayGain','weekGain']);
function validateClientPayload(payload){
 if(!payload||Array.isArray(payload)||typeof payload!=='object')return false;
 const stack=[{value:payload,depth:0}];
 let nodes=0;
 while(stack.length){
  const {value,depth}=stack.pop();
  if(++nodes>128||depth>5)return false;
  if(Array.isArray(value)){
   if(value.length>32)return false;
   for(const item of value)stack.push({value:item,depth:depth+1});
   continue;
  }
  if(value!==null&&typeof value==='object'){
   const keys=Object.keys(value);
   if(keys.length>40)return false;
   for(const key of keys){
    if(FORBIDDEN_KEYS.has(key)||key.length>80)return false;
    if(depth===0&&CLIENT_STATE_KEYS.has(key))return false;
    stack.push({value:value[key],depth:depth+1});
   }
  }else if(typeof value==='number'){
   if(!Number.isFinite(value)||!Number.isSafeInteger(value)&&Math.abs(value)>1e12)return false;
  }else if(typeof value==='string'){
   if(value.length>4096)return false;
  }else if(value!==null&&typeof value!=='boolean'){
   return false;
  }
 }
 return true;
}
export {validateClientPayload};
