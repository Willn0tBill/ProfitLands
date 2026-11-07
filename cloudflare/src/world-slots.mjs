/* Non-destructive active-slot admission. Parked accounts remain intact in D1.
 * No cash, shares, companies, receipts or historical trophy data are removed.
 */
const IDLE_MS=90*24*60*60*1000;
function isParked(player){
 return Number.isSafeInteger(player?.parkedAt)&&player.parkedAt>0;
}
function activeCount(state){
 return Object.values(state?.players||{}).reduce((n,p)=>n+(isParked(p)?0:1),0);
}
function lastActivity(player){
 const created=Number(player?.createdAtSeconds||0)*1000;
 const recent=Number(player?.lastActivityAt||0);
 const settled=Number(player?.lastSettledAt||0);
 return Math.max(created,recent,settled);
}
function mayPark(p,at){
 if(!p||isParked(p)||!Number.isSafeInteger(at)||at-lastActivity(p)<IDLE_MS)
  return false;
 if(p.pvpEnabled||Number(p.enterprise?.loanDebt||0)>0||
  Number(p.enterprise?.fiscal?.taxDue||0)>0)return false;
 if((p.businesses||[]).some(b=>b.listing&&Number(b.listing.expiresAt)>at))
  return false;
 return true;
}
function parkOldest(state,at,exceptUid=''){
 const eligible=Object.values(state?.players||{})
  .filter(p=>p.uid!==exceptUid&&mayPark(p,at))
  .sort((a,b)=>lastActivity(a)-lastActivity(b)||a.uid.localeCompare(b.uid));
 if(!eligible.length)return null;
 const account=eligible[0];
 account.parkedAt=at;
 return account.uid;
}
function reactivate(p,at){
 if(!p||!isParked(p))return p;
 delete p.parkedAt;
 p.lastActivityAt=at;
 return p;
}
export {IDLE_MS,isParked,activeCount,lastActivity,mayPark,parkOldest,reactivate};
