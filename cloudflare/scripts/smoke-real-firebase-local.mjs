/* Operator-only test: use two real TEMPORARY Firebase Auth accounts against
 * a local, in-memory D1 world. This NEVER sends game data to production.
 * Only run manually with --allow-temporary-firebase-users.
 * In the finally block, each temporary account is deleted from Firebase Auth.
 */
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import worker,{migrateExistingRegion} from '../src/index.mjs';
const dir=dirname(fileURLToPath(import.meta.url));
const root=resolve(dir,'../..');
const allow=process.argv.includes('--allow-temporary-firebase-users');
if(!allow)throw Error('Run manually with --allow-temporary-firebase-users only.');
const config=readFileSync(join(root,'firebase-config.js'),'utf8');
const key=config.match(/apiKey\s*:\s*['"]([^'"]+)['"]/);
const project=config.match(/projectId\s*:\s*['"]([^'"]+)['"]/);
if(!key||!project||project[1]!=='wtvstudios-5b40f')
 throw Error('Firebase project configuration did not match the expected owner project.');
const apiKey=key[1],ids=[],db=new DatabaseSync(':memory:');
const signupUrl='https://identitytoolkit.googleapis.com/v1/accounts:signUp?key='+encodeURIComponent(apiKey);
const deleteUrl='https://identitytoolkit.googleapis.com/v1/accounts:delete?key='+encodeURIComponent(apiKey);
class D1 {
 prepare(sql){
  const q=db.prepare(sql);
  return {bind(...args){this.args=args;return this},
   async first(){return q.get(...(this.args||[]))||null},
   async all(){return {results:q.all(...(this.args||[]))}},
   async run(){let r=q.run(...(this.args||[]));return {meta:{changes:Number(r.changes)}}},
   _run(){return q.run(...(this.args||[]))}
  };
 }
 async batch(queries){
  db.exec('BEGIN IMMEDIATE');
  try{const results=queries.map(q=>q._run());db.exec('COMMIT');return results}
  catch(e){db.exec('ROLLBACK');throw e}
 }
}
async function registerTemporary(){
 const r=await fetch(signupUrl,{method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({returnSecureToken:true})});
 const data=await r.json();
 if(!r.ok)throw Error('Temporary Firebase sign-in unavailable: '+(data.error?.message||r.status));
 if(!data.idToken||!data.localId)throw Error('Firebase returned no account token.');
 ids.push(data.idToken);
 return data.idToken;
}
const activeDb=new D1();
const rid=n=>String(n).padStart(32,'0');
async function call(token,action,params={}){
 const response=await worker.fetch(new Request('https://profitlands-world1.example.workers.dev/api',{
  method:'POST',headers:{Origin:'https://willn0tbill.github.io',
   'Content-Type':'application/json',Authorization:'Bearer '+token},
  body:JSON.stringify({action,...params})
 }),{DB:activeDb,WORLD_STORAGE_V2:'enabled'});
 const body=await response.json();
 if(response.status!==200)throw Error('Action '+action+' status '+response.status+' code '+body.error?.code);
 return body;
}
try{
 db.exec(readFileSync(join(root,'cloudflare/schema.sql'),'utf8'));
 db.exec(readFileSync(join(root,'cloudflare/schema-v2.sql'),'utf8'));
 await migrateExistingRegion(activeDb,'world1');
 const a=await registerTemporary();
 const b=await registerTemporary();
 const [first,second]=await Promise.all([
  call(a,'register'),call(b,'register')
 ]);
 assert.notEqual(first.player.uid,second.player.uid);
 const buy=await call(a,'buyBusiness',{businessId:'coffee',requestId:rid(401)});
 assert.equal(buy.player.cash,1000);
 const listing=await call(a,'enterpriseAction',{operation:'listCompany',index:0,
  price:500,requestId:rid(402)});
 assert.equal(listing.player.businesses[0].listing.price,500);
 const acquired=await call(b,'buyListedCompany',{sellerUid:first.player.uid,
  index:0,maxPrice:500,requestId:rid(403)});
 assert.equal(acquired.player.cash,1000);
 const replay=await call(b,'buyListedCompany',{sellerUid:first.player.uid,
  index:0,maxPrice:500,requestId:rid(403)});
 assert.equal(replay.replayed,true);
 assert.equal((await call(a,'me')).player.cash,1500);
 assert.equal((await call(b,'me')).player.businesses.length,1);
 console.log('TWO_REAL_FIREBASE_ACCOUNTS_LOCAL_D1_PASS');
}catch(e){
 // The project may have anonymous signup turned off. Do NOT change its
 // authentication settings just to run this test.
 console.log('TWO_REAL_FIREBASE_ACCOUNTS_LOCAL_D1_UNAVAILABLE: '+String(e.message).slice(0,170));
 process.exitCode=1;
}finally{
 let cleared=0;
 for(const idToken of ids){
  try{const r=await fetch(deleteUrl,{method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({idToken})});
   if(r.ok)cleared++;
  }catch{}
 }
 console.log('TEMP_FIREBASE_USERS_CREATED='+ids.length+' REMOVED='+cleared);
 db.close();
}
