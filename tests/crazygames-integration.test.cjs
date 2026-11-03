'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const adapter=fs.readFileSync(path.join(root,'crazygames.js'),'utf8');
const build=require('../scripts/build-crazygames.cjs');

function harness({host='www.crazygames.com',packaged=false,save=null,sdk=null}={}){
  const callbacks={};
  const counters={start:0,resume:0};
  const memory=new Map();
  if(save!==null)memory.set('profitlands-v2',typeof save==='string'?save:JSON.stringify(save));
  const localStorage={
    getItem:key=>memory.has(key)?memory.get(key):null,
    setItem:(key,value)=>memory.set(key,String(value))
  };
  const document={
    body:{classList:{add(){}}},
    querySelector:selector=>selector==='meta[name="profitlands-platform"]'&&packaged?{content:'crazygames'}:null,
    getElementById:()=>null
  };
  const window={
    profitLandsPlatform:{name:'web',save(){},load(){}},
    state:{started:false,playType:'multi',playerName:''},
    CrazyGames:sdk?{SDK:sdk}:null,
    addEventListener:(type,callback)=>{callbacks[type]=callback}
  };
  window.startProfitLands=()=>{
    counters.start++;
    window.state.started=true;
    window.profitLandsPlatform.gameplayStart?.();
  };
  window.resumeProfitLands=()=>{
    counters.resume++;
    window.state.started=true;
    window.profitLandsPlatform.gameplayStart?.();
  };
  vm.runInNewContext(adapter,{window,document,location:{hostname:host},localStorage,console}, {filename:'crazygames.js'});
  return {window,callbacks,counters,memory};
}

test('standard website never changes its existing platform or game flow',async()=>{
  const h=harness({host:'willn0tbill.github.io'});
  assert.equal(h.window.profitLandsPlatform.name,'web');
  assert.equal(h.callbacks.load,undefined);
  assert.equal(h.counters.start,0);
});

test('host detection recognizes CrazyGames instead of the broken escaped-dot expression',async()=>{
  const h=harness();
  assert.equal(h.window.profitLandsPlatform.name,'crazygames');
  assert.equal(h.window.profitLandsPlatform.externalAuthDisabled,true);
  await h.callbacks.load();
  assert.equal(h.counters.start,1);
  assert.equal(h.window.profitLandsPlatform.freshEmpire,true);
  assert.equal(h.window.state.playType,'single');
});

test('packaged build starts immediately, does not overwrite saved empires',async()=>{
  const save={mode:'standard',day:17,cash:52000,businesses:[{type:'coffee'}],stocks:{}};
  const h=harness({host:'localhost',packaged:true,save});
  await h.callbacks.load();
  assert.equal(h.counters.start,0);
  assert.equal(h.counters.resume,1);
  assert.equal(h.window.profitLandsPlatform.freshEmpire,false);
  assert.equal(h.memory.get('profitlands-v2'),JSON.stringify(save));
});

test('SDK init queues gameplay start and sends stop only on real exit',async()=>{
  const events=[];
  const sdk={
    environment:'crazygames',
    async init(){events.push('init')},
    game:{
      gameplayStart(){events.push('start')},
      gameplayStop(){events.push('stop')}
    },
    user:{isUserAccountAvailable:false,systemInfo:{locale:'en-US'}}
  };
  const h=harness({sdk});
  await h.callbacks.load();
  assert.deepEqual(events,['init','start']);
  assert.deepEqual(h.window.profitLandsPlatform.systemInfo,{locale:'en-US'});
  h.window.profitLandsPlatform.gameplayStart();
  h.window.profitLandsPlatform.gameplayStop();
  h.window.profitLandsPlatform.gameplayStop();
  assert.deepEqual(events,['init','start','stop']);
});

test('SDK disabled outside CrazyGames never blocks the core game',async()=>{
  const events=[];
  const sdk={
    environment:'disabled',async init(){events.push('init')},
    game:{gameplayStart(){events.push('start')}}
  };
  const h=harness({host:'localhost',packaged:true,sdk});
  await h.callbacks.load();
  assert.equal(h.counters.start,1);
  assert.deepEqual(events,['init']);
});

