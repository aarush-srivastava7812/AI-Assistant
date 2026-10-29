import {BrowserWindow,ipcMain,nativeTheme} from 'electron';
import {AppearanceStore} from './appearance-store';
import {themeById} from '../shared/appearance';
import {requireMainSender} from './sender';
import {requireCompanionSender} from './companion-windows';

export function registerAppearance(store:AppearanceStore,main:BrowserWindow,rendererURL:string){
 let preview:string|null=null;
 const snapshot=()=>store.current(nativeTheme.shouldUseDarkColors);
 const caption=()=>{const theme=themeById(preview||snapshot().resolvedTheme)!;if(!main.isDestroyed()){main.setBackgroundColor(theme.native.background);main.setTitleBarOverlay({color:theme.native.captionBackground,symbolColor:theme.native.captionForeground,height:36});}};
 const publish=()=>{preview=null;caption();for(const window of BrowserWindow.getAllWindows())window.webContents.send('appearance:changed',snapshot());};
 ipcMain.handle('appearance:get',(event)=>{if(event.sender===main.webContents)requireMainSender(event,main.webContents,rendererURL);else requireCompanionSender(event);return {ok:true,data:snapshot()};});
 ipcMain.handle('appearance:save',async(event,patch)=>{requireMainSender(event,main.webContents,rendererURL);try{await store.save(patch);publish();return {ok:true,data:snapshot()};}catch{return {ok:false,error:'Your theme could not be saved. The previous preference was preserved.'};}});
 ipcMain.handle('appearance:preview',(event,id)=>{requireMainSender(event,main.webContents,rendererURL);if(id!==null&&(typeof id!=='string'||!themeById(id)))return {ok:false,error:'Choose a built-in theme.'};preview=id;caption();return {ok:true};});
 nativeTheme.on('updated',publish);caption();
}
