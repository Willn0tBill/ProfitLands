'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const core=require('../functions/world-core');
const pvp=require('../functions/pvp-rules');
const now=Date.UTC(2026,10,4,12,0,0);
function startup(){return core.fresh('user-alpha','Player A',now)}
test('World 1 starts each identity with independent, server-created money',()=>{
 const a=startup(),b=core.fresh('user-beta','Player B',now);
 assert.equal(a.worldId,'world1');
 assert.equal(a.cash,1500);
 assert.deepEqual(a.businesses,[]);
 assert.notEqual(a.uid,b.uid);
 assert.equal(core.MAX_PLAYERS,64);
 assert.equal(core.worth(a),1500);
});
test('online purchases debit exactly the server catalog cost and preserve player input',()=>{
 const a=startup(),original=JSON.stringify(a);
 const result=core.buyBusiness(a,'coffee',now);
 assert.equal(result.ok,true);
 assert.equal(result.cost,500);
 assert.equal(result.player.cash,1000);
 assert.equal(result.player.businesses.length,1);
 assert.equal(core.worth(result.player),1500,'buying a business should not mint net worth');
 assert.equal(result.player.dayGain,0);
 assert.equal(result.player.weekGain,0);
 assert.equal(JSON.stringify(a),original,'server calculations must be pure');
 assert.equal(core.buyBusiness(a,'factory',now).error,'insufficient_cash');
 assert.equal(core.buyBusiness(a,'bogus',now).error,'unknown_business');
});
test('online upgrades debit server-calculated cost, reject invalid index',()=>{
 const owned=core.buyBusiness(startup(),'coffee',now).player;
 const upgraded=core.upgradeBusiness(owned,0,now);
 assert.equal(upgraded.ok,true);
 assert.equal(upgraded.cost,875);
 assert.equal(upgraded.player.businesses[0].level,2);
 assert.equal(upgraded.player.cash,125);
 assert.ok(core.worth(upgraded.player)<core.worth(owned),'upgrading costs cash');
 assert.equal(core.upgradeBusiness(owned,-1,now).error,'unknown_business');
 assert.equal(core.upgradeBusiness(owned,10,now).error,'unknown_business');
});
test('server income accrues on settlement and is not a client-provided balance',()=>{
 const p=core.buyBusiness(startup(),'coffee',now).player;
 const after=core.settle(p,now+120000);
 assert.equal(after.cash,1120);
 assert.equal(after.dayGain,120);
 assert.equal(after.weekGain,120);
 assert.equal(after.netWorth,1620);
 assert.equal(core.settle(after,now+120000).cash,1120,'settlement is idempotent');
});
test('daily and weekly scoring roll over on UTC period boundaries',()=>{
 const sunday=Date.UTC(2026,10,1,23,59,0);
 let p=core.fresh('user-a','Tester',sunday);
 p=core.buyBusiness(p,'coffee',sunday).player;
 const monday=core.settle(p,Date.UTC(2026,10,2,0,1,0));
 assert.equal(monday.dayKey,'2026-11-02');
 assert.equal(monday.weekKey,'2026-11-02');
 assert.equal(monday.dayGain,60);
 assert.equal(monday.weekGain,60);
 assert.equal(monday.cash,1120);
});
test('offline earning is capped, preventing extreme background accumulation',()=>{
 let p=core.buyBusiness(startup(),'coffee',now).player;
 const after=core.settle(p,now+30*3600000);
 assert.equal(after.cash,1000+core.MAX_OFFLINE_SECONDS);
});
test('temporary PvP debuffs reduce only the valid income window',()=>{
 let p=core.buyBusiness(startup(),'coffee',now).player;
 const seconds=Math.floor(now/1000);
 p.activePenalty=0.20;
 p.activePenaltyUntil=seconds+60;
 const after=core.settle(p,now+120000);
 assert.equal(after.cash,1000+48+60);
 assert.equal(after.activePenaltyUntil,seconds+60);
});
test('paid PvP proposals are separated from game state writes and enforce protections',()=>{
 const attacker={...startup(),cash:100000,netWorth:100000,clanId:'a',pvpEnabled:true};
 const defender={...core.fresh('victim','Player B',now-90000000),cash:100000,netWorth:100000,clanId:'b',pvpEnabled:true};
 const result=pvp.applyAttack({attacker,defender,attackId:'supplier',targetCompanyValue:100000,nowSeconds:Math.floor(now/1000)});
 assert.equal(result.ok,true);
 assert.equal(result.cost,5000);
 assert.equal(result.attacker.cash,95000);
 assert.equal(result.defender.activePenalty,0.12);
 assert.equal(result.defender.netWorth,100000);
 assert.equal(attacker.cash,100000);
 const noTeam=pvp.applyAttack({attacker:{...attacker,clanId:'b'},defender,attackId:'supplier',targetCompanyValue:100000,nowSeconds:Math.floor(now/1000)});
 assert.equal(noTeam.reason,'same_clan');
});
test('web app integration is authenticated and never sends client cash or scoring',()=>{
 const server=fs.readFileSync(path.join(__dirname,'..','functions/index.js'),'utf8');
 const adapter=fs.readFileSync(path.join(__dirname,'..','firebase-world-adapter.js'),'utf8');
 assert.match(server,/request\.auth\?\.uid/);
 assert.match(server,/db\.runTransaction/);
 assert.match(server,/tx\.create\(eventRef/);
 assert.match(server,/getLeaderboard/);
 assert.match(server,/CHAT_ENABLED=false/);
 assert.match(adapter,/firebase\.app\(\)\.functions\('us-west1'\)/);
 assert.match(adapter,/httpsCallable\('worldApi'\)/);
 assert.doesNotMatch(adapter,/state\.cash\s*[+\-*/]?=/);
 assert.doesNotMatch(adapter,/getLeaderboard:.*localStorage/);
});
