/* ProfitLands World 1 — free Cloudflare Worker transport.
 * Firebase is used ONLY for account identity: the Worker verifies its signed
 * ID token and stores all multiplayer cash and purchases in Cloudflare D1.
 * This file never trusts/updates local singleplayer currency.
 */
(function(){
'use strict';
let connected=false,user=null,catalog=[],chatEnabled=false,connecting=null,epoch=0,connectedWorld=null;
const WORLDS=Object.freeze([
 {id:'world1',region:'Americas',label:'World 1 · Americas'},
 {id:'world-europe',region:'Europe',label:'World 2 · Europe'},
 {id:'world-asia',region:'Asia',label:'World 3 · Asia'}
]);
const WORLD_KEY='profitlands-selected-world-v1';
let selectedWorld='world1';
try{const saved=window.localStorage?.getItem(WORLD_KEY);
 if(WORLDS.some(w=>w.id===saved))selectedWorld=saved;
}catch(e){}
const getWorld=()=>WORLDS.find(w=>w.id===selectedWorld)||WORLDS[0];
const pendingMutations=new Map();
let lastProbeAt=0,lastProbeResult=false,probeInFlight=null;
const PROBE_TTL_MS=15000;
const playing=()=>window.state?.playType==='multi'&&
 Boolean(document.getElementById('gameScreen')?.classList.contains('active'));
const currentUser=()=>{
 try{return window.firebase?.auth?.().currentUser||null}catch(e){return null}
};
// Firebase auth may still be restoring a session from this browser's storage
// when the player clicks Connect. Never treat a pending restore as a logout.
async function restoredUser(){
 const existing=currentUser();
 if(existing)return existing;
 const ready=window.profitlandsFirebase?.waitForAuth?.();
 if(ready&&typeof ready.then==='function'){
  let timer;
  try{
   await Promise.race([
    ready,
    new Promise(resolve=>{timer=setTimeout(resolve,7000)})
   ]);
  }finally{clearTimeout(timer)}
 }
 return currentUser();
}
const endpoint=()=>{
 const raw=String(window.PROFITLANDS_WORLD1_ENDPOINT||'').trim();
 try{
  const url=new URL(raw);
  // Protect account tokens: only send them to the expected Worker name.
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||
    !/^profitlands-world1\.[a-z0-9-]+\.workers\.dev$/.test(url.hostname)||
    url.pathname!=='/'&&url.pathname!=='')return '';
  return url.origin;
 }catch(e){return ''}
};
function ready(){return Boolean(endpoint()&&typeof fetch==='function')}
function emit(){
 if(typeof CustomEvent==='function')window.dispatchEvent(new CustomEvent('profitlands:serverupdate'));
}
/* A configured URL is not proof the Worker is deployed: Cloudflare's default
 * "Hello World!" responds 200 but is not a usable multiplayer backend.
 * Health never requires or sends a Firebase account token.
 */
async function probe(force=false){
 if(!ready())return false;
 if(probeInFlight)return probeInFlight;
 if(!force&&lastProbeAt&&Date.now()-lastProbeAt<PROBE_TTL_MS)return lastProbeResult;
 const world=selectedWorld;
 const task=(async()=>{
  let ok=false;
  try{
   const result=await call('health',{},world);
   ok=result?.ok===true&&result.worldId===world&&Array.isArray(result.catalog);
  }catch(e){}
  if(selectedWorld===world){lastProbeResult=ok;lastProbeAt=Date.now()}
  return selectedWorld===world&&ok;
 })();
 probeInFlight=task;
 try{return await task}
 finally{if(probeInFlight===task)probeInFlight=null}
}
async function call(action,data={},worldId=selectedWorld){
 const origin=endpoint();
 if(!origin)throw Error('World 1 has not been deployed. Set the Cloudflare Worker URL in world1-config.js.');
 if(typeof fetch!=='function')throw Error('Your browser cannot reach the multiplayer server.');
 const account=currentUser();
 if(action!=='health'&&!account)throw Error('Please sign into your ProfitLands account.');
 let token='';
 if(action!=='health'){
  try{token=await account.getIdToken()}catch(e){throw Error('Your account could not be verified. Sign in again.')}
 }
 const abort=typeof AbortController==='function'?new AbortController():null;
 const timer=abort?setTimeout(()=>abort.abort(),15000):null;
 try{
  if(worldId!==selectedWorld)throw Error('World selection changed during this request.');
  const response=await fetch(origin+'/api',{method:'POST',mode:'cors',cache:'no-store',
   headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},
   body:JSON.stringify({action,...data,worldId}),...(abort?{signal:abort.signal}:{})});
  let result;
  try{result=await response.json()}catch(e){result=null}
  if(!response.ok||!result||result.error){
   const code=String(result?.error?.code|| (response.status===401?'unauthenticated':
    response.status===503?'unavailable':'internal'));
   const error=new Error(String(result?.error?.message||'World 1 is not responding correctly.').slice(0,220));
   error.code=code;
   if(code==='unauthenticated'){connected=false;emit()}
   throw error;
  }
  return result;
 }catch(error){
  if(error?.code)throw error;
  const e=new Error(error?.name==='AbortError'?'World 1 timed out. Try again.':
   'Could not reach World 1. Confirm the free Cloudflare Worker is deployed.');
  e.code=error?.name==='AbortError'?'deadline-exceeded':'unavailable';
  throw e;
 }finally{if(timer!==null)clearTimeout(timer)}
}
async function connect(){
 if(connected&&connectedWorld===selectedWorld&&user?.uid===currentUser()?.uid)return true;
 if(connecting)return connecting;
 const worldId=selectedWorld;
 let task;
 task=(async()=>{
  const token=epoch;
  try{
   const signed=await restoredUser();
   if(!signed)throw Error('Please sign in to your ProfitLands account on this page to join a world.');
   if(!playing())throw Error('Open Multiplayer before connecting to a world.');
   const health=await call('health',{},worldId);
   if(!health?.ok||health.worldId!==worldId||!Array.isArray(health.catalog))
    throw Error('The Cloudflare server is not serving the selected regional world.');
   if(selectedWorld===worldId){lastProbeResult=true;lastProbeAt=Date.now()}
   const result=await call('register',{},worldId);
   if(!result?.player?.uid||result.player.uid!==signed.uid||result.worldId!==worldId||
      result.player.worldId!==worldId)
    throw Error('Server returned the wrong player identity or world.');
   if(epoch!==token||selectedWorld!==worldId||currentUser()?.uid!==signed.uid||!playing())
    throw Error('Account session or region changed while connecting.');
   catalog=health.catalog;chatEnabled=health.chatEnabled===true;
   user=signed;connectedWorld=worldId;connected=true;emit();return true;
  }catch(error){
   if(epoch===token){
    const wasConnected=connected;connected=false;connectedWorld=null;
    if(wasConnected)emit();
   }
   throw error;
  }finally{if(connecting===task)connecting=null}
 })();
 connecting=task;
 return task;
}
function disconnect(){epoch++;connected=false;connectedWorld=null;user=null;catalog=[];chatEnabled=false;emit()}
function selectWorld(worldId){
 if(!WORLDS.some(w=>w.id===worldId))return false;
 if(worldId===selectedWorld)return true;
 selectedWorld=worldId;
 try{window.localStorage?.setItem(WORLD_KEY,worldId)}catch(e){}
 lastProbeAt=0;lastProbeResult=false;probeInFlight=null;connecting=null;
 disconnect();
 return true;
}
function requireSession(){
 if(!connected||!playing()||connectedWorld!==selectedWorld||user?.uid!==currentUser()?.uid)
  throw Error('Connect to '+(selectedWorld==='world1'?'World 1':getWorld().label)+' first.');
}
async function request(action,data={}){requireSession();return call(action,data)}
function nonce(){
 if(!window.crypto?.getRandomValues)throw Error('Secure request IDs are unavailable.');
 const bytes=new Uint8Array(16);window.crypto.getRandomValues(bytes);
 return Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('');
}
async function paid(action,data={}){
 requireSession();
 const caller=user.uid,requestWorld=selectedWorld;
 const fingerprint=JSON.stringify(requestWorld==='world1'?[caller,action,data]:[caller,action,data,requestWorld]);
 const storageKey='profitlands-'+requestWorld+'-pending:'+fingerprint;
 let rid=pendingMutations.get(fingerprint);
 if(!rid){
  try{
   const saved=JSON.parse(window.sessionStorage?.getItem(storageKey)||'null');
   if(saved&&Date.now()-saved.createdAt<86400000&&Date.now()>=saved.createdAt&&
      /^[0-9a-f]{32}$/.test(saved.requestId))rid=saved.requestId;
  }catch(e){}
 }
 if(!rid)rid=nonce();
 pendingMutations.set(fingerprint,rid);
 try{window.sessionStorage?.setItem(storageKey,JSON.stringify({requestId:rid,createdAt:Date.now()}))}catch(e){}
 const clear=()=>{
  pendingMutations.delete(fingerprint);
  try{window.sessionStorage?.removeItem(storageKey)}catch(e){}
 };
 try{
  let answer;
  try{answer=await call(action,{...data,requestId:rid},requestWorld)}
  catch(e){
   if(!['unavailable','deadline-exceeded'].includes(e.code))throw e;
   if(user?.uid!==caller||currentUser()?.uid!==caller||!playing()||selectedWorld!==requestWorld)
    throw Error('Your account session changed during the request.');
   answer=await call(action,{...data,requestId:rid},requestWorld);
  }
  clear();return answer;
 }catch(e){
  if(!['unavailable','deadline-exceeded'].includes(e.code))clear();
  throw e;
 }
}
window.ProfitLandsOnline={
 connect,disconnect,selectWorld,getSelectedWorld:()=>selectedWorld,getWorld:getWorld,
 getWorlds:()=>WORLDS.map(w=>({...w})),
 probe,isConnected:()=>connected&&playing()&&connectedWorld===selectedWorld&&user?.uid===currentUser()?.uid,
 isConfigured:ready,endpoint,chatEnabled:()=>chatEnabled,getCatalog:()=>catalog.slice(),
 getMyEmpire:()=>request('me'),
 getLeaderboard:period=>request('getLeaderboard',{period}),
 getPlayers:()=>request('getPlayers'),
 buyBusiness:businessId=>paid('buyBusiness',{businessId}),
 upgradeBusiness:index=>paid('upgradeBusiness',{index}),
 togglePvP:()=>request('togglePvP'),
 requestAttack:({targetUid,attackId})=>paid('requestAttack',{targetUid,attackId}),
 requestDefense:()=>paid('requestDefense'),
 getChat:()=>chatEnabled?request('getChat'):Promise.resolve([]),
 sendChat:text=>chatEnabled?request('sendChat',{text}):Promise.reject(Error('World chat is currently disabled.')),
 reportMessage:messageId=>chatEnabled?request('reportMessage',{messageId}):Promise.reject(Error('World chat is currently disabled.')),
 blockChatUser:targetUid=>chatEnabled?request('blockChatUser',{targetUid}):Promise.reject(Error('World chat is currently disabled.')),
 unblockChatUser:targetUid=>chatEnabled?request('unblockChatUser',{targetUid}):Promise.reject(Error('World chat is currently disabled.')),
 getBlockedChatUsers:()=>chatEnabled?request('getBlockedChatUsers'):Promise.resolve([]),
 getChatReports:()=>request('getChatReports'),
 moderateChat:(messageId,decision)=>request('moderateChat',{messageId,decision})
};
window.addEventListener('load',()=>{
 if(!window.firebase?.auth)return;
 window.firebase.auth().onAuthStateChanged(next=>{
  if(!next||next.uid!==user?.uid)disconnect();
 });
});
})();