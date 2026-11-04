'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.join(__dirname,'..');
const code=fs.readFileSync(path.join(root,'multiplayer-world.js'),'utf8');
function element(extra={}){
 const events={};
 return {
  hidden:false,disabled:false,textContent:'',innerHTML:'',value:'',
  events,addEventListener:(name,fn)=>{(events[name]??=[]).push(fn)},
  setAttribute(name,value){this[name]=value},
  focus(){this.focused=true},
  ...extra
 };
}
function harness(playType='single'){
 const listeners={};
 const nodes={};
 for(const id of ['worldContent','worldChatDock','worldChatInput','worldChatSend','worldChatStatus','worldChatMessages','worldChatPanel','worldChatToggle','worldChatClose','worldChatForm'])nodes[id]=element();
 nodes.worldChatDock.hidden=true;
 nodes.worldChatPanel.hidden=true;
 nodes.gameScreen=element({classList:{contains:tag=>tag==='active'}});
 const document={
  readyState:'loading',
  addEventListener:(event,fn)=>{listeners[event]=fn},
  getElementById:id=>nodes[id]||null,
  querySelectorAll:()=>[]
 };
 const state={playType,cash:1234,actions:60,businesses:[{name:'Coffee Shop'}]};
 const window={state,addEventListener:(event,fn)=>{listeners[event]=fn}};
 vm.runInNewContext(code,{window,document,console},{filename:'multiplayer-world.js'});
 return {nodes,window,state,listeners};
}
test('singleplayer does not show multiplayer chat or World 1 features',()=>{
 const h=harness('single'),before=JSON.stringify(h.state);
 assert.equal(h.window.ProfitLandsWorld.render(),false);
 assert.equal(h.nodes.worldChatDock.hidden,true);
 assert.match(h.nodes.worldContent.innerHTML,/only in multiplayer mode/);
 assert.equal(h.window.ProfitLandsWorld.online(),false);
 assert.equal(JSON.stringify(h.state),before);
});
test('local multiplayer preview visibly reports no server and disables sending messages',()=>{
 const h=harness('multi'),before=JSON.stringify(h.state);
 assert.equal(h.window.ProfitLandsWorld.render(),true);
 assert.match(h.nodes.worldContent.innerHTML,/Join the online tycoon world/);
 assert.match(h.nodes.worldContent.innerHTML,/Your local singleplayer save is separate/);
 assert.equal(h.nodes.worldChatDock.hidden,false);
 assert.equal(h.nodes.worldChatInput.disabled,true);
 assert.equal(h.nodes.worldChatSend.disabled,true);
 assert.match(h.nodes.worldChatStatus.textContent,/Not connected/);
 assert.match(h.nodes.worldChatMessages.textContent,/No live chat connection/);
 assert.equal(JSON.stringify(h.state),before);
});
test('offline PvP attack, protection, and PvP enrollment are rejected',async()=>{
 const h=harness('multi'),before=JSON.stringify(h.state);
 assert.equal(await h.window.ProfitLandsWorld.attack('supplier'),false);
 assert.equal(await h.window.ProfitLandsWorld.defend(),false);
 assert.equal(await h.window.ProfitLandsWorld.online(),false);
 assert.equal(JSON.stringify(h.state),before);
});
test('chat can open in multiplayer preview but cannot send messages',()=>{
 const h=harness('multi');
 h.window.ProfitLandsWorld.render();
 h.listeners.DOMContentLoaded();
 assert.ok(h.nodes.worldChatToggle.events.click?.length===1);
 for(const handler of h.nodes.worldChatToggle.events.click)handler();
 assert.equal(h.nodes.worldChatPanel.hidden,false);
 assert.equal(h.nodes.worldChatInput.disabled,true);
 assert.equal(h.nodes.worldChatSend.disabled,true);
 assert.equal(h.nodes.worldChatInput.focused,true);
 for(const handler of h.nodes.worldChatClose.events.click)handler();
 assert.equal(h.nodes.worldChatPanel.hidden,true);
});
test('Firebase server is isolated and client cannot locally award PvP cash',()=>{
 const repo=fs.readdirSync(root);
 assert.equal(repo.includes('functions'),true,'authoritative server source now exists');
 assert.equal(fs.existsSync(require('node:path').join(root,'functions','index.js')),true);
 assert.doesNotMatch(code,/state\.cash\s*(\+\+|--|[+\-*/]?=)/);
 assert.match(code,/window\.ProfitLandsOnline/);
 assert.match(code,/isConnected\?\.\(\)===true/);
 const pages=fs.readFileSync(path.join(root,'play/index.html'),'utf8');
 assert.match(pages,/Multiplayer Preview currently uses a local economy/);
});
