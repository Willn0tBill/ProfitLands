const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'..','achievement-engine.js'),'utf8');
const types=['coffee','restaurant','gamestore','hotel','dealership','factory','software','logistics'];
function harness(){
 let saves=0,toasts=0;
 const state={started:true,day:10,cash:12345,actions:60,news:[],
 businesses:[{type:'coffee',name:'Cafe #1',locations:[
 {id:'downtown',name:'Downtown',level:92,marketing:3,efficiency:2,workers:12},
 {id:'tourist',name:'Tourist',level:10,marketing:0,efficiency:0,workers:2}
 ]}]};
 const root={innerHTML:'',addEventListener(){},querySelector(){return null},querySelectorAll(){return[]}};
 const document={readyState:'loading',visibilityState:'visible',getElementById:x=>x==='trophyContent'?root:null,addEventListener(){}};
 const window={state,BUSINESS_TYPES:types.map(id=>({id,cost:500})),save(){saves++},
 toast(){toasts++},addEventListener(){},setInterval(){},ProfitLandsWorkspace:{active:()=>''}};
 const ctx=vm.createContext({window,document,console,Date,Number,Math});
 new vm.Script(source,{filename:'achievement-engine.js'}).runInContext(ctx);
 return{api:window.ProfitLandsBadges,state,window,root,saves:()=>saves,toasts:()=>toasts};
}
test('generates 131072 deterministic rank achievements without allocating 131072 objects',()=>{
 const h=harness(),a=h.api;
 assert.equal(a.INDUSTRIES.length,8);
 assert.equal(a.TRACKS.length,16);
 assert.equal(a.RANKS,1024);
 assert.equal(a.TOTAL,131072);
 assert.equal(a.describe('coffee','highestLevel',100).id,'coffee.highestLevel.100');
 assert.equal(a.describe('coffee','highestLevel',100).tier,'Silver');
 assert.equal(a.describe('coffee','highestLevel',100).title,'Coffee Shops · Level Pioneer 100');
 assert.equal(a.describe('coffee','highestLevel',100).goal,500);
 assert.equal(a.describe('coffee','highestLevel',1025),null);
 assert.ok(Object.keys(h.api.ensure().ranks).length===0);
});
test('rank thresholds increase and rank retrieval can find rank 1024',()=>{
 const a=harness().api;
 for(const track of a.TRACKS){
  assert.ok(a.threshold(track,1)<a.threshold(track,1024),track.id);
  assert.equal(a.rankFor(track,0),0);
  assert.equal(a.rankFor(track,a.threshold(track,1)),1);
  assert.equal(a.rankFor(track,a.threshold(track,1024)),1024);
 }
});
test('existing business locations award badges on first scan, never twice',()=>{
 const h=harness(),a=h.api;
 const first=a.scan(200000,true);
 assert.ok(first>0);
 assert.ok(a.rankAt('coffee','highestLevel')>=18);
 assert.equal(a.rankAt('restaurant','highestLevel'),0);
 assert.equal(a.scan(210000,true),0);
 assert.equal(h.saves(),1);
 assert.equal(h.state.cash,12345,'achievements never change game cash');
 assert.equal(h.state.actions,60,'achievements never cost actions');
});
test('cumulative counters award independent industry badges and serialize compactly',()=>{
 const h=harness(),a=h.api;
 a.scan(200000,true);
 a.record('coffee','hired',101);
 a.record('coffee','upgrades',50);
 a.record('restaurant','cycles',6);
 a.scan(211000,true);
 assert.equal(a.rankAt('coffee','hired'),21);
 assert.equal(a.rankAt('coffee','upgrades'),10);
 assert.equal(a.rankAt('restaurant','cycles'),2);
 const payload=JSON.stringify(h.state.badgeBook);
 assert.ok(payload.length<5000,'save only max ranks per track, not individual badge entries');
 assert.ok(!payload.includes('coffee.highestLevel.1"'),'each rank is not stored separately');
});
test('paginated browsing returns maximum 30 cards, even with 131072 achievements',()=>{
 const a=harness().api;
 const first=a.browse(0),far=a.browse(4000);
 assert.equal(first.total,131072);
 assert.equal(first.pages,Math.ceil(131072/30));
 assert.equal(first.rows.length,30);
 assert.ok(far.rows.length<=30);
 assert.equal(a.browse(1e9).page,first.pages-1);
});
test('earned and locked filters use compact track progress instead of scanning badge objects',()=>{
 const h=harness(),a=h.api;
 a.scan(100000,true);
 const earned=a.setFilter({status:'earned'});
 assert.equal(earned.total,a.earnedCount());
 assert.ok(earned.rows.every(x=>x.earned));
 const locked=a.setFilter({status:'locked'});
 assert.equal(locked.total,a.TOTAL-a.earnedCount());
 assert.ok(locked.rows.every(x=>!x.earned));
 const coffee=a.setFilter({status:'all',sector:'coffee'});
 assert.equal(coffee.total,16*1024);
});
test('five earned badges can be featured without granting economy rewards',()=>{
 const h=harness(),a=h.api;
 a.scan(100000,true);
 assert.equal(a.featured('coffee.highestLevel.1'),true);
 assert.equal(a.featured('restaurant.highestLevel.1'),false,'cannot feature unearned');
 for(let i=2;i<=6;i++)assert.equal(a.featured('coffee.highestLevel.'+i),true);
 assert.equal(h.state.badgeBook.featured.length,5);
 assert.equal(h.state.badgeBook.featured.includes('coffee.highestLevel.1'),false);
 assert.equal(h.state.cash,12345);
});
test('Trophy Room renders filtered page, not the full collection',()=>{
 const h=harness(),a=h.api;
 a.scan(100000,true);a.render();
 assert.ok(h.root.innerHTML.includes('131,072 Achievements'));
 assert.equal((h.root.innerHTML.match(/class="pl-trophy-card /g)||[]).length,30);
 assert.ok(h.root.innerHTML.includes('Featured Badges'));
 assert.ok(h.root.innerHTML.includes('Page 1'));
});
test('old saves initialize without migration losses and all progress survives JSON',()=>{
 const h=harness(),a=h.api;const before=JSON.stringify(h.state.businesses);
 assert.equal(a.ensure().version,1);
 a.scan(100000,true);
 const restored=JSON.parse(JSON.stringify(h.state));
 assert.equal(JSON.stringify(restored.businesses),before);
 assert.equal(restored.badgeBook.ranks['coffee.highestLevel'],a.rankAt('coffee','highestLevel'));
 assert.equal(restored.cash,12345);
});
test('achievement engine is wired into actual income, cycle, actions and Trophy Room',()=>{
 const root=path.join(__dirname,'..');
 const f=p=>fs.readFileSync(path.join(root,p),'utf8');
 const html=f('play/index.html'),workspace=f('workspace.js'),economy=f('economy-system.js');
 assert.ok(html.includes('id="trophyPanel"'));
 assert.ok(html.includes('achievement-engine.js'));
 assert.ok(html.includes('achievement-engine.css'));
 assert.ok(workspace.includes("id:'trophies'"));
 assert.ok(economy.includes("?.record?.(b.type,'earnings'"));
 assert.ok(economy.includes("?.record?.(sector,'cycles'"));
 assert.ok(f('location-operations.js').includes("?.record?.(b.type,metric"));
 assert.ok(f('empire-lab.js').includes("?.record?.(site.b.type,'inventory'"));
 assert.ok(!f('app.js').includes('state.badgeBook=null'));
});

test('rarity selection partitions the full collection without materializing badges',()=>{
 const a=harness().api;
 const bronze=a.setFilter({tier:'bronze',status:'all',sector:'all',track:'all',search:''});
 assert.equal(bronze.total,8*16*64);
 assert.equal(bronze.rows[0].tier,'Bronze');
 const legendary=a.setFilter({tier:'legendary',search:''});
 assert.equal(legendary.total,8*16*256);
 assert.equal(legendary.rows[0].rank,769);
 assert.equal(legendary.rows[0].tier,'Legendary');
 const gold=a.setFilter({tier:'gold',search:''});
 assert.equal(gold.total,8*16*256);
 assert.ok(gold.rows.every(x=>x.tier==='Gold'));
});
test('players can find one exact badge by case-insensitive stable ID',()=>{
 const a=harness().api;
 const result=a.setFilter({tier:'all',status:'all',sector:'all',track:'all',search:'COFFEE.highestlevel.100'});
 assert.equal(result.total,1);
 assert.equal(result.pages,1);
 assert.equal(result.rows[0].id,'coffee.highestLevel.100');
 const locked=a.setFilter({status:'earned'});
 assert.equal(locked.total,0);
 const missing=a.setFilter({status:'all',search:'coffee.highestLevel.1025'});
 assert.equal(missing.total,0);
});
test('event-driven scan reconciles only touched sectors before periodic full scan',()=>{
 const h=harness(),a=h.api;
 a.scan(200000,true);
 h.state.businesses.push({type:'restaurant',locations:[{level:100,marketing:0,efficiency:0,workers:1}]});
 assert.equal(a.scan(206000),0);
 assert.equal(a.rankAt('restaurant','highestLevel'),0);
 a.record('coffee','upgrades',1);
 assert.ok(a.scan(212000)>0);
 assert.equal(a.rankAt('restaurant','highestLevel'),0);
 assert.ok(a.scan(231000)>0,'fallback scan backfills changes from older gameplay paths');
 assert.equal(a.rankAt('restaurant','highestLevel'),20);
});
test('featured badges appear in account showcase and can be removed there',()=>{
 const h=harness(),a=h.api;
 a.scan(200000,true);
 a.featured('coffee.highestLevel.1');
 assert.equal(a.showcased().length,1);
 assert.equal(a.showcased()[0].id,'coffee.highestLevel.1');
 a.render();
 assert.ok(h.root.innerHTML.includes('aria-label="Remove Coffee Shops'));
 a.featured('coffee.highestLevel.1');
 assert.equal(a.showcased().length,0);
});
