'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const script=fs.readFileSync(path.join(root,'ui-preferences.js'),'utf8');
const KEY='profitlands-ui-preferences-v1';
const COLOR='profitlands-colorway-v1';
function boot(current){
  const saved=new Map([['profitlands-v2','saved empire'],[KEY,JSON.stringify({highContrast:true})]]);
  if(current)saved.set(COLOR,current);
  const classes=new Set(),listeners={},inputs={};
  const colorway={value:'',events:{},addEventListener(type,fn){this.events[type]=fn}};
  const reset={events:{},addEventListener(type,fn){this.events[type]=fn}};
  const status={textContent:''};
  const document={
    readyState:'complete',
    documentElement:{classList:{toggle(name,yes){if(yes)classes.add(name);else classes.delete(name)}}},
    querySelector(selector){
      if(selector==='[data-colorway]')return colorway;
      const name=selector.match(/data-preference="([^"]+)"/)?.[1];
      if(!name)return null;
      return inputs[name]??(inputs[name]={checked:false,events:{},addEventListener(type,fn){this.events[type]=fn}});
    },
    getElementById(id){return id==='preferencesSaved'?status:id==='resetPreferences'?reset:null}
  };
  const localStorage={
    getItem:key=>saved.get(key)??null,
    setItem:(key,value)=>saved.set(key,String(value)),
    removeItem:key=>saved.delete(key)
  };
  const window={addEventListener(type,fn){listeners[type]=fn}};
  vm.runInNewContext(script,{window,document,localStorage,console});
  return{saved,classes,inputs,colorway,status,listeners,reset,window};
}
test('classic is the default and it preserves previous UI preferences and game save',()=>{
  const x=boot();
  assert.equal(x.colorway.value,'classic');
  assert.equal(x.classes.has('pl-colorway-vivid'),false);
  assert.equal(x.classes.has('pl-contrast'),true);
  assert.equal(x.saved.get('profitlands-v2'),'saved empire');
});
test('vivid is opt-in and can be changed without affecting game data',()=>{
  const x=boot();
  x.colorway.value='vivid';
  x.colorway.events.change();
  assert.equal(x.saved.get(COLOR),'vivid');
  assert.equal(x.classes.has('pl-colorway-vivid'),true);
  assert.equal(x.window.ProfitLandsPreferences.colorway(),'vivid');
  assert.equal(x.saved.get('profitlands-v2'),'saved empire');
});
test('palette preference follows changes from another tab',()=>{
  const x=boot('vivid');
  x.saved.set(COLOR,'classic');
  x.listeners.storage({key:COLOR});
  assert.equal(x.classes.has('pl-colorway-vivid'),false);
  assert.equal(x.colorway.value,'classic');
});
test('reset returns to classic without deleting game save',()=>{
  const x=boot('vivid');
  x.reset.events.click();
  assert.equal(x.saved.has(COLOR),false);
  assert.equal(x.classes.has('pl-colorway-vivid'),false);
  assert.equal(x.colorway.value,'classic');
  assert.equal(x.saved.get('profitlands-v2'),'saved empire');
});
test('theme CSS loads last on game and does not remove original arcade stylesheet',()=>{
  const html=fs.readFileSync(path.join(root,'play','index.html'),'utf8');
  const settings=fs.readFileSync(path.join(root,'settings','index.html'),'utf8');
  assert.match(html,/game-experience\.css/);
  assert.match(html,/focus-game\.css/);
  assert.ok(html.lastIndexOf('palette-consistency.css')>html.lastIndexOf('game-experience.css'));
  assert.match(settings,/id="plColorway"/);
  assert.match(settings,/data-colorway/);
  const css=fs.readFileSync(path.join(root,'palette-consistency.css'),'utf8');
  assert.match(css,/html:not\(\.pl-colorway-vivid\)/);
});
