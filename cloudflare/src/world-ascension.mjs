/* Repeatable empire ascension: bounded per-cycle wealth, persistent rank.
 * No claim of infinite Cloudflare storage, cash, or company records.
 * Every ascension is an authoritative paid action with a replay-safe receipt.
 */
import core from './world-core.mjs';
import achievements from './world-achievements.mjs';
const START=core.START_CASH;
function threshold(rank=0){
 const safe=Number.isSafeInteger(rank)&&rank>0?Math.min(rank,1000000):0;
 return Math.min(core.MAX_CASH,10_000_000+Math.floor(safe/3)*5_000_000);
}
function multiplier(rank=0){
 if(!Number.isSafeInteger(rank)||rank<=0)return 1;
 return 1+Math.min(3,Math.log2(rank+1)*.18);
}
function status(p,now=Date.now()){
 const e=p.enterprise||{};
 const rank=Number.isSafeInteger(e.prestigeRank)&&e.prestigeRank>0?e.prestigeRank:0;
 const due=Number(e.fiscal?.taxDue||0);
 const profit=Math.max(0,Number(e.fiscal?.taxableProfit||0));
 const country=core.COUNTRIES.find(c=>c.id===e.country);
 const estimatedTax=Math.min(core.MAX_CASH,Math.ceil(profit*(country?.taxRate??.255)));
 const currentWorth=core.worth(p,now);
 const target=threshold(rank);
 const isClean=Number(e.loanDebt||0)<=0&&due<=0&&
  Number(p.nextAttackAt||0)*1000<=now&&Number(p.activePenaltyUntil||0)*1000<=now;
 return {rank,target,multiplier:multiplier(rank),worth:currentWorth,
  canAscend:rank<Number.MAX_SAFE_INTEGER&&isClean&&
   currentWorth>=target&&p.cash>=estimatedTax,
  pendingOperatingTax:estimatedTax};
}
function ascend(player,now=Date.now()){
 const p=core.settle(player,now);
 const gate=status(p,now);
 if(!gate.canAscend)return {ok:false,error:'ascension_requirements_not_met'};
 const e=p.enterprise;
 const unlocked=achievements.summary(p).sectors;
 const old=e.prestigeTrophies||{};
 const next={};
 for(const s of unlocked){
  const ranks={};
  for(const [track,rank] of Object.entries(s.ranks)){
   ranks[track]=Math.max(rank,Math.max(0,Number(old[s.id]?.[track]||0)));
  }
  next[s.id]=ranks;
 }
 e.prestigeTrophies=next;
 e.prestigeRank=gate.rank+1;
 const f=e.fiscal;
 if(f){
  f.totalTaxPaid=Math.min(core.MAX_CASH,Number(f.totalTaxPaid||0)+gate.pendingOperatingTax);
  f.taxableProfit=0;f.taxDue=0;f.lastBill=gate.pendingOperatingTax;
  f.year=Math.max(1,Number(f.year)||1)+1;
  f.nextTaxAt=now+365*86400000;
 }
 p.cash=START;
 p.businesses=[];
 p.incomeMilliRemainder=0;p.incomeSubMilliRemainder=0;
 p.activePenalty=0;p.activePenaltyUntil=0;p.nextAttackAt=0;p.nextVulnerableAt=0;
 p.pvpEnabled=false;
 p.protectedUntil=Math.max(Number(p.protectedUntil||0),Math.ceil(now/1000)+86400);
 p.dayGain=0;p.weekGain=0;
 e.stocks={};e.majorCompanies=[];e.properties=[];e.research=[];
 e.warehouse=0;e.warehouseStock=0;e.trucks=0;e.routes=[];
 e.loanDebt=0;e.loanPrincipal=0;e.loanIssuedAt=0;e.loanDueAt=0;
 e.repaymentAuto=false;e.cityContract=null;e.lastInventoryAt=now;
 e.lastQualifyingActionDay='';
 p.netWorth=core.worth(p,now);
 return {ok:true,player:p,cost:0,prestigeRank:e.prestigeRank,
  nextThreshold:threshold(e.prestigeRank)};
}
export {threshold,multiplier,status,ascend};
export default {threshold,multiplier,status,ascend};
