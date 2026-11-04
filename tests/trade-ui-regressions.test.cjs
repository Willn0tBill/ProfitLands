'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'trade-ui.js'),'utf8');
function harness({cash=1000,actions=10,holdings=true,huge=false}={}){
 const state={cash,actions,stocks:holdings?{nova:{shares:0}}:{},news:[]};
 const stock={id:'nova',name:'Nova',ticker:'NOV',sector:'Technology',risk:'medium',price:100};
 const get=new Map();
 const node=id=>{
  if(!get.has(id))get.set(id,{
   id,value:'',textContent:'',innerHTML:'',disabled:false,max:999999,onclick:null,oninput:null,
   classList:{add(){},remove(){},toggle(){}},focus(){this.focused=true}
  });
  return get.get(id);
 };
 let spent=0,saved=0,rendered=0;const notifications=[];
 const tab1={dataset:{side:'buy'},classList:{toggle(){}},onclick:null};
 const tab2={dataset:{side:'sell'},classList:{toggle(){}},onclick:null};
 const document={
  getElementById:node,
  querySelectorAll:s=>s==='.trade-tab'?[tab1,tab2]:[],
 };
 const ledger=huge?{
  canAfford:()=>true,
  spend:n=>{spent+=n;return true},
  gain(){}
 }:{
  canAfford:n=>state.cash>=n,
  spend:n=>{if(state.cash<n)return false;state.cash-=n;spent+=n;return true},
  gain:n=>{state.cash+=n}
 };
 const window={ProfitLandsMoney:ledger};
 const context={window,document,state,STOCKS:[stock],
  money:n=>'$'+Number(n).toFixed(2),
  save(){saved++},render(){rendered++},toast:x=>notifications.push(x),console};
 vm.createContext(context);
 new vm.Script(source,{filename:'trade-ui.js'}).runInContext(context);
 return{window,state,stock,node,tab1,tab2,notifications,spent:()=>spent,saved:()=>saved,rendered:()=>rendered};
}
test('Buy and Sell buttons are visibly disabled when no management actions remain',()=>{
 const h=harness({actions:0});
 h.window.trade('nova');
 assert.equal(h.node('tradeSubmit').disabled,true);
 assert.match(h.node('tradeLimit').textContent,/No actions remaining/);
 h.tab2.onclick();
 assert.equal(h.node('tradeSubmit').disabled,true);
 assert.equal(h.saved(),0);
});
test('cash affordability is recalculated after market or income changes',()=>{
 const h=harness({cash:500});
 h.window.trade('nova');
 assert.match(h.node('tradeLimit').textContent,/5 shares/);
 h.state.cash=200;
 h.node('tradeQty').value='3';
 // User clicks an old quote; reject rather than silently buying fewer shares.
 h.node('tradeSubmit').onclick();
 assert.equal(h.state.stocks.nova.shares,0);
 assert.equal(h.state.actions,10);
 assert.match(h.notifications.at(-1),/available cash or shares changed/);
 assert.match(h.node('tradeLimit').textContent,/2 shares/);
});
test('a changed stock price requires review before execution',()=>{
 const h=harness({cash:1000});
 h.window.trade('nova');
 h.node('tradeQty').value='2';h.node('tradeQty').oninput();
 assert.equal(h.node('tradeTotal').textContent,'$200.00');
 h.stock.price=150;
 h.node('tradeSubmit').onclick();
 assert.equal(h.state.cash,1000);
 assert.equal(h.state.actions,10);
 assert.equal(h.node('tradeTotal').textContent,'$300.00');
 assert.match(h.notifications.at(-1),/stock price changed/i);
 h.node('tradeSubmit').onclick();
 assert.equal(h.state.stocks.nova.shares,2);
 assert.equal(h.state.cash,700);
 assert.equal(h.state.actions,9);
 assert.equal(h.saved(),1);
});
test('buying a stock absent from old save holdings initializes shares only on successful trade',()=>{
 const h=harness({holdings:false,cash:300});
 h.window.trade('nova');
 assert.equal(h.state.stocks.nova,undefined);
 h.node('tradeSubmit').onclick();
 assert.equal(h.state.stocks.nova.shares,1);
 assert.equal(h.state.cash,200);
 assert.equal(h.saved(),1);
});
test('large-number ledger determines max affordable shares, not a capped cash mirror',()=>{
 const h=harness({huge:true,cash:1});
 h.window.trade('nova');
 assert.match(h.node('tradeLimit').textContent,/999999 shares/);
 assert.equal(h.node('tradeSubmit').disabled,false);
 h.node('tradeQty').value='20';h.node('tradeQty').oninput();
 h.node('tradeSubmit').onclick();
 assert.equal(h.state.stocks.nova.shares,20);
 assert.equal(h.spent(),2000);
});
test('invalid fractional share amounts cannot be silently rounded and traded',()=>{
 const h=harness({cash:1000});
 h.window.trade('nova');
 h.node('tradeQty').value='3.7';
 h.node('tradeSubmit').onclick();
 assert.equal(h.state.stocks.nova.shares,0);
 assert.equal(h.saved(),0);
 assert.match(h.notifications.at(-1),/valid share quantity/);
});
