/* ProfitLands multiplayer PvP rules. Pure shared definitions, NOT a payment or combat executor.
 * All quotes, cooldowns, balances and effects MUST be revalidated by a trusted game server.
 */
(function(factory){
  const rules=factory();
  if(typeof module!=='undefined'&&module.exports)module.exports=rules;
  if(typeof window!=='undefined')window.ProfitLandsPvPRules=rules;
})(function(){
  'use strict';
  const ATTACKS=Object.freeze([
    Object.freeze({id:'supplier',icon:'📦',name:'Supply Disruption',description:'Slow a rival company\'s income by 12% for 8 minutes.',baseCost:5000,valueRate:0.015,penalty:0.12,durationSeconds:480}),
    Object.freeze({id:'reputation',icon:'📣',name:'Reputation Campaign',description:'Reduce a rival company\'s income by 20% for 6 minutes.',baseCost:15000,valueRate:0.035,penalty:0.20,durationSeconds:360}),
    Object.freeze({id:'pressure',icon:'🏢',name:'Market Pressure',description:'Reduce a rival company\'s income by 30% for 5 minutes.',baseCost:50000,valueRate:0.075,penalty:0.30,durationSeconds:300})
  ]);
  const DEFENSE=Object.freeze({id:'shield',icon:'🛡️',name:'Business Protection',description:'Protect your empire from new rival attacks for 20 minutes.',baseCost:10000,valueRate:0.02,durationSeconds:1200});
  const ATTACK_COOLDOWN_SECONDS=900;
  const TARGET_GRACE_SECONDS=600;
  const NEW_PLAYER_GRACE_SECONDS=86400;
  const MIN_TARGET_WORTH=25000;
  const MAX_INCOME_PENALTY=0.30;
  const money=value=>Number.isFinite(value)&&value>=0&&Number.isSafeInteger(Math.round(value));
  const option=id=>ATTACKS.find(x=>x.id===id)||null;
  function quote(id,targetCompanyValue){
    const item=option(id);
    if(!item||!money(targetCompanyValue))return null;
    const cost=Math.max(item.baseCost,Math.ceil(targetCompanyValue*item.valueRate));
    if(!Number.isSafeInteger(cost))return null;
    return Object.freeze({id:item.id,cost,penalty:item.penalty,durationSeconds:item.durationSeconds});
  }
  function defenseQuote(ownEmpireWorth){
    if(!money(ownEmpireWorth))return null;
    const cost=Math.max(DEFENSE.baseCost,Math.ceil(ownEmpireWorth*DEFENSE.valueRate));
    return Number.isSafeInteger(cost)?Object.freeze({id:DEFENSE.id,cost,durationSeconds:DEFENSE.durationSeconds}):null;
  }
  function eligibility({attacker,defender,attackId,nowSeconds}){
    if(!attacker||!defender||!option(attackId)||!Number.isSafeInteger(nowSeconds))return {ok:false,reason:'invalid_request'};
    if(!attacker.uid||!defender.uid||attacker.uid===defender.uid)return {ok:false,reason:'self_attack'};
    if(!attacker.worldId||attacker.worldId!==defender.worldId)return {ok:false,reason:'different_world'};
    if(attacker.clanId&&attacker.clanId===defender.clanId)return {ok:false,reason:'same_clan'};
    if(!attacker.pvpEnabled||!defender.pvpEnabled)return {ok:false,reason:'pvp_not_opted_in'};
    if(defender.netWorth<MIN_TARGET_WORTH||!Number.isSafeInteger(defender.createdAtSeconds)||nowSeconds-defender.createdAtSeconds<NEW_PLAYER_GRACE_SECONDS)return {ok:false,reason:'new_player_protection'};
    if(Number(attacker.nextAttackAt||0)>nowSeconds)return {ok:false,reason:'attacker_cooldown'};
    if(Number(defender.protectedUntil||0)>nowSeconds)return {ok:false,reason:'defender_shield'};
    if(Number(defender.nextVulnerableAt||0)>nowSeconds)return {ok:false,reason:'target_grace'};
    if(Number(defender.activePenaltyUntil||0)>nowSeconds)return {ok:false,reason:'already_under_attack'};
    return {ok:true,reason:null};
  }
  /* Server transaction helper: provides an immutable proposed ledger change.
   * The caller MUST read both ledger records within the same authenticated,
   * serializable transaction, validate world membership and write atomically.
   */
  function applyAttack({attacker,defender,attackId,targetCompanyValue,nowSeconds}){
    const eligible=eligibility({attacker,defender,attackId,nowSeconds});
    if(!eligible.ok)return {ok:false,reason:eligible.reason};
    const price=quote(attackId,targetCompanyValue);
    if(!price)return {ok:false,reason:'invalid_company_value'};
    if(!money(attacker.cash)||attacker.cash<price.cost)return {ok:false,reason:'insufficient_cash'};
    const affected=option(attackId);
    return Object.freeze({
      ok:true,cost:price.cost,attackId,
      attacker:{...attacker,cash:attacker.cash-price.cost,nextAttackAt:nowSeconds+ATTACK_COOLDOWN_SECONDS},
      defender:{...defender,activePenalty:affected.penalty,
        activePenaltyUntil:nowSeconds+affected.durationSeconds,
        nextVulnerableAt:nowSeconds+affected.durationSeconds+TARGET_GRACE_SECONDS},
      event:{type:'pvp_attack',attackId,attackerUid:attacker.uid,defenderUid:defender.uid,
        worldId:attacker.worldId,cost:price.cost,incomePenalty:affected.penalty,
        startedAtSeconds:nowSeconds,expiresAtSeconds:nowSeconds+affected.durationSeconds}
    });
  }
  function applyDefense({player,nowSeconds,ownEmpireWorth}){
    if(!player||!player.uid||!player.worldId||!Number.isSafeInteger(nowSeconds))return {ok:false,reason:'invalid_request'};
    const price=defenseQuote(ownEmpireWorth);
    if(!price)return {ok:false,reason:'invalid_empire_value'};
    if(!money(player.cash)||player.cash<price.cost)return {ok:false,reason:'insufficient_cash'};
    if(Number(player.protectedUntil||0)>nowSeconds)return {ok:false,reason:'already_protected'};
    return Object.freeze({ok:true,cost:price.cost,
      player:{...player,cash:player.cash-price.cost,protectedUntil:nowSeconds+price.durationSeconds},
      event:{type:'pvp_defense',userUid:player.uid,worldId:player.worldId,
        cost:price.cost,startedAtSeconds:nowSeconds,expiresAtSeconds:nowSeconds+price.durationSeconds}});
  }
  return Object.freeze({ATTACKS,DEFENSE,ATTACK_COOLDOWN_SECONDS,TARGET_GRACE_SECONDS,NEW_PLAYER_GRACE_SECONDS,MIN_TARGET_WORTH,MAX_INCOME_PENALTY,quote,defenseQuote,eligibility,applyAttack,applyDefense});
});
