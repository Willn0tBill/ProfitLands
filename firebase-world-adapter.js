/* ProfitLands online Firebase callable adapter.
 * No local economy or saved-game state is used for server-side currency.
 */
(function(){
'use strict';
let connected=false,user=null,catalog=[],chatEnabled=false,connecting=null;
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
  try{
   const signed=currentUser();
   if(!signed)throw Error('Please sign in from the account menu first.');
   if(!playing())throw Error('Open Multiplayer before connecting to World 1.');
   const health=await call('health');
   if(!health?.ok||health.worldId!=='world1')throw Error('World 1 is not configured.');
   const result=await call('register');
   if(!result?.player?.uid||result.player.uid!==signed.uid)throw Error('Server returned an invalid player identity.');
   if(currentUser()?.uid!==signed.uid||!playing())throw Error('Account or game mode changed while connecting.');
   catalog=Array.isArray(health.catalog)?health.catalog:[];
   chatEnabled=health.chatEnabled===true;
   user=signed;connected=true;emit();
   return true;
  }catch(e){connected=false;emit();throw e}
  finally{connecting=null}
 })();
 return connecting;
}
function disconnect(){connected=false;user=null;chatEnabled=false;catalog=[];emit()}
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
 const caller=user.uid,requestId=nonce();
 const payload={...data,requestId};
 try{return await call(action,payload)}
 catch(error){
  // Reuse the SAME requestId after an ambiguous network failure. The server
  // recognizes replays and will not charge the wallet a second time.
  if(!/unavailable|deadline-exceeded/i.test(error.code||''))throw error;
  if(user?.uid!==caller||currentUser()?.uid!==caller||!playing())
   throw Error('Session changed during request; please reconnect.');
  return call(action,payload);
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
 buyBusiness:businessId=>request('buyBusiness',{businessId}),
 upgradeBusiness:index=>request('upgradeBusiness',{index}),
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
