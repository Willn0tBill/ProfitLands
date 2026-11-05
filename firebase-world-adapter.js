/* ProfitLands World 1 — free Cloudflare Worker transport.
 * Firebase is used ONLY for account identity: the Worker verifies its signed
 * ID token and stores all multiplayer cash and purchases in Cloudflare D1.
 * This file never trusts/updates local singleplayer currency.
 */
(function(){
'use strict';
let connected=false,user=null,catalog=[],chatEnabled=false,connecting=null,epoch=0;
const pendingMutations=new Map();
let lastProbeAt=0,lastProbeResult=false,probeInFlight=null;
const PROBE_TTL_MS=15000;
const playing=()=>window.state?.playType==='multi'&&
 Boolean(document.getElementById('gameScreen')?.classList.contains('active'));
const currentUser=()=>{
 try{return window.firebase?.auth?.().currentUser||null}catch(e){return null}
};
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
 probeInFlight=(async()=>{
  try{
   const result=await call('health');
   lastProbeResult=result?.ok===true&&result.worldId==='world1'&&Array.isArray(result.catalog);
  }catch(error){lastProbeResult=false}
  finally{lastProbeAt=Date.now()}
  return lastProbeResult;
 })();
 try{return await probeInFlight}
 finally{probeInFlight=null}
}
async function call(action,data={}){
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
  const response=await fetch(origin+'/api',{method:'POST',mode:'cors',cache:'no-store',
   headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},
   body:JSON.stringify({action,...data}),...(abort?{signal:abort.signal}:{})});
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
 if(connected&&user?.uid===currentUser()?.uid)return true;
 if(connecting)return connecting;
 connecting=(async()=>{
  const token=epoch;
  try{
   const signed=currentUser();
   if(!signed)throw Error('Please sign in from the homepage or account menu first.');
   if(!playing())throw Error('Open Multiplayer before connecting to World 1.');
   const health=await call('health');
   if(!health?.ok||health.worldId!=='world1'||!Array.isArray(health.catalog))throw Error('The Cloudflare server is not serving World 1.');
   lastProbeResult=true;lastProbeAt=Date.now();
   const result=await call('register');
   if(!result?.player?.uid||result.player.uid!==signed.uid)throw Error('Server returned the wrong player identity.');
   if(epoch!==token||currentUser()?.uid!==signed.uid||!playing())
    throw Error('Session changed while connecting.');
   catalog=Array.isArray(health.catalog)?health.catalog:[];
   chatEnabled=health.chatEnabled===true;
   user=signed;connected=true;emit();return true;
  }catch(error){connected=false;emit();throw error}
  finally{connecting=null}
 })();
 return connecting;
}
function disconnect(){epoch++;connected=false;user=null;catalog=[];chatEnabled=false;emit()}
function requireSession(){
 if(!connected||!playing()||user?.uid!==currentUser()?.uid)throw Error('Connect to World 1 first.');
}
async function request(action,data={}){requireSession();return call(action,data)}
function nonce(){
 if(!window.crypto?.getRandomValues)throw Error('Secure request IDs are unavailable.');
 const bytes=new Uint8Array(16);window.crypto.getRandomValues(bytes);
 return Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('');
}
async function paid(action,data={}){
 requireSession();
 const caller=user.uid;
 const fingerprint=JSON.stringify([caller,action,data]);
 const storageKey='profitlands-world1-pending:'+fingerprint;
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
  try{answer=await call(action,{...data,requestId:rid})}
  catch(e){
   if(!['unavailable','deadline-exceeded'].includes(e.code))throw e;
   if(user?.uid!==caller||currentUser()?.uid!==caller||!playing())
    throw Error('Your account session changed during the request.');
   answer=await call(action,{...data,requestId:rid});
  }
  clear();return answer;
 }catch(e){
  if(!['unavailable','deadline-exceeded'].includes(e.code))clear();
  throw e;
 }
}
window.ProfitLandsOnline={
 connect,disconnect,probe,isConnected:()=>connected&&playing()&&user?.uid===currentUser()?.uid,
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
 reportMessage:messageId=>chatEnabled?request('reportMessage',{messageId}):Promise.reject(Error('World chat is currently disabled.'))
};
window.addEventListener('load',()=>{
 if(!window.firebase?.auth)return;
 window.firebase.auth().onAuthStateChanged(next=>{
  if(!next||next.uid!==user?.uid)disconnect();
 });
});
})();