/* ProfitLands World 1 — no-billing Cloudflare Workers + D1 backend.
 * Server-authoritative purchases, income, PvP and replay protection.
 * Legacy single-row worlds remain readable; opt-in V2 stores individual
 * players, receipts and regional metadata with atomic D1 batch transfers.
 */
import core from './world-core.mjs';
import pvp from './pvp-rules.mjs';
import enterprise from './world-enterprise.mjs';
import achievements from './world-achievements.mjs';
import {encodeLedger,decodeLedger} from './world-ledger.mjs';
import {readNormalized,transactNormalized,migrateLegacy} from './world-store-v2.mjs';
import {censorChat} from './chat-filter.mjs';
import {checkIp,checkUid} from './world-rate-limit.mjs';
import {validateClientPayload} from './world-anticheat.mjs';
import {checkDistributed} from './world-security-rate.mjs';
import {secureMarketPlan,secureQuote,PERIOD_MS} from './world-secure-market.mjs';
import {isParked,activeCount,parkOldest,reactivate} from './world-slots.mjs';

const PROJECT_ID='wtvstudios-5b40f';
const GOOGLE_JWKS='https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const ORIGINS=new Set(['https://willn0tbill.github.io','https://profitlands.winotbill.workers.dev']);
// World 1 remains Americas, preserving the existing production ledger.
const WORLD_ID=core.WORLD_ID;
const WORLDS=Object.freeze([
 {id:'world1',region:'Americas',label:'World 1 · Americas'},
 {id:'world-europe',region:'Europe',label:'World 2 · Europe'},
 {id:'world-asia',region:'Asia',label:'World 3 · Asia'}
]);
const worldById=id=>WORLDS.find(w=>w.id===id);
function worldFor(id){
 if(id===undefined)return WORLD_ID;
 if(typeof id!=='string'||!worldById(id))
  err('invalid-argument','Unknown world. Choose Americas, Europe or Asia.',400);
 return id;
}
// Limited text chat beta: server-moderated, rate-limited, region-scoped and
// automatically concealed after independent reports. Never display HTML.
const CHAT_ENABLED=true;
// Chat works with automatic filtering and self-service reports/blocks.
// Optional trusted moderator accounts retain restricted review and removal tools.
const chatAvailable=env=>CHAT_ENABLED&&String(env?.CHAT_DISABLED||'').toLowerCase()!=='true';
const CHAT_LIMIT=60,CHAT_TEXT_LIMIT=160,CHAT_COOLDOWN_MS=20000;
const CHAT_RETENTION_MS=24*60*60*1000;
const CHAT_REPORT_LIMIT=2;
const CHAT_BLOCK_LIMIT=48;
const READ_ONLY_ACTIONS=new Set(['health','me','getLeaderboard','getPlayers',
 'getListings','getChat','getBlockedChatUsers','getChatReports','getAccountAchievements']);
