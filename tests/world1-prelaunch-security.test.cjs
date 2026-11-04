'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');

test('client and server use the identical financial PvP rules at deployment',()=>{
 const client=require('../multiplayer-pvp-rules.js');
 const server=require('../functions/pvp-rules.js');
 assert.deepEqual(client.ATTACKS,server.ATTACKS);
 assert.deepEqual(client.DEFENSE,server.DEFENSE);
 assert.equal(client.MAX_INCOME_PENALTY,server.MAX_INCOME_PENALTY);
 for(const action of client.ATTACKS){
  const a=client.quote(action.id,950000);
  const b=server.quote(action.id,950000);
  assert.deepEqual(a,b,action.id+' must cost the same in the UI and online server');
 }
});
test('cloud profile update does not save online play type into a local save',()=>{
 const source=read('firebase-auth.js');
 assert.match(source,/const onlineWorldActive=/);
 assert.match(source,/if\(!onlineWorldActive\(\)\)\{save\(\);render\(\)\}/);
 assert.match(source,/const preserveOnlineWorld=onlineWorldActive\(\)/);
 assert.match(source,/if\(preserveOnlineWorld\)state\.playType='multi'/);
});
test('server cash and PvP cannot be directly written through public Firestore rules',()=>{
 const rules=read('firestore.rules');
 const server=read('functions/index.js');
 assert.match(rules,/match \/\{document=\*\*\} \{\s*allow read, write: if false;/);
 assert.doesNotMatch(rules,/match \/worlds\//);
 assert.match(server,/tx\.set\(attackerRef,newAttacker\)/);
 assert.match(server,/tx\.set\(targetRef,newDefender\)/);
 assert.match(server,/tx\.create\(eventRef/);
});
test('World 1 calls require Firebase Auth for all economic operations',()=>{
 const server=read('functions/index.js');
 assert.match(server,/const uid=uidOf\(request\);\s*switch\(action\)/);
 assert.match(server,/request\.auth\?\.uid/);
 assert.match(server,/validUid\(targetUid\)/);
 assert.match(server,/Request ID was already used for a different action/);
 assert.match(server,/CHAT_ENABLED=false/);
 assert.doesNotMatch(server,/request\.data\.cash/);
});

test('World 1 refresh is explicit, throttled and cannot update disconnected UI',()=>{
 const source=read('multiplayer-world.js');
 assert.match(source,/id="worldRefresh"/);
 assert.match(source,/now-lastWorldRefreshAt<10000/);
 assert.match(source,/const results=await Promise\.all\(\[loadEmpire\(\),loadLeaderboard\(\),loadPlayers\(\)\]\)/);
 assert.match(source,/stamp!==empireStamp\|\|!connected\(\)/);
 assert.match(source,/stamp!==playersStamp\|\|!connected\(\)/);
});
