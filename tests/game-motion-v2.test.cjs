'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'game-motion-v2.js'),'utf8');
const css=fs.readFileSync(path.join(root,'game-motion-v2.css'),'utf8');
function classes(initial=[]){
 const values=new Set(initial);
 return {add:n=>values.add(n),remove:n=>values.delete(n),contains:n=>values.has(n),values};
}
function harness({reduced=false,systemReduced=false,memory=8,cores=8,playing=true}={}){
 const frames=[],listeners={},documentEvents={},counters=[],timerCallbacks=[];
 const htmlClasses=classes(reduced?['pl-reduced-motion']:[]);
 const sections=new Map(['overview','businesses','markets'].map(name=>[name,{hidden:name!=='overview',classList:classes(name==='overview'?['active']:[])}]));
 const game={classList:classes(playing?['active']:[])};
 const header={classList:classes()};
 const numbers=new Map(['cash','netWorth','dailyIncome','actionsLeft'].map(name=>[name,{textContent:'100',classList:classes()}]));
 const document={
  readyState:'complete',hidden:false,documentElement:{classList:htmlClasses},
  getElementById:id=>id==='gameScreen'?game:numbers.get(id)||null,
  addEventListener:(name,callback)=>{documentEvents[name]=callback},
  createElement:tag=>({
   tag,className:'',attributes:{},style:{},removed:false,
   setAttribute(name,value){this.attributes[name]=value},
   remove(){this.removed=true}
  }),
  querySelector:selector=>{
   if(selector==='.pl-workspace-section-head')return header;
   const name=selector.match(/data-workspace-content="([^"]+)"/)?.[1];
   return sections.get(name)||null;
  }
 };
 class MutationObserver{constructor(callback){this.callback=callback;counters.push(this)}
  observe(element){this.target=element}}
 const window={
  matchMedia:()=>({matches:systemReduced}),
  requestAnimationFrame:callback=>{frames.push(callback);return frames.length},
  addEventListener:(name,callback)=>{listeners[name]=callback},
  ProfitLandsWorkspace:{active:()=> 'overview'}
 };
 const context={document,window,navigator:{deviceMemory:memory,hardwareConcurrency:cores},
  MutationObserver,console,
  setTimeout:callback=>{timerCallbacks.push(callback);return timerCallbacks.length},
  clearTimeout:id=>{timerCallbacks[id-1]=()=>{}}
 };
 vm.runInNewContext(source,context);
 return {document,window,sections,game,header,htmlClasses,frames,listeners,documentEvents,counters,numbers,timerCallbacks};
}

test('a workspace switch adds motion to the active section only',()=>{
 const h=harness();
 assert.ok(h.htmlClasses.contains('pl-motion-v2'));
 assert.equal(h.window.ProfitLandsMotionV2.animateView('overview'),true);
 h.frames.splice(0).forEach(fn=>fn());
 assert.ok(h.sections.get('overview').classList.contains('pl-motion-enter'));
 h.sections.get('overview').classList.remove('active');
 h.sections.get('overview').hidden=true;
 h.sections.get('businesses').hidden=false;
 h.sections.get('businesses').classList.add('active');
 h.listeners['profitlands:viewchange']({detail:{view:'businesses'}});
 h.frames.splice(0).forEach(fn=>fn());
 assert.equal(h.sections.get('overview').classList.contains('pl-motion-enter'),false);
 assert.equal(h.sections.get('businesses').classList.contains('pl-motion-enter'),true);
 assert.equal(h.window.ProfitLandsMotionV2.animateView('invalid section?'),false);
});

test('rapid navigation cancels a queued animation for an outdated screen',()=>{
 const h=harness();
 h.window.ProfitLandsMotionV2.animateView('overview');
 h.sections.get('overview').classList.remove('active');
 h.sections.get('overview').hidden=true;
 h.sections.get('markets').hidden=false;
 h.sections.get('markets').classList.add('active');
 h.window.ProfitLandsMotionV2.animateView('markets');
 h.frames.splice(0).forEach(fn=>fn());
 assert.equal(h.sections.get('overview').classList.contains('pl-motion-enter'),false);
 assert.equal(h.sections.get('markets').classList.contains('pl-motion-enter'),true);
});

test('OS and saved reduced motion prevent all scripted animations',()=>{
 for(const options of [{reduced:true},{systemReduced:true}]){
  const h=harness(options);
  assert.equal(h.window.ProfitLandsMotionV2.isReducedMotion(),true);
  assert.equal(h.window.ProfitLandsMotionV2.animateView('overview'),false);
  assert.equal(h.frames.length,0);
  const number=h.numbers.get('cash');
  number.textContent='101';
  h.counters[0].callback();
  assert.equal(number.classList.contains('pl-motion-value'),false);
 }
});

