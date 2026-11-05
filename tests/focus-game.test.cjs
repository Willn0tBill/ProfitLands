'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const script=fs.readFileSync(path.join(root,'focus-game.js'),'utf8');
const css=fs.readFileSync(path.join(root,'focus-game.css'),'utf8');

function fake({fullscreen=true,active=false,askedBefore=false}={}){
 const ids=new Map(),observers=[],events={},docEvents={};
 let storage=askedBefore?'1':null;
 function node(tag='div'){
  const set=new Set(),actions={},children=[];
  const x={tag,children,attributes:{},textContent:'',hidden:false,
   classList:{add:v=>set.add(v),remove:v=>set.delete(v),
    contains:v=>set.has(v),toggle:(v,b)=>{const result=b===undefined?!set.has(v):!!b;
     if(result)set.add(v);else set.delete(v);return result}},
   setAttribute:(k,v)=>{x.attributes[k]=String(v)},
   append(...items){for(const item of items)x.appendChild(item)},
   appendChild(item){children.push(item);item.parent=x;return item},
   prepend(item){children.unshift(item);item.parent=x;return item},
   addEventListener:(k,fn)=>{actions[k]=fn},
   click(){actions.click?.()},
   focus(){x.focused=true},
   closest(selector){return null},
   querySelector(selector){return x.children.find(c=>selector==='h2'&&c.tag==='h2')||null}
  };
  Object.defineProperty(x,'id',{get:()=>x._id||'',set:v=>{x._id=v;ids.set(v,x)}});
  Object.defineProperty(x,'className',{get:()=>[...set].join(' '),
   set:v=>{set.clear();String(v).split(/\s+/).filter(Boolean).forEach(z=>set.add(z))}});
  return x;
 }
 const body=node('body'),rootElement=node('html'),screen=node('section'),hud=node('div'),head=node('div'),controls=node('div');
 screen.id='gameScreen';
 if(active)screen.classList.add('active');
 head.className='game-head';hud.className='game-hud';controls.className='game-controls';
 head.appendChild(controls);
 screen.querySelector=selector=>{
  if(selector==='.pl-workspace-hud .game-head')return head;
  if(selector==='.pl-workspace-hud .game-hud')return hud;
  return null;
 };
 head.querySelector=selector=>selector==='.game-controls'?controls:null;
 if(fullscreen)rootElement.requestFullscreen=async()=>{doc.fullscreenElement=rootElement};
 const doc={body,readyState:'complete',documentElement:rootElement,fullscreenElement:null,
  exitFullscreen:async()=>{doc.fullscreenElement=null},
  getElementById:id=>ids.get(id)||null,
  createElement:node,
  addEventListener:(type,fn)=>{docEvents[type]=fn}
 };
 class MutationObserver{
  constructor(fn){this.fn=fn;observers.push(this)}
  observe(target,opt){this.target=target;this.options=opt}
 }
 const win={addEventListener:(type,fn)=>{events[type]=fn}};
 const sessionStorage={getItem:()=>storage,setItem:(key,val)=>{storage=val}};
 vm.runInNewContext(script,{window:win,document:doc,MutationObserver,sessionStorage,console});
 return {body,doc,screen,hud,head,controls,ids,events,docEvents,observers,
  get storage(){return storage},api:win.ProfitLandsFocus};
}
test('game entry starts with a compact action menu, not duplicate HUD buttons',()=>{
 const h=fake();
 assert.equal(h.api.diagnostics().initialized,true);
 assert.equal(h.ids.get('plGameMenu').textContent,'Menu');
 assert.equal(h.controls.id,'plGameControls');
 assert.equal(h.ids.get('plGameMenu').attributes['aria-expanded'],'false');
 assert.equal(h.hud.classList.contains('pl-focus-menu-open'),false);
 h.ids.get('plGameMenu').click();
 assert.equal(h.hud.classList.contains('pl-focus-menu-open'),true);
 assert.equal(h.ids.get('plGameMenu').attributes['aria-expanded'],'true');
 h.ids.get('plGameMenu').click();
 assert.equal(h.hud.classList.contains('pl-focus-menu-open'),false);
});
test('a new playable game explicitly offers optional fullscreen',()=>{
 const h=fake();
 h.screen.classList.add('active');
 h.observers[0].fn();
 assert.equal(h.body.classList.contains('pl-focus-playing'),true);
 assert.equal(h.api.diagnostics().dialogVisible,true);
 assert.equal(h.ids.get('plFocusPrompt').attributes['aria-modal'],'true');
 h.ids.get('plFocusStay').click();
 assert.equal(h.api.diagnostics().dialogVisible,false);
 assert.equal(h.storage,'1');
 h.observers[0].fn();
 assert.equal(h.api.diagnostics().dialogVisible,false);
});
test('fullscreen is only requested by the user and may be exited again',async()=>{
 const h=fake({active:true});
 assert.equal(h.doc.fullscreenElement,null);
 assert.equal(h.api.diagnostics().dialogVisible,true);
 assert.equal(await h.api.fullscreen(),true);
 assert.equal(h.doc.fullscreenElement,h.doc.documentElement);
 assert.equal(h.api.diagnostics().dialogVisible,false);
 assert.equal(h.ids.get('plFullscreenToggle').textContent,'Exit fullscreen');
 assert.equal(await h.api.fullscreen(),true);
 assert.equal(h.doc.fullscreenElement,null);
 assert.equal(h.ids.get('plFullscreenToggle').textContent,'Enter fullscreen');
});
test('unsupported fullscreen gracefully keeps compact gameplay without a blocking dialog',()=>{
 const h=fake({fullscreen:false,active:true});
 assert.equal(h.api.diagnostics().fullscreenAvailable,false);
 assert.equal(h.api.diagnostics().dialogVisible,false);
 assert.equal(h.body.classList.contains('pl-focus-playing'),true);
 assert.equal(h.ids.get('plFullscreenToggle'),undefined);
});
test('session opt-out and returning to setup do not prompt repeatedly',()=>{
 const h=fake({active:true,askedBefore:true});
 assert.equal(h.api.diagnostics().dialogVisible,false);
 h.ids.get('plGameMenu').click();
 h.screen.classList.remove('active');
 h.observers[0].fn();
 assert.equal(h.hud.classList.contains('pl-focus-menu-open'),false);
 assert.equal(h.body.classList.contains('pl-focus-playing'),false);
});
test('production styles hide the redundant website topbar and fit status into a tight strip',()=>{
 assert.match(css,/\.app-shell>\.topbar\{\s*display:none!important/);
 assert.match(css,/\.stats-grid\{\s*display:grid!important;grid-template-columns:repeat\(4/);
 assert.match(css,/\.pl-focus-menu-open \.game-controls\{/);
 assert.match(css,/\.modal \.modal-card button\.modal-close/);
 assert.match(css,/position:absolute!important/);
 assert.match(css,/@media\(max-width:760px\)/);
 const html=fs.readFileSync(path.join(root,'play/index.html'),'utf8');
 assert.match(html,/focus-game\.css\?v=focus01/);
 assert.match(html,/focus-game\.js\?v=focus01/);
 assert.match(html,/modal-dismiss\.js\?v=close02/);
 assert.match(html,/game-motion-v2\.js\?v=motion04/);
});
