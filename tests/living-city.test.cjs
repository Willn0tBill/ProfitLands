'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const script=fs.readFileSync(path.join(root,'living-city.js'),'utf8');
const css=fs.readFileSync(path.join(root,'living-city.css'),'utf8');

function fakeDOM(initialState={playType:'single',day:1,businesses:[]}){
 const ids=new Map(),windowEvents={},documentEvents={},timers=[];
 let showBusinessCalls=0,openShopCalls=0,openManageIndex=null;
 function makeNode(tag='div'){
  const classes=new Set(),listeners={};
  const node={
   tag,id:'',children:[],hidden:false,attributes:{},dataset:{},title:'',textContent:'',
   classNames:classes,innerMarkup:'',
   classList:{
    contains:key=>classes.has(key),
    add:key=>classes.add(key),
    remove:key=>classes.delete(key),
    toggle:(key,on)=>{
     const value=on===undefined?!classes.has(key):on;
     if(value)classes.add(key);else classes.delete(key);return value;
    }
   },
   style:{values:{},setProperty:(key,value)=>{node.style.values[key]=value}},
   setAttribute:(key,value)=>{node.attributes[key]=value},
   appendChild:child=>{node.children.push(child);return child},
   prepend:child=>{node.children.unshift(child)},
   replaceChildren:child=>{node.children=child?.isFragment?child.children:[child]},
   addEventListener:(key,callback)=>{listeners[key]=callback},
   insertAdjacentElement:(location,el)=>{
    if(location!=='afterend')throw Error('Wrong insertion location');
    node.inserted=el;return el;
   },
   click:()=>{listeners.click?.()},
   emit:(name,event)=>{listeners[name]?.(event)}
  };
  Object.defineProperty(node,'className',{
   get:()=>[...classes].join(' '),
   set:value=>{classes.clear();String(value).split(/\s+/).filter(Boolean).forEach(c=>classes.add(c))}
  });
  Object.defineProperty(node,'innerHTML',{
   get:()=>node.innerMarkup,
   set:value=>{
    node.innerMarkup=value;
    const matcher=/<[a-z][^>]*\bid="([^"]+)"[^>]*>/gi;
    let match;
    while((match=matcher.exec(value))!==null){
     const child=makeNode('div');
     child.id=match[1];ids.set(child.id,child);
    }
   }
  });
  return node;
 }
 const game=makeNode('section');
 game.id='gameScreen';game.classList.add('active');ids.set(game.id,game);
 const overview=makeNode('section');
 overview.hidden=false;
 const heading=makeNode('header');
 const income=makeNode('strong');income.id='dailyIncome';income.textContent='$4.25 / sec';ids.set(income.id,income);
 const store=makeNode('button');store.id='openBusinessShop';store.addEventListener('click',()=>{openShopCalls++});ids.set(store.id,store);
 const document={
  readyState:'complete',hidden:false,
  getElementById:id=>ids.get(id)||null,
  querySelector:selector=>selector.includes('data-workspace-content="overview"')?overview:
   selector==='#gameScreen .pl-workspace-section-head'?heading:null,
  createElement:makeNode,
  createDocumentFragment:()=>({isFragment:true,children:[],appendChild(child){this.children.push(child)}}),
  addEventListener:(key,callback)=>{documentEvents[key]=callback}
 };
 const state=structuredClone(initialState);
 const window={
  state,
  ProfitLandsWorkspace:{show:view=>{if(view==='businesses')showBusinessCalls++;return true}},
  openManage:index=>{openManageIndex=index},
  addEventListener:(key,callback)=>{windowEvents[key]=callback},
  setInterval:callback=>{timers.push(callback);return timers.length}
 };
 vm.runInNewContext(script,{document,window,console,MutationObserver:undefined});
 return {document,window,ids,overview,heading,game,income,windowEvents,documentEvents,timers,
  get showBusinessCalls(){return showBusinessCalls},
  get openShopCalls(){return openShopCalls},
  get openManageIndex(){return openManageIndex}};
}

test('the animated city mounts at the TOP of the real Overview',()=>{
 const h=fakeDOM();
 const city=h.overview.children[0];
 assert.equal(h.window.ProfitLandsLivingCity.diagnostics().mounted,true);
 assert.equal(city.id,'plLivingCity');
 assert.match(city.className,/pl-city-panel/);
 assert.match(city.innerHTML,/pl-city-stage/);
 assert.match(city.innerHTML,/pl-city-road/);
 assert.match(city.innerHTML,/pl-city-cloud-a/);
 assert.match(city.innerHTML,/pl-city-car-a/);
 assert.match(city.innerHTML,/pl-city-buildings/);
 assert.equal(h.ids.get('plCityBuildings').children.length,5,'new empire displays a starter town');
 assert.equal(h.ids.get('plCityBusinessCount').textContent,'0');
 assert.equal(h.ids.get('plCityHint').textContent,'Your first shop will fill an empty lot.');
 assert.equal(h.ids.get('plCityTickerCount').textContent,'0 ACTIVE BUSINESSES');
});

