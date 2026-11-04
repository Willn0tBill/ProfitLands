'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const rules=require('../multiplayer-pvp-rules.js');

test('paid PvP actions specify capped temporary income disruption, not asset deletion',()=>{
 assert.equal(rules.ATTACKS.length,3);
 assert.ok(rules.ATTACKS.every(a=>a.penalty>0&&a.penalty<=rules.MAX_INCOME_PENALTY));
 assert.ok(rules.ATTACKS.every(a=>a.durationSeconds<=480&&a.baseCost>=5000));
 assert.equal(rules.ATTACKS.some(a=>a.deleteBusiness||a.stealMoney),false);
});
test('server price quotes scale with rival business value and never overflow',()=>{
 const low=rules.quote('supplier',100000),high=rules.quote('supplier',1000000);
 assert.equal(low.cost,5000);
 assert.equal(high.cost,15000);
 assert.ok(rules.quote('reputation',500000).cost>=15000);
 assert.equal(rules.quote('unknown',100000),null);
 assert.equal(rules.quote('supplier',Number.POSITIVE_INFINITY),null);
 assert.ok(Number.isSafeInteger(rules.quote('supplier',Number.MAX_SAFE_INTEGER).cost));
 assert.equal(rules.quote('supplier',Number.MAX_SAFE_INTEGER+1),null);
 assert.equal(rules.defenseQuote(20000).cost,10000);
});
function players(){
 const now=1730000000;
 return {now,attacker:{uid:'attacker',worldId:'world1',clanId:'alpha',pvpEnabled:true,nextAttackAt:0},
 defender:{uid:'defender',worldId:'world1',clanId:'beta',pvpEnabled:true,createdAtSeconds:now-90000,netWorth:100000,protectedUntil:0,nextVulnerableAt:0,activePenaltyUntil:0}};
}
test('PvP requires consent, same world, independent teams, and a protected new player window',()=>{
 const {now,attacker,defender}=players();
 const eligibility=(updates={})=>rules.eligibility({attacker:{...attacker,...updates.attacker},defender:{...defender,...updates.defender},attackId:'supplier',nowSeconds:now});
 assert.equal(eligibility().ok,true);
 assert.equal(eligibility({attacker:{uid:'defender'}}).reason,'self_attack');
 assert.equal(eligibility({attacker:{worldId:'elsewhere'}}).reason,'different_world');
 assert.equal(eligibility({attacker:{clanId:'beta'}}).reason,'same_clan');
 assert.equal(eligibility({attacker:{pvpEnabled:false}}).reason,'pvp_not_opted_in');
 assert.equal(eligibility({defender:{netWorth:24999}}).reason,'new_player_protection');
 assert.equal(eligibility({defender:{createdAtSeconds:now-30}}).reason,'new_player_protection');
 assert.equal(eligibility({attacker:{nextAttackAt:now+10}}).reason,'attacker_cooldown');
 assert.equal(eligibility({defender:{protectedUntil:now+10}}).reason,'defender_shield');
 assert.equal(eligibility({defender:{activePenaltyUntil:now+10}}).reason,'already_under_attack');
 assert.equal(eligibility({defender:{nextVulnerableAt:now+10}}).reason,'target_grace');
});
test('server-only economic actions never mutate local saves or mint client cash',()=>{
 const source=fs.readFileSync(path.join(__dirname,'..','multiplayer-world.js'),'utf8');
 assert.match(source,/online\(\)\.requestAttack\(/);
 assert.match(source,/online\(\)\.requestDefense\(/);
 assert.match(source,/online\(\)\.sendChat\(/);
 assert.match(source,/online\(\)\.getLeaderboard\(/);
 assert.doesNotMatch(source,/window\.save\s*\(/);
 assert.doesNotMatch(source,/state\.cash\s*(\+\+|--|[+\-*/]?=)/);
});
test('multiplayer UI shows offline state rather than inventing players or scores',()=>{
 const html=fs.readFileSync(path.join(__dirname,'..','play/index.html'),'utf8');
 const source=fs.readFileSync(path.join(__dirname,'..','multiplayer-world.js'),'utf8');
 assert.match(html,/id="worldPanel"/);
 assert.match(html,/id="worldChatDock"/);
 assert.match(html,/id="worldChatMessages"/);
 assert.match(html,/multiplayer-world\.css/);
 assert.match(html,/multiplayer-world\.js/);
 assert.match(source,/Join the online tycoon world/);
 assert.match(source,/No verified scores/);
});

test('server attack helper debits only the attacker and applies a finite income penalty',()=>{
 const {now,attacker,defender}=players();
 attacker.cash=100000;
 const before=JSON.stringify({attacker,defender});
 const result=rules.applyAttack({attacker,defender,attackId:'supplier',targetCompanyValue:100000,nowSeconds:now});
 assert.equal(result.ok,true);
 assert.equal(result.cost,5000);
 assert.equal(result.attacker.cash,95000);
 assert.equal(result.defender.netWorth,100000,'victim is not directly deprived of assets');
 assert.equal(result.defender.activePenalty,0.12);
 assert.equal(result.defender.activePenaltyUntil,now+480);
 assert.equal(result.attacker.nextAttackAt,now+900);
 assert.equal(JSON.stringify({attacker,defender}),before,'helper is pure');
 const repeat=rules.applyAttack({attacker:result.attacker,defender:result.defender,attackId:'supplier',targetCompanyValue:100000,nowSeconds:now+1});
 assert.equal(repeat.ok,false,'back-to-back attacks are denied');
});
test('server defense helper charges for protection without minting money',()=>{
 const {now,defender}=players();defender.cash=30000;
 const result=rules.applyDefense({player:defender,nowSeconds:now,ownEmpireWorth:100000});
 assert.equal(result.ok,true);
 assert.equal(result.cost,10000);
 assert.equal(result.player.cash,20000);
 assert.equal(result.player.protectedUntil,now+1200);
 const blocked=rules.applyDefense({player:result.player,nowSeconds:now+100,ownEmpireWorth:100000});
 assert.equal(blocked.reason,'already_protected');
 const poorer=rules.applyDefense({player:{...defender,cash:100},nowSeconds:now,ownEmpireWorth:100000});
 assert.equal(poorer.reason,'insufficient_cash');
});
