'use strict';
const path=require('node:path');
const {fileURLToPath}=require('node:url');
const {app,BrowserWindow,ipcMain}=require('electron');
const root=path.resolve(__dirname,'..');
const sectors=['coffee','restaurant','gamestore','hotel','dealership','factory','software','logistics'];
const tracks=['highestLevel','totalLevels','highestMarketing','totalMarketing','highestEfficiency','totalEfficiency','workforce','investments','upgrades','campaigns','hired','earnings'];
const specials=[['coffee','highestLevel',100],['restaurant','workforce',100],['factory','totalLevels',250],['software','earnings',500]];
const upper=s=>s.replace(/[^a-z0-9]/gi,'_').toUpperCase();
// Keep IDs aligned with steam-achievement-map.js. Native IPC never accepts
// arbitrary API names from the renderer process.
const allowed=new Set([
 ...sectors.flatMap(s=>tracks.map(t=>'PL_'+upper(s)+'_'+upper(t)+'_01')),
 ...specials.map(([s,t,r])=>'PL_'+upper(s)+'_'+upper(t)+'_'+r)
]);
let steam=null,steamworks=null,gameWindow=null;
try{
 steamworks=require('steamworks.js');
 const value=process.env.PROFITLANDS_STEAM_APP_ID;
 if(value&&!/^\d+$/.test(value))throw Error('Steam App ID must be numeric');
 steam=value?steamworks.init(Number(value)):steamworks.init();
 if(!steam?.achievement||!steam?.stats)throw Error('Steam stats service unavailable');
}catch(error){
 steam=null;
 console.warn('Steamworks not initialized; local game remains available:',error.message);
}
function authorized(event,name){
 return !!steam&&event.sender===gameWindow?.webContents&&
 (name===undefined||allowed.has(name));
}
ipcMain.on('profitlands:steam:ready',event=>{
 event.returnValue=Boolean(steam);
});
ipcMain.handle('profitlands:steam:get',(event,name)=>{
 if(!authorized(event,name))return false;
 try{return steam.achievement.isActivated(name)===true}catch(error){console.warn('Steam read failed',error);return false}
});
ipcMain.handle('profitlands:steam:set',(event,name)=>{
 if(!authorized(event,name))return false;
 try{return steam.achievement.activate(name)===true}catch(error){console.warn('Steam unlock failed',error);return false}
});
ipcMain.handle('profitlands:steam:store',event=>{
 if(!authorized(event))return false;
 // Successful submission is not a guarantee that the Steam server has
 // acknowledged the asynchronous StoreStats callback.
 try{return steam.stats.storeStats()===true}catch(error){console.warn('Steam save failed',error);return false}
});
function localNavigation(url){
 try{
  const target=fileURLToPath(url);
  const relative=path.relative(root,target);
  return relative!==''&&!relative.startsWith('..')&&!path.isAbsolute(relative);
 }catch(error){return false}
}
function createWindow(){
 gameWindow=new BrowserWindow({
  width:1280,height:800,minWidth:900,minHeight:650,
  title:'ProfitLands',
  webPreferences:{
   preload:path.join(__dirname,'preload.cjs'),
   contextIsolation:true,
   nodeIntegration:false,
   sandbox:false
  }
 });
 gameWindow.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 gameWindow.webContents.on('will-navigate',(event,url)=>{
  if(!localNavigation(url))event.preventDefault();
 });
 gameWindow.loadFile(path.join(root,'index.html'));
 if(steamworks&&steam){
  try{steamworks.electronEnableSteamOverlay()}catch(error){console.warn('Steam overlay unavailable:',error.message)}
 }
}
app.whenReady().then(()=>{
 createWindow();
 app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)createWindow()});
});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit()});