test('city skyline reflects actual business type and level without changing game state',()=>{
 const h=fakeDOM({playType:'single',day:8,businesses:[
  {type:'coffee',level:2,chainCount:0},
  {type:'hotel',level:4,chainCount:2}
 ]});
 const original=JSON.stringify(h.window.state);
 const buildings=h.ids.get('plCityBuildings').children;
 assert.equal(buildings.length,2);
 assert.match(buildings[0].className,/pl-city-cafe/);
 assert.match(buildings[1].className,/pl-city-hotel/);
 assert.equal(buildings[1].children[1].children.length,12);
 assert.equal(buildings[0].children.at(-1).textContent,'$');
 assert.equal(h.ids.get('plCityBusinessCount').textContent,'2');
 assert.equal(h.ids.get('plCityUpgradeCount').textContent,'6');
 assert.equal(h.ids.get('plCityDay').textContent,'DAY 8');
 assert.equal(h.ids.get('plCityFlow').textContent,'$4.25 / sec');
 assert.equal(h.ids.get('plCityTickerCount').textContent,'2 ACTIVE BUSINESSES');
 assert.equal(JSON.stringify(h.window.state),original,'visualizer must never modify a saved empire');
});

test('buying or upgrading triggers a skyline rebuild, not repeated rerenders every second',()=>{
 const h=fakeDOM({playType:'single',businesses:[{type:'coffee',level:1}]});
 const api=h.window.ProfitLandsLivingCity;
 const count=api.diagnostics().renderCount;
 const oldHeight=h.ids.get('plCityBuildings').children[0].style.values['--city-height'];
 h.timers[0]();
 assert.equal(api.diagnostics().renderCount,count,'unchanged portfolios keep their DOM');
 h.window.state.businesses[0].level=5;
 h.timers[0]();
 assert.equal(api.diagnostics().renderCount,count+1);
 const newHeight=h.ids.get('plCityBuildings').children[0].style.values['--city-height'];
 assert.ok(parseInt(newHeight)>parseInt(oldHeight),'business upgrades make buildings taller');
});

test('portfolio visualization caps DOM work to nine buildings and shows additional ownership',()=>{
 const businesses=Array.from({length:21},(_,i)=>({type:i%2?'factory':'software',level:i+1}));
 const h=fakeDOM({playType:'single',businesses});
 assert.equal(h.ids.get('plCityBuildings').children.length,9);
 assert.equal(h.ids.get('plCityMore').hidden,false);
 assert.equal(h.ids.get('plCityMore').textContent,'+12 more businesses');
 assert.equal(h.ids.get('plCityBusinessCount').textContent,'21');
});

test('hidden views and tabs skip updates; returning to Overview refreshes the city',()=>{
 const h=fakeDOM();
 const api=h.window.ProfitLandsLivingCity;
 h.overview.hidden=true;
 const previous=api.diagnostics().renderCount;
 h.window.state.businesses.push({type:'restaurant',level:2});
 h.timers[0]();
 assert.equal(api.diagnostics().renderCount,previous);
 h.overview.hidden=false;
 h.windowEvents['profitlands:viewchange']({detail:{view:'overview'}});
 assert.equal(api.diagnostics().renderCount,previous+1);
 assert.equal(h.ids.get('plCityBusinessCount').textContent,'1');
 h.document.hidden=true;
 h.window.state.businesses.push({type:'factory',level:1});
 h.timers[0]();
 assert.equal(h.ids.get('plCityBusinessCount').textContent,'1');
});

test('Explore businesses opens the existing UI and optionally the first-shop market',()=>{
 const h=fakeDOM();
 h.ids.get('plCityManage').click();
 assert.equal(h.showBusinessCalls,1);
 assert.equal(h.openShopCalls,1);
 const existing=fakeDOM({playType:'single',businesses:[{type:'coffee',level:1}]});
 existing.ids.get('plCityManage').click();
 assert.equal(existing.showBusinessCalls,1);
 assert.equal(existing.openShopCalls,0);
});

