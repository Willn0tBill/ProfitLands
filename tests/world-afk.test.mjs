import test from 'node:test';
import assert from 'node:assert/strict';
import {AFK_MS,isMeaningful,lastMeaningful,status,mark} from '../cloudflare/src/world-afk.mjs';
import {lastActivity,mayPark,IDLE_MS} from '../cloudflare/src/world-slots.mjs';

const t=Date.UTC(2026,10,7);
const base=()=>({
 uid:'afk-user',createdAtSeconds:Math.floor(t/1000),
 lastGameplayAt:t,lastActivityAt:t,lastSettledAt:t,
 businesses:[],pvpEnabled:false
});
test('server AFK is time-bound and never accepts raw clicks or reconnect as activity',()=>{
 const p=base(),state={players:{'afk-user':p}};
 assert.equal(status(p,t+AFK_MS-1).afk,false);
 assert.equal(status(p,t+AFK_MS).afk,true);
 for(const action of ['register','me','getChat','sendChat','togglePvP','reportMessage'])
  assert.equal(mark(state,'afk-user',action,null,t+AFK_MS+100),false,action);
 assert.equal(status(p,t+AFK_MS+100).afk,true);
 assert.equal(isMeaningful('enterpriseAction',{operation:'setPrice'}),false);
 assert.equal(isMeaningful('enterpriseAction',{operation:'setCountry'}),false);
 assert.equal(isMeaningful('enterpriseAction',{operation:'buyShares'}),true);
 assert.equal(mark(state,'afk-user','buyBusiness','coffee',t+AFK_MS+200),true);
 assert.equal(status(p,t+AFK_MS+200).afk,false);
 assert.equal(p.lastActivityAt,t+AFK_MS+200);
});
test('economic settlement and bogus/invalid activity do not reset 90-day parking',()=>{
 const p=base();
 const old=t-IDLE_MS-60_000;
 p.createdAtSeconds=Math.floor(old/1000);
 p.lastActivityAt=old;
 p.lastSettledAt=t;
 assert.equal(lastActivity(p),old);
 assert.equal(mayPark(p,t),true);
 assert.equal(mark({players:{'afk-user':p}},'another-user','buyBusiness',null,t),false);
 assert.equal(mayPark(p,t),true);
});
test('legacy activity uses safe fallback, with explicit recent account activity taking priority',()=>{
 const legacy=base();
 delete legacy.lastGameplayAt;
 assert.equal(lastMeaningful(legacy),t);
 assert.equal(status(legacy,t+AFK_MS).afk,true);
 delete legacy.lastActivityAt;
 assert.equal(lastMeaningful(legacy),t);
 assert.equal(status({},t).afk,true);
});