test('isolated build removes external account scripts, links, and broken relative paths',()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'profitlands-cg-'));
  const output=path.join(temp,'game');
  try{
    const built=build({root,output});
    const html=fs.readFileSync(path.join(output,'index.html'),'utf8');
    assert.match(html,/name="profitlands-platform" content="crazygames"/);
    assert.match(html,/crazygames-sdk-v3\.js/);
    assert.match(html,/crazygames\.css/);
    assert.match(html,/crazygames-coach\.css/);
    assert.match(html,/crazygames-coach\.js/);
    assert.ok(html.indexOf('crazygames-coach.js')>html.indexOf('workspace.js'),'coach loads after workspace');
    assert.doesNotMatch(html,/firebase-auth|firebase-config|www\.gstatic\.com\/firebasejs/);
    assert.doesNotMatch(html,/href="\.\.\//);
    assert.doesNotMatch(html,/src="\.\.\//);
    assert.doesNotMatch(html,/href="https?:\/\//);
    assert.doesNotMatch(html,/play-route\.js/);
    for(const match of html.matchAll(/<(?:script|link)\b[^>]*(?:src|href)="([^"]+)"/g)){
      const src=match[1].split('?')[0];
      if(src.startsWith('http'))continue;
      assert.ok(fs.existsSync(path.join(output,src)),'Missing asset: '+src);
    }
    assert.ok(built.fileCount<=1500);
    assert.ok(built.bytes<=50*1024*1024);
  }finally{fs.rmSync(temp,{recursive:true,force:true})}
});


test('first-session coach measures actual business progress without mutating economy or saves',()=>{
  const script=fs.readFileSync(path.join(root,'crazygames-coach.js'),'utf8');
  let storageWrites=0;
  const window={profitLandsPlatform:{name:'crazygames'},addEventListener(){}};
  const document={readyState:'loading'};
  vm.runInNewContext(script,{window,document,localStorage:{getItem:()=>null,setItem:()=>{storageWrites++}},console}, {filename:'crazygames-coach.js'});
  const api=window.ProfitLandsCrazyCoach;
  assert.ok(api,'CrazyGames coach exposes read-only goal evaluation');
  const s={started:true,cash:1000,actions:60,businesses:[],stocks:{nova:{shares:0}}};
  const original=JSON.stringify(s);
  const first=api.snapshot(s,{});
  assert.equal(first.completed,0);
  assert.equal(first.next.id,'open');
  s.businesses.push({type:'coffee',level:1,marketing:0,efficiency:0,workers:0,chainCount:0,
    locations:[{level:1,marketing:0,efficiency:0,workers:0,manager:false}]});
  assert.equal(api.snapshot(s,{}).next.id,'inspect');
  assert.equal(api.snapshot(s,{inspectedBusiness:true}).next.id,'improve');
  // Real gameplay now upgrades individual locations, not just the old company fields.
  s.businesses[0].locations[0].marketing=1;
  assert.equal(api.snapshot(s,{inspectedBusiness:true}).next.id,'markets');
  assert.equal(s.businesses[0].marketing,0,'location upgrade does not mutate legacy company marketing');
  const final=api.snapshot(s,{inspectedBusiness:true,visitedMarkets:true});
  assert.equal(final.completed,4);
  assert.equal(final.done,true);
  assert.equal(final.next,null);
  assert.equal(s.cash,1000,'coach never grants money');
  assert.equal(s.actions,60,'coach never spends management actions');
  assert.equal(s.stocks.nova.shares,0,'coach does not trade for the user');
  assert.equal(storageWrites,0,'evaluating progress never writes to storage');
  assert.notEqual(JSON.stringify(s),original,'fixture advanced only because the test simulated a real purchase');
});

test('starter coach is entirely absent from the default web and Steam pages',()=>{
  const web=fs.readFileSync(path.join(root,'play/index.html'),'utf8');
  assert.doesNotMatch(web,/crazygames-coach\.(?:css|js)/);
  const source=fs.readFileSync(path.join(root,'crazygames-coach.js'),'utf8');
  assert.match(source,/profitLandsPlatform\?\.name!=='crazygames'/);
  const style=fs.readFileSync(path.join(root,'crazygames-coach.css'),'utf8');
  assert.match(style,/prefers-reduced-motion/);
  assert.match(style,/data-buy-type=\\"coffee\\"/,'enhanced shop supports the first-business highlight');
});
