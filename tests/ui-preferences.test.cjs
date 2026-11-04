'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const script=fs.readFileSync(path.join(__dirname,'..','ui-preferences.js'),'utf8');
const KEY='profitlands-ui-preferences-v1';
function setup(initial={}){
 const store=new Map([['profitlands-v2','valuable-empire'],[KEY,JSON.stringify(initial)]]);
 const classes=new Set();
 const inputNames=['reducedMotion','compactDisplay','highContrast'];
 const inputs=new Map(inputNames.map(name=>[name,{checked:false,events:{},addEventListener(kind,cb){this.events[kind]=cb}}]));
 const saved={textContent:''};
 const reset={events:{},addEventListener(kind,cb){this.events[kind]=cb}};
 const listeners={};
 const document={
  readyState:'complete',
  documentElement:{classList:{toggle(key,enabled){if(enabled)classes.add(key);else classes.delete(key)}}},
  querySelector(selector){const match=selector.match(/data-preference="([^"]+)"/);return match?inputs.get(match[1]):null},
  getElementById(id){return id==='preferencesSaved'?saved:id==='resetPreferences'?reset:null},
 };
 const localStorage={
  getItem:key=>store.get(key)??null,
  setItem:(key,value)=>store.set(key,String(value)),
  removeItem:key=>store.delete(key)
 };
 const window={addEventListener:(kind,callback)=>{listeners[kind]=callback}};
 vm.runInNewContext(script,{document,localStorage,window,console});
 return {window,store,classes,inputs,reset,listeners,saved};
}
test('display preferences affect only UI classes and never rewrite an empire save',()=>{
 const h=setup({reducedMotion:true});
 assert.equal(h.inputs.get('reducedMotion').checked,true);
 assert.equal(h.classes.has('pl-reduced-motion'),true);
 h.inputs.get('compactDisplay').checked=true;
 h.inputs.get('compactDisplay').events.change();
 assert.equal(h.classes.has('pl-compact'),true);
 assert.equal(JSON.parse(h.store.get(KEY)).compactDisplay,true);
 assert.equal(h.store.get('profitlands-v2'),'valuable-empire');
});
test('settings changed in another tab synchronize controls and visual state',()=>{
 const h=setup();
 h.store.set(KEY,JSON.stringify({reducedMotion:true,compactDisplay:true,highContrast:true}));
 h.listeners.storage({key:KEY});
 for(const input of h.inputs.values())assert.equal(input.checked,true);
 for(const cls of ['pl-reduced-motion','pl-compact','pl-contrast'])assert.equal(h.classes.has(cls),true);
 assert.match(h.saved.textContent,/another tab/);
 assert.equal(h.store.get('profitlands-v2'),'valuable-empire');
});
test('preference reset updates every control without touching game progress',()=>{
 const h=setup({reducedMotion:true,compactDisplay:true,highContrast:true});
 h.reset.events.click();
 for(const input of h.inputs.values())assert.equal(input.checked,false);
 for(const cls of ['pl-reduced-motion','pl-compact','pl-contrast'])assert.equal(h.classes.has(cls),false);
 assert.equal(h.store.has(KEY),false);
 assert.equal(h.store.get('profitlands-v2'),'valuable-empire');
});
