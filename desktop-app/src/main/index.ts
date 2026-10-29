import { app, BrowserWindow, dialog, ipcMain, Menu, session, safeStorage } from 'electron';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { BackendBridge } from './bridge';
import {SetupManager} from './setup';
import {ConnectionVault} from './connection-vault';
import { createHandlers } from './broker';
import { requireMainSender } from './sender';
import { existsSync } from 'node:fs';
import { runtimeChoice } from './runtime-path';
import release from '../../FEATURES.json';
import { initCompanion, shutdownCompanion, requireOverlayRequest } from './companion-windows';

declare const WAYFINDER_SOURCE_ROOT: string;
const appDirectory = path.dirname(fileURLToPath(import.meta.url));
const project = app.isPackaged ? path.join(process.resourcesPath,'backend-project') : process.env.WAYFINDER_PROJECT_ROOT || WAYFINDER_SOURCE_ROOT;
// Hidden verification is a presentation-only test mode, with an isolated profile.
const hiddenVerification = process.env.WAYFINDER_VERIFY_HIDDEN === '1';
if (process.env.WAYFINDER_VERIFY_PROFILE && path.isAbsolute(process.env.WAYFINDER_VERIFY_PROFILE)) app.setPath('userData', process.env.WAYFINDER_VERIFY_PROFILE);
const selected = runtimeChoice({ packaged: app.isPackaged, project, userData: app.getPath('userData'), explicit: process.env.WAYFINDER_DESKTOP_RUNTIME, exists: existsSync });
const runtime = process.env.WAYFINDER_DESKTOP_RUNTIME ? selected.root : path.join(app.getPath('userData'),'workspace-v1');
const host = app.isPackaged ? path.join(process.resourcesPath, 'backend', 'host.py') : path.join(project, 'desktop-app', 'backend', 'host.py');
const bridge = new BackendBridge(project, host, runtime, selected.error);
const setup = new SetupManager(app.getPath('userData'),runtime,project,path.join(app.isPackaged?process.resourcesPath:path.join(project,'desktop-app','.cache','bundle'),'backend','WayfinderBackend.exe'),path.join(app.isPackaged?process.resourcesPath:path.join(project,'desktop-app','.cache','bundle'),'models'),bridge);
const vault=new ConnectionVault(app.getPath('userData'),{available:()=>safeStorage.isAsyncEncryptionAvailable(),encrypt:value=>safeStorage.encryptStringAsync(value),decrypt:async value=>(await safeStorage.decryptStringAsync(value)).result});
setup.setConnectionSource(async()=>vault.snapshot());
let main: BrowserWindow | undefined, quitting = false;
const importIndex=process.argv.indexOf('--import-connections-only');
if(importIndex>=0){
  app.whenReady().then(async()=>{
    const source=process.argv[importIndex+1];if(!source||!path.isAbsolute(source))throw new Error('An explicit absolute credential file is required.');
    await vault.load();await vault.importFile(source);console.log('WAYFINDER_IMPORT='+JSON.stringify(vault.status()));app.quit();
  }).catch(()=>{console.error('Connection import failed. Source credentials were preserved; no secret values were printed.');app.exit(1);});
}
else if (!app.requestSingleInstanceLock({ runtime })) app.quit();
else {
  app.on('second-instance', (_event, _argv, _cwd, data) => {
    if (!main) return;
    if (main.isMinimized()) main.restore();
    main.show(); main.focus();
    const requested = data && typeof data === 'object' && 'runtime' in data ? data.runtime : undefined;
    if (typeof requested === 'string' && requested !== runtime) void dialog.showMessageBox(main, { message: 'Another runtime was not opened', detail: 'This app already owns a selected runtime. Quit Wayfinder before opening a different data directory. No data was switched or copied.' });
  });
  app.whenReady().then(async () => {
    await vault.load();
    await setup.load();
    app.setAppUserModelId('local.wayfinder.desktop');
    const rendererFile = path.resolve(appDirectory, '../renderer/index.html');
    const rendererURL = pathToFileURL(rendererFile).href;
    main = new BrowserWindow({
      width: 1440, height: 940, minWidth: 600, minHeight: 600, show: !hiddenVerification, title: 'Wayfinder', backgroundColor: '#11171c', icon: app.isPackaged ? path.join(process.resourcesPath, 'wayfinder.png') : path.join(project, 'desktop-app/resources/wayfinder.png'),
      webPreferences: { preload: path.join(appDirectory, '../preload/index.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true, allowRunningInsecureContent: false, spellcheck: false },
    });
    main.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    main.on('close',event=>{if(!quitting){event.preventDefault();main?.hide();}});
    main.webContents.on('will-navigate', event => event.preventDefault());
    main.webContents.on('will-attach-webview', event => event.preventDefault());
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    const regular = createHandlers(bridge, {
      pick: async kind => {
        const result = await dialog.showOpenDialog(main!, {
          title: kind === 'repository' ? 'Select a repository for the bounded local branch operation' : kind === 'folder' ? 'Select a read-only folder' : kind === 'activity' ? 'Select a canonical activity CSV' : 'Select one document',
          properties: kind === 'folder' || kind === 'repository' ? ['openDirectory'] : ['openFile'],
          filters: kind === 'document' ? [{ name: 'Text documents', extensions: ['txt', 'md', 'csv', 'json', 'log'] }] : kind === 'activity' ? [{ name: 'Canonical CSV', extensions: ['csv'] }] : [],
        });
        return result.canceled ? null : result.filePaths[0] || null;
      },
      confirm: async (title, detail) => (await dialog.showMessageBox(main!, { type: 'question', title, message: title, detail, buttons: ['Cancel', 'Approve exact change once'], defaultId: 0, cancelId: 0, noLink: true, normalizeAccessKeys: true })).response === 1,
    }, { status: () => setup.ready()?bridge.describe():Promise.resolve({state:'setup',runtime}), connect: () => setup.connect() });
    const syncConnections=async()=>{try{return await bridge.call('connections_configure',{connections:vault.snapshot()});}catch{await bridge.close();throw new Error('Connections were saved, but the backend needs reconnecting before another read.');}};
    const handlers = {...regular,
      importConnections:async()=>{const selection=await dialog.showOpenDialog(main!,{title:'Import Google, Tavily and Notion connections from a local .env or Google token JSON',properties:['openFile']});if(selection.canceled||!selection.filePaths[0])return null;await vault.importFile(selection.filePaths[0]);return syncConnections();},
      disconnectConnection:async(provider:unknown)=>{await vault.disconnect(provider);return syncConnections();},
      setupStatus:()=>setup.status(),setupDatabase:(download:unknown)=>{if(typeof download!=='boolean')throw new Error('Choose whether to download the fixed database image.');return setup.database(download);},setupMemory:()=>setup.memoryCheck(),setupModel:()=>setup.modelCheck(),setupFinish:(name:unknown,consent:unknown)=>setup.finish(name,consent)};
    for (const [method, handler] of Object.entries(handlers)) ipcMain.handle(`wayfinder:${method}`, async (event, ...args) => {
      if (!release.preload_methods.includes(method)) throw new Error('Intent is not included in this build.');
      if (!main) throw new Error('Window unavailable.');
      if(event.sender===main.webContents)requireMainSender(event, main.webContents, rendererURL);
      else requireOverlayRequest(event,method,args);
      if (Buffer.byteLength(JSON.stringify(args)) > 65536) throw new Error('Desktop request too large.');
      try { if(!setup.ready()&&!['status','connect','setupStatus','setupDatabase','setupMemory','setupModel','setupFinish'].includes(method))throw new Error('Complete first-run setup before opening workspace resources.'); return { ok: true, data: await (handler as (...values:any[])=>Promise<any>)(...args) }; }
      catch (error) { return { ok: false, error: error instanceof Error ? error.message : 'Request failed. No completion is asserted.' }; }
    });
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { label: 'Wayfinder', submenu: [{ label: 'About Wayfinder', click: () => dialog.showMessageBox(main!, { message: 'Wayfinder · Memory and evidence', detail: 'Local assistant with bundled memory backend, managed Hermes chat and explicit memory review. Google, Tavily and Notion provide scoped read-only access after import and live checks. Scheduling and native desktop actions remain unavailable.' }) }, { type: 'separator' }, { role: 'quit' }] },
      { role: 'editMenu' }, { role: 'viewMenu' },
    ]));
    main.loadFile(rendererFile);
    void setup.connect();
    // Initialise companion windows after the main window is ready.
    // The companion preload path is resolved relative to the same appDirectory.
    initCompanion(appDirectory, rendererFile, main);
  });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', event => {
    if (quitting) return;
    event.preventDefault(); quitting = true;
    shutdownCompanion();
    void setup.close().finally(() => app.quit());
  });
}
