import {test} from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {dispatch} from '../cloudflare/src/index.mjs';
if(!globalThis.crypto)globalThis.crypto=webcrypto;

function database(){
 const rows=new Map();
 return {
  read:id=>rows.has(id)?JSON.parse(rows.get(id).payload):null,
  mutate(id,callback){
   const row=rows.get(id);const state=JSON.parse(row.payload);
   callback(state);rows.set(id,{version:row.version+1,payload:JSON.stringify(state)});
  },
  prepare(sql){
   let args=[];
   return {
    bind(...v){args=v;return this},
    async first(){
     const row=rows.get(args[0]);return row?{...row}:null;
    },
    async run(){
     if(sql.startsWith('INSERT OR IGNORE')){
      if(!rows.has(args[0]))rows.set(args[0],{version:0,payload:args[1]});
      return {meta:{changes:1}};
     }
     if(sql.startsWith('UPDATE world_state')){
      const row=rows.get(args[1]);
      if(!row||row.version!==args[2])return {meta:{changes:0}};
      rows.set(args[1],{version:row.version+1,payload:args[0]});
      return {meta:{changes:1}};
     }
     throw Error('Unexpected SQL '+sql);
    }
   };
  }
 };
}
const region=(db,action,uid,worldId='world1',body={},env={CHAT_MODERATOR_UIDS:'test-moderator'})=>
 dispatch(action,uid,body,db,worldId,env);
const pauseRate=(db,id,uid)=>{
 db.mutate(id,s=>{s.players[uid].chatLastAt=Date.now()-25000});
};
test('Chat is region-owned, signed-in, server-authoritative and cannot leak between regions',async()=>{
 const db=database();
 await region(db,'register','alpha');
 await region(db,'register','beta');
 await region(db,'register','alpha','world-europe');
 const sent=await region(db,'sendChat','alpha','world1',{text:'Hello Americas!'});
 assert.match(sent.id,/^[a-f0-9-]{36}$/i);
 assert.equal(sent.text,'Hello Americas!');
 assert.equal(sent.uid,'alpha');
 assert.equal((await region(db,'getChat','beta')).length,1);
 assert.equal((await region(db,'getChat','alpha','world-europe')).length,0);
 await assert.rejects(region(db,'getChat','outsider'),/Join World 1/);
 await assert.rejects(region(db,'sendChat','outsider','world1',{text:'Hello!'}),/Join World 1/);
 const europe=await region(db,'sendChat','alpha','world-europe',{text:'Hello Europe!'});
 assert.equal((await region(db,'getChat','alpha')).length,1);
 assert.equal((await region(db,'getChat','alpha','world-europe'))[0].id,europe.id);
 assert.equal(db.read('world-asia'),null);
});
test('Chat rejects spam, links, contact details and hostile content, while preserving balances',async()=>{
 const db=database();
 await region(db,'register','alpha');
 const before=db.read('world1').players.alpha.cash;
 for(const input of ['A','a'.repeat(161),'https://example.com','join discord','me@example.org','Call me 222-333-4444','go die','x'.repeat(20)]){
  await assert.rejects(region(db,'sendChat','alpha','world1',{text:input}),e=>e.code==='invalid-argument');
 }
 await region(db,'sendChat','alpha','world1',{text:'Welcome to the game'});
 await assert.rejects(region(db,'sendChat','alpha','world1',{text:'Another message'}),e=>e.status===429);
 pauseRate(db,'world1','alpha');
 await assert.rejects(region(db,'sendChat','alpha','world1',{text:'Welcome to the game'}),/repeat/);
 assert.equal(db.read('world1').players.alpha.cash,before);
 assert.equal((await region(db,'getChat','alpha')).length,1);
});
test('Individual reports hide messages from the reporter; two distinct reports hide globally',async()=>{
 const db=database();
 for(const id of ['author','reporter1','reporter2','observer'])await region(db,'register',id);
 const m=await region(db,'sendChat','author','world1',{text:'Chat test message'});
 const first=await region(db,'reportMessage','reporter1','world1',{messageId:m.id});
 assert.equal(first.reported,true);assert.equal(first.hidden,false);
 assert.equal((await region(db,'getChat','reporter1')).length,0);
 assert.equal((await region(db,'getChat','observer')).length,1);
 const duplicate=await region(db,'reportMessage','reporter1','world1',{messageId:m.id});
 assert.equal(duplicate.duplicate,true);
 await assert.rejects(region(db,'reportMessage','author','world1',{messageId:m.id}),/own message/);
 const second=await region(db,'reportMessage','reporter2','world1',{messageId:m.id});
 assert.equal(second.hidden,true);
 assert.equal((await region(db,'getChat','observer')).length,0);
 const stored=db.read('world1').chat[0];
 assert.equal(stored.reports.length,2);
 assert.equal(stored.hidden,true);
});
test('Block and unblock affects only the selected regional chat',async()=>{
 const db=database();
 for(const world of ['world1','world-asia']){
  await region(db,'register','alpha',world);
  await region(db,'register','beta',world);
  await region(db,'sendChat','alpha',world,{text:'Regional message'});
 }
 const blocked=await region(db,'blockChatUser','beta','world1',{targetUid:'alpha'});
 assert.equal(blocked.blocked,true);
 assert.equal((await region(db,'getChat','beta')).length,0);
 assert.equal((await region(db,'getChat','beta','world-asia')).length,1);
 assert.deepEqual((await region(db,'getBlockedChatUsers','beta')).map(x=>x.uid),['alpha']);
 await region(db,'unblockChatUser','beta','world1',{targetUid:'alpha'});
 assert.equal((await region(db,'getChat','beta')).length,1);
 assert.equal((await region(db,'getBlockedChatUsers','beta')).length,0);
 await assert.rejects(region(db,'blockChatUser','beta','world1',{targetUid:'beta'}),/another player/);
});
test('Only a configured moderator can view reports or remove/restore messages',async()=>{
 const db=database();
 for(const uid of ['mod','alpha','beta'])await region(db,'register',uid);
 const sent=await region(db,'sendChat','alpha','world1',{text:'An example message'});
 await region(db,'reportMessage','beta','world1',{messageId:sent.id});
 await assert.rejects(region(db,'getChatReports','mod'),e=>e.status===403);
 await assert.rejects(region(db,'moderateChat','beta','world1',{messageId:sent.id,decision:'remove'}),e=>e.status===403);
 const env={CHAT_MODERATOR_UIDS:'mod'};
 const queue=await region(db,'getChatReports','mod','world1',{},env);
 assert.equal(queue.length,1);assert.equal(queue[0].reportCount,1);
 const removed=await region(db,'moderateChat','mod','world1',{messageId:sent.id,decision:'remove'},env);
 assert.equal(removed.hidden,true);
 assert.equal((await region(db,'getChat','alpha')).length,0);
 const restored=await region(db,'moderateChat','mod','world1',{messageId:sent.id,decision:'dismiss'},env);
 assert.equal(restored.hidden,false);
 assert.equal((await region(db,'getChat','alpha')).length,1);
 assert.equal((await region(db,'getChatReports','mod','world1',{},env)).length,0);
});
test('Chat history stays capped and the previously deployed Americas world state is supported',async()=>{
 const db=database();
 await region(db,'register','legacy');
 db.mutate('world1',state=>{delete state.chat;delete state.players.legacy.chatBlockedUids;});
 assert.deepEqual(await region(db,'getChat','legacy'),[]);
 for(let i=0;i<68;i++){
  db.mutate('world1',s=>{s.players.legacy.chatLastAt=0;s.players.legacy.chatLastText='';});
  await region(db,'sendChat','legacy','world1',{text:'Test '+i});
 }
 assert.equal(db.read('world1').chat.length,60);
 assert.equal((await region(db,'getChat','legacy')).length,40);
});

