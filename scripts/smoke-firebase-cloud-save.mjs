/* Owner-authorized Firestore save QA, isolated to fresh temporary accounts.
 * Never accesses existing player save documents. Temporary user-owned Firestore
 * documents and Firebase Auth identities are explicitly deleted in finally.
 */
import {readFileSync} from 'node:fs';
import {randomBytes,randomUUID} from 'node:crypto';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';

if(!process.argv.includes('--allow-temporary-cloud-users'))
 throw Error('Manual opt-in required: --allow-temporary-cloud-users');
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const config=readFileSync(join(root,'firebase-config.js'),'utf8');
const project=config.match(/projectId\s*:\s*['"]([^'"]+)['"]/)?.[1];
const key=config.match(/apiKey\s*:\s*['"]([^'"]+)['"]/)?.[1];
if(project!=='wtvstudios-5b40f'||!key)throw Error('Unexpected Firebase project');
const accounts=[];
const base='https://identitytoolkit.googleapis.com/v1/accounts:';
const fire='https://firestore.googleapis.com/v1/projects/'+project+'/databases/(default)/documents/';
const marker='profitlands-cloudsave-qa-'+randomUUID().replaceAll('-','');
async function auth(method,body){
 const response=await fetch(base+method+'?key='+encodeURIComponent(key),{
  method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 const data=await response.json();
 if(!response.ok)throw Error('Firebase account operation failed: '+(data.error?.message||response.status));
 return data;
}
async function create(){
 const email=marker+randomUUID().replaceAll('-','')+'@example.invalid';
 const password=randomBytes(30).toString('base64url');
 const data=await auth('signUp',{email,password,returnSecureToken:true});
 accounts.push({uid:data.localId,idToken:data.idToken,email,password});
 return accounts.at(-1);
}
async function documentRequest(token,method,url,body){
 const response=await fetch(url,{method,
  headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
  ...(body?{body:JSON.stringify(body)}:{})});
 const data=await response.json();
 return {status:response.status,body:data};
}
const makeFields=(rev,cash)=>({fields:{
 saveVersion:{integerValue:'4'},revision:{integerValue:String(rev)},
 mode:{stringValue:'standard'},playType:{stringValue:'single'},
 state:{mapValue:{fields:{
  cash:{integerValue:String(cash)},day:{integerValue:'2'},
  mode:{stringValue:'standard'},playType:{stringValue:'single'},
  businesses:{arrayValue:{values:[]}}
 }}},
 qaMarker:{stringValue:marker}
}});
let docUrl=null,valid=false;
try{
 const userA=await create();
 const userB=await create();
 docUrl=fire+'users/'+encodeURIComponent(userA.uid)+'/saves/last-game';
 const first=await documentRequest(userA.idToken,'PATCH',docUrl,makeFields(1,1420));
 assert.equal(first.status,200,'user must be able to write their own save');
 assert.equal(first.body.fields.qaMarker.stringValue,marker);
 const blocked=await documentRequest(userB.idToken,'GET',docUrl);
 assert.equal(blocked.status,403,'unrelated accounts must not read saves');
 const own=await documentRequest(userA.idToken,'GET',docUrl);
 assert.equal(own.status,200);
 assert.equal(Number(own.body.fields.revision.integerValue),1);
 assert.equal(Number(own.body.fields.state.mapValue.fields.cash.integerValue),1420);
 // Simulated second device: a new independent Firebase session for the same
 // email/password reads identical persisted cloud progress.
 const second=await auth('signInWithPassword',{
  email:userA.email,password:userA.password,returnSecureToken:true});
 const loaded=await documentRequest(second.idToken,'GET',docUrl);
 assert.equal(loaded.status,200);
 assert.equal(Number(loaded.body.fields.revision.integerValue),1);
 const stamp=loaded.body.updateTime;
 assert.ok(stamp,'Firestore updates must expose a version stamp');
 const guarded=await documentRequest(second.idToken,'PATCH',
  docUrl+'?currentDocument.updateTime='+encodeURIComponent(stamp),makeFields(2,2620));
 assert.equal(guarded.status,200,'current writer should be allowed to advance the save');
 const conflict=await documentRequest(userA.idToken,'PATCH',
  docUrl+'?currentDocument.updateTime='+encodeURIComponent(stamp),makeFields(2,999999));
 assert.equal(conflict.status,400,'stale update must be rejected by Firestore precondition');
 const current=await documentRequest(userA.idToken,'GET',docUrl);
 assert.equal(current.status,200);
 assert.equal(Number(current.body.fields.revision.integerValue),2);
 assert.equal(Number(current.body.fields.state.mapValue.fields.cash.integerValue),2620,
  'stale writer must not overwrite verified latest progress');
 valid=true;
 console.log('FIRESTORE_REAL_ACCOUNT_TWO_SESSION_CLOUD_SAVE_CONFLICT_PASS');
}catch(error){
 console.log('FIRESTORE_CLOUD_SAVE_TEST_BLOCKED: '+String(error.message||error).slice(0,240));
 process.exitCode=1;
}finally{
 let docsRemoved=0,usersRemoved=0;
 if(docUrl&&accounts[0]?.idToken){
  try{const res=await documentRequest(accounts[0].idToken,'DELETE',docUrl);
   if(res.status===200||res.status===404)docsRemoved++}catch{}
 }
 for(const a of accounts){
  try{const res=await auth('delete',{idToken:a.idToken});if(!res.error)usersRemoved++}catch{}
 }
 console.log('FIRESTORE_QA_DOC_REMOVED='+docsRemoved+
  ' TEMP_AUTH_ACCOUNTS_CREATED='+accounts.length+
  ' REMOVED='+usersRemoved);
 if(docsRemoved!==1||usersRemoved!==accounts.length)process.exitCode=1;
 if(valid&&docsRemoved===1&&usersRemoved===accounts.length)
  console.log('FIRESTORE_CLOUD_SAVE_REAL_QA_CLEANUP_PASS');
}
