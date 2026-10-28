const{test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.join(__dirname,'..');
const source=fs.readFileSync(path.join(root,'layout-panels.js'),'utf8');

class FakeElement{
 constructor(tag='div',classes=[]){
  this.tag=tag;this.children=[];this.parent=null;this.classNames=new Set(classes);
  this.attributes={};this.hidden=false;this.listeners={};this.textContent='';this.id='';
  this.classList={
   contains:x=>this.classNames.has(x),
   add:x=>this.classNames.add(x),
   remove:x=>this.classNames.delete(x),
   toggle:(x,value)=>{
    const on=value===undefined?!this.classNames.has(x):Boolean(value);
    if(on)this.classNames.add(x);else this.classNames.delete(x);
    return on;
   }
  };
 }
 appendChild(node){
  if(node.parent)node.parent.children=node.parent.children.filter(n=>n!==node);
  node.parent=this;this.children.push(node);return node;
 }
 prepend(node){node.parent=this;this.children.unshift(node);return node}
 after(node){
  if(!this.parent)return;
  const group=this.parent.children,idx=group.indexOf(this);
  node.parent=this.parent;group.splice(idx+1,0,node);
 }
 setAttribute(k,v){this.attributes[k]=String(v)}
 getAttribute(k){return this.attributes[k]??null}
 addEventListener(event,handler){(this.listeners[event]??=[]).push(handler)}
 click(){for(const fn of this.listeners.click||[])fn({target:this})}
 querySelector(sel){
  if(sel===':scope > .panel-head')return this.children.find(x=>x.classList.contains('panel-head'))||null;
  if(sel==='.panel-toggle')return this.descendant(x=>x.classList.contains('panel-toggle'));
  if(sel==='.panel-body')return this.descendant(x=>x.classList.contains('panel-body'));
  if(sel==='.modal-card')return this.descendant(x=>x.classList.contains('modal-card'));
  if(sel==='.modal-close')return this.descendant(x=>x.classList.contains('modal-close'));
  return null;
 }
 descendant(pred){
  for(const child of this.children){
   if(pred(child))return child;
   const found=child.descendant(pred);
   if(found)return found;
  }
  return null;
 }
}
function make(){
 const ids=new Map(),stored=new Map();
 const define=(id,node)=>{node.id=id;ids.set(id,node);return node};
 const hud=new FakeElement('section',['game-hud']);
 const controls=new FakeElement('div',['game-controls']);
 const dashboard=new FakeElement('div',['dashboard-grid']);
 hud.appendChild(controls);
 const panel=(id,legacy=false)=>{
  const root=define(id,new FakeElement('section',legacy?['panel','collapsible-panel']:['panel']));
  if(legacy&&['businessPanel','stockPanel'].includes(id))root.classList.add('open');
  const header=new FakeElement('div',['panel-head']);root.appendChild(header);
  if(legacy){
   const trigger=new FakeElement('button',['panel-toggle']);header.appendChild(trigger);
   root.appendChild(new FakeElement('div',['panel-body']));
   // Existing compact-panels.js handler fires before the new sync listener.
   trigger.addEventListener('click',()=>root.classList.toggle('open'));
  }else{
   const title=new FakeElement('h3');title.textContent=id;header.appendChild(title);
   const child=new FakeElement('div');root.appendChild(child);
  }
  dashboard.appendChild(root);
  return root;
 };
 const lab=panel('empireLab');
 const growth=panel('growthPanel');
 const econ=panel('economyPanel');
 const businesses=panel('businessPanel',true);
 const stocks=panel('stockPanel',true);
 const count=define('plLayoutCount',new FakeElement('span'));
 for(const id of ['plMinimizeAll','plExpandAll','plDefaultLayout'])define(id,new FakeElement('button'));
 const body=new FakeElement('body');
 const document={
  readyState:'complete',body,
  getElementById:id=>ids.get(id)||null,
  createElement:tag=>new FakeElement(tag),
  querySelector:sel=>sel==='#gameScreen .game-hud'?hud:sel==='#gameScreen .game-controls'?controls:null,
  querySelectorAll:()=>[]
 };
 const localStorage={getItem:key=>stored.get(key)||null,
  setItem:(key,value)=>stored.set(key,String(value)),
  removeItem:key=>stored.delete(key)};
 const window={addEventListener(){}};const location={hash:''};
 const ctx={document,window,localStorage,location,JSON,String,Array,Boolean,Map,console};
 vm.createContext(ctx);
 new vm.Script(source,{filename:'layout-panels.js'}).runInContext(ctx);
 return {layout:window.ProfitLandsLayout,ids,stored,hud,lab,growth,econ,businesses,stocks,count,body};
}
test('opens only the core dashboard, Businesses and Stocks by default',()=>{
 const x=make();
 assert.equal(x.layout.isOpen('dashboard'),true);
 assert.equal(x.layout.isOpen('businessPanel'),true);
 assert.equal(x.layout.isOpen('stockPanel'),true);
 for(const id of ['empireLab','growthPanel','economyPanel'])assert.equal(x.layout.isOpen(id),false,id);
 assert.ok(x.count.textContent.includes('3 of 6'));
});
test('minimized panels preserve all original elements and can be expanded',()=>{
 const x=make(),content=x.lab.children.find(c=>c.classList.contains('pl-panel-content'));
 assert.ok(content,'original body is wrapped in a collapsible container');
 assert.equal(content.hidden,true);
 assert.equal(x.lab.children[0].classList.contains('panel-head'),true);
 assert.ok(content.children.length>0,'content stays mounted');
 const button=x.lab.children[0].children.find(c=>c.classList.contains('pl-layout-toggle'));
 assert.equal(button.getAttribute('aria-expanded'),'false');
 button.click();
 assert.equal(content.hidden,false);
 assert.equal(button.getAttribute('aria-expanded'),'true');
 assert.equal(x.layout.isOpen('empireLab'),true);
});
test('bulk minimize, expand and default-layout actions are functional',()=>{
 const x=make();
 x.ids.get('plMinimizeAll').click();
 for(const id of ['dashboard','empireLab','growthPanel','economyPanel','businessPanel','stockPanel'])assert.equal(x.layout.isOpen(id),false);
 x.ids.get('plExpandAll').click();
 for(const id of ['dashboard','empireLab','growthPanel','economyPanel','businessPanel','stockPanel'])assert.equal(x.layout.isOpen(id),true);
 x.ids.get('plDefaultLayout').click();
 assert.equal(x.layout.isOpen('dashboard'),true);
 assert.equal(x.layout.isOpen('empireLab'),false);
 assert.equal(x.layout.isOpen('businessPanel'),true);
 assert.equal(x.stored.has('profitlands-layout-v1'),false);
});
test('legacy Businesses and Stocks toggles stay compatible with existing collapse logic',()=>{
 const x=make();
 const toggle=x.businesses.querySelector('.panel-toggle');
 toggle.click();
 assert.equal(x.layout.isOpen('businessPanel'),false);
 assert.equal(toggle.getAttribute('aria-expanded'),'false');
 assert.ok(x.stored.get('profitlands-layout-v1').includes('"businessPanel":false'));
 toggle.click();
 assert.equal(x.layout.isOpen('businessPanel'),true);
});
test('HUD minimizes only statistics, keeping its controls mounted',()=>{
 const x=make();
 x.layout.minimize('dashboard');
 assert.equal(x.hud.classList.contains('pl-panel-minimized'),true);
 assert.equal(x.hud.children.some(c=>c.classList.contains('game-controls')),true);
 x.layout.open('dashboard');
 assert.equal(x.hud.classList.contains('pl-panel-minimized'),false);
});
test('layout preferences never alter the empire save key',()=>{
 const x=make();
 x.layout.open('growthPanel');
 assert.ok(x.stored.has('profitlands-layout-v1'));
 assert.equal(x.stored.has('profitlands-v2'),false);
});
test('game HTML loads layout manager after existing panel toggle script',()=>{
 const html=fs.readFileSync(path.join(root,'play/index.html'),'utf8');
 assert.ok(html.includes('layout-panels.css'));
 assert.ok(html.indexOf('layout-panels.js')>html.indexOf('compact-panels.js'));
 for(const id of ['plMinimizeAll','plExpandAll','plDefaultLayout','empireLab','growthPanel','economyPanel','bankPanel']){
  assert.ok(html.includes('id="'+id+'"'),id+' is present');
 }
 assert.ok(html.includes('Jump to a section'));
});
test('branch operations open the minimized Empire Lab when navigating to a location',()=>{
 const script=fs.readFileSync(path.join(root,'empire-lab.js'),'utf8');
 assert.ok(script.includes("ProfitLandsLayout?.open?.('empireLab')"));
});
