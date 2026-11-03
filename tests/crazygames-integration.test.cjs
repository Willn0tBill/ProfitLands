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
  assert.equal(h.window.state.playType,'single');
});

test('packaged build starts immediately, does not overwrite saved empires',async()=>{
  const save={mode:'standard',day:17,cash:52000,businesses:[{type:'coffee'}],stocks:{}};
  const h=harness({host:'localhost',packaged:true,save});
  await h.callbacks.load();
  assert.equal(h.counters.start,0);
  assert.equal(h.counters.resume,1);
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
