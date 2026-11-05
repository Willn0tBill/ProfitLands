'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const code=fs.readFileSync(path.join(root,'city-contracts.js'),'utf8');
const css=fs.readFileSync(path.join(root,'city-contracts.css'),'utf8');

function setup({
 businesses=[],day=1,playType='single',started=true,active=true,
 existing=null,grantFails=false,withMoney=true,assets=true
}={}){
 const ids=new Map(),intervals=[],events={},docEvents={},audit={saves:0,renders:0,toasts:[],gains:0,shown:[]};
 function element(tag='div'){
  const set=new Set(),listeners={};
  const n={tag,children:[],parent:null,textContent:'',hidden:false,disabled:false,
   dataset:{},attributes:{},style:{width:''},offsetWidth:100,
   classList:{
    add:x=>set.add(x),remove:x=>set.delete(x),contains:x=>set.has(x),
    toggle:(x,on)=>{const result=on===undefined?!set.has(x):!!on;
      if(result)set.add(x);else set.delete(x);return result}
   },
   appendChild(child){this.children.push(child);child.parent=this;return child},
   append(...arr){arr.forEach(el=>this.appendChild(el))},
   insertAdjacentElement(kind,target){if(kind!=='afterend')throw Error('placement');
    this.inserted=target;return target},
   setAttribute:(key,value)=>{n.attributes[key]=String(value)},
   addEventListener:(name,fn)=>{listeners[name]=fn},
   click(){listeners.click?.()},
   querySelector(selector){
    return n.children.find(c=>selector==='.pl-contract-progress-fill'&&c.classList.contains('pl-contract-progress-fill'))||null;
   }
  };
  Object.defineProperty(n,'id',{get:()=>n._id||'',set:v=>{n._id=v;ids.set(v,n)}});
  Object.defineProperty(n,'className',{get:()=>[...set].join(' '),set:v=>{
   set.clear();String(v).split(/\s+/).filter(Boolean).forEach(x=>set.add(x));
  }});
  return n;
 }
 const city=element('section');city.id='plLivingCity';
 const view=element('section');view.hidden=false;
 city.closest=selector=>selector==='.pl-workspace-view'?view:null;
 const district=element('section');district.id='plDistrictBoard';
 const game=element('section');game.id='gameScreen';if(active)game.classList.add('active');
 const state={started,playType,day,cash:1000,businesses:businesses.map(b=>({...b})),news:[]};
 if(existing)state.cityContract=structuredClone(existing);
 const win={
  state,
  ProfitLandsWorkspace:{show:id=>audit.shown.push(id)},
  addEventListener:(key,fn)=>{events[key]=fn},
  setInterval:fn=>{intervals.push(fn);return intervals.length},
  save(){audit.saves++},
  render(){audit.renders++},
  toast(s){audit.toasts.push(s)}
 };
 if(withMoney)win.ProfitLandsMoney={gain(value){
  if(grantFails)throw new Error('ledger failure');
  audit.gains+=value;
  state.cash+=value;
 }};
 const doc={
  readyState:'complete',hidden:false,documentElement:element('html'),
  getElementById:id=>ids.get(id)||null,
  createElement:element,
  addEventListener:(key,fn)=>{docEvents[key]=fn}
 };
 vm.runInNewContext(code,{document:doc,window:win,console,MutationObserver:undefined});
 return {state,win,doc,ids,city,view,game,audit,intervals,events,docEvents,
  api:win.ProfitLandsCityContracts,board:ids.get('plCityContracts')};
}
const coffee=(n=1)=>Array.from({length:n},(_,i)=>({
 type:'coffee',level:1,marketing:0,chainCount:0,name:'Coffee #'+(i+1)
}));