test('Emergency chat shutdown closes both reads and writes without affecting the economy',async()=>{
 const db=database();
 await region(db,'register','alpha');
 const env={CHAT_DISABLED:'true'};
 const health=await region(db,'health',null,'world1',{},env);
 assert.equal(health.ok,true);
 assert.equal(health.chatEnabled,false);
 await assert.rejects(region(db,'sendChat','alpha','world1',{text:'Hello game'},env),e=>e.status===409);
 await assert.rejects(region(db,'getChat','alpha','world1',{},env),e=>e.status===409);
 assert.equal((await region(db,'me','alpha','world1',{},env)).player.cash,1500);
 assert.equal((await region(db,'getChat','alpha')).length,0);
 // A moderator must still be able to review a queue while public chat is offline.
 const mods={CHAT_DISABLED:'true',CHAT_MODERATOR_UIDS:'alpha'};
 assert.deepEqual(await region(db,'getChatReports','alpha','world1',{},mods),[]);
});

test('Automatic chat protection works without a dedicated moderator while review remains privileged',async()=>{
 const db=database();
 assert.equal((await region(db,'health',null,'world1',{},null)).chatEnabled,true);
 await region(db,'register','alpha');
 const sent=await region(db,'sendChat','alpha','world1',{text:'Hello world'},null);
 assert.equal(sent.text,'Hello world');
 await assert.rejects(region(db,'getChatReports','alpha','world1',{},null),e=>e.status===403);
 assert.equal((await region(db,'getChat','alpha','world1',{},null)).length,1);
});

test('Curses and slurs are masked at the server and repeated slurs trigger a temporary mute',async()=>{
 const db=database();
 await region(db,'register','alpha');
 const first=await region(db,'sendChat','alpha','world1',{text:'What the f.u.c.k'},null);
 assert.equal(first.text,'What the ***');
 pauseRate(db,'world1','alpha');
 const second=await region(db,'sendChat','alpha','world1',{text:'That ch1nk insult is unacceptable'},null);
 assert.equal(second.text,'That *** insult is unacceptable');
 pauseRate(db,'world1','alpha');
 const third=await region(db,'sendChat','alpha','world1',{text:'Another n1gg3r insult'},null);
 assert.equal(third.text,'Another *** insult');
 pauseRate(db,'world1','alpha');
 await assert.rejects(region(db,'sendChat','alpha','world1',{text:'Normal message'},null),e=>e.status===403);
 assert.ok(db.read('world1').players.alpha.chatMutedUntil>Date.now());
 assert.equal(db.read('world1').chat.every(m=>!/(?:n1gg3r|ch1nk|f\.u\.c\.k)/i.test(m.text)),true);
});
