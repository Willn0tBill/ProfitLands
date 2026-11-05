'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'district-development.js'),'utf8');
const css=fs.readFileSync(path.join(root,'district-development.css'),'utf8');

function nodeFactory(ids){
 function node(tag='div'){
  const values=new Set();
  const callbacks={};
  const n={tag,children:[],attributes:{},dataset:{},hidden:false,textContent:'',style:{},
   offsetWidth:240,
   classList:{
    add:key=>values.add(key),
    remove:key=>values.delete(key),
    contains:key=>values.has(key),
    toggle:(key,on)=>{const choice=on===undefined?!values.has(key):!!on;
     if(choice)values.add(key);else values.delete(key);return choice}
   },
   setAttribute(key,value){this.attributes[key]=String(value)},
   getAttribute(key){return this.attributes[key]??null},
   appendChild(child){this.children.push(child);child.parent=this;return child},
   append(...children){for(const child of children)this.appendChild(child)},
   insertAdjacentElement(pos,other){if(pos!=='afterend')throw Error('Wrong anchor');
    this.inserted=other;return other},
   addEventListener(kind,cb){callbacks[kind]=cb},
   click(){callbacks.click?.()},
   querySelector(sel){
    if(sel==='.pl-district-track-fill')return this.children.find(x=>x.classList.contains('pl-district-track-fill'))||null;
    return null;
   }
  };
  Object.defineProperty(n,'className',{
   get:()=>[...values].join(' '),
   set:s=>{values.clear();String(s).split(/\s+/).filter(Boolean).forEach(x=>values.add(x))}
  });
  Object.defineProperty(n,'id',{
   get:()=>n._id||'',
   set:value=>{n._id=value;ids.set(value,n)}
  });
  return n;
 }
 return node;
}
function setup({businesses=[],playType='single',reduced=false,osReduced=false,playing=true}={}){
 const ids=new Map(),windowEvents={},docEvents={},intervals=[],timers=[];
 const node=nodeFactory(ids);
 const city=node('section');city.id='plLivingCity';
 const stage=node('div');stage.className='pl-city-stage';
 const view=node('section');view.hidden=false;
 const game=node('section');game.id='gameScreen';
 if(playing)game.classList.add('active');
 city.closest=selector=>selector==='.pl-workspace-view'?view:null;
 city.querySelector=selector=>selector==='.pl-city-stage'?stage:null;
 const shop=node('button');shop.id='openBusinessShop';
 let openedShop=0;shop.addEventListener('click',()=>{openedShop++});
 const html=node('html');if(reduced)html.classList.add('pl-reduced-motion');
 const doc={documentElement:html,readyState:'complete',hidden:false,
  getElementById:key=>ids.get(key)||null,
  createElement:node,addEventListener:(kind,cb)=>{docEvents[kind]=cb}};
 let showViews=[];
 const state={playType,businesses:businesses.map(x=>({...x}))};
 const win={state,matchMedia:()=>({matches:osReduced}),
  addEventListener:(type,cb)=>{windowEvents[type]=cb},
  setInterval:cb=>{intervals.push(cb);return intervals.length},
  ProfitLandsWorkspace:{show:id=>{showViews.push(id);return true}}
 };
 vm.runInNewContext(source,{document:doc,window:win,console,setTimeout:fn=>{timers.push(fn);return timers.length},
  MutationObserver:undefined}, {filename:'district-development.js'});
 return {ids,win,doc,city,stage,view,game,intervals,timers,windowEvents,docEvents,
  get showViews(){return showViews},
  get openedShop(){return openedShop},
  api:win.ProfitLandsDistrictDevelopment
 };
}
const chain=(count,levels=1,opts={})=>Array.from({length:count},(_,i)=>({
 type:opts.types?.[i%opts.types.length]||'coffee',
 level:levels,chainCount:i<(opts.extraLocations||0)?1:0
}));

test('district starts with a visible roadmap and no imaginary achievements',()=>{
 const h=setup();
 assert.equal(h.api.diagnostics().mounted,true);
 assert.equal(h.api.diagnostics().tier,0);
 const board=h.ids.get('plDistrictBoard');
 assert.equal(h.city.inserted,board);
 assert.equal(h.ids.get('plDistrictMilestones').children.length,4);
 assert.equal(h.ids.get('plDistrictTier').textContent,'DISTRICT 1 / 5');
 assert.equal(h.ids.get('plDistrictNextGoal').textContent,'Businesses: 0 / 1');
 assert.equal(h.ids.get('plDistrictTrack').attributes['aria-valuenow'],'0');
 assert.equal(h.stage.children.length,1,'only one overlay for all four future landmarks');
 assert.equal(h.stage.children[0].children.length,4);
 assert.equal(h.api.progressFor(h.win.state).tier,0);
});

test('each real business milestone unlocks a different decorative district tier',()=>{
 const h=setup();
 const cases=[
  {businesses:chain(1),tier:1},
  {businesses:chain(3,2),tier:2},
  {businesses:chain(5,3,{types:['coffee','hotel','factory']}),tier:3},
  {businesses:chain(8,4,{types:['coffee','hotel','factory'],extraLocations:2}),tier:4}
 ];
 for(const c of cases){
  h.win.state.businesses=c.businesses;
  h.api.refresh();
  const p=h.api.progressFor(h.win.state);
  assert.equal(p.tier,c.tier);
  assert.equal(h.api.diagnostics().tier,c.tier);
  assert.ok(h.city.classList.contains('pl-district-tier-'+c.tier));
  assert.equal(h.ids.get('plDistrictTier').textContent,'DISTRICT '+(c.tier+1)+' / 5');
 }
 assert.equal(h.ids.get('plDistrictNextGoal').textContent,'All four landmarks developed. Keep expanding your empire.');
 assert.equal(h.ids.get('plDistrictNextButton').textContent,'Manage businesses');
});

