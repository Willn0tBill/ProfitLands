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
 const frames=[],listeners={},counters=[],timerCallbacks=[];
 const htmlClasses=classes(reduced?['pl-reduced-motion']:[]);
 const sections=new Map(['overview','businesses','markets'].map(name=>[name,{hidden:name!=='overview',classList:classes(name==='overview'?['active']:[])}]));
 const game={classList:classes(playing?['active']:[])};
 const numbers=new Map(['cash','netWorth','dailyIncome','actionsLeft'].map(name=>[name,{textContent:'100',classList:classes()}]));
 const document={
  readyState:'complete',hidden:false,documentElement:{classList:htmlClasses},
  getElementById:id=>id==='gameScreen'?game:numbers.get(id)||null,
  querySelector:selector=>{
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
 return {document,window,sections,game,htmlClasses,frames,listeners,counters,numbers,timerCallbacks};
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

test('low-power devices skip numeric effects and heavy panel animations',()=>{
 const h=harness({memory:2,cores:2});
 assert.ok(h.htmlClasses.contains('pl-motion-lite'));
 h.numbers.get('cash').textContent='123';
 h.counters[0].callback();
 assert.equal(h.frames.length,0);
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
