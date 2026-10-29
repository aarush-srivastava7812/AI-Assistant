import {app,BrowserWindow,globalShortcut,ipcMain,screen,type IpcMainInvokeEvent} from 'electron';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {requireMainSender} from './sender';
export const DEFAULT_ACCELERATOR='CommandOrControl+Shift+Space';
export const OVERLAY_METHODS=['status','connect','listSpaces','chats','newChat','chat','sendChat','cancelChat','lookupChat','deleteChat'];
let pet:BrowserWindow|undefined,overlay:BrowserWindow|undefined,mainWindow:BrowserWindow|undefined;
let rendererFile='',preloadFile='',shortcutRegistered=false,space='',hidden=false;
let enabled={pet:false,widget:false};
const channels:string[]=[];
function validate(event:IpcMainInvokeEvent,window:BrowserWindow|undefined,kind?:string){
 if(!window||window.isDestroyed())throw new Error('Companion unavailable.');
 const url=pathToFileURL(rendererFile);if(kind)url.searchParams.set('companion',kind);
 requireMainSender(event,window.webContents,url.href);
}
export function requireCompanionSender(event:IpcMainInvokeEvent){
 if(event.sender===mainWindow?.webContents){validate(event,mainWindow);return 'main';}
 if(event.sender===pet?.webContents){validate(event,pet,'pet');return 'pet';}
 validate(event,overlay,'overlay');return 'overlay';
}
export function requireOverlayRequest(event:IpcMainInvokeEvent,method:string,args:unknown[]){
 requireOverlaySender(event);
 if(!OVERLAY_METHODS.includes(method))throw new Error('Operation unavailable in companion chat.');
 if(!['status','connect','listSpaces'].includes(method)&&(!space||args[0]!==space))throw new Error('Select this space in the main window first.');
}
export function requireOverlaySender(event:IpcMainInvokeEvent){validate(event,overlay,'overlay');}
function present(window:BrowserWindow,focus=false){if(hidden)return;if(focus){window.show();window.focus();}else window.showInactive();}
function create(kind:'pet'|'overlay'){
 const current=kind==='pet'?pet:overlay;if(current&&!current.isDestroyed()){present(current,kind==='overlay');return current;}
 const area=screen.getPrimaryDisplay().workArea;
 const bounds=kind==='pet'?{x:area.x+Math.max(0,area.width-204),y:area.y+Math.max(0,area.height-204),width:180,height:180}:area;
 const window=new BrowserWindow({...bounds,frame:false,transparent:true,alwaysOnTop:true,skipTaskbar:true,resizable:false,hasShadow:false,show:false,title:kind==='pet'?'Wayfinder Companion':'Wayfinder Companion Chat',webPreferences:{preload:preloadFile,contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true,allowRunningInsecureContent:false}});
 if(kind==='pet')pet=window;else overlay=window;
 window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.on('will-navigate',event=>event.preventDefault());window.webContents.on('will-attach-webview',event=>event.preventDefault());
 window.once('ready-to-show',()=>present(window,kind==='overlay'));
 window.on('closed',()=>{if(kind==='pet')pet=undefined;else overlay=undefined;});
 void window.loadFile(rendererFile,{query:{companion:kind}});return window;
}
export function showOverlay(){if(!enabled.widget)throw new Error('Enable the chat widget in Settings first.');create('overlay');}
export function applyCompanionPreferences(value:{pet:boolean;widget:boolean}){
 enabled={pet:value.pet,widget:value.widget};
 if(enabled.pet&&mainWindow)create('pet');else {pet?.destroy();pet=undefined;}
 if(!enabled.widget){overlay?.destroy();overlay=undefined;if(shortcutRegistered)globalShortcut.unregister(DEFAULT_ACCELERATOR);shortcutRegistered=false;}
 else if(!hidden&&!shortcutRegistered){try{shortcutRegistered=globalShortcut.register(DEFAULT_ACCELERATOR,showOverlay);}catch{shortcutRegistered=false;}}
}
export function hideOverlay(){overlay?.hide();}
function displayChange(){if(overlay&&!overlay.isDestroyed())overlay.setBounds(screen.getPrimaryDisplay().workArea);if(pet&&!pet.isDestroyed()){const a=screen.getPrimaryDisplay().workArea;pet.setPosition(a.x+Math.max(0,a.width-240),a.y+Math.max(0,a.height-280));}}
export function initCompanion(appDir:string,htmlFile:string,main:BrowserWindow,preferences={pet:false,widget:false}){
 rendererFile=htmlFile;preloadFile=path.join(appDir,'../preload/companion.cjs');mainWindow=main;hidden=process.env.WAYFINDER_VERIFY_HIDDEN==='1';
 const handlers:Record<string,(event:IpcMainInvokeEvent,...args:any[])=>any>={
 showOverlay:event=>{requireCompanionSender(event);showOverlay();},hideOverlay:event=>{requireCompanionSender(event);hideOverlay();},
 focusMain:event=>{requireCompanionSender(event);if(main.isMinimized())main.restore();present(main,true);},
 showSettings:event=>{requireCompanionSender(event);main.webContents.send('companion:navigate','settings');present(main,true);},
 hidePet:event=>{requireCompanionSender(event);pet?.hide();},showPet:event=>{requireCompanionSender(event);if(!enabled.pet)throw new Error('Enable the desktop pet in Settings first.');create('pet');},
 getShortcut:event=>{requireCompanionSender(event);return DEFAULT_ACCELERATOR;},shortcutRegistered:event=>{requireCompanionSender(event);return shortcutRegistered;},
 setSpace:(event,value)=>{validate(event,main);if(typeof value!=='string'||value.length>200)throw new Error('Invalid space.');space=value;},
 resizePet:(event,expanded)=>{validate(event,pet,'pet');if(typeof expanded!=='boolean')throw new Error('Invalid menu state.');const a=screen.getPrimaryDisplay().workArea;const width=expanded?360:180,height=expanded?Math.min(680,a.height):180;pet?.setBounds({x:a.x+Math.max(0,a.width-width-24),y:a.y+Math.max(0,a.height-height-24),width,height});},
 getContext:event=>{requireCompanionSender(event);return {space};}
 };
 for(const [method,handler]of Object.entries(handlers)){const channel='companion:'+method;ipcMain.handle(channel,handler);channels.push(channel);}
 applyCompanionPreferences(preferences);screen.on('display-added',displayChange);screen.on('display-removed',displayChange);screen.on('display-metrics-changed',displayChange);
}
export function shutdownCompanion(){if(shortcutRegistered)globalShortcut.unregister(DEFAULT_ACCELERATOR);shortcutRegistered=false;pet?.destroy();overlay?.destroy();pet=undefined;overlay=undefined;for(const c of channels.splice(0))ipcMain.removeHandler(c);screen.removeListener('display-added',displayChange);screen.removeListener('display-removed',displayChange);screen.removeListener('display-metrics-changed',displayChange);}
export function getOverlayWindow(){return overlay;}
export function getPetWindow(){return pet;}
export function isShortcutRegistered(){return shortcutRegistered;}