test('later milestone requirements cannot bypass an earlier missing industry goal',()=>{
 const h=setup({businesses:chain(8,4,{extraLocations:2})});
 const p=h.api.progressFor(h.win.state);
 assert.equal(p.steps[0].done,true);
 assert.equal(p.steps[1].done,true);
 assert.equal(p.steps[2].done,false,'still lacks three business industries');
 assert.equal(p.steps[3].done,true,'late milestone may be numerically satisfied');
 assert.equal(p.tier,2,'the civic plaza stays locked until the missing goal is met');
 assert.equal(p.nextGoal.key,'types');
 assert.equal(h.city.classList.contains('pl-district-tier-2'),true);
});

test('the next development goal updates automatically with exact portfolio progress',()=>{
 const h=setup({businesses:chain(2,2)});
 let p=h.api.progressFor(h.win.state);
 assert.equal(p.tier,1);
 assert.equal(p.current.name,'Main Street');
 assert.equal(p.nextGoal.key,'shops');
 assert.equal(h.ids.get('plDistrictNextGoal').textContent,'Businesses: 2 / 3');
 assert.equal(h.ids.get('plDistrictTrack').attributes['aria-valuenow'],'67');
 h.win.state.businesses.push({type:'hotel',level:1});
 h.intervals[0]();
 assert.equal(h.ids.get('plDistrictNextGoal').textContent,'Combined levels: 5 / 6');
 assert.equal(h.ids.get('plDistrictTrack').attributes['aria-valuenow'],'92');
});

test('action buttons route to existing real game screens, not a fake purchase flow',()=>{
 const h=setup();
 h.ids.get('plDistrictNextButton').click();
 assert.deepEqual(h.showViews,['businesses']);
 assert.equal(h.openedShop,1,'first goal opens the existing shop');
 h.win.state.businesses=chain(8,4,{types:['coffee','hotel','factory'],extraLocations:0});
 h.api.refresh();
 const p=h.api.progressFor(h.win.state);
 assert.equal(p.tier,3);
 assert.equal(p.nextGoal.key,'locations');
 h.ids.get('plDistrictNextButton').click();
 assert.deepEqual(h.showViews,['businesses','operations']);
 assert.equal(h.openedShop,1,'does not open first-shop modal again');
});

test('progress responds to industry diversity and actual existing location lists',()=>{
 const h=setup({businesses:[
  {type:'coffee',level:2,locations:[{level:1},{level:2}]},
  {type:'coffee',level:3,chainCount:4},
  {type:'logistics',level:1,locations:[]}
 ]});
 const stats=h.api.statsFor(h.win.state);
 assert.equal(stats.shops,3);
 assert.equal(stats.levels,6);
 assert.equal(stats.locations,8);
 assert.equal(stats.types,2);
 assert.equal(h.api.progressFor(h.win.state).tier,2);
});

test('no game-state write or save occurs in progress computation or animation',()=>{
 const h=setup({businesses:chain(5,4,{types:['coffee','hotel','software']})});
 const snapshot=JSON.stringify(h.win.state);
 const before=h.api.diagnostics().updates;
 h.api.refresh();
 h.intervals[0]();
 assert.equal(JSON.stringify(h.win.state),snapshot);
 assert.equal(h.api.diagnostics().updates,before,'unchanged state avoids repeated DOM updates');
 assert.doesNotMatch(source,/localStorage|sessionStorage|state\.(?:cash|actions|businesses)\s*[+*/-]?=|save\(/);
});

test('offscreen activity stops and reduced motion does not play achievement flash',()=>{
 const h=setup({businesses:chain(1)});
 h.view.hidden=true;
 h.win.state.businesses=chain(3,2);
 const previous=h.api.diagnostics().updates;
 h.intervals[0]();
 assert.equal(h.api.diagnostics().updates,previous);
 h.view.hidden=false;
 h.windowEvents['profitlands:viewchange']({detail:{view:'overview'}});
 assert.equal(h.api.diagnostics().tier,2);
 const staticMode=setup({reduced:true});
 staticMode.win.state.businesses=chain(1);
 staticMode.api.refresh();
 assert.equal(staticMode.ids.get('plDistrictBoard').classList.contains('pl-district-celebrate'),false);
 const os=setup({osReduced:true});
 assert.equal(os.api.diagnostics().reduced,true);
});

test('new development assets load after the rest of the active in-game city',()=>{
 const html=fs.readFileSync(path.join(root,'play/index.html'),'utf8');
 assert.ok(html.indexOf('district-development.css')>html.indexOf('city-street-life.css'));
 assert.ok(html.indexOf('district-development.js')>html.indexOf('city-street-life.js'));
 assert.match(html,/district-development\.css\?v=development01/);
 assert.match(html,/district-development\.js\?v=development01/);
 for(const name of ['pl-district-garden','pl-district-market','pl-district-plaza',
  'pl-district-transit','pl-district-board','pl-district-track','plDistrictAchievement']){
  assert.ok(css.includes(name),name);
 }
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(css,/html\.pl-reduced-motion/);
 assert.match(css,/body\.pl-online-world #gameScreen \.pl-district-board/);
});