test('low-power devices keep a short, light screen transition but skip numeric effects',()=>{
 const h=harness({memory:2,cores:2});
 assert.ok(h.htmlClasses.contains('pl-motion-lite'));
 h.frames.splice(0).forEach(fn=>fn());
 assert.equal(h.sections.get('overview').classList.contains('pl-motion-enter'),true);
 h.numbers.get('cash').textContent='123';
 h.counters[0].callback();
 assert.equal(h.frames.length,0,'no costly numeric motion on low-power devices');
});

test('changing a currency number animates the label but not the economy state',()=>{
 const h=harness();
 const number=h.numbers.get('cash');
 number.textContent='140';
 h.counters[0].callback();
 h.frames.splice(0).forEach(fn=>fn());
 assert.ok(number.classList.contains('pl-motion-value'));
 h.timerCallbacks.splice(0).forEach(fn=>fn());
 assert.equal(number.classList.contains('pl-motion-value'),false);
 assert.doesNotMatch(source,/localStorage|\.cash\s*[+*/-]?=|\bsave\(/);
});

test('motion assets load on the game page after the existing experience layer',()=>{
 const html=fs.readFileSync(path.join(root,'play/index.html'),'utf8');
 assert.ok(html.indexOf('game-motion-v2.css')>html.indexOf('game-experience.css'));
 assert.ok(html.indexOf('game-motion-v2.js')>html.indexOf('game-experience.js'));
 assert.match(css,/plSmoothView/);
 assert.match(css,/plSmoothDialog/);
 assert.match(css,/plSmoothNumber/);
 assert.match(css,/pl-workspace-nav-item/);
 assert.match(css,/pl-workspace-panels/);
 assert.match(css,/pl-motion-lite/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(css,/html\.pl-reduced-motion\.pl-motion-v2/);
 assert.doesNotMatch(css,/animation:\s*[^;]*infinite/);
});

test('opening the game after the menu triggers an obvious section entrance',()=>{
 const h=harness({playing:false});
 assert.equal(h.frames.length,0);
 h.game.classList.add('active');
 h.counters.at(-1).callback();
 assert.ok(h.frames.length>0,'screen activation should schedule animation');
 h.frames.splice(0).forEach(fn=>fn());
 assert.equal(h.sections.get('overview').classList.contains('pl-motion-enter'),true);
 assert.equal(h.header.classList.contains('pl-motion-heading'),true);
 h.timerCallbacks.splice(0).forEach(fn=>fn());
 assert.equal(h.sections.get('overview').classList.contains('pl-motion-enter'),false);
 assert.equal(h.header.classList.contains('pl-motion-heading'),false);
});

test('gameplay pointer press creates an actual touch ripple and safely removes it',()=>{
 const h=harness();
 const children=[];
 const button={
  disabled:false,classList:classes(),
  closest:()=>button,
  getBoundingClientRect:()=>({left:10,top:20,width:150,height:44}),
  appendChild:child=>children.push(child),
  querySelector:selector=>children.find(child=>child.className==='pl-motion-ripple'&&!child.removed)||null
 };
 h.documentEvents.pointerdown({target:{closest:()=>button},clientX:65,clientY:40});
 assert.equal(children.length,1);
 assert.equal(children[0].className,'pl-motion-ripple');
 assert.equal(children[0].style.left,'55px');
 assert.equal(children[0].style.top,'20px');
 assert.ok(button.classList.contains('pl-motion-ripple-host'));
 h.timerCallbacks.splice(0).forEach(fn=>fn());
 assert.equal(children[0].removed,true);
 assert.equal(button.classList.contains('pl-motion-ripple-host'),false);
});

test('new animation assets are cache-busted and visibly stronger than the old 6px transitions',()=>{
 const html=fs.readFileSync(path.join(root,'play/index.html'),'utf8');
 assert.match(html,/game-motion-v2\.css\?v=motion04/);
 assert.match(html,/game-motion-v2\.js\?v=motion04/);
 assert.match(css,/plMotionViewSlide/);
 assert.match(css,/translate3d\(23px,0,0\)/);
 assert.match(css,/plMotionPanelSlide/);
 assert.match(css,/plMotionHighlight/);
 assert.match(css,/plMotionRipple/);
 assert.match(css,/plMotionLite/);
 assert.match(css,/pl-workspace-nav-item\.active/);
 assert.match(css,/pl-motion-heading/);
 assert.ok(source.includes("root.classList.add('pl-motion-v3')"));
 assert.ok(source.includes("attributeFilter:['class']"));
 assert.doesNotMatch(source,/localStorage|\.cash\s*[+*/-]?=|\bsave\(/);
});
