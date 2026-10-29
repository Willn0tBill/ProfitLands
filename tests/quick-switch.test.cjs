const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.join(__dirname,'..');
const code=fs.readFileSync(path.join(root,'quick-switch.js'),'utf8');
function harness(){
 const actions=[],state={started:true,actions:60,cash:50000,businesses:[
  {type:'coffee',name:'Downtown Coffee Shop'},{type:'software',name:'Atlas Software'}]};
 const views=[{id:'businesses',name:'Businesses'},{id:'overview',name:'Overview'},{id:'trophies',name:'Trophies'},{id:'advances',name:'Advances'}];
 const window={state,ProfitLandsWorkspace:{views,ready:()=>true,show:x=>{actions.push(['view',x]);return true}},
 openManage:index=>actions.push(['company',index])};
 const appends=[];
 const document={readyState:'loading',getElementById:x=>x==='gameScreen'?{classList:{contains:name=>name==='active'}}:null,
 createElement:tag=>({tag,href:'',target:'',rel:'',click(){actions.push(['link',this.href])},remove(){}}),
 body:{appendChild:x=>appends.push(x)},addEventListener(){}};
 const context=vm.createContext({window,document,console});
 new vm.Script(code,{filename:'quick-switch.js'}).runInContext(context);
 return {api:window.ProfitLandsQuickSwitch,window,state,actions,appends};
}
test('quick switch includes console screens, companies, WtvI studio and Nation Wars',()=>{
 const h=harness(),all=h.api.items();
 assert.ok(all.some(x=>x.label==='Businesses'));
 assert.ok(all.some(x=>x.label==='Trophies'));
 assert.ok(all.some(x=>x.label==='Downtown Coffee Shop'));
 assert.ok(all.some(x=>x.label==='Wtv Innovations'));
 assert.ok(all.some(x=>x.label==='Nation Wars'));
});
test('search prioritizes exact matches and returns a bounded list',()=>{
 const a=harness().api;
 assert.equal(a.items('Trophies')[0].view,'trophies');
 assert.equal(a.items('Atlas')[0].index,1);
 assert.equal(a.items('Not Existing').length,0);
 assert.ok(a.items('').length<=12);
 assert.ok(a.items('s').length<=12);
});
test('company management shortcut opens the correct existing business',()=>{
 const h=harness();const item=h.api.items('Downtown Coffee')[0];
 assert.equal(h.api.execute(item),true);
 assert.deepEqual(h.actions,[['view','businesses'],['company',0]]);
 assert.equal(h.state.cash,50000);assert.equal(h.state.actions,60);
});
test('Quick Switch can navigate a screen without changing game money or saves',()=>{
 const h=harness();
 assert.equal(h.api.execute(h.api.items('Trophies')[0]),true);
 assert.deepEqual(h.actions,[['view','trophies']]);
 assert.equal(h.state.cash,50000);
});
test('website paths remain the legacy GitHub Pages addresses, not invented new URLs',()=>{
 const h=harness();
 assert.equal(h.api.execute(h.api.items('Wtv Innovations')[0]),true);
 assert.ok(h.actions.some(x=>x[1]==='https://willn0tbill.github.io/WtvStudios/'));
});
test('ProfitLands play page loads the quick switch CSS and script after workspace navigation',()=>{
 const html=fs.readFileSync(path.join(root,'play/index.html'),'utf8');
 assert.ok(html.includes('quick-switch.css'));
 assert.ok(html.includes('quick-switch.js'));
 assert.ok(html.indexOf('quick-switch.js')>html.indexOf('workspace.js'));
 assert.ok(html.includes('Wtv Innovations'));
 assert.ok(html.includes('>WtvI</a>'));
});
test('keyboard menu uses Ctrl/Cmd K and slash and does not pollute saved game',()=>{
 assert.ok(code.includes("e.key.toLowerCase()==='k'"));
 assert.ok(code.includes("e.key==='/'"));
 assert.ok(!code.includes('localStorage.setItem'));
 assert.ok(!code.includes('window.save?.()'));
});
