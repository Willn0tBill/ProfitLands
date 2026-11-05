'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'modal-dismiss.js'),'utf8');
const motion=fs.readFileSync(path.join(root,'game-motion-v2.js'),'utf8');
const css=fs.readFileSync(path.join(root,'focus-game.css'),'utf8');

class Element{
 constructor(cls='',id=''){
  const names=new Set(cls.split(' ').filter(Boolean));
  this.classes=names;this.id=id;this.parent=null;
  this.classList={add:v=>names.add(v),remove:v=>names.delete(v),contains:v=>names.has(v)};
 }
 closest(selector){
  if(selector==='.modal')return this.classes.has('modal')?this:this.parent?.closest(selector)||null;
  if(selector==='button.modal-close,button[data-close]')return this.classes.has('modal-close')?this:null;
  return null;
 }
}
function harness(){
 const handlers={};
 const document={
  addEventListener:(kind,fn,capture)=>{handlers[kind]=fn;handlers[kind+'Capture']=capture},
  querySelectorAll:selector=>selector==='.modal:not(.hidden)'?
   visible.filter(x=>!x.classList.contains('hidden')):[]
 };
 const visible=[];
 const win={};
 vm.runInNewContext(source,{document,window:win,Element,console});
 function modal(id='businessModal'){
  const m=new Element('modal',id);
  visible.push(m);
  const x=new Element('modal-close');x.parent=m;
  return {m,x};
 }
 function click(target){
  const event={target,defaultPrevented:false,stopped:false,
   preventDefault(){this.defaultPrevented=true},
   stopPropagation(){this.stopped=true}};
  handlers.click(event);
  return event;
 }
 return {document,visible,win,handlers,modal,click};
}
test('modal X closes the intended active dialog in capture phase',()=>{
 const h=harness(),{m,x}=h.modal('manageModal');
 const event=h.click(x);
 assert.equal(h.handlers.clickCapture,true);
 assert.equal(m.classList.contains('hidden'),true);
 assert.equal(event.defaultPrevented,true);
 assert.equal(event.stopped,true);
});
test('backdrop dismisses an ordinary modal but not a financial recovery dialog',()=>{
 const h=harness(),a=h.modal('businessModal'),b=h.modal('economyModal');
 h.click(a.m);
 assert.equal(a.m.classList.contains('hidden'),true);
 h.click(b.m);
 assert.equal(b.m.classList.contains('hidden'),false);
 h.click(b.x);
 assert.equal(b.m.classList.contains('hidden'),false);
});
test('Escape dismisses the top visible dialog, preserving protected recovery flow',()=>{
 const h=harness(),a=h.modal('tradeModal'),b=h.modal('settingsModal');
 const event={key:'Escape',preventDefault(){this.prevented=true}};
 h.handlers.keydown(event);
 assert.equal(b.m.classList.contains('hidden'),true);
 assert.equal(a.m.classList.contains('hidden'),false);
 h.handlers.keydown(event);
 assert.equal(a.m.classList.contains('hidden'),true);
 assert.equal(event.prevented,true);
});
test('ripple animation explicitly excludes modal X controls from position changes',()=>{
 assert.match(motion,/button\?\.matches\?\.\('\.modal-close,\[data-close\]/);
 assert.match(css,/button\.modal-close/);
 assert.match(css,/position:absolute!important/);
 assert.match(css,/transform:none!important/);
 const html=fs.readFileSync(path.join(root,'play/index.html'),'utf8');
 for(const name of ['businessModal','manageModal','tradeModal','endGameModal','settingsModal']){
  assert.ok(html.includes('data-close="'+name+'"'));
 }
});
