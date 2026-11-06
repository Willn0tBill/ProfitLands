/* Opt-in normalized multiplayer D1 storage.
 * Existing world_state is a read-only migration source and rollback snapshot.
 * Enable only after schema-v2.sql + explicit, offline migration of all regions.
 * Every cross-account mutation is an atomic db.batch with an optimistic SQL
 * CHECK guard; a failed guard rolls the entire batch back before any transfer.
 */
const RECEIPT_MS=72*3600*1000;
const MAX_RETRIES=8;
const MAX_RECORD=1800000;
const json=value=>JSON.stringify(value);
const fail=code=>{throw Error(code)};
function boundPayload(value){
 const s=json(value);
 if(new TextEncoder().encode(s).byteLength>MAX_RECORD)fail('world_v2_record_too_large');
 return s;
}
function rows(result){
 if(Array.isArray(result))return result;
 if(Array.isArray(result?.results))return result.results;
 return [];
}
function withoutRecords(state){
 const {players,receipts,...meta}=state;
 return meta;
}
function parseRecord(record){
 try{return JSON.parse(record)}catch{fail('world_v2_invalid_record')}
}
function isConflict(error){
 return /world_revision_match|world_player_revision_match|CHECK constraint failed.*world_(?:player_)?guards|world_v2_conflict/i
  .test(String(error?.message||error));
}
function guard(db,worldId,version,source='world_meta'){
 // SELECT is evaluated inside the atomic batch; no JavaScript check can race it.
 const idColumn=source==='world_state'?'id':'world_id';
 return db.prepare(`INSERT INTO world_guards(world_id,expected_version,actual_version)
 VALUES (?,?,COALESCE((SELECT version FROM ${source} WHERE ${idColumn}=?),-1))
 ON CONFLICT(world_id) DO UPDATE SET
 expected_version=excluded.expected_version,actual_version=excluded.actual_version`)
  .bind(worldId,version,worldId);
}
function playerGuard(db,worldId,uid,expected){
 return db.prepare(`INSERT INTO world_player_guards(world_id,uid,expected_version,actual_version)
 VALUES(?,?,?,COALESCE((SELECT version FROM world_players WHERE world_id=? AND uid=?),-1))
 ON CONFLICT(world_id,uid) DO UPDATE SET
 expected_version=excluded.expected_version,actual_version=excluded.actual_version`)
  .bind(worldId,uid,expected,worldId,uid);
}
async function readNormalized(db,worldId,receiptKey=undefined,accountIds=undefined){
 const info=await db.prepare(
  'SELECT version,metadata FROM world_meta WHERE world_id=?').bind(worldId).first();
 if(!info)fail('world_v2_not_migrated');
 const receiptsQuery=receiptKey===null?null:
  receiptKey===undefined?
   db.prepare('SELECT receipt_key,payload FROM world_receipts WHERE world_id=?').bind(worldId).all():
   db.prepare('SELECT receipt_key,payload FROM world_receipts WHERE world_id=? AND receipt_key=?')
    .bind(worldId,receiptKey).all();
 // Write paths can load only the owner and the one other account involved
 // in an acquisition/PvP action. Leaderboards still request the full roster.
 const ids=Array.isArray(accountIds)?[...new Set(accountIds)]:null;
 if(ids&&ids.some(x=>typeof x!=='string'||x.length>128))
  fail('world_v2_bad_uid');
 const memberQuery=ids?
  (ids.length?db.prepare('SELECT uid,version,payload FROM world_players WHERE world_id=? AND uid IN ('+
    ids.map(()=>'?').join(',')+')').bind(worldId,...ids).all():Promise.resolve({results:[]})):
  db.prepare('SELECT uid,version,payload FROM world_players WHERE world_id=?').bind(worldId).all();
 const [members,receipts]=await Promise.all([
  memberQuery,
  receiptsQuery||Promise.resolve({results:[]})
 ]);
 const state={...parseRecord(info.metadata),players:{},receipts:{}};
 const playerVersions={};
 for(const row of rows(members)){
  const p=parseRecord(row.payload);
  if(!p||p.uid!==row.uid||Object.hasOwn(state.players,row.uid))
   fail('world_v2_corrupt_player');
  state.players[row.uid]=p;
  const v=Number(row.version);
  if(!Number.isSafeInteger(v)||v<0)fail('world_v2_bad_player_version');
  playerVersions[row.uid]=v;
 }
 for(const row of rows(receipts)){
  if(Object.hasOwn(state.receipts,row.receipt_key))fail('world_v2_duplicate_receipt');
  state.receipts[row.receipt_key]=parseRecord(row.payload);
 }
 return {version:Number(info.version),state,playerVersions};
}
function pruneReceipts(state,at){
 // Per-user receipts remain valid for the full 72-hour window regardless
 // of how many other users are buying at the same time.
 state.receipts=Object.fromEntries(Object.entries(state.receipts||{}).filter(([,v])=>
  v&&Number.isFinite(v.at)&&v.at<=at&&at-v.at<RECEIPT_MS));
}
async function transactNormalized(db,worldId,change,receiptKey=null,accountIds=undefined,requireRegionalGuard=false){
 if(typeof db?.batch!=='function')fail('world_v2_batch_required');
 for(let tries=0;tries<MAX_RETRIES;tries++){
  const {version,state,playerVersions}=await readNormalized(db,worldId,receiptKey,accountIds);
  if(!Number.isSafeInteger(version)||version<0)fail('world_v2_bad_version');
  const originalMeta=json(withoutRecords(state));
  const originalPlayers=new Map(Object.entries(state.players)
   .map(([id,p])=>[id,json(p)]));
  const originalReceipts=new Map(Object.entries(state.receipts)
   .map(([id,r])=>[id,json(r)]));
  // An expired ID must not replay a transaction; it may be safely reused.
  pruneReceipts(state,Date.now());
  const at=Date.now();
  const result=await change(state,at);
  pruneReceipts(state,at);
  const metadata=boundPayload(withoutRecords(state));
  const stmts=[];
  // Only registrations and chat changes need a region-wide CAS. Unrelated
  // player actions do not contend on the regional metadata revision.
  if(requireRegionalGuard||metadata!==originalMeta){
   stmts.push(guard(db,worldId,version));
   stmts.push(db.prepare('UPDATE world_meta SET version=version+1,metadata=? WHERE world_id=?')
    .bind(metadata,worldId));
  }
  const changed=new Map();
  for(const [uid,p] of Object.entries(state.players)){
   if(!/^[A-Za-z0-9_-]{1,128}$/.test(uid)||p.uid!==uid)fail('world_v2_bad_uid');
   const payload=boundPayload(p);
   if(originalPlayers.get(uid)!==payload)changed.set(uid,payload);
  }
  const removed=[...originalPlayers.keys()].filter(uid=>!Object.hasOwn(state.players,uid));
  // Always guard the acting account, even for receipt-only operations. Guards
  // are checked inside the same SQLite transaction as the ledger updates.
  const affected=new Set(Array.isArray(accountIds)&&accountIds.length?[accountIds[0]]:[]);
  for(const uid of changed.keys())affected.add(uid);
  for(const uid of removed)affected.add(uid);
  for(const uid of affected){
   if(!/^[A-Za-z0-9_-]{1,128}$/.test(uid))fail('world_v2_bad_uid');
   stmts.push(playerGuard(db,worldId,uid,playerVersions[uid]??-1));
  }
  for(const uid of affected){
   if(!Object.hasOwn(state.players,uid)){
    stmts.push(db.prepare('DELETE FROM world_players WHERE world_id=? AND uid=?')
     .bind(worldId,uid));
   }else if(changed.has(uid)){
    stmts.push(db.prepare(`INSERT INTO world_players(world_id,uid,version,payload)
     VALUES(?,?,0,?) ON CONFLICT(world_id,uid) DO UPDATE
     SET version=world_players.version+1,payload=excluded.payload`)
     .bind(worldId,uid,changed.get(uid)));
   }else{
    stmts.push(db.prepare('UPDATE world_players SET version=version+1 WHERE world_id=? AND uid=?')
     .bind(worldId,uid));
   }
  }
  for(const [key,r] of Object.entries(state.receipts)){
   const payload=boundPayload(r);
   if(originalReceipts.get(key)===payload)continue;
   stmts.push(db.prepare(`INSERT INTO world_receipts(world_id,receipt_key,at,payload)
    VALUES(?,?,?,?) ON CONFLICT(world_id,receipt_key) DO UPDATE
    SET at=excluded.at,payload=excluded.payload`)
    .bind(worldId,key,r.at,payload));
  }
  // Expired receipts are pruned as one indexed operation, not thousands of
  // individual D1 writes. The SQL batch free-tier budget is 50 queries.
  stmts.push(db.prepare('DELETE FROM world_receipts WHERE world_id=? AND at<?')
   .bind(worldId,at-RECEIPT_MS));
  if(stmts.length>45)fail('world_v2_transaction_too_large');
  try{await db.batch(stmts);return result}
  catch(e){if(isConflict(e))continue;throw e}
 }
 fail('world_v2_busy');
}
async function migrateLegacy(db,worldId,legacySnapshot){
 // This is an explicit maintenance operation, NEVER reachable from the
 // public Worker HTTP dispatch. Pause live writes, back up D1 first.
 if(typeof db?.batch!=='function')fail('world_v2_batch_required');
 const live=await db.prepare('SELECT version FROM world_meta WHERE world_id=?')
  .bind(worldId).first();
 if(live)fail('world_v2_already_active');
 const {version,state}=legacySnapshot;
 if(!Number.isSafeInteger(version)||!state?.players||!state?.receipts)
  fail('world_v2_invalid_snapshot');
 const stage=worldId+'__v2stage__'+version+'__'+crypto.randomUUID().replaceAll('-','');
 const players=Object.entries(state.players);
 const receipts=Object.entries(state.receipts);
 // Stage in chunks, without modifying the legacy source or activating V2.
 // Cloudflare Free permits 50 D1 queries/invocation; 20 keeps headroom.
 const statements=[];
 for(const [uid,p] of players){
  if(!/^[A-Za-z0-9_-]{1,128}$/.test(uid)||p.uid!==uid)fail('world_v2_bad_uid');
  statements.push(db.prepare('INSERT INTO world_players(world_id,uid,payload) VALUES(?,?,?)')
   .bind(stage,uid,boundPayload(p)));
 }
 for(const [key,r] of receipts){
  statements.push(db.prepare(
   'INSERT INTO world_receipts(world_id,receipt_key,at,payload) VALUES(?,?,?,?)')
   .bind(stage,key,Number(r.at)||0,boundPayload(r)));
 }
 try{
  for(let i=0;i<statements.length;i+=20)
   await db.batch(statements.slice(i,i+20));
 const metadata=boundPayload(withoutRecords(state));
 const activate=[
  guard(db,worldId,version,'world_state'),
  db.prepare('INSERT INTO world_meta(world_id,version,metadata) VALUES(?,0,?)')
   .bind(worldId,metadata),
  db.prepare(`INSERT INTO world_players(world_id,uid,payload)
   SELECT ?,uid,payload FROM world_players WHERE world_id=?`).bind(worldId,stage),
  db.prepare(`INSERT INTO world_receipts(world_id,receipt_key,at,payload)
   SELECT ?,receipt_key,at,payload FROM world_receipts WHERE world_id=?`).bind(worldId,stage),
  db.prepare('DELETE FROM world_players WHERE world_id=?').bind(stage),
  db.prepare('DELETE FROM world_receipts WHERE world_id=?').bind(stage)
 ];
 // A stale snapshot fails the CHECK guard; SQL rollback leaves legacy and
 // staging untouched and does not activate partial normalized data.
  await db.batch(activate);
 }catch(e){
  // Discard only this migration's staging rows. Never touch legacy saves.
  try{
   await db.batch([
    db.prepare('DELETE FROM world_players WHERE world_id=?').bind(stage),
    db.prepare('DELETE FROM world_receipts WHERE world_id=?').bind(stage)
   ]);
  }catch{}
  throw e;
 }
 const verified=await readNormalized(db,worldId);
 if(Object.keys(verified.state.players).length!==players.length||
  Object.keys(verified.state.receipts).length!==receipts.length)
  fail('world_v2_migration_verify_failed');
 return {worldId,players:players.length,receipts:receipts.length,
  legacyVersion:version};
}
export {readNormalized,transactNormalized,migrateLegacy};
