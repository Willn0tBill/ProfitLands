'use strict';
const {onCall,HttpsError}=require('firebase-functions/v2/https');
const {initializeApp,getApps}=require('firebase-admin/app');
const {getFirestore,FieldValue}=require('firebase-admin/firestore');
const core=require('./world-core');
const pvp=require('./pvp-rules');
const {createHash}=require('node:crypto');

if(!getApps().length)initializeApp();
const db=getFirestore();
const world=db.collection('worlds').doc(core.WORLD_ID);
const players=world.collection('players');
const events=world.collection('events');
// Short-lived per-instance cache coalesces overlapping leaderboard/rival reads.
// It cannot authorize payments: every mutation still reads Firestore in a transaction.
const rosterCache={records:null,expiresAt:0,inflight:null,version:0};
function invalidateRoster(){
 rosterCache.version++;
 rosterCache.records=null;rosterCache.expiresAt=0;rosterCache.inflight=null;
}
const CHAT_ENABLED=false; // Off until moderation and blocking controls are reviewed.
const ACTIONS=new Set(['health','register','me','getLeaderboard','getPlayers',
 'buyBusiness','upgradeBusiness','togglePvP','requestAttack','requestDefense',
 'getChat','sendChat','reportMessage']);
const err=(status,message)=>{throw new HttpsError(status,message)};
const uidOf=request=>{
 const uid=request.auth?.uid;
 if(typeof uid!=='string'||!uid||uid.length>128||uid.includes('/'))err('unauthenticated','Sign into a valid ProfitLands account first.');
 return uid;
};
const intId=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{10,72}$/.test(value);
const validUid=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(value);
const nowMs=()=>Date.now();
function publicProfile(player){
 return {uid:player.uid,displayName:player.displayName,worldId:core.WORLD_ID,
  cash:player.cash,netWorth:core.worth(player),businesses:player.businesses,
  pvpEnabled:player.pvpEnabled===true,protectedUntil:player.protectedUntil||0,
  nextAttackAt:player.nextAttackAt||0,dayGain:player.dayGain||0,weekGain:player.weekGain||0};
}
function publicRival(player,clanId=null){
 return {uid:player.uid,displayName:player.displayName,pvpEnabled:player.pvpEnabled===true,
  netWorth:core.worth(player),clanId};
}
function safeNumber(player){
 if(!core.worth(player)||!Number.isSafeInteger(core.worth(player))||player.cash>core.MAX_CASH)
  err('failed-precondition','The empire reached the alpha economy limit.');
}
async function register(request){
 const uid=uidOf(request),at=nowMs(),ref=players.doc(uid);
 return db.runTransaction(async tx=>{
  const [room,snapshot]=await Promise.all([tx.get(world),tx.get(ref)]);
  if(snapshot.exists)return {worldId:core.WORLD_ID,player:publicProfile(core.settle(snapshot.data(),at)),created:false};
  const count=room.exists?Number(room.data().joined||0):0;
  if(count>=core.MAX_PLAYERS)err('resource-exhausted','World 1 alpha is full.');
  const publicAlias='Tycoon-'+createHash('sha256').update(uid).digest('hex').slice(0,7).toUpperCase();
  const profile=core.fresh(uid,publicAlias,at);
  tx.set(ref,profile);
  tx.set(world,{joined:count+1,createdAt:room.exists?room.data().createdAt:FieldValue.serverTimestamp(),
   worldId:core.WORLD_ID}, {merge:true});
  return {worldId:core.WORLD_ID,player:publicProfile(profile),created:true};
 }).then(result=>{invalidateRoster();return result});
}
async function mutateOwn(uid,transform){
 const ref=players.doc(uid);
 return db.runTransaction(async tx=>{
  const existing=await tx.get(ref);
  if(!existing.exists)err('failed-precondition','Join World 1 before playing online.');
  const result=transform(existing.data(),nowMs());
  if(!result.ok)err('failed-precondition',result.error||'Action rejected.');
  safeNumber(result.player);
  tx.set(ref,result.player);
  return {player:publicProfile(result.player),cost:result.cost||0};
 }).then(result=>{invalidateRoster();return result});
}
// Purchases and upgrades must be idempotent just like PvP. A lost HTTP
// response is not permission to repeat a charge or duplicate a business.
async function mutatePaid(uid,action,requestId,parameter,transform){
 if(!intId(requestId))err('invalid-argument','Invalid request identifier.');
 const ref=players.doc(uid),eventRef=events.doc(uid+'_'+requestId);
 return db.runTransaction(async tx=>{
  const [prior,snapshot]=await Promise.all([tx.get(eventRef),tx.get(ref)]);
  if(!snapshot.exists)err('failed-precondition','Join World 1 before playing online.');
  if(prior.exists){
   const event=prior.data();
   if(event.type!=='world_purchase'||event.action!==action||event.parameter!==parameter)
    err('invalid-argument','Request ID was already used for a different action.');
   return {player:publicProfile(core.settle(snapshot.data(),nowMs())),cost:event.cost,replayed:true};
  }
  const result=transform(snapshot.data(),nowMs());
  if(!result.ok)err('failed-precondition',result.error||'Purchase rejected.');
  safeNumber(result.player);
  tx.set(ref,result.player);
  tx.create(eventRef,{type:'world_purchase',action,parameter,cost:result.cost,
   userUid:uid,worldId:core.WORLD_ID,createdAt:FieldValue.serverTimestamp()});
  return {player:publicProfile(result.player),cost:result.cost,replayed:false};
 }).then(result=>{invalidateRoster();return result});
}
async function getMine(uid){
 const ref=players.doc(uid);
 return db.runTransaction(async tx=>{
  const saved=await tx.get(ref);
  if(!saved.exists)err('failed-precondition','Join World 1 first.');
  const p=core.settle(saved.data(),nowMs());
  tx.set(ref,p);
  return {worldId:core.WORLD_ID,player:publicProfile(p)};
 });
}
async function getAll(){
 const at=nowMs();
 let records=rosterCache.records;
 if(!records||at>=rosterCache.expiresAt){
  if(!rosterCache.inflight){
   const generation=rosterCache.version;
   rosterCache.inflight=players.limit(core.MAX_PLAYERS).get().then(snapshot=>{
    const list=snapshot.docs.map(doc=>doc.data());
    if(rosterCache.version===generation){
     rosterCache.records=list;rosterCache.expiresAt=nowMs()+3000;
    }
    return list;
   }).finally(()=>{
    if(rosterCache.version===generation)rosterCache.inflight=null;
   });
  }
  records=await rosterCache.inflight;
 }
 return records.map(record=>core.settle(record,at));
}
async function getLeaderboard(uid,period){
 if(!['day','week','all'].includes(period))err('invalid-argument','Unknown leaderboard period.');
 const all=await getAll();
 if(!all.some(player=>player.uid===uid))err('failed-precondition','Join World 1 before viewing rankings.');
 return all.map(p=>({uid:p.uid,displayName:p.displayName,score:core.score(p,period,p.lastSettledAt)}))
  .sort((a,b)=>b.score-a.score||a.uid.localeCompare(b.uid)).slice(0,20);
}
async function getPlayers(uid){
 const all=await getAll();
 if(!all.some(player=>player.uid===uid))err('failed-precondition','Join World 1 before viewing other players.');
 return all.filter(p=>p.uid!==uid).map(p=>publicRival(p)).slice(0,63);
}
async function togglePvP(uid){
 return mutateOwn(uid,(before,at)=>{
  const p=core.settle(before,at),seconds=Math.floor(at/1000);
  if((p.lastPvPSwitchAt||0)>seconds-300)return {ok:false,error:'Wait five minutes before changing PvP again.'};
  if(p.pvpEnabled&&(p.nextAttackAt||0)>seconds)return {ok:false,error:'PvP cannot be disabled immediately after an attack.'};
  p.pvpEnabled=!p.pvpEnabled;p.lastPvPSwitchAt=seconds;
  return {ok:true,player:p};
 });
}
async function attack(uid,body){
 const targetUid=body.targetUid,attackId=body.attackId,requestId=body.requestId;
 if(!validUid(targetUid)||targetUid===uid||!intId(requestId))
  err('invalid-argument','Invalid target or request identifier.');
 if(!pvp.ATTACKS.some(x=>x.id===attackId))err('invalid-argument','Unknown rival action.');
 const attackerRef=players.doc(uid),targetRef=players.doc(targetUid),eventRef=events.doc(uid+'_'+requestId);
 const myClan=db.collection('users').doc(uid).collection('clanMembership').doc('current');
 const theirClan=db.collection('users').doc(targetUid).collection('clanMembership').doc('current');
 return db.runTransaction(async tx=>{
  // All document reads precede writes to avoid transaction invalidation.
  const [prior,attackerDoc,targetDoc,clanA,clanB]=await Promise.all([
   tx.get(eventRef),tx.get(attackerRef),tx.get(targetRef),tx.get(myClan),tx.get(theirClan)]);
  if(prior.exists){
   const event=prior.data();
   if(event.type!=='pvp_attack'||event.attackerUid!==uid||event.defenderUid!==targetUid||event.attackId!==attackId)
    err('invalid-argument','Request ID was already used for a different action.');
   return {ok:true,replayed:true,event};
  }
  if(!attackerDoc.exists||!targetDoc.exists)err('failed-precondition','Player not found in World 1.');
  const seconds=Math.floor(nowMs()/1000),at=seconds*1000;
  const attacker=core.settle(attackerDoc.data(),at),defender=core.settle(targetDoc.data(),at);
  attacker.clanId=clanA.exists?clanA.data().clanId:null;
  defender.clanId=clanB.exists?clanB.data().clanId:null;
  const targetValue=Math.max(0,...defender.businesses.map(core.valueOf));
  if(!targetValue)err('failed-precondition','Rival has no attackable businesses.');
  const result=pvp.applyAttack({attacker,defender,attackId,targetCompanyValue:targetValue,nowSeconds:seconds});
  if(!result.ok)err('failed-precondition','Attack blocked: '+result.reason);
  const newAttacker=result.attacker,newDefender=result.defender;
  // Paid actions affect daily and weekly wealth growth too.
  newAttacker.dayGain-=result.cost;newAttacker.weekGain-=result.cost;
  newAttacker.netWorth=core.worth(newAttacker);
  delete newAttacker.clanId;delete newDefender.clanId;
  tx.set(attackerRef,newAttacker);tx.set(targetRef,newDefender);
  tx.create(eventRef,{...result.event,createdAt:FieldValue.serverTimestamp()});
  return {ok:true,replayed:false,event:result.event,player:publicProfile(newAttacker)};
 }).then(result=>{invalidateRoster();return result});
}
async function defend(uid,body){
 const requestId=body.requestId;
 if(!intId(requestId))err('invalid-argument','Missing request identifier.');
 const ref=players.doc(uid),eventRef=events.doc(uid+'_'+requestId);
 return db.runTransaction(async tx=>{
  const [prior,existing]=await Promise.all([tx.get(eventRef),tx.get(ref)]);
  if(prior.exists){
   const event=prior.data();
   if(event.type!=='pvp_defense'||event.userUid!==uid)
    err('invalid-argument','Request ID was already used for a different action.');
   return {ok:true,replayed:true,event};
  }
  if(!existing.exists)err('failed-precondition','Join World 1 first.');
  const seconds=Math.floor(nowMs()/1000),p=core.settle(existing.data(),seconds*1000);
  const result=pvp.applyDefense({player:p,nowSeconds:seconds,ownEmpireWorth:core.worth(p)});
  if(!result.ok)err('failed-precondition','Defense blocked: '+result.reason);
  result.player.dayGain-=result.cost;result.player.weekGain-=result.cost;
  result.player.netWorth=core.worth(result.player);
  tx.set(ref,result.player);
  tx.create(eventRef,{...result.event,createdAt:FieldValue.serverTimestamp()});
  return {ok:true,replayed:false,event:result.event,player:publicProfile(result.player)};
 }).then(result=>{invalidateRoster();return result});
}
exports.worldApi=onCall({region:'us-west1',memory:'256MiB',maxInstances:5,timeoutSeconds:30,
 cors:['https://willn0tbill.github.io',/^http:\/\/localhost:\d+$/]},async request=>{
 const data=request.data&&typeof request.data==='object'?request.data:{},action=data.action;
 if(!ACTIONS.has(action))err('invalid-argument','Unknown online action.');
 if(action==='health')return {ok:true,worldId:core.WORLD_ID,chatEnabled:CHAT_ENABLED,version:1,catalog:core.BUSINESS_TYPES};
 const uid=uidOf(request);
 switch(action){
  case 'register':return register(request);
  case 'me':return getMine(uid);
  case 'getLeaderboard':return getLeaderboard(uid,data.period);
  case 'getPlayers':return getPlayers(uid);
  case 'buyBusiness':return mutatePaid(uid,'buyBusiness',data.requestId,data.businessId,(p,at)=>core.buyBusiness(p,data.businessId,at));
  case 'upgradeBusiness':return mutatePaid(uid,'upgradeBusiness',data.requestId,data.index,(p,at)=>core.upgradeBusiness(p,data.index,at));
  case 'togglePvP':return togglePvP(uid);
  case 'requestAttack':return attack(uid,data);
  case 'requestDefense':return defend(uid,data);
  case 'getChat':return [];
  case 'sendChat':err('failed-precondition','World chat is disabled pending moderation and abuse controls.');
  case 'reportMessage':err('failed-precondition','No public chat is currently enabled.');
  default:err('invalid-argument','Invalid action');
 }
});
