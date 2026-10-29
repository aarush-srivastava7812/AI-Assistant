import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
const fake=vi.hoisted(()=>({handlers:new Map<string,any>(),listeners:[] as (()=>void)[],window:null as any,theme:{shouldUseDarkColors:false}}));
vi.mock('electron',()=>({app:{},globalShortcut:{},screen:{},nativeTheme:{get shouldUseDarkColors(){return fake.theme.shouldUseDarkColors;},on:(_event:string,listener:()=>void)=>fake.listeners.push(listener)},ipcMain:{handle:(name:string,handler:any)=>fake.handlers.set(name,handler)},BrowserWindow:{getAllWindows:()=>[fake.window]}}));
import {registerAppearance} from '../src/main/appearance-ipc';
import {AppearanceStore} from '../src/main/appearance-store';
import {themeById} from '../src/shared/appearance';
let root:string,store:AppearanceStore,event:any;
beforeEach(async()=>{fake.handlers.clear();fake.listeners=[];fake.theme.shouldUseDarkColors=false;root=await fs.mkdtemp(path.join(os.tmpdir(),'wayfinder-appearance-ipc-'));store=new AppearanceStore(root);await store.load();fake.window={isDestroyed:()=>false,setBackgroundColor:vi.fn(),setTitleBarOverlay:vi.fn(),webContents:{mainFrame:{url:'file:///owned/index.html'},send:vi.fn()}};event={sender:fake.window.webContents,senderFrame:fake.window.webContents.mainFrame};registerAppearance(store,fake.window,'file:///owned/index.html');});
afterEach(async()=>{await fs.rm(root,{recursive:true,force:true});});
it('rejects forged frames before reading or writing preferences',async()=>{
 const forged={...event,senderFrame:{url:'file:///owned/index.html'}};
 expect(()=>fake.handlers.get('appearance:get')(forged)).toThrow(/Untrusted/);
 await expect(fake.handlers.get('appearance:save')(forged,{mode:'dark'})).rejects.toThrow(/Untrusted/);
 expect(store.current(false).configured).toBe(false);
 expect(()=>fake.handlers.get('appearance:get')({sender:{},senderFrame:{url:'file:///pet'}})).toThrow();
});
it('previews only catalog colors without persisting, and restores the caption on cancel',()=>{
 const preview=fake.handlers.get('appearance:preview');expect(preview(event,'url(other)')).toEqual({ok:false,error:'Choose a built-in theme.'});
 preview(event,'vscode-monokai');expect(fake.window.setBackgroundColor).toHaveBeenLastCalledWith(themeById('vscode-monokai')!.native.background);expect(store.current(false).configured).toBe(false);
 preview(event,null);expect(fake.window.setBackgroundColor).toHaveBeenLastCalledWith(themeById('vscode-light-modern')!.native.background);
});
it('saves a validated preference and broadcasts the same committed theme',async()=>{
 const result=await fake.handlers.get('appearance:save')(event,{mode:'dark',darkTheme:'vscode-monokai'});
 expect(result).toMatchObject({ok:true,data:{mode:'dark',resolvedTheme:'vscode-monokai'}});
 expect(fake.window.webContents.send).toHaveBeenLastCalledWith('appearance:changed',result.data);
 const copy=new AppearanceStore(root);await copy.load();expect(copy.current(false).resolvedTheme).toBe('vscode-monokai');
});
it('follows OS changes in system mode and preserves an explicit scheme',async()=>{
 fake.theme.shouldUseDarkColors=true;fake.listeners[0]();expect(fake.window.webContents.send).toHaveBeenLastCalledWith('appearance:changed',expect.objectContaining({resolvedTheme:'vscode-dark-modern'}));
 await fake.handlers.get('appearance:save')(event,{mode:'light'});fake.listeners[0]();expect(fake.window.webContents.send).toHaveBeenLastCalledWith('appearance:changed',expect.objectContaining({resolvedTheme:'vscode-light-modern'}));
});
