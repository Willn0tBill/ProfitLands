import test from 'node:test';
import assert from 'node:assert/strict';
import {activeCount,isParked,mayPark,parkOldest,reactivate,IDLE_MS} from '../cloudflare/src/world-slots.mjs';
const at=Date.UTC(2027,5,1);
const account=(uid,when)=>({
 uid,createdAtSeconds:Math.floor(when/1000),lastSettledAt:when,
 lastActivityAt:when,cash:1300,businesses:[{type:'coffee',level:2}],
 enterprise:{stocks:{harbor:7},loanDebt:0,fiscal:{taxDue:0}},
 pvpEnabled:false
});
test('full 64 active-account world parks only genuinely dormant, debt-free records',()=>{
 const players={};
 for(let i=0;i<64;i++)players['p'+i]=account('p'+i,at-1000);
 players.p0=account('p0',at-IDLE_MS-1000);
 players.p1=account('p1',at-IDLE_MS-900);
 players.p0.enterprise.loanDebt=100;
 const state={players};
 assert.equal(activeCount(state),64);
 assert.equal(parkOldest(state,at,'p65'),'p1');
 assert.equal(activeCount(state),63);
 assert.equal(isParked(state.players.p1),true);
 assert.deepEqual(state.players.p1.enterprise.stocks,{harbor:7});
 assert.equal(state.players.p1.cash,1300);
 const restored=reactivate(state.players.p1,at);
 assert.equal(isParked(restored),false);
 assert.equal(activeCount(state),64);
});
test('park policy respects PvP, live listings, tax, age and account activity',()=>{
 const old=at-IDLE_MS-100;
 const p=account('dormant',old);
 assert.equal(mayPark(p,at),true);
 p.pvpEnabled=true;assert.equal(mayPark(p,at),false);p.pvpEnabled=false;
 p.enterprise.fiscal.taxDue=1;assert.equal(mayPark(p,at),false);p.enterprise.fiscal.taxDue=0;
 p.businesses[0].listing={price:50,expiresAt:at+1000};
 assert.equal(mayPark(p,at),false);
 p.businesses[0].listing.expiresAt=at-1;assert.equal(mayPark(p,at),true);
 p.lastActivityAt=at-1000;assert.equal(mayPark(p,at),false);
});
test('parked accounts cannot be silently selected again or affect active cap',()=>{
 const p=account('dormant',at-IDLE_MS-5000),state={players:{dormant:p,active:account('active',at)}};
 assert.equal(parkOldest(state,at),'dormant');
 assert.equal(parkOldest(state,at),null);
 assert.equal(activeCount(state),1);
});