test('unexpected business types and bad save values do not corrupt or crash the visualizer',()=>{
 const h=fakeDOM({playType:'single',day:NaN,businesses:[{type:'<script>',level:Infinity,locations:[]}]});
 const city=h.ids.get('plCityBuildings').children[0];
 assert.match(city.className,/pl-city-office/);
 assert.equal(city.title,'Business · Level 1');
 assert.equal(h.ids.get('plCityBusinessCount').textContent,'1');
 assert.doesNotMatch(script,/localStorage\.setItem|state\.[a-z]+\s*[+*/-]?=|firebase|fetch\(/);
});

test('the live city is part of the actual game and retains reduced-motion and offline safety',()=>{
 const html=fs.readFileSync(path.join(root,'play/index.html'),'utf8');
 assert.ok(html.indexOf('living-city.css')>html.indexOf('game-feedback-v4.css'));
 assert.ok(html.indexOf('living-city.js')>html.indexOf('game-feedback-v4.js'));
 assert.match(html,/living-city\.css\?v=city02/);
 assert.match(html,/living-city\.js\?v=city02/);
 for(const key of ['plCityTraffic','plCityMoney','plCityBuild','plCityCloud','plCityConveyor',
  'pl-city-profit-particle','pl-city-ticker','pl-city-live-dot']){
  if(key==='plCityTraffic'||key==='plCityMoney'||key==='plCityBuild'||key==='plCityCloud'||key==='plCityConveyor')
   assert.ok(css.includes(key),key);
  else assert.ok(css.includes(key)||script.includes(key),key);
 }
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(css,/html\.pl-reduced-motion/);
 assert.match(css,/body\.pl-online-world #gameScreen \.pl-city-panel/);
 assert.match(css,/body\.pl-online-world #gameScreen \.pl-city-ticker/);
});


test('city uses crafted store signs instead of emoji badges and exposes real buttons',()=>{
 const h=fakeDOM({playType:'single',businesses:[
  {type:'coffee',level:2},{type:'restaurant',level:3},{type:'software',level:1}
 ]});
 const city=h.overview.children[0];
 assert.match(city.innerHTML,/Interactive business district/);
 assert.doesNotMatch(city.innerHTML,/<div class=\\"pl-city-stage\\" aria-hidden/);
 const buttons=h.ids.get('plCityBuildings').children;
 assert.equal(buttons.length,3);
 assert.equal(buttons[0].tag,'button');
 assert.equal(buttons[0].type,'button');
 assert.equal(buttons[0].children[2].textContent,'CAFÉ');
 assert.equal(buttons[1].children[2].textContent,'DINER');
 assert.equal(buttons[2].children[2].textContent,'TECH');
 assert.match(buttons[1].attributes['aria-label'],/Manage Restaurant, level 3/);
});
test('clicking a skyline building opens the exact business, even with more than nine owned',()=>{
 const businesses=Array.from({length:15},(_,i)=>({type:'coffee',level:i+1}));
 const h=fakeDOM({playType:'single',businesses});
 const buildings=h.ids.get('plCityBuildings');
 const first=buildings.children[0];
 assert.equal(first.dataset.businessIndex,'6','visible buildings retain original portfolio indices');
 buildings.emit('click',{target:{closest:()=>first}});
 assert.equal(h.openManageIndex,6);
 const ninth=buildings.children[8];
 buildings.emit('click',{target:{closest:()=>ninth}});
 assert.equal(h.openManageIndex,14);
 buildings.emit('click',{target:{closest:()=>({dataset:{businessIndex:'999'}})}});
 assert.equal(h.openManageIndex,14,'out-of-range clicks must be ignored');
});
test('empty future lots are not clickable business controls',()=>{
 const h=fakeDOM();
 for(const lot of h.ids.get('plCityBuildings').children){
  assert.equal(lot.tag,'div');
  assert.match(lot.className,/pl-city-building-ghost/);
 }
});
test('the in-game day cycle switches the visible city between day dusk and night',()=>{
 const h=fakeDOM({playType:'single',mode:'standard',started:true,
  timeLeft:850,day:2,businesses:[{type:'hotel',level:2}]});
 const city=h.overview.children[0];
 assert.equal(h.ids.get('plCityPhase').textContent,'DAY');
 h.window.state.timeLeft=350;
 h.timers[0]();
 assert.equal(h.ids.get('plCityPhase').textContent,'DUSK');
 assert.equal(city.classList.contains('pl-city-phase-dusk'),true);
 h.window.state.timeLeft=110;
 h.timers[0]();
 assert.equal(h.ids.get('plCityPhase').textContent,'NIGHT');
 assert.equal(city.classList.contains('pl-city-phase-night'),true);
 h.window.state.timeLeft=850;
 h.timers[0]();
 assert.equal(city.classList.contains('pl-city-phase-night'),false);
 assert.equal(city.classList.contains('pl-city-phase-dusk'),false);
});
test('handcrafted art uses legible signage, pedestrians and reduced-motion guardrails',()=>{
 assert.match(css,/pl-city-storefront:before/);
 assert.match(css,/pl-city-pedestrian/);
 assert.match(css,/plCityWalk/);
 assert.match(css,/pl-city-phase-night/);
 assert.match(css,/pl-city-phase-dusk/);
 assert.match(css,/pl-city-building:not\(\.pl-city-building-ghost\):focus-visible/);
 assert.match(css,/html\.pl-reduced-motion/);
 assert.doesNotMatch(script,/localStorage\.setItem|state\.businesses\s*=|fetch\(/);
});


test('original arcade palette is not overridden by the later sandstone district theme',()=>{
 const html=fs.readFileSync(path.join(root,'play/index.html'),'utf8');
 const game=fs.readFileSync(path.join(root,'game-experience.css'),'utf8');
 assert.doesNotMatch(html,/district-theme\.css/);
 assert.equal(fs.existsSync(path.join(root,'district-theme.css')),false);
 assert.match(game,/--pl-game-gold:#ffd96a/);
 assert.match(game,/--pl-game-purple:#b29aff/);
 assert.match(game,/body\.pl-play-page/);
 assert.ok(html.indexOf('game-experience.css')<html.indexOf('living-city.css'));
 assert.match(html,/focus-game\.css\?v=original01/);
});
