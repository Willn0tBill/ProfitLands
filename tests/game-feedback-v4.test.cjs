'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const script=fs.readFileSync(path.join(root,'game-feedback-v4.js'),'utf8');
const css=fs.readFileSync(path.join(root,'game-feedback-v4.css'),'utf8');

function classList(initial=[]){
 const values=new Set(initial);
 return {add:x=>values.add(x),remove:x=>values.delete(x),contains:x=>values.has(x),values};
}
function node(tag){
 const o={tag,children:[],classList:classList(),className:'',attributes:{},style:{
  properties:{},setProperty(k,v){this.properties[k]=v}
 },textContent:'',isConnected:true,removed:false,
  setAttribute(k,v){this.attributes[k]=v},
  append(...children){this.children.push(...children)},
  appendChild(child){this.children.push(child);return child},
  remove(){this.removed=true;this.isConnected=false}
 };
 return o;
}
function setup({reduced=false,systemReduced=false,lowPower=false,playing=true}={}){
 const roots=classList(reduced?['pl-reduced-motion']:[]);
 const screen=node('section');screen.classList=classList(playing?['active']:[]);
 const toast=node('div');toast.classList=classList(['show']);toast.textContent='';
 const header=node('header');
 const body=node('body'),events={},observers=[],frames=[],timers=[];
 let clock=10000;
 const document={
  readyState:'complete',hidden:false,documentElement:{classList:roots},body,
  getElementById:k=>k==='gameScreen'?screen:k==='toast'?toast:null,
  querySelector:selector=>selector==='#gameScreen .pl-workspace-section-head'?header:null,
  createElement:node,
  addEventListener:(kind,fn)=>{events[kind]=fn}
 };
 class MutationObserver{
  constructor(callback){this.callback=callback;observers.push(this)}
  observe(element,config){this.target=element;this.config=config}
 }
 const window={matchMedia:()=>({matches:systemReduced}),
  requestAnimationFrame:fn=>{frames.push(fn);return frames.length}};
 const context={window,document,navigator:{deviceMemory:lowPower?2:8,hardwareConcurrency:lowPower?2:8},
  MutationObserver,setTimeout:fn=>{timers.push(fn);return timers.length},
  clearTimeout:id=>{timers[id-1]=()=>{}},Date:{now:()=>clock},console};
 vm.runInNewContext(script,context,{filename:'game-feedback-v4.js'});
 const runFrames=()=>frames.splice(0).forEach(fn=>fn());
 const runTimers=()=>{while(timers.length)timers.shift()()};
 return {window,document,body,screen,toast,header,roots,events,observers,frames,timers,runFrames,runTimers,advance:n=>{clock+=n}};
}

test('success detection is grounded in verified message text and excludes failures',()=>{
 const h=setup();
 const fx=h.window.ProfitLandsGameFeedback;
 for(const text of ['Coffee Shop opened.','Upgrade completed.','Business upgraded!','Property purchased','Tier unlocked'])
  assert.equal(fx.qualifies(text),true,text);
 for(const text of ['Insufficient funds','Upgrade failed','Cannot upgrade','Not enough cash','Server rejected purchase','', 'x'.repeat(241)])
  assert.equal(fx.qualifies(text),false,text);
});

test('confirmed action draws a visible receipt using textContent, never HTML',()=>{
 const h=setup();
 const fx=h.window.ProfitLandsGameFeedback;
 assert.equal(h.roots.contains('pl-motion-v4'),true);
 const text='<img src=x onerror=alert(1)> opened.';
 assert.equal(fx.showReceipt(text),true);
 assert.equal(h.body.children.length,1);
 const card=h.body.children[0];
 assert.equal(card.className,'pl-action-receipt');
 assert.equal(card.attributes['aria-hidden'],'true');
 assert.equal(card.children[1].children[1].textContent,text);
 assert.equal(card.children[1].children[0].textContent,'ACTION COMPLETE');
 assert.equal(h.header.classList.contains('pl-action-done'),true);
 assert.equal(script.includes('innerHTML'),false,'dynamic feedback must never parse HTML');
});

