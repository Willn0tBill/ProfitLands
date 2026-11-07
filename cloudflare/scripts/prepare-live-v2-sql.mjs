/* Owner-only V2 migration plan generator.
 * Reads a private verified Cloudflare D1 SQL export, emits another private SQL
 * file. NEVER commit or publish generated data or output. Run only when game
 * writes are frozen and verify remote D1 revision before executing.
 */
import {readFileSync,writeFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {decodeLedger} from '../src/world-ledger.mjs';
const [sourcePath,outputPath]=process.argv.slice(2);
if(!sourcePath?.toLowerCase().endsWith('.sql')||!outputPath?.toLowerCase().endsWith('.sql'))
 throw Error('Usage: node prepare-live-v2-sql.mjs PRIVATE_SOURCE.sql PRIVATE_OUTPUT.sql');
if(sourcePath===outputPath)throw Error('Source and output may not be the same file');
const source=readFileSync(sourcePath,'utf8');
const sha=createHash('sha256').update(source).digest('hex');
const db=new DatabaseSync(':memory:');
const sq=value=>"'"+String(value).replaceAll("'","''")+"'";
const ids=['world1','world-europe','world-asia'];
// D1 remote SQL imports manage their own transaction; explicit BEGIN/COMMIT
// are rejected by Cloudflare. Keep the source revision guard as the first write.
const commands=[];
let totalPlayers=0,totalReceipts=0;
try{
 db.exec(source);
 for(const id of ids){
  const row=db.prepare('SELECT version,payload FROM world_state WHERE id=?').get(id);
  let version,state;
  if(row){
   version=Number(row.version);
   state=await decodeLedger(row.payload);
  }else{
   version=0;
   state={players:{},receipts:{}};
   commands.push('INSERT INTO world_state(id,version,payload) VALUES ('+
    [sq(id),version,sq(JSON.stringify(state))].join(',')+') ON CONFLICT(id) DO NOTHING;');
  }
  if(!Number.isSafeInteger(version)||version<0||
   !state||typeof state!=='object'||!state.players||!state.receipts)
   throw Error('Invalid legacy source record for '+id);
  const {players,receipts,...metadata}=state;
  commands.push(`INSERT INTO world_guards(world_id,expected_version,actual_version)
VALUES(${sq(id)},${version},COALESCE((SELECT version FROM world_state WHERE id=${sq(id)}),-1))
ON CONFLICT(world_id) DO UPDATE SET
expected_version=excluded.expected_version,actual_version=excluded.actual_version;`);
  commands.push('INSERT INTO world_meta(world_id,version,metadata) VALUES ('+
   [sq(id),'0',sq(JSON.stringify(metadata))].join(',')+');');
  for(const [uid,p] of Object.entries(players)){
   if(!/^[A-Za-z0-9_-]{1,128}$/.test(uid)||p.uid!==uid)
    throw Error('Invalid source user identifier');
   commands.push('INSERT INTO world_players(world_id,uid,payload) VALUES('+
    [sq(id),sq(uid),sq(JSON.stringify(p))].join(',')+');');
   totalPlayers++;
  }
  for(const [key,receipt] of Object.entries(receipts)){
   if(typeof key!=='string'||key.length>250||!receipt||!Number.isSafeInteger(receipt.at))
    throw Error('Invalid source purchase receipt');
   commands.push('INSERT INTO world_receipts(world_id,receipt_key,at,payload) VALUES('+
    [sq(id),sq(key),String(receipt.at),sq(JSON.stringify(receipt))].join(',')+');');
   totalReceipts++;
  }
  console.log('REGION_EXPECTED='+id+' VERSION='+version+
   ' PLAYERS='+Object.keys(players).length+' RECEIPTS='+Object.keys(receipts).length);
 }
 const sql=commands.join('\n')+'\n';
 // In-memory rehearsal proves the SQL text and schema replay without modifying
 // the original file, before anyone executes it remotely.
 const schema=readFileSync(new URL('../schema-v2.sql',import.meta.url),'utf8');
 db.exec(schema);
 db.exec(sql);
 for(const id of ids){
  const old=db.prepare('SELECT version,payload FROM world_state WHERE id=?').get(id);
  const meta=db.prepare('SELECT version,metadata FROM world_meta WHERE world_id=?').get(id);
  const decoded=await decodeLedger(old.payload);
  const {players,receipts,...metadata}=decoded;
  if(JSON.stringify(metadata)!==meta.metadata)throw Error('Metadata mismatch for '+id);
  const migrated=db.prepare('SELECT uid,payload FROM world_players WHERE world_id=?').all(id);
  if(migrated.length!==Object.keys(players).length)throw Error('Player count mismatch for '+id);
  for(const p of migrated){
   if(JSON.stringify(players[p.uid])!==p.payload)throw Error('Player payload mismatch for '+id);
  }
  const replay=db.prepare('SELECT receipt_key,at,payload FROM world_receipts WHERE world_id=?').all(id);
  if(replay.length!==Object.keys(receipts).length)throw Error('Receipt count mismatch for '+id);
  for(const r of replay){
   if(JSON.stringify(receipts[r.receipt_key])!==r.payload||receipts[r.receipt_key].at!==r.at)
    throw Error('Replay receipt mismatch for '+id);
  }
 }
 if(createHash('sha256').update(readFileSync(sourcePath,'utf8')).digest('hex')!==sha)
  throw Error('Backup changed during rehearsal');
 writeFileSync(outputPath,sql,{flag:'wx',mode:0o600});
 console.log('OWNER_MIGRATION_SQL_REHEARSAL_PASS');
 console.log('REGIONS=3 PLAYERS='+totalPlayers+' RECEIPTS='+totalReceipts+
  ' PRIVATE_SQL_BYTES='+Buffer.byteLength(sql)+' SOURCE_SHA256='+sha);
}finally{db.close()}
