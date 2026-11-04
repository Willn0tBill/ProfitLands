'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'economy-render.js'),'utf8');
function element(tag='div'){
 const handlers=new Map();
 const node={
   tag,hidden:false,isConnected:true,innerHTML:'',textContent:'',value:'',className:'',
   type:'',placeholder:'',autocomplete:'',style:{},dataset:{},attributes:new Map(),
   children:[],parentElement:null,handlers,
   setAttribute(name,value){this.attributes.set(name,String(value))},
   addEventListener(name,listener){
     if(!handlers.has(name))handlers.set(name,[]);
     handlers.get(name).push(listener);
   },
   append(...children){for(const child of children){this.children.push(child);child.parentElement=this}},
   appendChild(child){this.append(child);return child},
   insertBefore(child,ref){
     const pos=this.children.indexOf(ref);
     this.children.splice(pos<0?this.children.length:pos,0,child);
     child.parentElement=this;
   },
   contains(){return true},
   closest(){return null},
   remove(){}
 };
 return node;
}
function harness({businessCount=100,withHost=true}={}){
 const rootEl=element('section'),box=element('div');
 if(withHost)rootEl.appendChild(box);
 box.id='businessList';
 const document={
  getElementById:id=>id==='businessList'?box:null,
  createElement:tag=>element(tag),
  querySelectorAll:()=>[]
 };
 let profitCalls=0,opened=[],saves=0;
 const companies=Array.from({length:businessCount},(_,i)=>({
  type:i%2?'restaurant':'coffee',name:'Company '+i,
  level:1,popularity:55,chainCount:1,financialBalance:i*10,locations:[
   {id:'downtown',level:1,workers:3}
  ]
 }));
 const state={businesses:companies,stocks:{},property:0};
 const window={
  ProfitLandsEconomy:{RISK:{},LOCS:{}},
  businessDailyProfit:()=>{profitCalls++;return 100},
  openManage:i=>opened.push(i),
  render(){}
 };
 const ctx=vm.createContext({
  window,document,state,
  BUSINESS_TYPES:[
   {id:'coffee',name:'Coffee Shop',icon:'☕',cost:500},
   {id:'restaurant',name:'Restaurant',icon:'🍽',cost:2000}
  ],
  STOCKS:[],money:n=>'$'+Number(n).toFixed(2),
  setTimeout(){return 1}
 });
 new vm.Script(source,{filename:'economy-render.js'}).runInContext(ctx);
 // Verify portfolio event routing without opening the actual management modal.
 window.openManage=i=>opened.push(i);
 const getControls=()=>rootEl.children.find(x=>x.className==='pl-portfolio-controls');
 const trigger=(node,event,arg={})=>(node.handlers.get(event)||[]).forEach(fn=>fn(arg));
 return{box,state,window,rootEl,getControls,trigger,opened,profitCalls:()=>profitCalls,
  saves:()=>saves};
}
const cards=html=>(html.match(/data-business="/g)||[]).length;
test('large portfolios initially calculate and render only the first 36 companies',()=>{
 const h=harness({businessCount:100});
 h.window.renderBusinesses();
 assert.equal(cards(h.box.innerHTML),36);
 assert.equal(h.profitCalls(),36,'off-page companies must not be simulated just for cards');
 assert.match(h.getControls()._count.textContent,/Showing 36 of 100/);
 assert.equal(h.getControls()._more.hidden,false);
 assert.equal(h.getControls().children[0].children[0].value,'');
});
test('Show more preserves each original business index and loads the next window',()=>{
 const h=harness({businessCount:100});h.window.renderBusinesses();
 const controls=h.getControls();
 h.trigger(controls._more,'click');
 assert.equal(cards(h.box.innerHTML),72);
 assert.match(h.box.innerHTML,/data-business="71"/);
 assert.equal(h.profitCalls(),36+72);
 h.trigger(controls._more,'click');
 assert.equal(cards(h.box.innerHTML),100);
 assert.equal(controls._more.hidden,true);
 assert.equal(controls._more.disabled,true);
});
test('search preserves input object, filters by company and industry, and opens correct original index',()=>{
 const h=harness({businessCount:100});h.window.renderBusinesses();
 const controls=h.getControls(),input=controls.children[0].children[0];
 input.value='Company 74';h.trigger(input,'input');
 assert.equal(h.getControls(),controls,'input controls are never recreated during refresh');
 assert.equal(controls.children[0].children[0],input);
 assert.equal(cards(h.box.innerHTML),1);
 assert.match(h.box.innerHTML,/data-business="74"/);
 h.trigger(h.box,'click',{target:{closest:()=>({dataset:{business:'74'}})}});
 assert.deepEqual(h.opened,[74]);
 input.value='Restaurant';h.trigger(input,'input');
 assert.equal(cards(h.box.innerHTML),36,'industry filter still respects render window');
 assert.match(controls._count.textContent,/Showing 36 of 50/);
});
test('keyboard activation works, scripts cannot be injected through displayed company names',()=>{
 const h=harness({businessCount:3});
 h.state.businesses[0].name='<img src=x onerror=alert(1)>';
 h.window.renderBusinesses();
 assert.ok(!h.box.innerHTML.includes('<img'));
 assert.match(h.box.innerHTML,/&lt;img/);
 assert.match(h.box.innerHTML,/role="button" tabindex="0"/);
 let prevented=false;
 h.trigger(h.box,'keydown',{key:'Enter',target:{closest:()=>({dataset:{business:'2'}})},preventDefault:()=>prevented=true});
 assert.equal(prevented,true);
 assert.deepEqual(h.opened,[2]);
});
test('unchanged HTML is not replaced and save state is never modified by the portfolio UI',()=>{
 const h=harness({businessCount:80}),before=JSON.stringify(h.state);
 let writes=0,inner='';
 Object.defineProperty(h.box,'innerHTML',{get(){return inner},set(value){inner=value;writes++}});
 h.window.renderBusinesses();
 h.window.renderBusinesses();
 assert.equal(writes,1,'identical portfolio cards should not be rebuilt');
 assert.equal(h.getControls().hidden,false);
 assert.equal(JSON.stringify(h.state),before);
 assert.equal(h.saves(),0);
});
test('small portfolios keep all companies visible without noisy search controls',()=>{
 const h=harness({businessCount:8});
 h.window.renderBusinesses();
 assert.equal(cards(h.box.innerHTML),8);
 assert.equal(h.getControls().hidden,true);
});
test('portfolios without a parent fall back to all companies rather than hiding entries',()=>{
 const h=harness({businessCount:60,withHost:false});
 h.window.renderBusinesses();
 assert.equal(cards(h.box.innerHTML),60);
 assert.equal(h.getControls(),undefined);
});
test('performance cadence keeps half-second income ticks but skips hidden workspaces',()=>{
 const source=fs.readFileSync(path.join(root,'economy-system.js'),'utf8');
 const workspace=fs.readFileSync(path.join(root,'workspace.js'),'utf8');
 const html=fs.readFileSync(path.join(root,'play/index.html'),'utf8');
 assert.match(source,/setInterval\(tick,500\)/);
 assert.match(source,/settleIncome\(now\);\s+window\.ProfitLandsBalance\?\.tick\?\.\(now\)/);
 assert.match(source,/now-lastHudPaint>=1000/);
 assert.match(source,/activeView==='businesses'/);
 assert.match(source,/activeView==='finance'/);
 assert.match(workspace,/if\(id==='businesses'\)window\.renderBusinesses\?\.\(\)/);
 assert.match(workspace,/if\(id==='finance'\)window\.renderFinance\?\.\(\)/);
 assert.match(html,/portfolio-performance\.css/);
});

test('visible company cards share one economic snapshot instead of recomputing empire-wide factors',()=>{
 const h=harness({businessCount:100});
 let contextCalls=0;const used=[];
 h.window.ProfitLandsEconomy.profitFactors=()=>({snapshot:++contextCalls});
 h.window.businessDailyProfit=(business,factors)=>{
   used.push(factors?.snapshot);
   return 100;
 };
 h.window.renderBusinesses();
 assert.equal(contextCalls,1);
 assert.equal(used.length,36);
 assert.ok(used.every(x=>x===1));
 h.trigger(h.getControls()._more,'click');
 assert.equal(contextCalls,2);
 assert.equal(used.length,108);
 assert.ok(used.slice(36).every(x=>x===2));
});

test('portfolio sorting changes presentation only and keeps source indexes intact',()=>{
 const h=harness({businessCount:45}),before=JSON.stringify(h.state);
 h.state.businesses[7].name='AAA Company';
 h.state.businesses[7].locations=[{id:'downtown'},{id:'suburbs'},{id:'tourist'},{id:'tech'}];
 h.state.businesses[8].financialBalance=-500;
 const original=JSON.stringify(h.state);
 h.window.renderBusinesses();
 const controls=h.getControls(),sort=controls._sort;
 sort.value='name';h.trigger(sort,'change');
 assert.match(h.box.innerHTML,/data-business="7"/);
 assert.equal(Number([...h.box.innerHTML.matchAll(/data-business="(\d+)"/g)][0][1]),7);
 sort.value='locations';h.trigger(sort,'change');
 assert.equal(Number([...h.box.innerHTML.matchAll(/data-business="(\d+)"/g)][0][1]),7);
 sort.value='balance';h.trigger(sort,'change');
 assert.equal(Number([...h.box.innerHTML.matchAll(/data-business="(\d+)"/g)][0][1]),8);
 assert.equal(JSON.stringify(h.state),original);
 assert.notEqual(before,original,'fixture changes were explicit, not caused by sorting');
});
test('attention-only portfolio filter finds negative balances and bankruptcy warnings',()=>{
 const h=harness({businessCount:75});
 h.state.businesses[3].financialBalance=-20;
 h.state.businesses[41].bankruptcyPending=true;
 h.window.renderBusinesses();
 const controls=h.getControls(),filter=controls._attention;
 assert.match(controls._count.textContent,/2 need attention/);
 filter.checked=true;h.trigger(filter,'change');
 assert.equal(cards(h.box.innerHTML),2);
 assert.match(h.box.innerHTML,/data-business="3"/);
 assert.match(h.box.innerHTML,/data-business="41"/);
 assert.equal(controls._more.hidden,true);
 assert.equal(h.profitCalls(),36+2,'filter evaluation does not simulate hidden companies');
 controls._clear.handlers.get('click')[0]();
 assert.equal(cards(h.box.innerHTML),36);
 assert.equal(filter.checked,false);
 assert.equal(controls._sort.value,'original');
});
test('portfolio options remain mounted across refreshes and medium portfolios can use sorting',()=>{
 const h=harness({businessCount:20});
 h.window.renderBusinesses();
 const controls=h.getControls(),sort=controls._sort,filter=controls._attention;
 assert.equal(controls.hidden,false,'medium portfolios need discovery controls');
 sort.value='newest';h.trigger(sort,'change');
 const first=Number([...h.box.innerHTML.matchAll(/data-business="(\d+)"/g)][0][1]);
 assert.equal(first,19);
 h.window.renderBusinesses();
 assert.equal(controls._sort,sort);
 assert.equal(controls._attention,filter);
 assert.equal(sort.value,'newest');
});
