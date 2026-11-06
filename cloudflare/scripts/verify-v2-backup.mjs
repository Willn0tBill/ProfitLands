/* Read-only V2 migration rehearsal using an owner's private SQL export.
 * The SQL backup is read into a local IN-MEMORY SQLite database and never
 * copied to GitHub, Cloudflare, the repo, or another file.
 * Usage: node scripts/verify-v2-backup.mjs <absolute-private-backup.sql>
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {migrateLegacy,readNormalized} from '../src/world-store-v2.mjs';
import {decodeLedger} from '../src/world-ledger.mjs';

const file=process.argv[2];
if(!file||!resolve(file).endsWith('.sql'))
 throw Error('Provide the absolute path of a private D1 SQL backup.');
const source=readFileSync(file,'utf8');
const digest=createHash('sha256').update(source).digest('hex');
const db=new DatabaseSync(':memory:');
class D1 {
 prepare(sql){
  const query=db.prepare(sql);
  return {bind(...a){this.args=a;return this},
   async first(){return query.get(...(this.args||[]))||null},
   async all(){return {results:query.all(...(this.args||[]))}},
   async run(){const x=query.run(...(this.args||[]));return {meta:{changes:Number(x.changes)}}},
   _run(){return query.run(...(this.args||[]))}
  };
 }
 async batch(statements){
  db.exec('BEGIN IMMEDIATE');
  try{
   const outcome=statements.map(s=>s._run());
   db.exec('COMMIT');
   return outcome.map(x=>({meta:{changes:Number(x.changes)}}));
  }catch(error){db.exec('ROLLBACK');throw error}
 }
}
try{
 db.exec(source);
 const dir=join(dirname(fileURLToPath(import.meta.url)),'..');
 db.exec(readFileSync(join(dir,'schema-v2.sql'),'utf8'));
 const database=new D1();
 const ids=['world1','world-europe','world-asia'];
 let totalPlayers=0,totalReceipts=0,initialized=0;
 for(const worldId of ids){
  let row=database.prepare('SELECT version,payload FROM world_state WHERE id=?').bind(worldId);
  let prior=await row.first();
  if(!prior){
   // Missing Europe/Asia regions get empty, version-zero legacy source rows
   // in this private in-memory rehearsal only.
   await database.prepare('INSERT INTO world_state(id,version,payload) VALUES(?,0,?)')
    .bind(worldId,JSON.stringify({players:{},receipts:{}})).run();
   prior=await row.first();initialized++;
  }
  const old={version:Number(prior.version),state:await decodeLedger(prior.payload)};
  const before=JSON.stringify(old.state);
  const oldVersion=old.version;
  const result=await migrateLegacy(database,worldId,old);
  const after=await readNormalized(database,worldId);
  assert.equal(JSON.stringify(after.state),before,
   'Migrated accounts and history must match the source record byte-for-byte.');
  const legacy=await row.first();
  assert.equal(legacy.version,oldVersion,'Legacy revision must not change');
  assert.equal(legacy.payload,prior.payload,'Legacy payload must remain intact');
  assert.equal(result.players,Object.keys(after.state.players).length);
  assert.equal(result.receipts,Object.keys(after.state.receipts).length);
  totalPlayers+=result.players;totalReceipts+=result.receipts;
 }
 assert.equal(createHash('sha256').update(readFileSync(file,'utf8')).digest('hex'),digest,
  'Private SQL backup must not change.');
 console.log('V2_BACKUP_REHEARSAL_PASS');
 console.log('regions_checked=3 players_verified='+totalPlayers+
  ' receipts_verified='+totalReceipts+' missing_regions_initialized_in_memory='+initialized);
 console.log('legacy_records_unchanged=true backup_sha256='+digest);
}finally{db.close()}
