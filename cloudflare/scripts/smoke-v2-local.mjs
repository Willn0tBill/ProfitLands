/* Real Cloudflare Worker + local D1 V2 smoke, entirely isolated from
 * production and without Firebase tokens or paid infrastructure.
 */
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import net from 'node:net';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const cli=join(root,'node_modules','wrangler','bin','wrangler.js');
const temp=await mkdtemp(join(tmpdir(),'profitlands-v2-smoke-'));
const config=join(root,'.wrangler-v2-smoke-'+process.pid+'.toml');
const data=join(temp,'db');
let server;
const logs=[];
function wrangler(args){
 const out=spawnSync(process.execPath,[cli,...args],{
  cwd:root,encoding:'utf8',timeout:65000,windowsHide:true
 });
 if(out.status!==0||out.error)
  throw Error('Wrangler command failed: '+(out.stderr||'')+' '+(out.stdout||'')+' '+out.error);
 return out.stdout;
}
async function port(){
 return new Promise((resolvePort,reject)=>{
  const s=net.createServer();
  s.once('error',reject);
  s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolvePort(p))});
 });
}
async function get(base,path,headers={Origin:'https://profitlands.winotbill.workers.dev'}){
 const response=await fetch(base+path,{headers});
 return {status:response.status,body:await response.json(),headers:response.headers};
}
try{
 const listen=await port();
 const base='http://127.0.0.1:'+listen;
 await writeFile(config,[
  'name = "profitlands-v2-smoke"',
  'main = "src/index.mjs"',
  'compatibility_date = "2026-11-05"',
  'workers_dev = false',
  '[vars]',
  'WORLD_STORAGE_V2 = "enabled"',
  '[[d1_databases]]',
  'binding = "DB"',
  'database_name = "profitlands-v2-smoke"',
  'database_id = "00000000-0000-0000-0000-000000000002"',
  ''
 ].join('\n'));
 console.log('Applying additive V2 schema to clean local D1...');
 wrangler(['d1','execute','profitlands-v2-smoke','--local','--config',config,
  '--persist-to',data,'--file',join(root,'schema.sql'),'--yes']);
 wrangler(['d1','execute','profitlands-v2-smoke','--local','--config',config,
  '--persist-to',data,'--file',join(root,'schema-v2.sql'),'--yes']);
 const seed=join(temp,'seed.sql');
 // Simulate a fully migrated empty world without authenticating fake users.
 await writeFile(seed,`INSERT INTO world_meta(world_id,version,metadata) VALUES
 ('world1',0,'{"chat":[]}'),
 ('world-asia',0,'{"chat":[]}');\n`);
 wrangler(['d1','execute','profitlands-v2-smoke','--local','--config',config,
  '--persist-to',data,'--file',seed,'--yes']);
 console.log('Starting actual V2 Cloudflare Worker...');
 server=spawn(process.execPath,[cli,'dev','--local','--config',config,
  '--persist-to',data,'--ip','127.0.0.1','--port',String(listen),
  '--show-interactive-dev-session=false'],{
  cwd:root,stdio:['ignore','pipe','pipe'],windowsHide:true
 });
 server.stdout.on('data',chunk=>logs.push(chunk.toString()));
 server.stderr.on('data',chunk=>logs.push(chunk.toString()));
 let ready=false;
 const start=Date.now();
 while(Date.now()-start<30000){
  if(server.exitCode!==null)throw Error('Worker exited: '+logs.join('').slice(-1600));
  try{
   const test=await get(base,'/health');
   if(test.status===200&&test.body.version===6){ready=true;break}
  }catch{}
  await new Promise(done=>setTimeout(done,250));
 }
 assert.ok(ready,'V2 Worker failed startup: '+logs.join('').slice(-2500));
 const health=await get(base,'/health');
 assert.equal(health.body.version,6);
 assert.equal(health.body.maxPlayers,128);
 assert.equal(health.body.enterpriseEnabled,true);
 assert.equal(health.headers.get('access-control-allow-origin'),
  'https://profitlands.winotbill.workers.dev');
 const asia=await get(base,'/health?worldId=world-asia');
 assert.equal(asia.status,200);
 assert.equal(asia.body.region,'Asia');
 const incomplete=await get(base,'/health?worldId=world-europe');
 assert.equal(incomplete.status,503,'unmigrated region must not silently create data');
 const unsigned=await fetch(base+'/api',{method:'POST',headers:{
  Origin:'https://profitlands.winotbill.workers.dev',
  'Content-Type':'application/json'
 },body:JSON.stringify({action:'register',worldId:'world1'})});
 assert.equal(unsigned.status,401);
 const rejected=await get(base,'/health',{Origin:'https://untrusted.example'});
 assert.equal(rejected.status,403);
 console.log('WORLD_V2_REAL_D1_SMOKE_PASS: migration readiness, health, 3 regions, auth, CORS');
}catch(error){
 console.error(error.stack||error);
 console.error(logs.join('').slice(-2000));
 process.exitCode=1;
}finally{
 if(server){
  server.kill();
  // On Windows a spawned Wrangler subprocess may need a second termination.
  if(process.platform==='win32')spawnSync('taskkill',['/PID',String(server.pid),'/T','/F'],
   {windowsHide:true,timeout:2000});
 }
 await rm(config,{force:true}).catch(()=>{});
 await rm(temp,{recursive:true,force:true}).catch(()=>{});
}
