/* Server-owned meaningful activity, not mouse clicks or client heartbeats.
 * AFK is an informational/session state; never ban or erase an idle player's
 * businesses and never trust user-provided "active" timestamps.
 */
const AFK_MS=15*60*1000;
const GAMEPLAY=new Set(['buyBusiness','upgradeBusiness','buyListedCompany',
 'requestAttack','requestDefense']);
const ENTERPRISE_GAMEPLAY=new Set([
 'hireStaff','appointManager','runMarketing','upgradeEfficiency','openBranch',
 'relocateBranch','upgradeBranch','restockBranch','warehouseOrder',
 'deliverWarehouseStock','buyWarehouse','buyTruck','buyResearch',
 'buyShares','sellShares','borrowLoan','repayLoan','buyProperty',
 'claimContract','claimCityContract','buyMajorCorporation','payTax',
 'fileBankruptcy','ascendEmpire'
]);
function isMeaningful(action,argument){
 return GAMEPLAY.has(action)||
  action==='enterpriseAction'&&ENTERPRISE_GAMEPLAY.has(argument?.operation);
}
function lastMeaningful(player){
 const last=Number(player?.lastGameplayAt);
 if(Number.isSafeInteger(last)&&last>0)return last;
 // A legacy account without the field starts from its last real activity;
 // a new registration gets its own timestamp once, not on each reconnect.
 const activity=Number(player?.lastActivityAt);
 if(Number.isSafeInteger(activity)&&activity>0)return activity;
 const created=Number(player?.createdAtSeconds)*1000;
 return Number.isSafeInteger(created)&&created>0?created:0;
}
function status(player,at=Date.now()){
 const last=lastMeaningful(player);
 const elapsed=Math.max(0,at-last);
 return {afk:!last||elapsed>=AFK_MS,idleSeconds:Math.floor(elapsed/1000),
  thresholdSeconds:AFK_MS/1000};
}
function mark(state,uid,action,argument,at){
 if(!isMeaningful(action,argument)||!Number.isSafeInteger(at)||at<=0)return false;
 const player=state?.players?.[uid];
 if(!player||player.uid!==uid)return false;
 player.lastGameplayAt=at;
 player.lastActivityAt=at;
 return true;
}
export {AFK_MS,GAMEPLAY,ENTERPRISE_GAMEPLAY,isMeaningful,lastMeaningful,status,mark};
