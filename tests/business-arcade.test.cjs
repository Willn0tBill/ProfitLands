const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const code=fs.readFileSync(path.join(root,'business-arcade.js'),'utf8');
function harness(){
  const state={started:true,cash:1000,actions:60,day:3,businesses:[],news:[]};
  let saved=0,rendered=0,gains=0,intervalFn=null;
  let visible=true,view='arcade',gameActive=true;
  const elements=new Map();
  elements.set('arcadeContent',{innerHTML:'',addEventListener(){}});
  elements.set('gameScreen',{classList:{contains:name=>name==='active'&&gameActive}});
  const document={
    readyState:'loading',get visibilityState(){return visible?'visible':'hidden'},
    getElementById:id=>elements.get(id)||null,
    addEventListener(){}
  };
  const window={
    state,
    ProfitLandsMoney:{gain:amount=>{assert.ok(Number.isFinite(amount));state.cash+=amount;gains+=amount},format:n=>'$'+Number(n).toLocaleString()},
    ProfitLandsWorkspace:{active:()=>view},
    save(){saved++},
    render(){rendered++},
    addEventListener(){}
  };
  const context=vm.createContext({window,document,console,Date,Math,Number,
    setInterval:fn=>{intervalFn=fn;return 42},clearInterval:()=>{intervalFn=null}});
  new vm.Script(code,{filename:'business-arcade.js'}).runInContext(context);
  return {api:window.ProfitLandsArcade,state,window,elements,
    saved:()=>saved,rendered:()=>rendered,gains:()=>gains,
    setVisible:value=>visible=value,setView:value=>view=value,
    setGameActive:value=>gameActive=value,interval:()=>intervalFn};
}
test('provides three original mini-games in the management console',()=>{
 const h=harness();
 assert.deepEqual(Array.from(h.api.GAMES.map(g=>g.id)),['rush','dispatch','desk']);
 assert.equal(h.api.game('rush').duration,20000);
 assert.equal(h.api.game('missing'),undefined);
});
test('Coffee Rush clicker scores taps and grants capped in-game cash',()=>{
 const h=harness(),api=h.api;
 assert.equal(api.start('rush',100000),true);
 for(let i=0;i<60;i++)assert.equal(api.press('serve',undefined,100100+i),true);
 assert.equal(api.getSession().score,60);
 assert.equal(api.complete(119999),true);
 assert.equal(h.gains(),110);
 assert.equal(h.state.cash,1110);
 assert.equal(h.state.actions,60,'mini-game does not consume management actions');
 assert.equal(h.state.day,3);
 assert.equal(api.getSession().finished,true);
 assert.equal(api.complete(120000),false,'no duplicate payout');
 assert.equal(h.saved(),1);
 assert.equal(h.state.arcade.bests.rush,60);
});
test('Delivery Dispatch scores correct routes with a fixed eight-delivery round',()=>{
 const h=harness(),api=h.api;
 assert.equal(api.start('dispatch',200000),true);
 for(let i=0;i<8;i++){
   const dest=api.getSession().destination;
   assert.equal(api.press('route',dest,200100+i),true);
 }
 assert.equal(api.getSession().score,8);
 assert.equal(api.getSession().finished,true);
 assert.equal(h.gains(),96);
 assert.equal(h.state.arcade.perfect,1);
});
test('Deal Desk rewards correct business decisions and records personal best',()=>{
 const h=harness(),api=h.api;
 api.start('desk',300000);
 const answers=[0,1,0,0,2];
 for(const answer of answers)assert.equal(api.press('choose',answer,300100),true);
 assert.equal(api.getSession().score,5);
 assert.equal(h.gains(),90);
 assert.equal(h.state.arcade.bests.desk,5);
 assert.equal(h.state.arcade.perfect,1);
});
test('reward rate is capped to three completed rounds in a rolling five-minute window',()=>{
 const h=harness(),api=h.api;
 let time=Date.now()-4*21000; // Simulate completed rounds in the recent past.
 for(let i=0;i<4;i++){
  assert.equal(api.start('rush',time),true);
  for(let tap=0;tap<5;tap++)api.press('serve',undefined,time+1+tap);
  api.complete(time+20000);
  if(i<3)assert.equal(api.available(time+20000),2-i);
  api.stop();
  time+=21000;
 }
 assert.equal(h.gains(),45,'fourth game is practice only');
 assert.equal(h.state.arcade.played,4);
 assert.equal(api.available(time),0);
 assert.equal(api.available(time+5*60*1000),3,'quota resets once every rewarded round has aged out');
});
test('hidden tabs and other workspace views cannot play or collect rewards',()=>{
 const h=harness(),api=h.api;
 h.setView('markets');assert.equal(api.start('rush',100000),false);
 h.setView('arcade');h.setVisible(false);assert.equal(api.start('rush',100000),false);
 h.setVisible(true);h.setGameActive(false);assert.equal(api.start('rush',100000),false);
 h.setGameActive(true);assert.equal(api.start('rush',100000),true);
 h.setVisible(false);api.tick(101000);
 assert.equal(api.getSession(),null,'hidden tab quits round');
 assert.equal(h.gains(),0,'no reward for unattended play');
});
test('expired clicker rounds cannot collect further taps and cannot pay twice',()=>{
 const h=harness(),api=h.api;
 api.start('rush',100000);
 for(let i=0;i<10;i++)api.press('serve',undefined,100100+i);
 assert.equal(api.press('serve',undefined,120001),false);
 assert.equal(api.getSession().finished,true);
 assert.equal(h.gains(),30);
 assert.equal(api.press('serve',undefined,120002),false);
 assert.equal(h.gains(),30);
});
test('all arcade progress serializes in regular saves without touching older fields',()=>{
 const h=harness(),api=h.api;
 api.start('rush',100000);api.press('serve',undefined,100001);api.complete(119999);
 const snapshot=JSON.parse(JSON.stringify(h.state));
 assert.equal(snapshot.started,true);
 assert.equal(snapshot.actions,60);
 assert.equal(snapshot.day,3);
 assert.equal(snapshot.arcade.earned,3);
 assert.equal(snapshot.arcade.rewards.length,1);
 assert.equal(snapshot.cash,1003);
});
test('workspace navigation and new game reset are wired without replacing existing panels',()=>{
 const workspace=fs.readFileSync(path.join(root,'workspace.js'),'utf8');
 const html=fs.readFileSync(path.join(root,'play/index.html'),'utf8');
 const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
 const economy=fs.readFileSync(path.join(root,'economy-system.js'),'utf8');
 assert.ok(workspace.includes("id:'arcade'"));
 assert.ok(workspace.includes("panels:['arcadePanel']"));
 assert.ok(workspace.includes('/^[1-9]$/'));
 assert.ok(html.includes('id="arcadePanel"'));
 assert.ok(html.includes('id="arcadeContent"'));
 assert.ok(html.includes('business-arcade.css'));
 assert.ok(html.indexOf('business-arcade.js')>html.indexOf('workspace.js'));
 assert.ok(app.includes('state.arcade=null'));
 assert.ok(economy.includes('state.arcade=null'));
});
