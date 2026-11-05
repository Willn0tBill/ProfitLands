'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const script=fs.readFileSync(path.join(root,'landing.js'),'utf8');
const index=fs.readFileSync(path.join(root,'index.html'),'utf8');
const play=fs.readFileSync(path.join(root,'play/index.html'),'utf8');
const route=fs.readFileSync(path.join(root,'play-route.js'),'utf8');

function setup({local=null,owner=null,withFirebase=false,cloudState=null}={}){
 const nodes=new Map(),storage=new Map(),navigation=[];
 if(local)storage.set('profitlands-v2',JSON.stringify(local));
 if(owner)storage.set('profitlands-local-owner',owner);
 function element(id){
  const listeners={};
  const n={id,hidden:false,disabled:false,textContent:'',value:'',
   attributes:{},style:{},autocomplete:'',setAttribute(key,value){this.attributes[key]=String(value)},
   addEventListener(type,fn){listeners[type]=fn},
   click(){listeners.click?.({target:this})},
   focus(){n.focused=true},
   scrollIntoView(){}
  };
  Object.defineProperty(n,'onEvent',{get:()=>listeners});
  nodes.set(id,n);return n;
 }
 for(const id of ['homeContinue','homeSignIn','homeSignUp','homeSignOut',
  'homeHeaderAccount','homeSaveStatus','homeAccountBadge','homeIdentity','homeAccountStatus',
  'homeAccountTitle','homeAuthDialog','homeAuthTitle','homeAuthIntro','homeAuthSignupFields',
  'homeAuthPassword','homeAuthSubmit','homeAuthSwitch','homeAuthReset','homeAuthError',
  'homeAuthEmail','homeAuthPlayer','homeAuthCompany','homeAuthForm','homeAuthClose'])element(id);
 nodes.get('homeAuthDialog').hidden=true;
 const doc={readyState:'complete',
  getElementById:id=>nodes.get(id)||null,
  addEventListener(){}
 };
 const localStorage={getItem:key=>storage.get(key)||null,setItem:(key,val)=>storage.set(key,String(val))};
 let observer;
 let fb;
 if(withFirebase){
  const user={uid:'uid-one',email:'player@example.com',displayName:'Player'};
  const auth={
   signInWithEmailAndPassword:async()=>({user}),
   createUserWithEmailAndPassword:async()=>({user}),
   sendPasswordResetEmail:async()=>{},
   signOut:async()=>{observer?.(null)},
   onAuthStateChanged:fn=>{observer=fn;fn(null)}
  };
  const docFor=id=>({
   get:async()=>id==='last-game'?
    {exists:!!cloudState,data:()=>({state:cloudState})}:
    {exists:true,data:()=>({playerName:'Example Player',companyName:'Example Ltd'})},
   set:async()=>{}
  });
  const firestore={collection:()=>({doc:id=>({
   ...docFor(id),
   collection:()=>({doc:docFor})
  })})};
  fb={apps:[],initializeApp:()=>({auth:()=>auth,firestore:()=>firestore})};
  // Separate test access to Firebase auth observer.
  fb.login=()=>observer?.(user);
 }
 const win={
  location:{assign:url=>navigation.push(url)},
  PROFITLANDS_FIREBASE_CONFIG:withFirebase?{apiKey:'public-config'}:{},
  firebase:fb,
  profitlandsHomeProfile:null
 };
 vm.runInNewContext(script,{window:win,document:doc,console,localStorage});
 return {win,nodes,storage,navigation,fb};
}
test('only one actual homepage exposes new setup, resume and sign-in together',()=>{
 for(const id of ['homeContinue','homeNew','homeSignIn','homeSignUp','homeAuthForm'])assert.match(index,new RegExp('id="'+id+'"'));
 assert.match(index,/href="play\/\?new=1"/);
 assert.match(index,/firebase-app-compat\.js/);
 assert.match(index,/firebase-auth-compat\.js/);
 assert.match(index,/firebase-firestore-compat\.js/);
 assert.doesNotMatch(index,/class="type-grid"/,'world and speed selection belong to setup only');
 assert.match(play,/class="pl-new-empire-intro"/);
 assert.match(play,/NEW EMPIRE SETUP/);
 assert.doesNotMatch(play,/class="hero play-entry-hero"/);
 assert.match(play,/href="\.\.\/">Back to Homepage/,'setup links return to the actual project root');
});
test('guest local save enables Continue without requiring a login',()=>{
 const h=setup({local:{started:true,day:3,businesses:[{type:'coffee'}],cash:850}});
 assert.equal(h.nodes.get('homeContinue').disabled,false);
 assert.match(h.nodes.get('homeSaveStatus').textContent,/Saved on this device/);
 h.nodes.get('homeContinue').click();
 assert.deepEqual(h.navigation,['play/?resume=1']);
});
test('owned device saves are hidden from other signed-out profiles',()=>{
 const h=setup({local:{started:true,day:4,businesses:[]},owner:'some-other-user'});
 assert.equal(h.nodes.get('homeContinue').disabled,true);
 assert.match(h.nodes.get('homeSaveStatus').textContent,/Sign in/);
});
test('sign-in and creation operate in a modal on the homepage',()=>{
 const h=setup();
 h.nodes.get('homeSignIn').click();
 assert.equal(h.nodes.get('homeAuthDialog').hidden,false);
 assert.equal(h.nodes.get('homeAuthTitle').textContent,'Sign in');
 assert.equal(h.nodes.get('homeAuthSignupFields').hidden,true);
 h.nodes.get('homeAuthSwitch').click();
 assert.equal(h.nodes.get('homeAuthTitle').textContent,'Create your account');
 assert.equal(h.nodes.get('homeAuthSignupFields').hidden,false);
 h.nodes.get('homeAuthClose').click();
 assert.equal(h.nodes.get('homeAuthDialog').hidden,true);
});
test('Firebase account save enables Continue after authenticated cloud discovery',async()=>{
 const h=setup({withFirebase:true,cloudState:{
  started:true,day:7,businesses:[{type:'coffee'},{type:'hotel'}],cash:9000
 }});
 h.fb.login();
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(h.nodes.get('homeContinue').disabled,false);
 assert.equal(h.nodes.get('homeAccountBadge').textContent,'SIGNED IN');
 assert.match(h.nodes.get('homeSaveStatus').textContent,/Cloud empire ready/);
 assert.match(h.nodes.get('homeIdentity').textContent,/Example Player/);
 h.nodes.get('homeContinue').click();
 assert.deepEqual(h.navigation,['play/?resume=1']);
});
test('the resume route invokes the EXISTING game save controller only when ready',()=>{
 let clickCount=0;
 const listeners={},info={textContent:'',setAttribute(){}};
 const resume={disabled:false,click:()=>clickCount++};
 const home={prepend(){}};
 const doc={readyState:'complete',
  getElementById:id=>id==='resumeLastGame'?resume:id==='homeScreen'?home:id==='plResumeStatus'?info:null,
  createElement:()=>info,
  addEventListener(){},querySelector(){return null}
 };
 const win={addEventListener:(name,fn)=>listeners[name]=fn};
 const location={search:'?resume=1',hash:''};
 vm.runInNewContext(route,{window:win,document:doc,location,URLSearchParams,console});
 assert.equal(clickCount,1);
 assert.equal(win.ProfitLandsEntryRoute.hasResumed(),true);
 listeners['profitlands:resume-ready']?.();
 assert.equal(clickCount,1,'a repeated auth refresh must not resume twice');
});
test('home account flow never stores credentials in localStorage',()=>{
 assert.doesNotMatch(script,/localStorage\.setItem\([^)]*(?:password|authEmail|authPassword)/i);
 assert.match(script,/firebaseAuth\.signInWithEmailAndPassword/);
 assert.match(script,/firebaseAuth\.createUserWithEmailAndPassword/);
 assert.match(route,/profitlands:resume-ready/);
 const auth=fs.readFileSync(path.join(root,'firebase-auth.js'),'utf8');
 assert.match(auth,/new Event\('profitlands:resume-ready'\)/);
});
