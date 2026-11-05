/* ProfitLands World 1 — no-billing Cloudflare Workers + D1 backend.
 * The server alone creates income and validates purchases, cooldowns and PvP.
 * One versioned world-state row provides atomic multi-player transactions;
 * request receipts are saved in that same row to prevent double purchases.
 */
import core from './world-core.mjs';
import pvp from './pvp-rules.mjs';

const PROJECT_ID='wtvstudios-5b40f';
const GOOGLE_JWKS='https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const ORIGINS=new Set(['https://willn0tbill.github.io','https://profitlands.winotbill.workers.dev']);
const WORLD_ID=core.WORLD_ID;
const CHAT_ENABLED=false; // Report/block/moderation must exist before enabling.
const ALL_ACTIONS=new Set(['health','register','me','getLeaderboard','getPlayers',
 'buyBusiness','upgradeBusiness','togglePvP','requestAttack','requestDefense',
 'getChat','sendChat','reportMessage']);
const RID=/^[0-9a-f]{32}$/;
const UID=/^[A-Za-z0-9_-]{1,128}$/;
const RECEIPT_RETENTION_MS=72*60*60*1000;
const MAX_RECEIPTS=4096;
let cachedKeys=null,keysUntil=0;

class ApiError extends Error{
 constructor(code,message,status=400){super(message);this.code=code;this.status=status}
}
function err(code,message,status){throw new ApiError(code,message,status)}
function originFor(request){
 const raw=request.headers.get('Origin');
 if(!raw)return null;
 if(ORIGINS.has(raw))return raw;
 // Only local development may use the HTTP origin.
 if(/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(raw))return raw;
 return null;
}
function headers(request){
 const origin=originFor(request);
 const h={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
  'X-Content-Type-Options':'nosniff','Vary':'Origin'};
 if(origin){
  h['Access-Control-Allow-Origin']=origin;
  h['Access-Control-Allow-Methods']='GET, POST, OPTIONS';
  h['Access-Control-Allow-Headers']='Content-Type, Authorization';
  h['Access-Control-Max-Age']='600';
 }
 return h;
}
function json(request,data,status=200){return new Response(JSON.stringify(data),{status,headers:headers(request)})}
function decodeB64(part){
 if(typeof part!=='string'||part.length>10000||!/^[A-Za-z0-9_-]+$/.test(part))err('unauthenticated','Malformed account token.',401);
 const padded=part.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-part.length%4)%4);
 const binary=atob(padded);
 return Uint8Array.from(binary,c=>c.charCodeAt(0));
}
function parseSegment(segment){
 try{return JSON.parse(new TextDecoder().decode(decodeB64(segment)))}
 catch(e){err('unauthenticated','Invalid account token.',401)}
}
async function keys(){
 const now=Date.now();
 if(cachedKeys&&now<keysUntil)return cachedKeys;
 let response;
 try{response=await fetch(GOOGLE_JWKS,{headers:{Accept:'application/json'}})}
 catch(e){err('unavailable','Cannot verify player account right now.',503)}
 if(!response.ok)err('unavailable','Account verification service is unavailable.',503);
 const data=await response.json();
 if(!Array.isArray(data?.keys)||!data.keys.length)err('unavailable','No account signing keys are available.',503);
 const maxAge=Number(response.headers.get('cache-control')?.match(/max-age=(\d+)/i)?.[1]||600);
 cachedKeys=data.keys;
 keysUntil=now+Math.min(3600,Math.max(60,maxAge))*1000;
 return cachedKeys;
}
async function verifyFirebase(token){
 if(typeof token!=='string'||token.length>8000)err('unauthenticated','Please sign in first.',401);
 const chunks=token.split('.');
 if(chunks.length!==3)err('unauthenticated','Invalid account credentials.',401);
 const head=parseSegment(chunks[0]),claims=parseSegment(chunks[1]);
 const now=Math.floor(Date.now()/1000);
 if(head?.alg!=='RS256'||typeof head.kid!=='string'||!head.kid)
  err('unauthenticated','Unsupported account signature.',401);
 if(claims?.aud!==PROJECT_ID||claims.iss!=='https://securetoken.google.com/'+PROJECT_ID||
    typeof claims.sub!=='string'||!UID.test(claims.sub)||
    !Number.isSafeInteger(claims.exp)||claims.exp<=now||
    !Number.isSafeInteger(claims.iat)||claims.iat>now||
    !Number.isSafeInteger(claims.auth_time)||claims.auth_time>now)
  err('unauthenticated','Account token has expired or belongs to a different project.',401);
 const key=(await keys()).find(k=>k.kid===head.kid&&k.kty==='RSA');
 if(!key)err('unauthenticated','The account signing key is unknown.',401);
 let valid=false;
 try{
  const publicKey=await crypto.subtle.importKey('jwk',key,
   {name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
  valid=await crypto.subtle.verify('RSASSA-PKCS1-v1_5',publicKey,decodeB64(chunks[2]),
   new TextEncoder().encode(chunks[0]+'.'+chunks[1]));
 }catch(e){err('unauthenticated','Could not verify account signature.',401)}
 if(!valid)err('unauthenticated','Account signature is invalid.',401);
 return claims.sub;
}
async function identity(request){
 const auth=request.headers.get('Authorization')||'';
 if(!/^Bearer [A-Za-z0-9._-]+$/.test(auth))err('unauthenticated','Sign in to your ProfitLands account.',401);
 return verifyFirebase(auth.slice(7));
}
function blank(){return {players:{},receipts:{}}}
function validateState(obj){
 if(!obj||typeof obj!=='object'||!obj.players||typeof obj.players!=='object'||
  !obj.receipts||typeof obj.receipts!=='object')
  err('internal','World data is unavailable.',500);
 return obj;
}
async function rawWorld(db,init=false){
 let row=await db.prepare('SELECT version, payload FROM world_state WHERE id = ?').bind(WORLD_ID).first();
 if(!row&&init){
  await db.prepare('INSERT OR IGNORE INTO world_state (id,version,payload) VALUES (?,0,?)')
   .bind(WORLD_ID,JSON.stringify(blank())).run();
  row=await db.prepare('SELECT version, payload FROM world_state WHERE id = ?').bind(WORLD_ID).first();
 }
 if(!row)return {version:null,state:blank()};
 let state;
 try{state=validateState(JSON.parse(row.payload))}catch(e){err('internal','World data could not be read.',500)}
 return {version:Number(row.version),state};
}
async function transaction(db,change){
 if(!db?.prepare)err('unavailable','Cloudflare D1 is not configured. Bind the database as DB.',503);
 for(let tries=0;tries<10;tries++){
  const {version,state}=await rawWorld(db,true);
  if(!Number.isSafeInteger(version))err('internal','World state could not initialize.',500);
  const at=Date.now();
  const result=await change(state,at);
  const current=Object.entries(state.receipts||{}).filter(([,v])=>
   v&&Number.isFinite(v.at)&&at-v.at<RECEIPT_RETENTION_MS&&v.at<=at);
  if(current.length>MAX_RECEIPTS)current.sort((a,b)=>a[1].at-b[1].at).splice(0,current.length-MAX_RECEIPTS);
  state.receipts=Object.fromEntries(current);
  const packed=JSON.stringify(state);
  if(packed.length>900000)err('resource-exhausted','World 1 alpha has reached its storage cap.',503);
  const update=await db.prepare('UPDATE world_state SET version=version+1,payload=? WHERE id=? AND version=?')
   .bind(packed,WORLD_ID,version).run();
  if(update?.meta?.changes===1)return result;
 }
 err('unavailable','World 1 is busy. Retry your action.',503);
}
function playerOf(state,uid){
 const p=state.players[uid];
 if(!p||p.uid!==uid)err('failed-precondition','Join World 1 before using online features.',409);
 return p;
}
function display(p){
 return {uid:p.uid,displayName:p.displayName,worldId:WORLD_ID,
  cash:p.cash,netWorth:core.worth(p),businesses:p.businesses,
  pvpEnabled:p.pvpEnabled===true,protectedUntil:p.protectedUntil||0,
  nextAttackAt:p.nextAttackAt||0,dayGain:p.dayGain||0,weekGain:p.weekGain||0};
}
function requireValid(p){
 if(!Number.isSafeInteger(p.cash)||p.cash<0||p.cash>core.MAX_CASH||
  !Number.isSafeInteger(core.worth(p)))err('failed-precondition','Invalid world economy result.',409);
}
function publicRival(p){
 return {uid:p.uid,displayName:p.displayName,pvpEnabled:p.pvpEnabled===true,
  netWorth:core.worth(p),clanId:null};
}
async function alias(uid){
 const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(uid));
 const bytes=new Uint8Array(hash).slice(0,4);
 return 'Tycoon-'+[...bytes].map(x=>x.toString(16).padStart(2,'0')).join('').slice(0,7).toUpperCase();
}
function requestId(body){
 if(typeof body?.requestId!=='string'||!RID.test(body.requestId))
  err('invalid-argument','Invalid payment request identifier.');
 return body.requestId;
}
function paid(state,uid,body,action,argument,apply,at){
 const id=requestId(body),key=uid+':'+id;
 const old=state.receipts[key];
 const parameter=JSON.stringify(argument);
 if(old){
  if(old.action!==action||old.parameter!==parameter)
   err('invalid-argument','This request ID was used for another action.');
  return {...old.result,replayed:true};
 }
 const response=apply();
 state.receipts[key]={at,action,parameter,result:response};
 return response;
}
function settleAll(state,at){
 return Object.values(state.players).map(p=>core.settle(p,at));
}
function checkPlayerCount(state){
 if(Object.keys(state.players).length>=core.MAX_PLAYERS)
  err('resource-exhausted','World 1 alpha is full.',503);
}
async function dispatch(action,uid,body,db){
 if(action==='health'){
  if(!db?.prepare)err('unavailable','World 1 database is not connected.',503);
  return {ok:true,worldId:WORLD_ID,chatEnabled:CHAT_ENABLED,version:2,catalog:core.BUSINESS_TYPES};
 }
 if(action==='getChat')return [];
 if(action==='sendChat'||action==='reportMessage')
  err('failed-precondition','World chat is disabled pending moderation.',409);
 if(action==='getLeaderboard'||action==='getPlayers'||action==='me'){
  const {state}=await rawWorld(db);
  playerOf(state,uid);
  const at=Date.now();
  if(action==='me')return {worldId:WORLD_ID,player:display(core.settle(state.players[uid],at))};
  const list=settleAll(state,at);
  if(action==='getPlayers')return list.filter(p=>p.uid!==uid).map(publicRival).slice(0,63);
  if(!['day','week','all'].includes(body.period))err('invalid-argument','Unknown leaderboard period.');
  return list.map(p=>({uid:p.uid,displayName:p.displayName,score:core.score(p,body.period,at)}))
   .sort((a,b)=>b.score-a.score||a.uid.localeCompare(b.uid)).slice(0,20);
 }
 if(action==='register'){
  const name=await alias(uid);
  return transaction(db,(state,at)=>{
   if(state.players[uid])return {worldId:WORLD_ID,player:display(core.settle(state.players[uid],at)),created:false};
   checkPlayerCount(state);
   const player=core.fresh(uid,name,at);
   state.players[uid]=player;
   return {worldId:WORLD_ID,player:display(player),created:true};
  });
 }
 return transaction(db,(state,at)=>{
  const own=playerOf(state,uid),p=core.settle(own,at),seconds=Math.floor(at/1000);
  if(action==='buyBusiness'||action==='upgradeBusiness'){
   return paid(state,uid,body,action,action==='buyBusiness'?body.businessId:body.index,()=>{
    const result=action==='buyBusiness'?core.buyBusiness(p,body.businessId,at):
     core.upgradeBusiness(p,body.index,at);
    if(!result.ok)err('failed-precondition',result.error||'Purchase rejected.',409);
    requireValid(result.player);
    state.players[uid]=result.player;
    return {player:display(result.player),cost:result.cost||0,replayed:false};
   },at);
  }
  if(action==='togglePvP'){
   if((p.lastPvPSwitchAt||0)>seconds-300)err('failed-precondition','Wait five minutes before switching PvP.',409);
   if(p.pvpEnabled&&(p.nextAttackAt||0)>seconds)
    err('failed-precondition','Cannot disable PvP immediately after an attack.',409);
   p.pvpEnabled=!p.pvpEnabled;p.lastPvPSwitchAt=seconds;
   state.players[uid]=p;return {player:display(p),cost:0};
  }
  if(action==='requestDefense'){
   return paid(state,uid,body,action,null,()=>{
    const result=pvp.applyDefense({player:p,nowSeconds:seconds,ownEmpireWorth:core.worth(p)});
    if(!result.ok)err('failed-precondition','Defense blocked: '+result.reason,409);
    result.player.dayGain-=result.cost;result.player.weekGain-=result.cost;
    state.players[uid]=result.player;
    return {ok:true,replayed:false,event:result.event,player:display(result.player)};
   },at);
  }
  if(action==='requestAttack'){
   if(typeof body.targetUid!=='string'||!UID.test(body.targetUid)||body.targetUid===uid)
    err('invalid-argument','Invalid rival account.');
   if(!pvp.ATTACKS.some(option=>option.id===body.attackId))err('invalid-argument','Unknown PvP action.');
   const argument={targetUid:body.targetUid,attackId:body.attackId};
   return paid(state,uid,body,action,argument,()=>{
    const target=core.settle(playerOf(state,body.targetUid),at);
    const targetValue=Math.max(0,...target.businesses.map(core.valueOf));
    if(!targetValue)err('failed-precondition','The rival has no attackable business.',409);
    // Clans remain on Firebase; World 1 intentionally uses only mutually
    // opted-in PvP rather than trusting a clan value from a browser.
    const result=pvp.applyAttack({attacker:p,defender:target,attackId:body.attackId,
      targetCompanyValue:targetValue,nowSeconds:seconds});
    if(!result.ok)err('failed-precondition','PvP blocked: '+result.reason,409);
    result.attacker.dayGain-=result.cost;result.attacker.weekGain-=result.cost;
    state.players[uid]=result.attacker;
    state.players[body.targetUid]=result.defender;
    return {ok:true,replayed:false,event:result.event,player:display(result.attacker)};
   },at);
  }
  err('invalid-argument','Unknown world operation.');
 });
}
export default {
 async fetch(request,env){
  const url=new URL(request.url);
  if(!['/','/api','/health'].includes(url.pathname))return json(request,{error:{code:'not-found',message:'Route not found.'}},404);
  if(request.headers.has('Origin')&&!originFor(request))
   return json(request,{error:{code:'permission-denied',message:'Origin not authorized.'}},403);
  if(request.method==='OPTIONS'){
   return new Response(null,{status:204,headers:headers(request)});
  }
  if(request.method!=='POST'&&!(request.method==='GET'&&url.pathname==='/health'))
   return json(request,{error:{code:'method-not-allowed',message:'Use POST /api.'}},405);
  if(request.method==='POST'&&!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))
   return json(request,{error:{code:'invalid-argument',message:'Use application/json.'}},415);
  try{
   let body={action:'health'};
   if(request.method==='POST'){
    const length=Number(request.headers.get('content-length')||0);
    if(length>8192)err('invalid-argument','Request body too large.');
    const raw=await request.text();
    if(raw.length>8192)err('invalid-argument','Request body too large.');
    try{body=JSON.parse(raw)}catch(e){err('invalid-argument','Invalid request JSON.')}
   }
   if(!body||typeof body!=='object'||!ALL_ACTIONS.has(body.action))
    err('invalid-argument','Unknown world action.');
   const uid=body.action==='health'?null:await identity(request);
   const data=await dispatch(body.action,uid,body,env?.DB);
   return json(request,data);
  }catch(e){
   const failure=e instanceof ApiError?e:new ApiError('internal','World 1 request failed.',500);
   // Never return D1 errors, token contents, or internal stack traces to clients.
   return json(request,{error:{code:failure.code,message:failure.message}},failure.status);
  }
 }
};
export {verifyFirebase,dispatch,transaction,rawWorld};
