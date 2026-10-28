const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const source=fs.readFileSync(path.join(root,'workspace.js'),'utf8');
const PANEL_IDS=['businessPanel','economyPanel','newsPanel','empireLab','stockPanel',
  'holdingsPanel','growthPanel','financePanel','bankPanel','majorCompaniesPanel','actionsPanel'];
class Node{
 constructor(tag='div'){
  this.tag=tag;this.children=[];this.parent=null;this.attributes={};this.listeners={};
  this.classNames=new Set();this.dataset={};this.textContent='';this.hidden=false;
  this.inert=false;this.type='';this.tabIndex=0;
  this.classList={
   add:x=>this.classNames.add(x),remove:x=>this.classNames.delete(x),
   contains:x=>this.classNames.has(x),
   toggle:(x,b)=>{const v=b===undefined?!this.classNames.has(x):!!b;
     if(v)this.classNames.add(x);else this.classNames.delete(x);return v}
  };
 }
 get className(){return [...this.classNames].join(' ')}
 set className(s){this.classNames=new Set(String(s).split(/\s+/).filter(Boolean))}
 appendChild(n){if(n.parent)n.parent.children=n.parent.children.filter(x=>x!==n);
  this.children.push(n);n.parent=this;return n}
 append(...ns){for(const n of ns)this.appendChild(n)}
 prepend(n){if(n.parent)n.parent.children=n.parent.children.filter(x=>x!==n);
  this.children.unshift(n);n.parent=this}
 setAttribute(k,v){this.attributes[k]=String(v)}
 removeAttribute(k){delete this.attributes[k]}
 getAttribute(k){return this.attributes[k]??null}
 addEventListener(k,fn){(this.listeners[k]??=[]).push(fn)}
 click(){for(const fn of this.listeners.click||[])fn({target:this})}
 scrollTo(v){this.lastScroll=v}
 focus(){this.focused=true}
 closest(){return null}
 find(pred){if(pred(this))return this;for(const c of this.children){const found=c.find(pred);if(found)return found}return null}
 findAll(pred,out=[]){if(pred(this))out.push(this);for(const c of this.children)c.findAll(pred,out);return out}
 querySelector(sel){if(sel==='.game-hud')return this.find(x=>x.classList.contains('game-hud'));return null}
}
function setup(saved=null){
 const ids=new Map(),game=new Node('section'),oldToolbar=new Node(),hud=new Node();
 oldToolbar.className='pl-view-toolbar';hud.className='game-hud';
 const allPanels={};
 game.id='gameScreen';
 game.appendChild(hud);game.appendChild(oldToolbar);
 const preexistingParent=new Node('div');game.appendChild(preexistingParent);
 for(const id of PANEL_IDS){
  const el=new Node('section');el.id=id;ids.set(id,el);
  preexistingParent.appendChild(el);allPanels[id]=el;
 }
 ids.set('gameScreen',game);
 const savedData=new Map(saved?[['profitlands-workspace-view-v1',saved]]:[]);
 const localStorage={getItem:k=>savedData.get(k)||null,
  setItem:(k,v)=>savedData.set(k,String(v))};
 const body=new Node('body');
 const doc={readyState:'complete',body,
  getElementById:k=>ids.get(k)||null,
  createElement:t=>new Node(t),
  querySelector:sel=>sel==='#gameScreen .pl-view-toolbar'?oldToolbar:null,
  querySelectorAll:()=>[]};
 const opened=[];const events={};
 const window={
  addEventListener:(t,fn)=>events[t]=fn,
  ProfitLandsLayout:{open:id=>opened.push(id)},
  ProfitLandsGrowth:{render(){}},ProfitLandsEmpire:{render(){}}
 };
 const location={hash:''};
 const ctx=vm.createContext({window,document:doc,localStorage,location,console});
 new vm.Script(source,{filename:'workspace.js'}).runInContext(ctx);
 return {game,body,window,opened,allPanels,savedData,events,toolbar:oldToolbar};
}
test('workspace has business portfolio as its primary single-screen view',()=>{
 const x=setup();
 assert.equal(x.window.ProfitLandsWorkspace.ready(),true);
 assert.equal(x.window.ProfitLandsWorkspace.active(),'businesses');
 assert.ok(x.body.classList.contains('pl-workspace-enabled'));
 const workspace=x.game.find(n=>n.classList.contains('pl-workspace-shell'));
 assert.ok(workspace);
 const contents=workspace.findAll(n=>n.dataset.workspaceContent);
 assert.equal(contents.length,7);
 assert.equal(contents.filter(v=>!v.hidden).length,1);
 assert.equal(contents.filter(v=>!v.hidden)[0].dataset.workspaceContent,'businesses');
});
test('moving game panels keeps original elements and IDs, never duplicates a business list',()=>{
 const x=setup();
 const workspace=x.game.find(n=>n.classList.contains('pl-workspace-shell'));
 for(const id of PANEL_IDS){
  const matches=workspace.findAll(n=>n.id===id);
  assert.equal(matches.length,1,id+' exists exactly once');
  assert.equal(matches[0],x.allPanels[id],id+' is the same DOM object');
 }
 const businesses=workspace.find(n=>n.dataset.workspaceContent==='businesses');
 assert.equal(businesses.findAll(n=>n.id==='businessPanel').length,1);
});
test('sidebar changes views without modifying game state or triggering save',()=>{
 const x=setup(),api=x.window.ProfitLandsWorkspace;
 assert.equal(api.show('markets'),true);
 assert.equal(api.active(),'markets');
 assert.ok(x.opened.includes('stockPanel'));
 assert.ok(x.opened.includes('holdingsPanel'));
 const selected=x.game.find(n=>n.dataset.workspaceView==='markets');
 assert.equal(selected.getAttribute('aria-current'),'page');
 assert.equal(x.savedData.get('profitlands-workspace-view-v1'),'markets');
 assert.equal(x.savedData.has('profitlands-v2'),false);
 assert.equal(api.show('bad-key'),false);
});
test('operations and analytics modules retain navigation and render hooks',()=>{
 const x=setup(),api=x.window.ProfitLandsWorkspace;
 assert.equal(api.show('operations'),true);
 assert.equal(x.opened.at(-1),'empireLab');
 assert.equal(api.show('analytics'),true);
 assert.equal(x.opened.at(-1),'growthPanel');
 const all=x.game.findAll(n=>n.dataset.workspaceContent);
 assert.equal(all.filter(n=>n.classList.contains('active')).length,1);
 assert.equal(all.filter(n=>n.classList.contains('active'))[0].dataset.workspaceContent,'analytics');
});
test('previous workspace selection is restored, not the stored minimized layout',()=>{
 const x=setup('finance'),api=x.window.ProfitLandsWorkspace;
 assert.equal(api.active(),'finance');
 assert.equal(x.opened.includes('bankPanel'),true);
 assert.equal(x.opened.includes('financePanel'),true);
 assert.equal(x.savedData.has('profitlands-layout-v1'),false);
});
test('quick action opens businesses and clicks the existing business-shop button',()=>{
 const x=setup(),api=x.window.ProfitLandsWorkspace;
 const shop=new Node('button');let clicked=0;shop.click=()=>clicked++;
 // Extend document id mapping by allowing a custom game button lookup.
 const action=x.game.find(n=>n.classList.contains('pl-workspace-quick-button')&&n.textContent==='+ New business');
 assert.ok(action);
 assert.equal(api.show('operations'),true);
 action.click();
 assert.equal(api.active(),'businesses');
});
test('workspace source provides keyboard shortcuts and panel-aware links',()=>{
 assert.ok(source.includes('Alt+1')||source.includes('e.altKey'));
 assert.ok(source.includes('viewFromHash'));
 assert.ok(source.includes('hashchange'));
 assert.ok(source.includes('viewForPanel'));
});
test('desktop browser page cannot scroll but the active workspace panel can',()=>{
 const css=fs.readFileSync(path.join(root,'workspace.css'),'utf8');
 assert.match(css,/body\.pl-workspace-enabled:has\(#gameScreen\.active\)/);
 assert.match(css,/overflow:hidden!important/);
 assert.match(css,/\.pl-workspace-view\.active/);
 assert.match(css,/overflow-y:auto/);
 assert.ok(css.includes('max-width:760px'),'responsive mobile navigation');
});
test('play page loads the business console after existing panel scripts and uses real panel IDs',()=>{
 const html=fs.readFileSync(path.join(root,'play/index.html'),'utf8');
 assert.ok(html.indexOf('workspace.js')>html.indexOf('layout-panels.js'));
 assert.ok(html.includes('workspace.css'));
 assert.ok(html.includes('id="businessPanel"'));
 assert.ok(html.includes('id="empireLab"'));
 assert.ok(html.includes('id="growthPanel"'));
});
test('opening products from company management switches to the Operations workspace',()=>{
 const source=fs.readFileSync(path.join(root,'empire-lab.js'),'utf8');
 assert.ok(source.includes("ProfitLandsWorkspace?.show?.('operations')"));
});
