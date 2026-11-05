'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const script=fs.readFileSync(path.join(__dirname,'..','appearance-transfer.js'),'utf8');
const KEY='profitlands-ui-preferences-v1';
const OLD='https://willn0tbill.github.io';
const NEW='https://profitlands.winotbill.workers.dev';

function harness(origin,search='',initial={}){
  const storage=new Map([
    [KEY,JSON.stringify(initial)],
    ['profitlands-v2','valuable empire saved here'],
    ['profitlands-local-owner','player-account']
  ]);
  const listeners={};
  const status={textContent:''};
  const actions={appendChild(button){this.button=button}};
  const inputs=Object.fromEntries(['reducedMotion','compactDisplay','highContrast'].map(name=>[
    name,{checked:false,dispatchEvent(){storage.set(KEY,JSON.stringify(Object.fromEntries(
      Object.entries(inputs).map(([key,value])=>[key,value.checked])
    )))}}
  ]));
  const document={
    readyState:'complete',
    getElementById(id){return id==='preferencesSaved'?status:id==='restorePreviousAppearance'?actions.button:null},
    querySelector(selector){
      if(selector==='.pl-settings-section .pl-settings-actions')return actions;
      const name=selector.match(/^\[data-preference="(.+)"\]$/)?.[1];
      return name?inputs[name]:null;
    },
    createElement(){return{events:{},addEventListener(type,fn){this.events[type]=fn}}}
  };
  const window={
    location:{origin,search},
    addEventListener(type,fn){listeners[type]=fn},
    close(){this.closed=true}
  };
  const localStorage={
    getItem(key){return storage.get(key)??null},
    setItem(key,value){storage.set(key,String(value))}
  };
  const start=()=>vm.runInNewContext(script,{window,document,localStorage,URLSearchParams,Event:class{constructor(type){this.type=type}}});
  return{start,window,document,storage,status,listeners,actions,inputs};
}
test('Cloudflare displays opt-in recovery without touching player saves',()=>{
  const h=harness(NEW);
  h.window.open=()=>({postMessage(){}});
  h.start();
  assert.equal(h.actions.button.textContent,'Restore previous display settings');
  assert.equal(h.storage.get('profitlands-v2'),'valuable empire saved here');
  assert.equal(JSON.parse(h.storage.get(KEY)).highContrast,undefined);
});
test('user-requested transfer copies only safe appearance flags and rejects other origins',()=>{
  const target=harness(NEW,'',{reducedMotion:false,compactDisplay:false,highContrast:false});
  const popup={postMessage(){}};
  target.window.open=()=>popup;
  target.start();
  target.actions.button.events.click();
  target.listeners.message({origin:'https://evil.example',source:popup,data:{
    type:'profitlands:display-offer-v1',preferences:{highContrast:true}
  }});
  assert.equal(JSON.parse(target.storage.get(KEY)).highContrast,false);
  const origin=harness(OLD,'?pl-appearance-transfer=1',{
    reducedMotion:true,compactDisplay:true,highContrast:true,password:'DO_NOT_TRANSFER'
  });
  const delivered=[];
  origin.window.opener={postMessage(data,originName){delivered.push({data,originName})}};
  origin.start();
  assert.equal(delivered.length,1);
  assert.equal(delivered[0].originName,NEW);
  assert.deepEqual(Object.keys(delivered[0].data.preferences).sort(),['compactDisplay','highContrast','reducedMotion']);
  target.listeners.message({origin:OLD,source:popup,data:delivered[0].data});
  assert.equal(JSON.parse(target.storage.get(KEY)).highContrast,true);
  assert.equal(JSON.parse(target.storage.get(KEY)).reducedMotion,true);
  assert.equal(target.storage.get('profitlands-v2'),'valuable empire saved here');
  assert.equal(target.storage.get('profitlands-local-owner'),'player-account');
  assert.match(target.status.textContent,/restored/);
});
test('old site does not send preferences without the explicit transfer query',()=>{
  const old=harness(OLD);
  let sent=0;
  old.window.opener={postMessage(){sent++}};
  old.start();
  assert.equal(sent,0);
});
