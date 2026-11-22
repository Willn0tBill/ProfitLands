/* Run a real local World 1 Worker with a clean D1 database.
 * This test needs no Cloudflare account, billing, tokens, or Firebase secrets.
 * Usage: npm --prefix cloudflare install && node cloudflare/scripts/smoke-local.mjs
 */
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import net from 'node:net';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const wrangler=join(root,'node_modules','wrangler','bin','wrangler.js');
const origin='https://profitlands.winotbill.workers.dev';
const wrongOrigin='https://untrusted.example';
const tmp=await mkdtemp(join(tmpdir(),'profitlands-world1-smoke-'));
const stateDir=join(tmp,'d1');
const tempConfig=join(root,'.wrangler-smoke-'+process.pid+'.toml');
let server;
const log=[];
const timeout=(ms)=>new Promise((_,reject)=>setTimeout(()=>reject(Error('Timed out after '+ms+'ms')),ms));

function wranglerCmd(args){
 const p=spawnSync(process.execPath,[wrangler,...args],{
  cwd:root,encoding:'utf8',timeout:65000,windowsHide:true
 });
 if(p.error||p.status!==0)throw Error('Wrangler '+args[0]+' failed:\n'+(p.stdout||'')+'\n'+(p.stderr||'')+'\n'+String(p.error||'exit '+p.status));
 return (p.stdout||'')+(p.stderr||'');
}
async function freePort(){
 return await new Promise((resolvePort,reject)=>{
  const listener=net.createServer();
  listener.once('error',reject);
  listener.listen(0,'127.0.0.1',()=>{
   const port=listener.address().port;
   listener.close(()=>resolvePort(port));
  });
 });
}
async function request(base,path,{method='GET',body,headers={}}={}){
 const res=await fetch(base+path,{
  method,headers:{Origin:origin,...headers,...(body?{'Content-Type':'application/json'}:{})},
  ...(body?{body:JSON.stringify(body)}:{})
 });
 const text=await res.text();
 let data;try{data=JSON.parse(text)}catch{data=null}
 return {status:res.status,cors:res.headers.get('access-control-allow-origin'),data,text};
}
async function main(){
 const port=await freePort();
 const base='http://127.0.0.1:'+port;
 await writeFile(tempConfig,[
  'name = "profitlands-world1-smoke"',
  'main = "src/index.mjs"',
  'compatibility_date = "2026-11-05"',
  'workers_dev = false',
  '[[d1_databases]]',
  'binding = "DB"',
  'database_name = "profitlands-world1-smoke"',
  'database_id = "00000000-0000-0000-0000-000000000001"',
  ''
 ].join('\n'),'utf8');
 console.log('Initializing fresh local D1...');
 wranglerCmd(['d1','execute','profitlands-world1-smoke','--local',
  '--config',tempConfig,'--persist-to',stateDir,'--file',join(root,'schema.sql'),'--yes']);
 console.log('Starting real local Worker...');
 server=spawn(process.execPath,[wrangler,'dev','--local','--config',tempConfig,
  '--persist-to',stateDir,'--ip','127.0.0.1','--port',String(port),
  '--show-interactive-dev-session=false'],{
  cwd:root,stdio:['ignore','pipe','pipe'],windowsHide:true
 });
 server.stdout.on('data',c=>log.push(c.toString()));
 server.stderr.on('data',c=>log.push(c.toString()));
 let started=false;
 const start=Date.now();
 while(Date.now()-start<30000){
  if(server.exitCode!==null)throw Error('Wrangler exited unexpectedly:\n'+log.join('').slice(-3000));
  try{
   const check=await Promise.race([request(base,'/health'),timeout(1200)]);
   if(check.status===200&&check.data?.worldId==='world1'){started=true;break}
  }catch{}
  await new Promise(r=>setTimeout(r,250));
 }
 assert.ok(started,'Local Worker did not become healthy:\n'+log.join('').slice(-3000));
 const getHealth=await request(base,'/health');
 assert.equal(getHealth.status,200,'GET health');
 assert.equal(getHealth.cors,origin,'GET CORS');
 assert.equal(getHealth.data.ok,true,'D1-backed health');
 assert.ok(Array.isArray(getHealth.data.catalog)&&getHealth.data.catalog.length>=8,'server-owned catalog');
 assert.equal(getHealth.data.chatEnabled,true,'automatic chat protections permit an unstaffed chat beta');
 const postHealth=await request(base,'/api',{method:'POST',body:{action:'health'}});
 assert.equal(postHealth.status,200,'POST health');
 assert.equal(postHealth.data.worldId,'world1');
 const preflight=await request(base,'/api',{
  method:'OPTIONS',
  headers:{'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization,content-type'}
 });
 assert.equal(preflight.status,204,'browser CORS preflight');
 assert.equal(preflight.cors,origin,'browser CORS preflight origin');
 const unsigned=await request(base,'/api',{method:'POST',body:{action:'register'}});
 assert.equal(unsigned.status,401,'unsigned registrations must fail');
 assert.equal(unsigned.data.error.code,'unauthenticated');
 const denied=await request(base,'/api',{
  method:'POST',body:{action:'health'},headers:{Origin:wrongOrigin}
 });
 assert.equal(denied.status,403,'other origins must be denied');
 assert.equal(denied.cors,null,'other origins get no CORS allowance');
 const invalid=await request(base,'/api',{
  method:'POST',body:{action:'not-a-real-action'}
 });
 assert.equal(invalid.status,400,'unknown server actions rejected');
 const wrongMethod=await request(base,'/api',{method:'GET'});
 assert.equal(wrongMethod.status,405,'GET cannot mutate game state');
 console.log('WORLD1_LOCAL_SMOKE_PASS: D1, health, catalog, CORS, auth, route validation');
}
try{await main()}
catch(e){console.error(e.stack||e);console.error(log.join('').slice(-2500));process.exitCode=1}
finally{
 if(server){
  try{server.kill('SIGTERM')}catch{}
  await Promise.race([new Promise(resolveExit=>{
   if(server.exitCode!==null)return resolveExit();
   server.once('exit',resolveExit);
  }),new Promise(r=>setTimeout(r,3000))]);
  if(server.exitCode===null)try{server.kill('SIGKILL')}catch{}
 }
 await rm(tempConfig,{force:true});
 // Windows Workerd releases SQLite/observability handles shortly after exit.
 // A locked disposable QA directory is not an API or gameplay test failure.
 try{await rm(tmp,{recursive:true,force:true,maxRetries:12,retryDelay:350})}
 catch(error){console.warn('Temporary QA directory could not be fully cleaned:',tmp,error.code||error.message)}
}
