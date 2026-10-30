'use strict';
const {contextBridge,ipcRenderer}=require('electron');

// Expose only the three achievement operations. No Node.js, filesystem,
// network, generic IPC, or arbitrary Steamworks access enters the web page.
const ready=ipcRenderer.sendSync('profitlands:steam:ready');
contextBridge.exposeInMainWorld('ProfitLandsSteamBridge',Object.freeze({
 ready:ready===true,
 getAchievement:name=>ipcRenderer.invoke('profitlands:steam:get',name),
 setAchievement:name=>ipcRenderer.invoke('profitlands:steam:set',name),
 storeStats:()=>ipcRenderer.invoke('profitlands:steam:store')
}));