test('contracts appear on real Overview after district progress and use real days',()=>{
 const h=setup({businesses:coffee(1)});
 assert.equal(h.api.diagnostics().mounted,true);
 assert.equal(h.ids.get('plDistrictBoard').inserted,h.board);
 assert.equal(h.ids.get('plContractDay').textContent,'DAY 1');
 assert.equal(h.ids.get('plContractOffers').hidden,false);
 assert.equal(h.ids.get('plContractActive').hidden,true);
 const available=h.ids.get('plContractOffers').children.filter(c=>!c.hidden);
 assert.equal(available.length,3);
 assert.ok(available.some(c=>c.dataset.kind==='open'));
 assert.ok(available.some(c=>c.dataset.kind==='upgrade'));
});

test('new players have only a reachable open-business job',()=>{
 const h=setup();
 assert.deepEqual(Array.from(h.api.offersFor(h.state).map(x=>x.id)),['open']);
 assert.equal(h.api.accept('upgrade'),false);
 assert.equal(h.api.accept('promote'),false);
 assert.equal(h.api.accept('open'),true);
 assert.equal(h.audit.saves,1);
 assert.equal(h.state.cityContract.status,'accepted');
 assert.equal(h.state.cityContract.baseline.shops,0);
});

test('contracts require post-acceptance gameplay and reject double collection',()=>{
 const h=setup();
 assert.equal(h.api.accept('open'),true);
 assert.equal(h.api.claim(),false,'starting a contract must never instantly pay');
 h.state.businesses.push(...coffee());
 h.api.refresh();
 assert.equal(h.ids.get('plContractState').textContent,'READY TO COLLECT');
 assert.equal(h.ids.get('plContractProgress').attributes['aria-valuenow'],'1');
 assert.equal(h.ids.get('plContractClaim').hidden,false);
 assert.equal(h.api.claim(),true);
 assert.equal(h.state.cash,1075);
 assert.equal(h.audit.gains,75);
 assert.equal(h.state.cityContract.status,'claimed');
 assert.equal(h.api.claim(),false,'repeat click must not pay a second time');
 assert.equal(h.api.accept('open'),false,'cannot accept another contract on the same day');
 assert.equal(h.audit.saves,2);
 assert.equal(h.audit.renders,1);
 assert.equal(h.ids.get('plContractClaim').hidden,true);
 assert.match(h.audit.toasts[0],/Contract completed/);
});

test('upgrades and marketing pay only for the real action after accepting',()=>{
 const upgrade=setup({businesses:coffee(),day:1});
 assert.equal(upgrade.api.accept('upgrade'),true);
 assert.equal(upgrade.api.claim(),false);
 upgrade.state.businesses[0].level=2;
 assert.equal(upgrade.api.progressFor(upgrade.state).complete,true);
 assert.equal(upgrade.api.claim(),true);
 assert.equal(upgrade.audit.gains,90);
 const marketing=setup({businesses:coffee(),day:2});
 assert.ok(marketing.api.offersFor(marketing.state).some(x=>x.id==='promote'));
 assert.equal(marketing.api.accept('promote'),true);
 marketing.state.businesses[0].marketing=1;
 assert.equal(marketing.api.claim(),true);
 assert.equal(marketing.audit.gains,55);
});

test('expansion tracks real chainCount changes and routes to Operations',()=>{
 const h=setup({businesses:coffee(1),day:3});
 assert.equal(h.api.accept('expand'),true);
 h.ids.get('plContractGo').click();
 assert.deepEqual(h.audit.shown,['operations']);
 h.state.businesses[0].chainCount=1;
 assert.equal(h.api.progressFor(h.state).complete,true);
 assert.equal(h.api.claim(),true);
 assert.equal(h.audit.gains,125);
});

test('day rollover expires incomplete contracts and creates fresh options',()=>{
 const h=setup({businesses:coffee(),day:1});
 h.api.accept('upgrade');
 h.state.businesses[0].level=2;
 h.state.day=2;
 assert.equal(h.api.claim(),false,'yesterday progress must not pay today');
 assert.equal(h.api.progressFor(h.state),null);
 h.api.refresh();
 assert.equal(h.ids.get('plContractDay').textContent,'DAY 2');
 assert.equal(h.ids.get('plContractOffers').hidden,false);
 assert.ok(h.api.accept('promote'),'new day lets player choose again');
 assert.equal(h.state.cityContract.day,2);
 assert.equal(h.state.cityContract.baseline.levels,2);
});

