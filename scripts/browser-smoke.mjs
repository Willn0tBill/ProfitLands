/* Manual isolated browser QA. Uses an empty Chrome profile; never touches the
 * owner's saved ProfitLands session, passwords or browsing history.
 * Windows: node scripts/browser-smoke.mjs
 */
import {spawn,spawnSync} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import net from 'node:net';
import assert from 'node:assert/strict';
const chrome='C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const profile=await mkdtemp('D:\\ProfitLands_Backups\\browser-smoke-');
const base='https://profitlands.winotbill.workers.dev';
let browser,websocket,nextId=1;
const pending=new Map(),errors=[];
const sleep=ms=>new Promise(res=>setTimeout(res,ms));
async function freePort(){
 return new Promise((res,rej)=>{
  const srv=net.createServer();
  srv.once('error',rej);
  srv.listen(0,'127.0.0.1',()=>{const port=srv.address().port;srv.close(()=>res(port))});
 });
}
async function send(method,params={}){
 const id=nextId++;
 return new Promise((resolve,reject)=>{
  const handle=setTimeout(()=>{pending.delete(id);reject(Error('CDP timed out: '+method))},12000);
  pending.set(id,{resolve:x=>{clearTimeout(handle);resolve(x)},reject});
  websocket.send(JSON.stringify({id,method,params}));
 });
}
async function evaluate(expression){
 const reply=await send('Runtime.evaluate',{expression,
  returnByValue:true,awaitPromise:true});
 if(reply.error||reply.result?.exceptionDetails)
  throw Error('Browser evaluation failed: '+String(reply.error?.message||
   reply.result?.exceptionDetails?.text).slice(0,200));
 return reply.result?.result?.value;
}
async function waitFor(expression,timeout=18000){
 const start=Date.now();
 while(Date.now()-start<timeout){
  try{const result=await evaluate(expression);if(result)return result}catch{}
  await sleep(200);
 }
 throw Error('UI did not reach expected state: '+expression);
}
async function navigate(url){
 await send('Page.navigate',{url});
 await waitFor("document.readyState==='complete' && document.querySelector('body')",25000);
}
try{
 const port=await freePort();
 browser=spawn(chrome,[
  '--headless=new','--disable-gpu','--no-first-run',
  '--no-default-browser-check','--disable-extensions',
  '--remote-debugging-port='+port,'--user-data-dir='+profile,
  '--window-size=1440,900','about:blank'
 ],{windowsHide:true,stdio:'ignore'});
 let tab;
 for(let i=0;i<70;i++){
  try{const tabs=await (await fetch('http://127.0.0.1:'+port+'/json')).json();
   tab=tabs.find(t=>t.type==='page');if(tab)break}catch{}
  await sleep(200);
 }
 assert.ok(tab,'Could not open isolated headless Chrome');
 websocket=new WebSocket(tab.webSocketDebuggerUrl);
 await new Promise((resolve,reject)=>{
  websocket.addEventListener('open',resolve,{once:true});
  websocket.addEventListener('error',reject,{once:true});
 });
 websocket.addEventListener('message',event=>{
  const m=JSON.parse(String(event.data));
  if(m.id&&pending.has(m.id)){
   const job=pending.get(m.id);pending.delete(m.id);job.resolve(m);
  }
  if(m.method==='Runtime.exceptionThrown')
   errors.push(String(m.params?.exceptionDetails?.text||'JS exception').slice(0,120));
 });
 await send('Runtime.enable');
 await send('Page.enable');
 await navigate(base+'/');
 await waitFor("!!document.querySelector('#homeContinue') && !!document.querySelector('#homeNew')");
 assert.equal(await evaluate("!!document.querySelector('#homeNew')"),true);
 console.log('HOME_ENTRY_BUTTONS_PRESENT=true');
 // Setup screen should not be mistaken for a second landing homepage.
 await navigate(base+'/play/?new=1');
 await waitFor("!!document.querySelector('#startGame') && !!document.querySelector('[data-type=single]')");
 console.log('SINGLEPLAYER_SETUP_PRESENT=true');
 await evaluate("document.querySelector('#startGame').click();true");
 await waitFor("!!document.querySelector('#playerNameModal:not(.hidden)') || !!window.state?.started");
 const asksName=await evaluate("!!document.querySelector('#playerNameModal:not(.hidden)')");
 if(asksName){
  await evaluate("document.querySelector('#playerNameInput').value='QA Tester'; document.querySelector('#playerNameContinue').click();true");
  console.log('REQUIRED_PLAYER_NAME_ONBOARDING_PASS=true');
 }
 const launched=await waitFor("!!(window.state?.started && document.querySelector('#gameScreen')?.classList.contains('active'))",20000);
 const shop=await evaluate("({button:!!document.querySelector('#openBusinessShop'),onclick:typeof document.querySelector('#openBusinessShop')?.onclick,choices:!!document.querySelector('#businessChoices'),modal:!!document.querySelector('#businessModal')})");
 console.log('SHOP_BEFORE='+JSON.stringify(shop));
 await evaluate("document.querySelector('#openBusinessShop').click();true");
 const after=await evaluate("({content:document.querySelector('#businessChoices')?.innerHTML.slice(0,140),hidden:document.querySelector('#businessModal')?.classList.contains('hidden'),active:document.querySelector('#gameScreen')?.classList.contains('active')})");
 console.log('SHOP_AFTER='+JSON.stringify(after));
 await waitFor("!!document.querySelector('[data-buy-type=coffee], [data-buy=coffee]')");
 await evaluate("document.querySelector('[data-buy-type=coffee], [data-buy=coffee]').click();true");
 await waitFor("window.state?.businesses?.length>0",12000);
 assert.equal(launched,true);
 const details=await evaluate("({cash:window.state.cash,companyCount:window.state.businesses?.length||0,mode:window.state.playType,saveKeys:Object.keys(localStorage).filter(k=>/profit|save|game/i.test(k))})");
 assert.equal(details.mode,'single');
 console.log('SINGLEPLAYER_START_PASS cash_valid='+Number.isFinite(details.cash)+
  ' local_save_keys='+details.saveKeys.length);
 await sleep(1100);
 // A distinct navigation to home must offer a saved-game recovery path.
 await navigate(base+'/');
 await waitFor("!!document.querySelector('#homeContinue')");
 const resume=await waitFor("document.querySelector('#homeContinue')?.disabled===false",20000)
  .catch(()=>false);
 console.log('SINGLEPLAYER_RESUME_ENABLED='+resume);
 // Check an ordinary popup close lifecycle in the isolated profile.
 const open=await evaluate("document.querySelector('#homeSignIn')?.click();!document.querySelector('#homeAuthDialog')?.hidden");
 const close=await evaluate("document.querySelector('#homeAuthClose')?.click();document.querySelector('#homeAuthDialog')?.hidden");
 console.log('LOGIN_MODAL_OPEN='+open+' CLOSE='+close);
 await send('Emulation.setDeviceMetricsOverride',{width:320,height:720,
  deviceScaleFactor:1,mobile:true});
 await navigate(base+'/');
 const mobile=await evaluate("({viewport:window.innerWidth,content:document.documentElement.scrollWidth})");
 console.log('MOBILE_HOME_VIEWPORT='+mobile.viewport+' DOCUMENT_WIDTH='+mobile.content);
 console.log('UNHANDLED_BROWSER_JS_ERRORS='+errors.length);
 if(!resume||!close||mobile.content>mobile.viewport+5||errors.length)
  throw Error('Singleplayer browser QA found runtime/UX problems');
 console.log('PROFITLANDS_CLEAN_CHROME_SINGLEPLAYER_QA_PASS');
}catch(e){
 console.log('PROFITLANDS_BROWSER_QA_FAILED: '+String(e?.message||e).slice(0,250));
 process.exitCode=1;
}finally{
 try{websocket?.close()}catch{}
 if(browser?.pid&&process.platform==='win32')spawnSync('taskkill',
  ['/PID',String(browser.pid),'/F','/T'],{windowsHide:true,timeout:6000});
 else browser?.kill();
 await rm(profile,{force:true,recursive:true,maxRetries:4,retryDelay:300}).catch(()=>{});
}
