/* Authoritative financial recovery for the online world.
 * No player-supplied balances, insolvency flags or recovery payouts.
 * This is a game mechanic and not a simulation of real-world bankruptcy.
 */
import core from './world-core.mjs';

const RESTART_CASH=500;
const RECOVERY_COOLDOWN_MS=30*86400000;
const NEW_LOAN_COOLDOWN_MS=90*86400000;
const PROTECTION_SECONDS=86400;
const safeMoney=x=>Number.isSafeInteger(x)&&x>=0&&x<=core.MAX_CASH?x:0;
const safeTimestamp=x=>Number.isSafeInteger(x)&&x>=0?x:0;
function assessment(player,now=Date.now()){
 const e=player.enterprise||{};
 const last=safeTimestamp(e.lastBankruptcyAt);
 const nextAllowedAt=last?last+RECOVERY_COOLDOWN_MS:0;
 const nextLoanAt=last?last+NEW_LOAN_COOLDOWN_MS:0;
 const loan=safeMoney(e.loanDebt);
 const tax=safeMoney(e.fiscal?.taxDue);
 const debt=Math.min(Number.MAX_SAFE_INTEGER,loan+tax);
 // Worth normally floors negative net worth to zero. Calculate assets before
 // subtracting liabilities, without ever altering the stored player record.
 const assets=core.worth({...player,enterprise:{...e,loanDebt:0,
  fiscal:{...(e.fiscal||{}),taxDue:0}}},now);
 const overdue=loan>0&&Number.isSafeInteger(e.loanDueAt)&&
  e.loanDueAt>0&&e.loanDueAt<=now;
 const insolvent=debt>assets;
 const cooldown=nextAllowedAt>now;
 const eligible=overdue&&insolvent&&!cooldown;
 const reason=!overdue?'overdue_loan_required':
  !insolvent?'assets_cover_liabilities':cooldown?'recovery_cooldown':null;
 const remainingAfterCreditors=Math.max(0,assets-debt);
 const recovery=Math.min(core.MAX_CASH,RESTART_CASH+
  Math.floor(remainingAfterCreditors*.05));
 return {eligible,reason,assets,debt,loan,tax,overdue,
  ownerRecovery:eligible?recovery:0,
  nextAllowedAt,nextLoanAt,count:safeMoney(e.bankruptcyCount)};
}
function file(player,now=Date.now()){
 const info=assessment(player,now);
 if(!info.eligible)return {ok:false,error:info.reason};
 const p=core.settle(player,now);
 const check=assessment(p,now);
 if(!check.eligible)return {ok:false,error:check.reason};
 const e=p.enterprise;
 // All assets are liquidated and existing liabilities are resolved first.
 // Because this action requires insolvency, the owner retains only a small,
 // explicit restart allowance rather than forgiven loan proceeds.
 p.cash=check.ownerRecovery;
 p.businesses=[];
 p.incomeMilliRemainder=0;
 p.incomeSubMilliRemainder=0;
 p.pvpEnabled=false;
 p.protectedUntil=Math.max(Number(p.protectedUntil||0),
  Math.ceil(now/1000)+PROTECTION_SECONDS);
 p.nextAttackAt=0;p.nextVulnerableAt=0;
 p.activePenalty=0;p.activePenaltyUntil=0;
 p.dayGain=0;p.weekGain=0;
 e.stocks={};e.majorCompanies=[];e.properties=[];
 e.warehouse=0;e.warehouseStock=0;e.trucks=0;e.routes=[];
 e.research=[];
 e.loanDebt=0;e.loanPrincipal=0;e.loanIssuedAt=0;e.loanDueAt=0;
 e.repaymentAuto=false;
 e.cityContract=null;
 // Clear live operating-tax accumulators without resetting lifetime paid
 // taxes or making previous paid receipts replayable.
 if(e.fiscal){
  e.fiscal.taxDue=0;e.fiscal.taxableProfit=0;e.fiscal.lastBill=0;
  e.fiscal.nextTaxAt=now+365*86400000;
 }
 e.bankruptcyCount=Math.min(1000000000,(e.bankruptcyCount||0)+1);
 e.lastBankruptcyAt=now;
 e.lastQualifyingActionDay='';
 e.lastInventoryAt=now;
 p.netWorth=core.worth(p,now);
 return {ok:true,player:p,reward:check.ownerRecovery,cost:0,
  bankruptcy:{resolvedDebt:check.debt,recovered:check.ownerRecovery}};
}
export {RESTART_CASH,RECOVERY_COOLDOWN_MS,NEW_LOAN_COOLDOWN_MS,assessment,file};
export default {assessment,file};
