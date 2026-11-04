'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const code=fs.readFileSync(path.join(root,'save-center.js'),'utf8');

function validSave(patch={}){
 return {saveVersion:4,mode:'standard',playType:'single',day:8,cash:2800,cashHuge:'2.8e3',
  actions:54,timeLeft:600,dayEndsAt:Date.now()+600000,
  started:true,stocks:{nova:{shares:0},harbor:{shares:2}},
  businesses:[{type:'coffee',name:'Coffee Shop #1',level:2,popularity:60,
   locations:[{id:'university',name:'University District',level:2,workers:1,marketing:1,efficiency:0}]}],
  news:['Welcome back.'],...patch};
}
function setup({platform='web',signedIn=false,active=true,confirm=true,autoBackup=null}={}){
 const old=validSave({day:13,cash:5000,cashHuge:'5e3',businesses:[]});
 const memory=new Map([['profitlands-v2',JSON.stringify(old)]]);
 if(autoBackup)memory.set('profitlands-v2-backup',JSON.stringify(autoBackup));
 let saved=0,rendered=0,timers=0,confirmed=0,normalized=0,opened=0;
 const state=JSON.parse(JSON.stringify(old));
 const ids={
  gameScreen:{classList:{contains:key=>key==='active'&&active}},
  settingsModal:{classList:{add(){},remove(){}}},
 };
 const document={readyState:'loading',addEventListener(){},getElementById:id=>ids[id]||null};
 const localStorage={
  getItem:key=>memory.has(key)?memory.get(key):null,
  setItem:(key,value)=>memory.set(key,String(value))
 };
 const window={
  state,BUSINESS_TYPES:[{id:'coffee'},{id:'restaurant'}],
  profitLandsPlatform:{name:platform},
  profitlandsFirebase:{getCurrentUser:()=>signedIn?{uid:'account123'}:null},
  ProfitLandsMoney:{parse:v=>{
    const m=String(v).match(/^(-?\d+(?:\.\d+)?)e(\d+)$/);
    if(!m)throw Error('bad ledger');
    return{m:Number(m[1]),e:Number(m[2])}
   },attach(){},format:n=>'$'+n},
  ProfitLandsBalance:{migrate(){}},
  ProfitLandsLocationOps:{normalizeAll(){normalized++}},
  ProfitLandsGrowth:{ensure(){},render(){}},
  ProfitLandsWorkspace:{show(){opened++;return true}},
  restoreProfitLandsMarket(){},
  render(){rendered++},
  startTimer(){timers++},
  save(){state.savedAt=Date.now();memory.set('profitlands-v2',JSON.stringify(state));saved++},
  confirm(msg){confirmed++;return confirm},
 };
 const ctx=vm.createContext({window,document,localStorage,console,Date,JSON,Number,Math,Set,Object,
   setTimeout:()=>1,Blob:function(){},URL:{},});
 new vm.Script(code,{filename:'save-center.js'}).runInContext(ctx);
 return{api:window.ProfitLandsSaveCenter,state,window,memory,saved:()=>saved,
  rendered:()=>rendered,timers:()=>timers,confirmed:()=>confirmed,normalized:()=>normalized,opened:()=>opened};
}
test('accepts a complete current-version empire and does not modify validation input',()=>{
 const h=setup();const raw=JSON.stringify(validSave());
 const a=h.api.parseSnapshot(raw);
 assert.equal(a.day,8);
 assert.equal(a.businesses[0].locations[0].marketing,1);
 assert.equal(h.memory.get('profitlands-v2'),JSON.stringify(h.state));
});
test('rejects corrupted JSON, wrong modes, invalid companies, unsafe text and poisoned fields',()=>{
 const h=setup();
 for(const raw of [
   '{bad',JSON.stringify(validSave({mode:'fantasy'})),
   JSON.stringify(validSave({saveVersion:2})),
   JSON.stringify(validSave({cashHuge:'not-money'})),
   JSON.stringify(validSave({businesses:[{type:'guns',name:'Unknown',locations:[]}]})),
   JSON.stringify(validSave({businesses:[{type:'coffee',name:'<script>alert(1)</script>',locations:[]}]})),
   JSON.stringify(validSave({businesses:[{type:'coffee',name:'Shop',locations:[{level:-1}]}]})),
   JSON.stringify(validSave({actions:-3})),
   '{"saveVersion":4,"mode":"standard","day":2,"cash":0,"cashHuge":"0e0","businesses":[],"stocks":{},"news":[],"__proto__":{"isAdmin":true}}',
 ]){
  assert.throws(()=>h.api.parseSnapshot(raw),undefined,raw.slice(0,40));
 }
});
test('successful restore preserves a recovery copy, existing state identity and active timer',()=>{
 const h=setup();
 const original=h.state;
 const old=h.memory.get('profitlands-v2');
 const snapshot=validSave({day:29,cash:7700,cashHuge:'7.7e3',dayEndsAt:1,timeLeft:30});
 assert.equal(h.api.restore(JSON.stringify(snapshot),'local file'),true);
 assert.equal(h.state,original,'all gameplay systems retain their state object reference');
 assert.equal(h.state.day,29);
 assert.equal(h.state.cash,7700);
 assert.equal(h.state.businesses.length,1);
 assert.equal(h.state.started,true);
 assert.equal(h.memory.get('profitlands-v2-before-import'),old,'old progress is retained');
 assert.equal(h.saved(),1);
 assert.equal(h.timers(),1);
 assert.equal(h.normalized(),1);
 assert.equal(h.opened(),1);
 assert.ok(h.state.dayEndsAt>Date.now()+20000,'expired countdown is safely restarted');
});
test('restore of every mode retains that mode countdown',()=>{
 const h=setup();
 for(const [mode,seconds] of [['fast',300],['standard',900],['long',3600],['persistent',86400]]){
  const s=validSave({mode,dayEndsAt:1,timeLeft:999999});
  assert.equal(h.api.restore(JSON.stringify(s),'test',true),true);
  assert.ok(h.state.timeLeft<=seconds,'no fallback to 15-minute default on '+mode);
 }
});
test('cancelled recovery and invalid files never change the active empire',()=>{
 const h=setup({confirm:false,autoBackup:validSave({day:6})});
 const old=JSON.stringify(h.state),primary=h.memory.get('profitlands-v2');
 assert.equal(h.api.fromBackup(),false);
 assert.equal(h.confirmed(),1);
 assert.equal(h.api.restore('{INVALID','bad'),false);
 assert.equal(JSON.stringify(h.state),old);
 assert.equal(h.memory.get('profitlands-v2'),primary);
 assert.equal(h.saved(),0);
});
test('signed-in users cannot import device saves into a cloud account',()=>{
 const h=setup({signedIn:true});
 assert.equal(h.api.restore(JSON.stringify(validSave({day:1})),'external'),false);
 assert.equal(h.state.day,13);
 assert.equal(h.confirmed(),0,'account block occurs before confirmation');
});
test('CrazyGames APS builds cannot import external save files',()=>{
 const h=setup({platform:'crazygames'});
 assert.equal(h.api.restore(JSON.stringify(validSave({day:2})),'external'),false);
 assert.equal(h.state.day,13);
 assert.equal(h.saved(),0);
});
test('manual Save Now confirms the local snapshot exists and keeps economy unchanged',()=>{
 const h=setup();const before=h.state.cash;
 assert.equal(h.api.manualSave(),true);
 assert.equal(h.saved(),1);
 assert.equal(h.state.cash,before);
 assert.equal(h.state.actions,54);
 const raw=JSON.parse(h.memory.get('profitlands-v2'));
 assert.ok(raw.savedAt>0);
});
test('settings UI and save center run only in play, with existing display controls retained',()=>{
 const html=fs.readFileSync(path.join(root,'play/index.html'),'utf8');
 const main=fs.readFileSync(path.join(root,'app.js'),'utf8');
 assert.ok(html.includes('save-center.js'));
 assert.ok(html.includes('save-center.css'));
 assert.ok(html.indexOf('save-center.js')>html.indexOf('quick-switch.js'));
 assert.ok(main.includes('profitlands-v2-backup'));
 assert.ok(code.includes('profitlands-v2-before-import'));
 assert.ok(code.includes('../settings/'));
 assert.ok(code.includes('window.ProfitLandsSaveCenter'));
});