const ALL_ACTIONS=new Set(['health','register','me','getLeaderboard','getPlayers','getListings','getAccountAchievements',
 'buyListedCompany',
 'buyBusiness','upgradeBusiness','enterpriseAction','togglePvP','requestAttack','requestDefense',
 'getChat','getBlockedChatUsers','sendChat','reportMessage','blockChatUser','unblockChatUser',
 'getChatReports','moderateChat']);
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
function json(request,data,status=200,extra={}){return new Response(JSON.stringify(data),{status,headers:{...headers(request),...extra}})}
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
async function attachMarket(state,env,worldId,at=Date.now()){
 if(!env?.WORLD_MARKET_SECRET||!state?.players)return state;
 const random=await secureMarketPlan(env.WORLD_MARKET_SECRET,worldId,at);
 const quotes=new Map();
 for(const period of random.keys()){
  const when=period*PERIOD_MS,event=core.worldEvent(when,worldId),prices={};
  for(const asset of core.SHARE_CATALOG){
   const news=(event.effects[asset.sector]||1)-1;
   prices[asset.id]=secureQuote(random,asset.id,when,core.SHARE_CATALOG,news);
  }
  quotes.set(period,prices);
 }
 const context={quotes};
 for(const p of Object.values(state.players))core.setMarketContext(p,context);
 return state;
}
async function rawWorld(db,init=false,worldId=WORLD_ID,env=null,accountIds=undefined){
 if(env?.WORLD_STORAGE_V2==='enabled'){
  const result=await readNormalized(db,worldId,null,accountIds);
  await attachMarket(result.state,env,worldId);
  return result;
 }
 let row=await db.prepare('SELECT version, payload FROM world_state WHERE id = ?').bind(worldId).first();
 if(!row&&init){
  await db.prepare('INSERT OR IGNORE INTO world_state (id,version,payload) VALUES (?,0,?)')
   .bind(worldId,JSON.stringify(blank())).run();
  row=await db.prepare('SELECT version, payload FROM world_state WHERE id = ?').bind(worldId).first();
 }
 if(!row)return {version:null,state:blank()};
 let state;
 try{state=validateState(await decodeLedger(row.payload))}
 catch(e){err('internal','World data could not be read.',500)}
 await attachMarket(state,env,worldId);
 return {version:Number(row.version),state};
}
async function transaction(db,change,worldId=WORLD_ID,env=null,receiptKey=null,accountIds=undefined,requireRegionalGuard=false){
 if(env?.WORLD_STORAGE_V2==='enabled')
  return transactNormalized(db,worldId,async(state,at)=>{
   await attachMarket(state,env,worldId,at);
   return change(state,at);
  },receiptKey,accountIds,requireRegionalGuard);
 if(!db?.prepare)err('unavailable','Cloudflare D1 is not configured. Bind the database as DB.',503);
 for(let tries=0;tries<10;tries++){
  const {version,state}=await rawWorld(db,true,worldId);
  if(!Number.isSafeInteger(version))err('internal','World state could not initialize.',500);
  const at=Date.now();
  const result=await change(state,at);
  const current=Object.entries(state.receipts||{}).filter(([,v])=>
   v&&Number.isFinite(v.at)&&at-v.at<RECEIPT_RETENTION_MS&&v.at<=at);
  if(current.length>MAX_RECEIPTS)current.sort((a,b)=>a[1].at-b[1].at).splice(0,current.length-MAX_RECEIPTS);
  state.receipts=Object.fromEntries(current);
  let packed;
  try{packed=(await encodeLedger(state)).payload}
  catch(e){
   if(e?.message==='world_ledger_overflow')
    err('resource-exhausted','The regional world storage limit was reached.',503);
   throw e;
  }
  const update=await db.prepare('UPDATE world_state SET version=version+1,payload=? WHERE id=? AND version=?')
   .bind(packed,worldId,version).run();
  if(update?.meta?.changes===1)return result;
 }
 err('unavailable','World 1 is busy. Retry your action.',503);
}
function playerOf(state,uid){
 const p=state.players[uid];
 if(!p||p.uid!==uid)err('failed-precondition','Join World 1 before using online features.',409);
 if(isParked(p))err('resource-exhausted',
  'Your account is safely parked. Rejoin this region when an active slot is available.',503);
 return p;
}
function display(p,worldId=WORLD_ID){
 return {uid:p.uid,displayName:p.displayName,worldId,
  cash:p.cash,netWorth:core.worth(p),businesses:p.businesses,
   incomePerSecond:core.perSecond(p),enterprise:enterprise.summary(p),
   achievements:achievements.summary(p),
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
function paid(state,uid,body,action,argument,apply,at,worldId=WORLD_ID){
 const id=requestId(body),key=uid+':'+id;
 const old=state.receipts[key];
 const parameter=JSON.stringify(argument);
 if(old){
  if(old.action!==action||old.parameter!==parameter)
   err('invalid-argument','This request ID was used for another action.');
  // New receipts store only payment metadata. Never store a complete player
  // snapshot for every click; that quickly exhausts the D1 world-state row.
  const result={...old.result,replayed:true};
  if(!result.player&&state.players[uid])
   result.player=display(core.settle(state.players[uid],at),worldId);
  return result;
 }
 const response=apply();
 const receipt={...response};
 delete receipt.player;
 state.receipts[key]={at,action,parameter,result:receipt};
 return response;
}
function settleAll(state,at){
 return Object.values(state.players).filter(p=>!isParked(p)).map(p=>core.settle(p,at));
}
function checkPlayerCount(state,worldId=WORLD_ID){
 if(activeCount(state)>=core.MAX_PLAYERS)
  err('resource-exhausted',worldById(worldId).region+' world is full ('+core.MAX_PLAYERS+' active players). No inactive account is eligible for safe parking yet.',503);
}
// All text must be plain, short and free of off-platform contact information.
// This screening is defense-in-depth, not a substitute for active moderation.
function chatText(raw){
 if(typeof raw!=='string')err('invalid-argument','Write a short text message.');
 const text=raw.normalize('NFKC').replace(/[\u0000-\u001f\u007f-\u009f]/g,' ')
  .replace(/\s+/g,' ').trim();
 if(text.length<2||text.length>CHAT_TEXT_LIMIT)
  err('invalid-argument','Messages must contain 2–160 characters.');
 const unsafe=/https?:\/\/|www\.|\b\S+@\S+\.\S+\b|\b(?:discord|snapchat|telegram|whatsapp|instagram|tiktok)\b|\b(?:dm me|send your number|my phone|my address|meet me at)\b|(?:\+?\d[\s().-]?){8,}|\b(?:rape)\b/i;
 if(unsafe.test(text))err('invalid-argument','Message blocked: do not post links, contact details or unsafe content.');
 if(/(.)\1{11,}/u.test(text))err('invalid-argument','Please avoid repetitive spam.');
 const screened=censorChat(text);
 if(screened.blocked)err('invalid-argument','Targeted harassment is not allowed in chat.');
 return screened;
}
function chatMessages(state){
 if(!Array.isArray(state.chat))state.chat=[];
 return state.chat;
}
function cleanChat(state,at){
 state.chat=chatMessages(state).filter(m=>m&&Number.isFinite(m.at)&&m.at<=at&&at-m.at<CHAT_RETENTION_MS)
  .slice(-CHAT_LIMIT);
}
function publicChatMessage(m){
 return {id:m.id,uid:m.uid,displayName:m.displayName,text:m.text,at:m.at};
}
function visibleChat(state,viewer,at){
 const hidden=new Set(viewer.chatHiddenIds||[]);
 const blocked=new Set(viewer.chatBlockedUids||[]);
 return (state.chat||[]).filter(m=>m&&m.at>at-CHAT_RETENTION_MS&&!m.hidden&&
  !hidden.has(m.id)&&!blocked.has(m.uid)).slice(-40).map(publicChatMessage);
}
function moderator(uid,env){
 const names=String(env?.CHAT_MODERATOR_UIDS||'').split(',').map(x=>x.trim());
 return names.some(id=>id&&id===uid);
}
function requireModerator(uid,env){
 if(!moderator(uid,env))err('permission-denied','Moderator access required.',403);
}
async function dispatch(action,uid,body,db,worldId=WORLD_ID,env=null){
 // Production cutovers must freeze all world writes while a verified
 // read-only legacy backup is staged into normalized D1 records.
 const maintenance=String(env?.WORLD_MAINTENANCE_READONLY||'').toLowerCase()==='true';
 if(maintenance&&!READ_ONLY_ACTIONS.has(action))
  err('unavailable','Regional multiplayer is in read-only maintenance.',503);
 // Emergency kill switch must protect writes as well as the health-advertised UI.
 if(!chatAvailable(env)&&[
  'getChat','getBlockedChatUsers','sendChat','reportMessage','blockChatUser',
  'unblockChatUser'
 ].includes(action))err('failed-precondition','Regional chat is temporarily disabled.',409);
 if(action==='health'){
  if(!db?.prepare)err('unavailable','World 1 database is not connected.',503);
  try{
   if(env?.WORLD_STORAGE_V2==='enabled'){
    const row=await db.prepare('SELECT version FROM world_meta WHERE world_id=?')
     .bind(worldId).first();
    if(!row)err('unavailable','World 1 database migration is incomplete.',503);
   }else await rawWorld(db,false,worldId,env);
  }catch(e){err('unavailable','World 1 database schema is not ready.',503)}
  return {ok:true,worldId,region:worldById(worldId).region,
    worlds:WORLDS,maxPlayers:core.MAX_PLAYERS,chatEnabled:chatAvailable(env),
    version:env?.WORLD_STORAGE_V2==='enabled'?6:5,maintenance,
    enterpriseEnabled:true,catalog:core.BUSINESS_TYPES};
 }
 if(action==='getAccountAchievements'){
  // Combined account-wide ranks are the highest earned rank for each track
  // across independent server-verified regions. Never sum duplicate trophies.
  // No cross-region mutation, money transfer, or client-authored rank input.
  const regions=[];
  for(const world of WORLDS){
   const {state}=await rawWorld(db,false,world.id,env,[uid]);
   const player=state.players?.[uid];
   if(player)regions.push({worldId:world.id,region:world.region,
    summary:achievements.summary(player)});
  }
  if(!regions.length)err('failed-precondition','Join a world first.',409);
  const sectors=core.BUSINESS_TYPES.map(({id,name})=>{
   const ranks={};
   for(const item of regions){
    const found=item.summary.sectors.find(s=>s.id===id);
    for(const [track,rank] of Object.entries(found?.ranks||{}))
     ranks[track]=Math.max(Number(ranks[track]||0),Math.max(0,Number(rank)||0));
   }
   return {id,name,ranks,earned:Object.values(ranks).reduce((a,b)=>a+b,0)};
  });
  return {source:'server_verified_regions',total:131072,
   earned:sectors.reduce((sum,s)=>sum+s.earned,0),
   sectors,regions:regions.map(({worldId,region,summary})=>
    ({worldId,region,earned:summary.earned}))};
 }
 if(action==='getChat'||action==='getBlockedChatUsers'){
  const {state}=await rawWorld(db,false,worldId,env,
   action==='getChat'?[uid]:undefined);
  const viewer=playerOf(state,uid);
  if(action==='getChat')return visibleChat(state,viewer,Date.now());
  return (viewer.chatBlockedUids||[]).map(id=>state.players[id]&&
   {uid:id,displayName:state.players[id].displayName}).filter(Boolean);
 }
 if(action==='getChatReports'){
  requireModerator(uid,env);
  const {state}=await rawWorld(db,false,worldId,env,[uid]);
  playerOf(state,uid);
  return (state.chat||[]).filter(m=>Array.isArray(m.reports)&&m.reports.length)
   .slice(-40).map(m=>({...publicChatMessage(m),reportCount:m.reports.length,hidden:m.hidden===true}));
 }

 if(action==='getListings'){
  const {state}=await rawWorld(db,false,worldId,env);
  playerOf(state,uid);
  const at=Date.now(),entries=[];
  for(const seller of Object.values(state.players).filter(p=>!isParked(p))){
   for(const [index,b] of (seller.businesses||[]).entries()){
    const listing=b.listing;
    if(!listing||!Number.isSafeInteger(listing.price)||listing.price<1||
     !Number.isFinite(listing.expiresAt)||listing.expiresAt<=at)continue;
    entries.push({sellerUid:seller.uid,displayName:seller.displayName,
     index,type:b.type,level:b.level,price:listing.price,
     sites:b.sites?.length||1,expiresAt:listing.expiresAt});
   }
  }
  return entries.sort((a,b)=>a.price-b.price||a.sellerUid.localeCompare(b.sellerUid)).slice(0,60);
 }
 if(action==='getLeaderboard'||action==='getPlayers'||action==='me'){
  const {state}=await rawWorld(db,false,worldId,env,action==='me'?[uid]:undefined);
  playerOf(state,uid);
  const at=Date.now();
  if(action==='me')return {worldId,player:display(core.settle(state.players[uid],at),worldId)};
  const list=settleAll(state,at);
  if(action==='getPlayers')return list.filter(p=>p.uid!==uid).map(publicRival)
   .slice(0,core.MAX_PLAYERS-1);
  if(!['day','week','all'].includes(body.period))err('invalid-argument','Unknown leaderboard period.');
  return list.map(p=>({uid:p.uid,displayName:p.displayName,score:core.score(p,body.period,at)}))
   .sort((a,b)=>b.score-a.score||a.uid.localeCompare(b.uid)).slice(0,20);
 }
 if(action==='register'){
  const name=await alias(uid);
  return transaction(db,(state,at)=>{
   const stored=state.players[uid];
   if(stored&&!isParked(stored)){
    const player=core.settle(stored,at);
    player.lastActivityAt=at;
    state.players[uid]=player;
    return {worldId,player:display(player,worldId),created:false};
   }
   // 90-day inactive accounts with no open listing, PvP, loan or tax
   // are parked without deleting or altering their saved holdings.
   if(activeCount(state)>=core.MAX_PLAYERS)parkOldest(state,at,uid);
   checkPlayerCount(state,worldId);
   if(stored){
    const player=reactivate(core.settle(stored,at),at);
    state.players[uid]=player;
    return {worldId,player:display(player,worldId),created:false,resumed:true};
   }
   const player=core.fresh(uid,name,at);
   player.worldId=worldId;player.lastActivityAt=at;
   state.players[uid]=player;
   return {worldId,player:display(player,worldId),created:true};
  },worldId,env,null,undefined,true);
 }
 const related=action==='buyListedCompany'?body.sellerUid:
  ['requestAttack','blockChatUser','unblockChatUser'].includes(action)?body.targetUid:null;
 const affectedAccounts=typeof related==='string'&&UID.test(related)?[uid,related]:[uid];
 return transaction(db,(state,at)=>{
  const own=playerOf(state,uid),p=core.settle(own,at),seconds=Math.floor(at/1000);
  p.lastActivityAt=at;
  if(action==='sendChat'){
   const screened=chatText(body.text),text=screened.text;
   if(Number(p.chatMutedUntil||0)>at)
    err('permission-denied','Chat is temporarily unavailable on this account.',403);
   if(Number(p.chatLastAt||0)>at-CHAT_COOLDOWN_MS)
    err('resource-exhausted','Please wait 20 seconds between messages.',429);
   if(p.chatLastText===text&&Number(p.chatLastAt||0)>at-120000)
    err('invalid-argument','Please do not repeat the same message.');
   cleanChat(state,at);
   const item={id:crypto.randomUUID(),uid,displayName:p.displayName,
    text,at,reports:[],hidden:false};
   state.chat.push(item);state.chat=state.chat.slice(-CHAT_LIMIT);
   // Store only the masked text, and automatically mute repeated slurs.
   if(screened.slurs){
    const previous=Number(p.chatAbuseWindowAt||0);
    const priorStrikes=Number(p.chatAbuseStrikes||0);
    p.chatAbuseStrikes=(at-previous>600000?0:Math.max(0,priorStrikes))+screened.slurs;
    p.chatAbuseWindowAt=at;
    if(p.chatAbuseStrikes>=2)p.chatMutedUntil=at+600000;
   }
   p.chatLastAt=at;p.chatLastText=text;state.players[uid]=p;
   return publicChatMessage(item);
  }
  if(action==='reportMessage'){
   if(typeof body.messageId!=='string'||!/^[-a-zA-Z0-9]{8,80}$/.test(body.messageId))
    err('invalid-argument','Invalid message identifier.');
   const item=chatMessages(state).find(m=>m.id===body.messageId);
   if(!item)err('not-found','That chat message has expired.',404);
   if(item.uid===uid)err('invalid-argument','You cannot report your own message.');
   item.reports=Array.isArray(item.reports)?item.reports:[];
   if(item.reports.includes(uid))return {reported:true,duplicate:true,hidden:item.hidden===true};
   item.reports.push(uid);
   if(item.reports.length>=CHAT_REPORT_LIMIT)item.hidden=true;
   p.chatHiddenIds=[...new Set([...(p.chatHiddenIds||[]),item.id])].slice(-CHAT_LIMIT);
   state.players[uid]=p;
   return {reported:true,hidden:item.hidden===true};
  }
  if(action==='blockChatUser'||action==='unblockChatUser'){
   const target=body.targetUid;
   if(typeof target!=='string'||!UID.test(target)||target===uid||!state.players[target])
    err('invalid-argument','Choose another player in the same world.');
   const old=Array.isArray(p.chatBlockedUids)?p.chatBlockedUids:[];
   if(action==='blockChatUser'){
    if(!old.includes(target)&&old.length>=CHAT_BLOCK_LIMIT)
     err('resource-exhausted','Your chat block list is full.',409);
    p.chatBlockedUids=[...new Set([...old,target])];
   }else p.chatBlockedUids=old.filter(id=>id!==target);
   state.players[uid]=p;
   return {blocked:action==='blockChatUser',targetUid:target};
  }
  if(action==='moderateChat'){
   requireModerator(uid,env);
   const item=chatMessages(state).find(m=>m.id===body.messageId);
   if(!item)err('not-found','Chat message not found.',404);
   if(!['remove','dismiss'].includes(body.decision))
    err('invalid-argument','Choose remove or dismiss.');
   if(body.decision==='remove'){item.hidden=true;item.reviewed=true}
   else{item.hidden=false;item.reports=[];item.reviewed=true}
   return {moderated:true,hidden:item.hidden===true};
  }
  if(action==='buyBusiness'||action==='upgradeBusiness'){
   return paid(state,uid,body,action,action==='buyBusiness'?body.businessId:body.index,()=>{
    const result=action==='buyBusiness'?core.buyBusiness(p,body.businessId,at):
     core.upgradeBusiness(p,body.index,at);
    if(!result.ok)err('failed-precondition',result.error||'Purchase rejected.',409);
    requireValid(result.player);
    enterprise.recordDailyAction(result.player);
    enterprise.recordCityAction(result.player,action,at);
    if(action==='upgradeBusiness'){
     const sector=result.player.businesses?.[body.index]?.type;
     if(sector)achievements.record(result.player,sector,'upgrades',1);
    }
    state.players[uid]=result.player;
    return {player:display(result.player,worldId),cost:result.cost||0,replayed:false};
   },at,worldId);
  }
  if(action==='buyListedCompany'){
   if(typeof body.sellerUid!=='string'||!UID.test(body.sellerUid)||body.sellerUid===uid||
    !Number.isSafeInteger(body.index)||body.index<0||body.index>=core.MAX_BUSINESSES||
    !Number.isSafeInteger(body.maxPrice)||body.maxPrice<1)
    err('invalid-argument','Choose a valid regional company listing.');
   const argument={sellerUid:body.sellerUid,index:body.index,maxPrice:body.maxPrice};
   return paid(state,uid,body,action,argument,()=>{
    if(Number(p.enterprise?.loanDebt||0)>0)
     err('failed-precondition','Repay outstanding loans before purchasing another player\'s company.',409);
    const seller=core.settle(playerOf(state,body.sellerUid),at);
    const company=seller.businesses[body.index],listing=company?.listing;
    if(!company||!listing||!Number.isSafeInteger(listing.price)||listing.price<100||
     listing.expiresAt<=at)err('failed-precondition','Company listing is no longer available.',409);
    if(listing.price>body.maxPrice)err('failed-precondition','Company asking price changed.',409);
    if(p.businesses.length>=core.MAX_BUSINESSES)err('resource-exhausted','Your online company limit has been reached.',409);
    if(p.cash<listing.price||seller.cash>core.MAX_CASH-listing.price)
     err('failed-precondition','Transaction cannot be funded.',409);
    const buyerBefore=core.worth(p),sellerBefore=core.worth(seller);
    const buyerDay=p.dayGain,buyerWeek=p.weekGain;
    const sellerDay=seller.dayGain,sellerWeek=seller.weekGain;
    if(!core.debit(p,listing.price))err('failed-precondition','Not enough cash.',409);
    core.credit(seller,listing.price);
    const transferred={...company,sites:Array.isArray(company.sites)?
     company.sites.map(site=>({...site})):undefined};
    delete transferred.listing;
    seller.businesses.splice(body.index,1);
    // An acquisition may shift seller-owned company indices; never reroute supplies.
    enterprise.removeCompanyRoutes(seller,body.index);
    p.businesses.push(transferred);
    enterprise.recordDailyAction(p);
    p.dayGain=buyerDay+core.worth(p)-buyerBefore;
    p.weekGain=buyerWeek+core.worth(p)-buyerBefore;
    seller.dayGain=sellerDay+core.worth(seller)-sellerBefore;
    seller.weekGain=sellerWeek+core.worth(seller)-sellerBefore;
    requireValid(p);requireValid(seller);
    state.players[uid]=p;
    state.players[body.sellerUid]=seller;
    return {ok:true,replayed:false,cost:listing.price,player:display(p,worldId),
     acquired:{type:transferred.type,level:transferred.level}};
   },at,worldId);
  }
  if(action==='enterpriseAction'){
   if(typeof body.operation!=='string'||body.operation.length>40)
    err('invalid-argument','Choose a supported online enterprise operation.');
   const allowed=new Set(['hireStaff','appointManager','runMarketing','upgradeEfficiency',
    'openBranch','relocateBranch','upgradeBranch','restockBranch','setAutoRestock','setPrice',
    'warehouseOrder','deliverWarehouseStock','setSupplyRoute','clearSupplyRoute','buyWarehouse',
    'buyTruck','buyResearch','buyShares','sellShares','borrowLoan','repayLoan',
    'setAutoDebtRepayment',
    'listCompany','cancelCompanyListing',
    'buyProperty','setCountry','claimContract','buyMajorCorporation','payTax',
    'acceptCityContract','claimCityContract','fileBankruptcy','ascendEmpire']);
   if(!allowed.has(body.operation))err('invalid-argument','Unknown enterprise operation.');
   const args={
    index:body.index,site:body.site,quantity:body.quantity,enabled:body.enabled,
    percent:body.percent,price:body.price,
    stockId:body.stockId,amount:body.amount,researchId:body.researchId,country:body.country,
     corporationId:body.corporationId,contractId:body.contractId,cityId:body.cityId
   };
   return paid(state,uid,body,action,{operation:body.operation,args},()=>{
    const worthBefore=core.worth(p);
    const result=enterprise.apply(p,body.operation,args,at);
    if(!result.ok)err('failed-precondition','Online operation blocked: '+result.error,409);
    const next=result.player;
    enterprise.recordCityAction(next,body.operation,at);
    requireValid(next);
    const sector=next.businesses?.[args.index]?.type;
    if(sector){
     if(body.operation==='hireStaff')achievements.record(next,sector,'hired',args.quantity);
     if(body.operation==='runMarketing')achievements.record(next,sector,'campaigns',1);
     if(body.operation==='upgradeEfficiency')achievements.record(next,sector,'optimizations',1);
     if(body.operation==='upgradeBranch')achievements.record(next,sector,'upgrades',1);
     if(body.operation==='restockBranch')achievements.record(next,sector,'inventory',args.quantity);
    }
    // Net-worth ranking changes must not classify borrowing or trading as gains.
    const delta=core.worth(next)-worthBefore;
    if(body.operation==='ascendEmpire'||body.operation==='fileBankruptcy'){
     // A deliberate empire reset begins a new scoring cycle; the forgiven
     // assets and liabilities are neither earnings nor negative ranking P&L.
     next.dayGain=0;next.weekGain=0;
    }else{
     next.dayGain=p.dayGain+delta;
     next.weekGain=p.weekGain+delta;
    }
    state.players[uid]=next;
    return {ok:true,replayed:false,operation:body.operation,
     cost:result.cost||0,reward:result.reward||0,
     bankruptcy:result.bankruptcy||undefined,player:display(next,worldId)};
   },at,worldId);
  }
  if(action==='togglePvP'){
   if((p.lastPvPSwitchAt||0)>seconds-300)err('failed-precondition','Wait five minutes before switching PvP.',409);
   if(p.pvpEnabled&&(p.nextAttackAt||0)>seconds)
    err('failed-precondition','Cannot disable PvP immediately after an attack.',409);
   p.pvpEnabled=!p.pvpEnabled;p.lastPvPSwitchAt=seconds;
   state.players[uid]=p;return {player:display(p,worldId),cost:0};
  }
  if(action==='requestDefense'){
   return paid(state,uid,body,action,null,()=>{
    const result=pvp.applyDefense({player:p,nowSeconds:seconds,ownEmpireWorth:core.worth(p)});
    if(!result.ok)err('failed-precondition','Defense blocked: '+result.reason,409);
    result.player.dayGain-=result.cost;result.player.weekGain-=result.cost;
    state.players[uid]=result.player;
    return {ok:true,replayed:false,event:result.event,player:display(result.player,worldId)};
   },at,worldId);
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
    return {ok:true,replayed:false,event:result.event,player:display(result.attacker,worldId)};
   },at,worldId);
  }
  err('invalid-argument','Unknown world operation.');
 },worldId,env,typeof body?.requestId==='string'&&RID.test(body.requestId)
  ?uid+':'+body.requestId:null,affectedAccounts);
}
// Explicit maintenance-only migration, not reachable from HTTP routes.
export async function migrateExistingRegion(db,worldId){
 if(!worldById(worldId))err('invalid-argument','Unknown region.',400);
 return migrateLegacy(db,worldId,await rawWorld(db,true,worldId));
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
   if(!validateClientPayload(body))
     err('invalid-argument','Malformed or unauthorized game state in request.');
    if(!ALL_ACTIONS.has(body.action))
    err('invalid-argument','Unknown world action.');
   const worldId=worldFor(request.method==='GET'?url.searchParams.get('worldId')||undefined:body.worldId);
   const ipCheck=checkIp(request,body.action);
   if(!ipCheck.ok)
    return json(request,{error:{code:'resource-exhausted',message:'Too many requests from this connection. Retry shortly.'}},429,
     {'Retry-After':String(ipCheck.retryAfter)});
   const uid=body.action==='health'?null:await identity(request);
   const userCheck=checkUid(uid,body.action);
   if(!userCheck.ok)
    return json(request,{error:{code:'resource-exhausted',message:'Too many account requests. Retry shortly.'}},429,
     {'Retry-After':String(userCheck.retryAfter)});
   if(String(env?.SECURITY_D1_RATE_LIMIT||'').toLowerCase()==='enabled'){
    let distributed;
    try{distributed=await checkDistributed(env?.DB,uid,worldId,body)}
    catch(e){err('unavailable','Security request validation is temporarily unavailable.',503)}
    if(!distributed.ok)return json(request,{error:{code:'resource-exhausted',
     message:'Too many sensitive actions. Try again shortly.'}},429,
     {'Retry-After':String(distributed.retryAfter)});
   }
   const data=await dispatch(body.action,uid,body,env?.DB,worldId,env);
   return json(request,data);
  }catch(e){
   const failure=e instanceof ApiError?e:new ApiError('internal','World 1 request failed.',500);
   // Never return D1 errors, token contents, or internal stack traces to clients.
   return json(request,{error:{code:failure.code,message:failure.message}},failure.status);
  }
 }
};
export {verifyFirebase,dispatch,transaction,rawWorld,WORLDS,worldFor};
