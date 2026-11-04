/* ProfitLands online Firebase callable adapter.
 * No local economy or saved-game state is used for server-side currency.
 */
(function(){
'use strict';
let connected=false,user=null,catalog=[],chatEnabled=false,connecting=null,sessionEpoch=0;
const pendingMutations=new Map();
let callable=null;
const playing=()=>window.state?.playType==='multi'&&
  Boolean(document.getElementById('gameScreen')?.classList.contains('active'));
function emit(){
 if(typeof CustomEvent==='function')window.dispatchEvent(new CustomEvent('profitlands:serverupdate'));
}
function ready(){
 try{
  if(!firebase?.apps?.length||typeof firebase.functions!=='function')return false;
  if(!callable)callable=firebase.app().functions('us-west1').httpsCallable('worldApi');
  return true;
 }catch(e){return false}
}
function currentUser(){
 try{return firebase.auth().currentUser||null}catch(e){return null}
}
async function call(action,data={}){
 if(!ready())throw Error('Firebase multiplayer functions are not configured.');
 if(action!=='health'&&!currentUser())throw Error('Please sign into your ProfitLands account.');
 try{
  const result=await callable({action,...data});
  return result.data;
 }catch(error){
  if(/unauthenticated|not-found/i.test(String(error?.code||''))){connected=false;emit()}
  const failure=new Error(String(error?.message||'Online server unavailable.').slice(0,220));
  failure.code=String(error?.code||'');
  throw failure;
 }
}
async function connect(){
 if(connected&&user?.uid===currentUser()?.uid)return true;
 if(connecting)return connecting;
 connecting=(async()=>{
  const epoch=sessionEpoch;
  try{
   const signed=currentUser();
   if(!signed)throw Error('Please sign in from the account menu first.');
   if(!playing())throw Error('Open Multiplayer before connecting to World 1.');
   const health=await call('health');
   if(!health?.ok||health.worldId!=='world1')throw Error('World 1 is not configured.');
   const result=await call('register');
   if(!result?.player?.uid||result.player.uid!==signed.uid)throw Error('Server returned an invalid player identity.');
   if(sessionEpoch!==epoch||currentUser()?.uid!==signed.uid||!playing())throw Error('Session changed while connecting. Please try again.');
   catalog=Array.isArray(health.catalog)?health.catalog:[];
   chatEnabled=health.chatEnabled===true;
   user=signed;connected=true;emit();
   return true;
  }catch(e){connected=false;emit();throw e}
  finally{connecting=null}
 })();
 return connecting;
}
function disconnect(){sessionEpoch++;connected=false;user=null;chatEnabled=false;catalog=[];emit()}
function requireSession(){
 if(!connected||!playing()||user?.uid!==currentUser()?.uid)throw Error('Connect to World 1 first.');
}
async function request(action,data={}){
 requireSession();
 return call(action,data);
}
function nonce(){
 if(!window.crypto?.getRandomValues)throw Error('Secure random IDs are unavailable.');
 const bytes=new Uint8Array(16);window.crypto.getRandomValues(bytes);
 return Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('');
}
async function submitIdempotent(action,data={}){
 requireSession();
 const caller=user.uid;
 // An ambiguous server result must keep its original request ID. This avoids
 // buying a second business when a mobile network loses two responses in a row.
 const fingerprint=JSON.stringify([caller,action,data]);
 const storageKey='profitlands-world1-pending:'+fingerprint;
 let requestId=pendingMutations.get(fingerprint);
 if(!requestId){
  try{
   const saved=JSON.parse(window.sessionStorage?.getItem(storageKey)||'null');
   if(saved&&Date.now()-saved.createdAt<86400000&&Date.now()>=saved.createdAt&&/^[0-9a-f]{32}$/.test(saved.requestId))
    requestId=saved.requestId;
  }catch(e){}
 }
 if(!requestId)requestId=nonce();
 pendingMutations.set(fingerprint,requestId);
 try{window.sessionStorage?.setItem(storageKey,JSON.stringify({requestId,createdAt:Date.now()}))}catch(e){}
 const clear=()=>{
  pendingMutations.delete(fingerprint);
  try{window.sessionStorage?.removeItem(storageKey)}catch(e){}
 };
 const payload={...data,requestId};
 try{
  let result;
  try{result=await call(action,payload)}
  catch(error){
   if(!/unavailable|deadline-exceeded/i.test(error.code||''))throw error;
   if(user?.uid!==caller||currentUser()?.uid!==caller||!playing())
    throw Error('Session changed during request; please reconnect.');
   result=await call(action,payload);
  }
  clear();
  return result;
 }catch(error){
  // Keep the key only for uncertain transport failures. A definite rejected
  // transaction is safe to retry with a fresh request ID.
  if(!/unavailable|deadline-exceeded/i.test(error.code||''))clear();
  throw error;
 }
}
async function requestAttack({targetUid,attackId}){
 return submitIdempotent('requestAttack',{targetUid,attackId});
}
async function requestDefense(){return submitIdempotent('requestDefense')}
window.ProfitLandsOnline={
 connect,disconnect,isConnected:()=>connected&&playing()&&user?.uid===currentUser()?.uid,
 getCatalog:()=>catalog.slice(),chatEnabled:()=>chatEnabled,
 getMyEmpire:()=>request('me'),
 getLeaderboard:period=>request('getLeaderboard',{period}),
 getPlayers:()=>request('getPlayers'),
 buyBusiness:businessId=>submitIdempotent('buyBusiness',{businessId}),
 upgradeBusiness:index=>submitIdempotent('upgradeBusiness',{index}),
 togglePvP:()=>request('togglePvP'),
 requestAttack,requestDefense,
 getChat:()=>chatEnabled?request('getChat'):Promise.resolve([]),
 sendChat:text=>chatEnabled?request('sendChat',{text}):Promise.reject(Error('World chat is currently disabled.')),
 reportMessage:messageId=>chatEnabled?request('reportMessage',{messageId}):Promise.reject(Error('World chat is currently disabled.'))
};
window.addEventListener('load',()=>{
 if(!ready())return;
 firebase.auth().onAuthStateChanged(next=>{
  if(!next||next.uid!==user?.uid)disconnect();
 });
});
})();
