/* ProfitLands single home launcher.
 * Auth and cloud-save discovery run on the actual homepage, without loading
 * the entire game engine. Firebase owns passwords; nothing secret is stored
 * by this page. Continue uses the existing /play/ game loader.
 */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const SAVE_KEY='profitlands-v2',OWNER_KEY='profitlands-local-owner';
const clean=s=>String(s||'').trim().replace(/\s+/g,' ');
const formatDay=s=>Math.max(1,Math.floor(Number(s?.day)||1));
const hasSave=s=>!!(s&&typeof s==='object'&&(
 s.started===true||Number(s.day)>1||
 Array.isArray(s.businesses)&&s.businesses.length>0||
 Number(s.property)>0||Object.values(s.stocks||{}).some(x=>Number(x?.shares)>0)
));
const getLocal=()=>{
 try{
  const value=localStorage.getItem(SAVE_KEY);
  const parsed=value?JSON.parse(value):null;
  return hasSave(parsed)?parsed:null;
 }catch(e){return null}
};
const owner=()=>{
 try{return localStorage.getItem(OWNER_KEY)}catch(e){return null}
};
let firebaseAuth=null,firestore=null,user=null,cloud=null,signUp=false,checking=false;
const config=window.PROFITLANDS_FIREBASE_CONFIG||{};
const configured=!!(config.apiKey&&!String(config.apiKey).includes('PASTE_'));
const controls={
 get continue(){return $('homeContinue')},
 get signIn(){return $('homeSignIn')},
 get signUp(){return $('homeSignUp')},
 get signOut(){return $('homeSignOut')}
};
function safeLocal(){
 const local=getLocal();
 const identity=owner();
 // Never resume somebody else's signed-in device save.
 if(identity&&identity!==user?.uid)return null;
 return local;
}
function saveText(s,label){
 return label+' · Day '+formatDay(s)+' · '+(Array.isArray(s.businesses)?s.businesses.length:0)+' businesses';
}
function refresh(){
 const local=safeLocal(),remote=cloud?.state&&hasSave(cloud.state)?cloud.state:null;
 const saved=remote||local;
 const resume=controls.continue;
 if(resume){
  resume.disabled=!saved;
  resume.setAttribute('aria-label',saved?'Continue your saved empire':'No saved empire available');
 }
 const status=$('homeSaveStatus');
 if(status){
  if(checking)status.textContent='Checking your account save…';
  else if(remote)status.textContent=saveText(remote,'Cloud empire ready');
  else if(local)status.textContent=saveText(local,'Saved on this device');
  else if(owner()&&!user)status.textContent='Sign in to the account that saved this empire on this device.';
  else status.textContent='No saved empire found yet. Set up a new game to get started.';
 }
 const badge=$('homeAccountBadge'),identity=$('homeIdentity'),foot=$('homeAccountStatus');
 if(user){
  const name=window.profitlandsHomeProfile?.playerName||user.displayName||user.email?.split('@')[0]||'Player';
  if(badge)badge.textContent='SIGNED IN';
  if(identity)identity.textContent='Signed in as '+name+'. '+(remote?'Your cloud save is available.':'Your local game and account are ready.');
  if(foot)foot.textContent='Account: '+user.email;
  if(controls.signIn)controls.signIn.hidden=true;
  if(controls.signUp)controls.signUp.hidden=true;
  if(controls.signOut)controls.signOut.hidden=false;
  if($('homeHeaderAccount'))$('homeHeaderAccount').textContent=name;
 }else{
  if(badge)badge.textContent='GUEST';
  if(identity)identity.textContent='Play on this device, or sign in to retrieve your account saves.';
  if(foot)foot.textContent=configured?'Singleplayer works without signing in.':'Account services are unavailable; guest play still works.';
  if(controls.signIn)controls.signIn.hidden=false;
  if(controls.signUp)controls.signUp.hidden=false;
  if(controls.signOut)controls.signOut.hidden=true;
  if($('homeHeaderAccount'))$('homeHeaderAccount').textContent='Sign In';
 }
}
function openAuth(create=false){
 const modal=$('homeAuthDialog');if(!modal)return;
 signUp=Boolean(create);
 $('homeAuthTitle').textContent=signUp?'Create your account':'Sign in';
 $('homeAuthIntro').textContent=signUp?
  'Create your player identity and use cloud saves on supported devices.':
  'Sign in to retrieve your connected ProfitLands save.';
 $('homeAuthSignupFields').hidden=!signUp;
 $('homeAuthPassword').autocomplete=signUp?'new-password':'current-password';
 $('homeAuthSubmit').textContent=signUp?'Create Account':'Sign In';
 $('homeAuthSwitch').textContent=signUp?'Already have an account? Sign in':'Need an account? Create one';
 $('homeAuthReset').hidden=signUp;
 $('homeAuthError').textContent='';
 modal.hidden=false;
 $('homeAuthEmail').focus();
}
function closeAuth(){
 $('homeAuthDialog').hidden=true;
 $('homeAuthPassword').value='';
 $('homeAuthError').textContent='';
}
function errorMessage(error){
 const dict={
  'auth/invalid-email':'Enter a valid email address.',
  'auth/invalid-credential':'The email or password was incorrect.',
  'auth/wrong-password':'The password was incorrect.',
  'auth/user-not-found':'No account was found for that email.',
  'auth/email-already-in-use':'That email is already registered.',
  'auth/weak-password':'Choose a stronger password.',
  'auth/network-request-failed':'Could not reach the account service. Check your connection.',
  'auth/too-many-requests':'Too many attempts. Try again later.'
 };
 return dict[error?.code]||'Account request failed. Please try again.';
}
async function onSubmit(event){
 event.preventDefault();
 const error=$('homeAuthError'),button=$('homeAuthSubmit');
 if(!firebaseAuth){error.textContent='Sign-in is unavailable right now. You can still play locally.';return}
 const email=clean($('homeAuthEmail').value),password=$('homeAuthPassword').value;
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||password.length<6){
  error.textContent='Enter a valid email and a password of at least six characters.';return;
 }
 let player='',company='';
 if(signUp){
  player=clean($('homeAuthPlayer').value);
  company=clean($('homeAuthCompany').value);
  if(player.length<2||player.length>24||company.length<2||company.length>40){
   error.textContent='Player name must be 2–24 characters and company name 2–40.';return;
  }
  if(!/^[\p{L}\p{N} ._'’-]+$/u.test(player)||!/^[\p{L}\p{N} .,&'’\-]+$/u.test(company)){
   error.textContent='Use letters, numbers, spaces, and simple punctuation in names.';return;
  }
 }
 button.disabled=true;
 try{
  if(signUp){
   const result=await firebaseAuth.createUserWithEmailAndPassword(email,password);
   await firestore.collection('users').doc(result.user.uid).set({playerName:player,companyName:company},{merge:true});
   window.profitlandsHomeProfile={playerName:player,companyName:company};
  }else{
   await firebaseAuth.signInWithEmailAndPassword(email,password);
  }
  closeAuth();
 }catch(e){
  error.textContent=errorMessage(e);
 }finally{
  button.disabled=false;
 }
}
async function loadForAccount(u){
 checking=true;cloud=null;refresh();
 try{
  const [profile,save]=await Promise.all([
   firestore.collection('users').doc(u.uid).get(),
   firestore.collection('users').doc(u.uid).collection('saves').doc('last-game').get()
  ]);
  // Reject stale asynchronous responses after sign-out/account switch.
  if(user?.uid!==u.uid)return;
  window.profitlandsHomeProfile=profile.exists?profile.data():null;
  cloud=save.exists?save.data():null;
 }catch(e){
  if(user?.uid!==u.uid)return;
  $('homeAccountStatus').textContent='Account connected; cloud save could not be checked.';
  cloud=null;
 }finally{
  if(user?.uid===u.uid){checking=false;refresh()}
 }
}
function resume(){
 if(controls.continue?.disabled)return;
 // The game page restores from cloud/local in its existing account layer.
 // ?resume=1 now auto-opens the real saved empire when its account loader is ready.
 window.location.assign('play/?resume=1');
}
function init(){
 controls.continue?.addEventListener('click',resume);
 controls.signIn?.addEventListener('click',()=>openAuth(false));
 controls.signUp?.addEventListener('click',()=>openAuth(true));
 $('homeHeaderAccount')?.addEventListener('click',()=>{
  if(user)$('homeAccountTitle')?.scrollIntoView?.({behavior:'smooth',block:'center'});
  else openAuth(false);
 });
 controls.signOut?.addEventListener('click',async()=>{
  if(!firebaseAuth)return;
  try{await firebaseAuth.signOut()}catch(e){
   $('homeAccountStatus').textContent='Could not sign out. Try again.';
  }
 });
 $('homeAuthClose')?.addEventListener('click',closeAuth);
 $('homeAuthSwitch')?.addEventListener('click',()=>openAuth(!signUp));
 $('homeAuthDialog')?.addEventListener('click',event=>{
  if(event.target===$('homeAuthDialog'))closeAuth();
 });
 document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&!$('homeAuthDialog')?.hidden)closeAuth();
 });
 $('homeAuthReset')?.addEventListener('click',async()=>{
  const email=clean($('homeAuthEmail').value),error=$('homeAuthError');
  if(!firebaseAuth){error.textContent='Account recovery is unavailable right now.';return}
  if(!email){error.textContent='Enter your account email first.';return}
  try{await firebaseAuth.sendPasswordResetEmail(email);
   error.textContent='Password reset email requested. Check your inbox.';
  }catch(e){error.textContent=errorMessage(e)}
 });
 $('homeAuthForm')?.addEventListener('submit',onSubmit);
 refresh();
 if(!configured||!window.firebase?.auth||!window.firebase?.firestore){
  $('homeAccountStatus').textContent='Account service is currently unavailable; local game saves still work.';
  return;
 }
 try{
  // Reuse the existing Firebase project configuration and account data.
  const app=window.firebase.apps?.length?window.firebase.app():window.firebase.initializeApp(config);
  firebaseAuth=app.auth();firestore=app.firestore();
  firebaseAuth.onAuthStateChanged(u=>{
   user=u;cloud=null;window.profitlandsHomeProfile=null;checking=false;
   refresh();
   if(u)loadForAccount(u);
  });
 }catch(e){
  $('homeAccountStatus').textContent='Account service could not start; local play remains available.';
 }
}
window.ProfitLandsHomepage={
 refresh,openAuth,closeAuth,hasSave,safeLocal,diagnostics:()=>({signedIn:!!user,checking,
  cloudAvailable:!!cloud?.state,canContinue:!controls.continue?.disabled})
};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
else init();
})();