test('duplicate notifications do not stack, but a later separate success replaces the first',()=>{
 const h=setup();const fx=h.window.ProfitLandsGameFeedback;
 assert.equal(fx.showReceipt('Coffee Shop opened.'),true);
 assert.equal(fx.showReceipt('Coffee Shop opened.'),false);
 const first=h.body.children[0];
 h.advance(800);
 assert.equal(fx.showReceipt('Restaurant opened.'),true);
 assert.equal(first.removed,true);
 assert.equal(h.body.children.length,2);
 h.runTimers();
 assert.equal(h.body.children[1].removed,true);
});

test('reduced motion shows a static receipt, never triggers header animation',()=>{
 const h=setup({reduced:true});
 assert.equal(h.window.ProfitLandsGameFeedback.isReducedMotion(),true);
 assert.equal(h.window.ProfitLandsGameFeedback.showReceipt('Coffee Shop opened.'),true);
 assert.equal(h.body.children.length,1);
 assert.equal(h.header.classList.contains('pl-action-done'),false);
 const sys=setup({systemReduced:true});
 assert.equal(sys.window.ProfitLandsGameFeedback.isReducedMotion(),true);
 assert.equal(sys.window.ProfitLandsGameFeedback.showReceipt('Business upgraded.'),true);
 assert.equal(sys.header.classList.contains('pl-action-done'),false);
});

test('hidden tabs and menu screen never show gameplay receipts',()=>{
 const h=setup({playing:false});
 assert.equal(h.window.ProfitLandsGameFeedback.showReceipt('Coffee Shop opened.'),false);
 h.screen.classList.add('active');
 h.document.hidden=true;
 assert.equal(h.window.ProfitLandsGameFeedback.showReceipt('Coffee Shop opened.'),false);
 assert.equal(h.body.children.length,0);
});

test('a real toast is monitored and updates the feedback once',()=>{
 const h=setup();
 assert.equal(h.observers.length,1);
 assert.equal(h.observers[0].target,h.toast);
 assert.equal(h.observers[0].config.attributeFilter[0],'class');
 h.toast.textContent='Factory upgraded.';
 h.observers[0].callback();
 assert.equal(h.body.children.length,1);
 h.toast.textContent='Purchase rejected.';
 h.observers[0].callback();
 assert.equal(h.body.children.length,1);
});

test('business spotlight follows mouse within a card at most once per animation frame',()=>{
 const h=setup(),card=node('div');
 card.getBoundingClientRect=()=>({left:10,top:20,width:180,height:100});
 const target={closest:selector=>selector==='#businessList .business-card'?card:null};
 h.events.pointermove({target,pointerType:'mouse',clientX:45,clientY:77});
 h.events.pointermove({target,pointerType:'mouse',clientX:55,clientY:88});
 assert.equal(h.frames.length,1,'pointer events should coalesce to one paint');
 h.runFrames();
 assert.equal(card.style.properties['--pl-spot-x'],'45px');
 assert.equal(card.style.properties['--pl-spot-y'],'68px');
});

test('touch, low-memory and reduced-motion devices skip card spotlight computation',()=>{
 for(const settings of [{lowPower:true},{reduced:true},{systemReduced:true}]){
  const h=setup(settings);
  const card=node('div');
  const target={closest:()=>card};
  h.events.pointermove({target,pointerType:'mouse',clientX:45,clientY:77});
  assert.equal(h.frames.length,0);
 }
 const touch=setup();
 touch.events.pointermove({target:{closest:()=>node('div')},pointerType:'touch',clientX:20,clientY:10});
 assert.equal(touch.frames.length,0);
});

test('feedback assets load after existing game animations and respect reduced motion',()=>{
 const html=fs.readFileSync(path.join(root,'play/index.html'),'utf8');
 assert.ok(html.indexOf('game-feedback-v4.css')>html.indexOf('game-motion-v2.css'));
 assert.ok(html.indexOf('game-feedback-v4.js')>html.indexOf('game-motion-v2.js'));
 assert.match(html,/game-feedback-v4\.css\?v=feedback04/);
 assert.match(html,/game-feedback-v4\.js\?v=feedback04/);
 for(const key of ['plReceiptEnter','plReceiptExit','plReceiptTime','plActionHeaderGlow','--pl-spot-x','--pl-spot-y'])
  assert.ok(css.includes(key),key);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(css,/html\.pl-reduced-motion\.pl-motion-v4/);
 assert.doesNotMatch(script,/localStorage|sessionStorage|state\.cash\s*=/);
});
