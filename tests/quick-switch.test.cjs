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
 const document={readyState:'loading',getElementById:x=>x==='gameScreen'?{classList:{contains:name=>name==='active'}}:x==='openSettings'?{click(){actions.push(['settings','opened'])}}:null,
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

test('Quick Switch opens Save & Recovery without touching cash, actions or saves',()=>{
 const h=harness();
 const entry=h.api.items('Save & Recovery')[0];
 assert.equal(entry.key,'settings');
 assert.equal(h.api.execute(entry),true);
 assert.deepEqual(h.actions,[['settings','opened']]);
 assert.equal(h.state.cash,50000);
 assert.equal(h.state.actions,60);
});

test('default shortcuts keep recovery, studio and companies discoverable as the empire expands',()=>{
 const h=harness();
 h.state.businesses=Array.from({length:40},(_,i)=>({type:'coffee',name:'Branch '+(i+1)}));
 const defaultItems=h.api.items();
 for(const key of ['businesses','trophies','settings','wtvi','nation']){
  assert.ok(defaultItems.some(item=>item.key===key),key+' must be visible without typing');
 }
 assert.ok(defaultItems.some(item=>item.kind==='business'));
 assert.ok(defaultItems.length<=12);
 assert.equal(h.api.items('Branch 39')[0].index,38,'the full portfolio remains searchable');
});

test('search supports words in either order, including mixed label and descriptive terms',()=>{
 const h=harness();
 assert.equal(h.api.items('coffee downtown')[0].index,0);
 assert.equal(h.api.items('Downtown Coffee')[0].index,0);
 assert.equal(h.api.items('restore save')[0].key,'settings');
 assert.equal(h.api.items('unknown portfolio banana').length,0);
});

test('recently opened destinations rise to the top without touching save data',()=>{
 const h=harness();
 const before=JSON.stringify(h.state);
 const destination=h.api.items('Atlas Software')[0];
 assert.equal(h.api.execute(destination),true);
 assert.equal(h.api.items()[0].label,'Atlas Software');
 assert.equal(h.api.execute(h.api.items('Trophies')[0]),true);
 assert.equal(h.api.items()[0].label,'Trophies');
 assert.equal(JSON.stringify(h.state),before);
});

test('Quick Switch in World 1 hides all local companies, purchases and save controls',()=>{
 const h=harness();
 h.state.playType='multi';
 h.window.ProfitLandsWorkspace.views.push({id:'world',name:'World'},{id:'clans',name:'Clans'});
 h.window.ProfitLandsWorkspace.available=id=>id==='world'||id==='clans';
 const available=h.api.items('');
 assert.ok(available.some(item=>item.key==='world'));
 assert.ok(available.some(item=>item.key==='clans'));
 assert.equal(h.api.items('Downtown Coffee').length,0);
 assert.equal(h.api.items('Buy a new business').length,0);
 assert.equal(h.api.items('Save & Recovery').length,0);
 assert.equal(h.api.items('Businesses').length,0);
 assert.equal(h.api.execute({kind:'business',key:'business-0',index:0,label:'Downtown Coffee Shop'}),false);
 assert.equal(h.api.execute({kind:'action',key:'buy',label:'Buy a business'}),false);
 assert.equal(h.api.execute({kind:'action',key:'settings',label:'Save & Recovery'}),false);
 assert.equal(h.api.execute({kind:'view',key:'businesses',view:'businesses',label:'Businesses'}),false);
 assert.equal(h.actions.length,0,'stale local shortcuts must not modify game state');
 h.state.playType='single';
 assert.ok(h.api.items('Downtown Coffee').some(item=>item.kind==='business'));
});