test('reloaded claimed record keeps reward locked and does not alter cash',()=>{
 const record={day:6,kind:'open',status:'claimed',
  baseline:{shops:0,levels:0,marketing:0,locations:0}};
 const h=setup({day:6,businesses:coffee(),existing:record});
 assert.equal(h.api.progressFor(h.state).claimed,true);
 assert.equal(h.api.accept('upgrade'),false);
 assert.equal(h.api.claim(),false);
 assert.equal(h.audit.gains,0);
 assert.equal(h.ids.get('plContractState').textContent,'JOB PAID');
 assert.equal(h.ids.get('plContractClaim').hidden,true);
});

test('invalid legacy or tampered contract data cannot claim or block fresh jobs',()=>{
 const invalid=[
  {day:1,kind:'unknown',status:'accepted',baseline:{shops:0,levels:0,marketing:0,locations:0}},
  {day:1,kind:'open',status:'accepted',baseline:{shops:-2,levels:0,marketing:0,locations:0}},
  {day:1,kind:'open',status:'accepted',baseline:{shops:'0',levels:0,marketing:0,locations:0}},
  {day:1,kind:'open',status:'accepted',baseline:null}
 ];
 for(const record of invalid){
  const h=setup({existing:record,businesses:coffee(1)});
  assert.equal(h.api.progressFor(h.state),null);
  assert.equal(h.api.claim(),false);
  assert.equal(h.audit.gains,0);
  assert.equal(h.api.accept('open'),true);
 }
});

test('a ledger failure rolls back the claim marker without rewarding cash',()=>{
 const h=setup({existing:{day:1,kind:'open',status:'accepted',
   baseline:{shops:0,levels:0,marketing:0,locations:0}},
   businesses:coffee(1),grantFails:true});
 assert.equal(h.api.progressFor(h.state).complete,true);
 assert.equal(h.api.claim(),false);
 assert.equal(h.audit.gains,0);
 assert.equal(h.state.cash,1000);
 assert.equal(h.state.cityContract.status,'accepted');
 assert.equal(h.audit.saves,0);
});

test('classic numeric economy fallback can pay once when huge-money ledger is unavailable',()=>{
 const h=setup({withMoney:false,businesses:coffee(),existing:{
  day:1,kind:'open',status:'accepted',baseline:{shops:0,levels:0,marketing:0,locations:0}
 }});
 assert.equal(h.api.claim(),true);
 assert.equal(h.state.cash,1075);
 assert.equal(h.api.claim(),false);
});

test('hidden, inactive, multiplayer and unstarted games cannot accept or claim',()=>{
 for(const options of [{active:false},{playType:'multi'},{started:false}]){
  const h=setup(options);
  assert.equal(h.api.accept('open'),false);
  assert.equal(h.api.claim(),false);
  assert.equal(h.audit.gains,0);
 }
 const h=setup();
 h.view.hidden=true;h.api.accept('open');
 const before=h.api.diagnostics().renders;
 h.intervals[0]();
 assert.equal(h.api.diagnostics().renders,before);
});

test('new empires clear old contract markers and assets load in the actual play page',()=>{
 const game=fs.readFileSync(path.join(root,'app.js'),'utf8');
 assert.match(game,/state\.businesses=\[\];state\.cityContract=null;/);
 const html=fs.readFileSync(path.join(root,'play/index.html'),'utf8');
 assert.ok(html.indexOf('city-contracts.css')>html.indexOf('district-development.css'));
 assert.ok(html.indexOf('city-contracts.js')>html.indexOf('district-development.js'));
 assert.match(html,/city-contracts\.css\?v=contracts01/);
 assert.match(html,/city-contracts\.js\?v=contracts01/);
 assert.match(css,/\[hidden\]/);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(css,/pl-reduced-motion/);
 assert.match(css,/pl-online-world/);
});
