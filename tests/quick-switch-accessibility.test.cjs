'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','quick-switch.js'),'utf8');
function harness(){
 const state={started:true,cash:5000,actions:40,businesses:[{type:'coffee',name:'Sunrise Coffee'}]};
 const nodes=new Map(),handlers=new Map(),documentHandlers=new Map();
 let overlay,closeNode,underlyingClose=0;
 const document={readyState:'complete',activeElement:null,body:null};
 function node(tag){
  const el={tag,hidden:false,value:'',textContent:'',innerHTML:'',dataset:{},
    children:[],events:new Map(),
    classList:{add(){},remove(){}},
    addEventListener(name,fn){this.events.set(name,fn)},
    append(...nodes){this.children.push(...nodes)},
    appendChild(child){this.children.push(child);return child},
    prepend(child){this.children.unshift(child)},
    replaceChildren(...children){this.children=[...children]},
    querySelector(selector){
     if(selector==='.pl-switch-close')return closeNode;
     if(selector==='.selected')return this.children.find(x=>x.className==='selected')||null;
     return null;
    },
    querySelectorAll(selector){
     if(selector.startsWith('button:not([disabled])'))return[closeNode,nodes.get('input'),...nodes.get('results').children];
     return[];
    },
    contains(value){return value===closeNode||value===nodes.get('input')||nodes.get('results').children.includes(value)},
    focus(){document.activeElement=this},
    remove(){}
  };
  return el;
 }
 document.body=node('body');
 document.createElement=tag=>node(tag);
 const input=node('input'),results=node('div');
 nodes.set('input',input);nodes.set('results',results);
 closeNode=node('button');
 const trigger=node('button');trigger.focus();
 document.getElementById=id=>{
  if(id==='gameScreen')return{classList:{contains:name=>name==='active'}};
  if(id==='plSwitchInput')return input;
  if(id==='plSwitchResults')return results;
  return null;
 };
 document.querySelector=()=>null;
 document.addEventListener=(name,callback)=>documentHandlers.set(name,callback);
 const window={
  state,ProfitLandsWorkspace:{ready:()=>true,views:[{id:'overview',name:'Overview'},{id:'businesses',name:'Businesses'}],show:()=>true},
  addEventListener:(name,callback,capture)=>handlers.set(name,{callback,capture})
 };
 const context=vm.createContext({window,document,console});
 new vm.Script(source,{filename:'quick-switch.js'}).runInContext(context);
 overlay=document.body.children.find(x=>x.id==='plQuickSwitch');
 if(!overlay)throw Error('Quick Switch overlay not constructed');
 // Simulate document-level Escape behavior of modal-dismiss.js.
 documentHandlers.set('keydown',e=>{if(e.key==='Escape')underlyingClose++});
 const fire=(key,opts={})=>{
  const e={key,target:document.activeElement,shiftKey:false,ctrlKey:false,metaKey:false,altKey:false,
   prevented:false,stopped:false,
   preventDefault(){this.prevented=true},stopPropagation(){this.stopped=true},...opts};
  const registration=handlers.get('keydown');
  if(!registration?.capture)throw Error('Quick Switch needs capture-phase key handling');
  registration.callback(e);
  if(!e.stopped)documentHandlers.get('keydown')?.(e);
  return e;
 };
 return{api:window.ProfitLandsQuickSwitch,window,state,overlay,closeNode,results,input,trigger,
  fire,document,getUnderlyingCloses:()=>underlyingClose};
}
test('Escape closes only Quick Switch, not an underlying modal, and restores focus',()=>{
 const h=harness(),before={cash:h.state.cash,actions:h.state.actions};
 assert.equal(h.api.open(),true);
 assert.equal(h.overlay.hidden,false);
 const e=h.fire('Escape');
 assert.ok(e.prevented&&e.stopped,'document-level modal handler must not receive Escape');
 assert.equal(h.overlay.hidden,true);
 assert.equal(h.getUnderlyingCloses(),0);
 assert.equal(h.document.activeElement,h.trigger,'previously focused control restored');
 assert.equal(h.state.cash,before.cash);
 assert.equal(h.state.actions,before.actions);
});
test('Tab and Shift+Tab stay inside the open Quick Switch dialog',()=>{
 const h=harness();h.api.open();
 const options=[h.closeNode,h.input,...h.results.children];
 const last=options.at(-1);
 assert.ok(last);
 last.focus();
 const tab=h.fire('Tab');
 assert.equal(tab.prevented,true);
 assert.equal(h.document.activeElement,h.closeNode);
 h.closeNode.focus();
 const shift=h.fire('Tab',{shiftKey:true});
 assert.equal(shift.prevented,true);
 assert.equal(h.document.activeElement,last);
});
test('Ctrl+K toggles Quick Switch and does not change game progress',()=>{
 const h=harness();
 const start=JSON.stringify(h.state);
 const first=h.fire('k',{ctrlKey:true});
 assert.ok(first.prevented);
 assert.equal(h.overlay.hidden,false);
 const second=h.fire('k',{ctrlKey:true});
 assert.ok(second.prevented);
 assert.equal(h.overlay.hidden,true);
 assert.equal(JSON.stringify(h.state),start);
});
