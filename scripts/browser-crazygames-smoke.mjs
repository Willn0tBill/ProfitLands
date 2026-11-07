/* CrazyGames package QA in a fresh headless Chromium profile. No account
 * secrets, Steam data, real players or production saves are ever touched.
 * Builds the upload separately before launching this localhost preview.
 */
import {createServer} from 'node:http';
import {readFile,rm,mkdtemp} from 'node:fs/promises';
import {resolve,join,extname,sep} from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import net from 'node:net';
import assert from 'node:assert/strict';
const root=resolve('dist/crazygames');
const chrome='C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const profile=await mkdtemp('D:\\ProfitLands_Backups\\cg-browser-');
let server,browser,ws;
let commandId=1;
const pending=new Map(),errors=[];
async function freePort(){
 return new Promise((resolvePort,reject)=>{
  const s=net.createServer();
  s.once('error',reject);
  s.listen(0,'127.0.0.1',()=>s.close(()=>resolvePort(s.address()?.port)));
  // close() invalidates address in some Node versions; capture first.
 });
}
function port(){
 return new Promise((resolvePort,reject)=>{
  const s=net.createServer();
  s.once('error',reject);
  s.listen(0,'127.0.0.1',()=>{
   const assigned=s.address().port;
   s.close(()=>resolvePort(assigned));
  });
 });
}
const sleep=ms=>new Promise(ok=>setTimeout(ok,ms));
async function send(method,params={}){
 const id=commandId++;
 return new Promise((res,rej)=>{
  const timer=setTimeout(()=>{pending.delete(id);rej(Error('CDP timeout: '+method))},12000);
  pending.set(id,{res:x=>{clearTimeout(timer);res(x)},rej});
  ws.send(JSON.stringify({id,method,params}));
 });
}
async function evaluate(expression){
 const result=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
 if(result.result?.exceptionDetails)throw Error(result.result.exceptionDetails.text);
 return result.result?.result?.value;
}
async function until(expression,timeout=25000){
 const start=Date.now();
 while(Date.now()-start<timeout){
  try{if(await evaluate(expression))return true}catch{}
  await sleep(200);
 }
 throw Error('Condition failed: '+expression);
}
try{
 const webPort=await port(),debugPort=await port();
 const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json'};
 server=createServer(async(req,res)=>{
  try{
   const url=new URL(req.url,'http://127.0.0.1');
   const name=decodeURIComponent(url.pathname)==='/'?'index.html':
    decodeURIComponent(url.pathname).slice(1);
   const target=resolve(root,name);
   if(target!==root&&!target.startsWith(root+sep))throw Error('invalid_path');
   const data=await readFile(target);
   res.writeHead(200,{'Content-Type':mime[extname(target)]||'application/octet-stream','Cache-Control':'no-store'});
   res.end(data);
  }catch{res.writeHead(404);res.end('Not Found')}
 });
 await new Promise(ok=>server.listen(webPort,'127.0.0.1',ok));
 browser=spawn(chrome,['--headless=new','--disable-gpu','--no-first-run',
  '--no-default-browser-check','--disable-extensions',
  '--user-data-dir='+profile,'--remote-debugging-port='+debugPort,
  '--window-size=907,510','about:blank'],{windowsHide:true,stdio:'ignore'});
 let tab;
 for(let i=0;i<100;i++){
  try{const pages=await (await fetch('http://127.0.0.1:'+debugPort+'/json')).json();
   tab=pages.find(p=>p.type==='page');if(tab)break}catch{}
  await sleep(180);
 }
 assert.ok(tab,'Isolated Chrome could not start');
 ws=new WebSocket(tab.webSocketDebuggerUrl);
 await new Promise((ok,fail)=>{
  ws.addEventListener('open',ok,{once:true});
  ws.addEventListener('error',fail,{once:true});
 });
 ws.addEventListener('message',message=>{
  const item=JSON.parse(String(message.data));
  if(item.id&&pending.has(item.id)){
   const entry=pending.get(item.id);pending.delete(item.id);entry.res(item);
  }
  if(item.method==='Runtime.exceptionThrown')
   errors.push(String(item.params?.exceptionDetails?.text||'JS exception'));
 });
 await send('Runtime.enable');await send('Page.enable');
 await send('Page.navigate',{url:'http://127.0.0.1:'+webPort+'/'});
 await until("document.readyState==='complete'&&!!window.state",30000);
 await until("window.state.started===true&&document.querySelector('#gameScreen')?.classList.contains('active')",20000);
 const platform=await evaluate("({name:window.profitLandsPlatform?.name,playType:window.state.playType,gameLoaded:document.querySelector('#gameScreen')?.classList.contains('active'),sdkScripts:[...document.scripts].filter(s=>s.src.includes('crazygames-sdk-v3')).length,externalAuth:!!window.firebase?.auth})");
 assert.equal(platform.name,'crazygames');
 assert.equal(platform.playType,'single');
 assert.equal(platform.sdkScripts,1);
 assert.equal(platform.externalAuth,false);
 console.log('CRAZYGAMES_LOCAL_SDK_SINGLEPLAYER_ENTRY_PASS');
 await evaluate("document.querySelector('#openBusinessShop').click();true");
 await until("!!document.querySelector('[data-buy-type=coffee]')");
 await evaluate("document.querySelector('[data-buy-type=coffee]').click();true");
 await until("window.state.businesses.length>0");
 assert.equal(await evaluate("window.state.businesses.length"),1);
 console.log('CRAZYGAMES_FIRST_BUSINESS_PURCHASE_PASS');
 for(const [width,height] of [[907,510],[320,568]]){
  await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<500});
  const metrics=await evaluate("({width:innerWidth,content:document.documentElement.scrollWidth,game:!!document.querySelector('#gameScreen')?.classList.contains('active')})");
  assert.equal(metrics.game,true);
  console.log('CRAZYGAMES_FRAME_'+width+'x'+height+
   '_CONTENT_WIDTH='+metrics.content+' VIEWPORT='+metrics.width);
  if(metrics.content>metrics.width+7)
   throw Error('Horizontal game viewport overflow at '+width+' pixels');
 }
 assert.equal(errors.length,0,'Uncaught browser JavaScript errors: '+errors.join('; ').slice(0,200));
 console.log('CRAZYGAMES_CHROME_IFRAME_QA_PASS');
}catch(error){
 console.log('CRAZYGAMES_CHROME_IFRAME_QA_FAILED: '+String(error.message||error).slice(0,260));
 process.exitCode=1;
}finally{
 try{ws?.close()}catch{}
 if(browser?.pid)spawnSync('taskkill',['/PID',String(browser.pid),'/T','/F'],
  {windowsHide:true,timeout:7000});
 if(server)await new Promise(done=>server.close(done));
 await rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:250}).catch(()=>{});
}
