import { app, BrowserWindow, dialog, ipcMain, Menu, session, safeStorage, shell } from 'electron';
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
import {PermissionStore} from './permissions';
import {ModelKeyStore} from './model-key-store';
import {connectGoogle} from './google-oauth';
import {DependencyInstaller} from './dependency-installer';
import { initCompanion, shutdownCompanion, requireOverlayRequest, applyCompanionPreferences } from './companion-windows';

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
const permissions=new PermissionStore(app.getPath('userData'));
const modelKey=new ModelKeyStore(app.getPath('userData'),{available:()=>safeStorage.isAsyncEncryptionAvailable(),encrypt:value=>safeStorage.encryptStringAsync(value),decrypt:async value=>(await safeStorage.decryptStringAsync(value)).result});
const dependencies=new DependencyInstaller(app.isPackaged?process.resourcesPath:path.join(project,'desktop-app','resources'),process.env.LOCALAPPDATA||app.getPath('userData'));
setup.setModelEnvironment(()=>{if(!modelKey.status().configured)return {};const native=dependencies.environment();if(!native.WAYFINDER_HERMES_PYTHON)throw new Error('Install / repair required software before verifying your NVIDIA connection.');return {...native,...modelKey.environment(),WAYFINDER_OPENCODE_EXE:path.join(app.isPackaged?process.resourcesPath:path.join(project,'desktop-app','resources'),'setup','opencode.exe')};});
let main: BrowserWindow | undefined, quitting = false, quitReady = false;
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
    await permissions.load();
    await modelKey.load();
    app.setAppUserModelId('local.wayfinder.desktop');
    const rendererFile = path.resolve(appDirectory, '../renderer/index.html');
    const rendererURL = pathToFileURL(rendererFile).href;
    main = new BrowserWindow({
      width: 1440, height: 940, minWidth: 600, minHeight: 600, show: !hiddenVerification, title: 'Wayfinder', backgroundColor: '#11171c', icon: app.isPackaged ? path.join(process.resourcesPath, 'wayfinder.png') : path.join(project, 'desktop-app/resources/wayfinder.png'),
      webPreferences: { preload: path.join(appDirectory, '../preload/index.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true, allowRunningInsecureContent: false, spellcheck: false },
    });
    main.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    main.on('close',event=>{if(quitReady)return;event.preventDefault();if(!quitting&&(permissions.get().pet||permissions.get().widget))main?.hide();else app.quit();});
    main.webContents.on('will-navigate', event => event.preventDefault());
    main.webContents.on('will-attach-webview', event => event.preventDefault());
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    const regular = createHandlers(bridge, {
      pick: async kind => {
        if(kind==='folder'&&permissions.get().folders.length===1)return permissions.get().folders[0];
        const result = await dialog.showOpenDialog(main!, {
          title: kind === 'repository' ? 'Select a repository for the bounded local branch operation' : kind === 'folder' ? 'Select a read-only folder' : kind === 'activity' ? 'Select a canonical activity CSV' : 'Select one document',
          properties: kind === 'folder' || kind === 'repository' ? ['openDirectory'] : ['openFile'],
          filters: kind === 'document' ? [{ name: 'Text documents', extensions: ['txt', 'md', 'csv', 'json', 'log'] }] : kind === 'activity' ? [{ name: 'Canonical CSV', extensions: ['csv'] }] : [],
        });
        return result.canceled ? null : result.filePaths[0] || null;
      },
      confirm: async (title, detail) => (await dialog.showMessageBox(main!, { type: 'question', title, message: title, detail, buttons: ['Cancel', 'Approve exact change once'], defaultId: 0, cancelId: 0, noLink: true, normalizeAccessKeys: true })).response === 1,
    }, { status: () => setup.ready()?bridge.describe():Promise.resolve({state:'setup',runtime}), connect: () => setup.connect() });
    const syncConnections=async()=>{if(!setup.ready())return vault.status();try{return await bridge.call('connections_configure',{connections:vault.snapshot()});}catch{await bridge.close();throw new Error('Connections were saved, but the backend needs reconnecting before another read.');}};
    const handlers = {...regular,
      profiles:async(space:unknown)=>{const catalog=await regular.profiles(space);if(permissions.get().agents)return catalog;return {...catalog,profiles:catalog.profiles.map((p:any)=>({...p,execution:{...p.execution,available:false,status:'permission_required',note:'Enable advisory task agents in Settings to run this profile.'}})),presets:catalog.presets.map((p:any)=>({...p,available:false,status:'permission_required'}))};},
      setupDependencies:async(install:unknown)=>{if(typeof install!=='boolean')throw new Error('Choose whether to install required dependencies.');return install?dependencies.install():dependencies.status();},
      setupChoices:async(input?:unknown)=>{
        if(input===undefined)return {...permissions.get(),connections:vault.status(),modelKey:modelKey.status()};
        const value=input as any;if(!Array.isArray(value?.folders)||value.folders.some((folder:string)=>!permissions.get().folders.includes(folder)))throw new Error('Choose folders in the native folder picker.');
        const removed=permissions.get().folders.some(folder=>!value.folders.includes(folder));
        if(removed&&setup.ready()){for(const space of await regular.listSpaces()){const selection=await regular.fileSelection(space.id);if(selection)await regular.revokeFiles(space.id,selection.grant.id);}}
        const saved=await permissions.save(value);if(setup.ready())applyCompanionPreferences(saved);return {...saved,connections:vault.status(),modelKey:modelKey.status()};
      },
      setupFolder:async()=>{const selected=await dialog.showOpenDialog(main!,{title:'Allow read-only access to a folder when you request file tasks',properties:['openDirectory']});if(!selected.canceled&&selected.filePaths[0])await permissions.save({...permissions.get(),folders:[...permissions.get().folders,selected.filePaths[0]]});return {...permissions.get(),connections:vault.status(),modelKey:modelKey.status()};},
      setupNvidia:async(key:unknown,model:unknown)=>{await modelKey.save(key,model);setup.invalidateModel();return {...setup.status(),modelKey:modelKey.status()};},
      setupGoogle:async(services:unknown)=>{const picked=await dialog.showOpenDialog(main!,{title:'Choose your Google Desktop OAuth client JSON for Google sign-in',properties:['openFile'],filters:[{name:'Google Desktop client',extensions:['json']}]});if(picked.canceled||!picked.filePaths[0])return vault.status();await vault.saveGoogle(await connectGoogle(picked.filePaths[0],services,url=>shell.openExternal(url)));return syncConnections();},
      setupHelp:async(kind:unknown)=>{const urls:Record<string,string>={docker:'https://docs.docker.com/desktop/setup/install/windows-install/',hermes:'https://hermes-agent.nousresearch.com/docs/getting-started/installation/',nvidia:'https://build.nvidia.com/'};if(typeof kind!=='string'||!urls[kind])throw new Error('Unsupported setup guide.');await shell.openExternal(urls[kind]);},
      importConnections:async()=>{const selection=await dialog.showOpenDialog(main!,{title:'Import Google, Tavily and Notion connections from a local .env or Google token JSON',properties:['openFile']});if(selection.canceled||!selection.filePaths[0])return null;await vault.importFile(selection.filePaths[0]);return syncConnections();},
      disconnectConnection:async(provider:unknown)=>{await vault.disconnect(provider);return syncConnections();},
      setupStatus:()=>({...setup.status(),modelKey:modelKey.status()}),setupDatabase:(download:unknown)=>{if(typeof download!=='boolean')throw new Error('Choose whether to download the fixed database image.');return setup.database(download);},setupMemory:()=>setup.memoryCheck(),setupModel:()=>setup.modelCheck(),setupFinish:async(name:unknown,consent:unknown)=>{const state=await setup.finish(name,consent);applyCompanionPreferences(permissions.get());return state;}};
    for (const [method, handler] of Object.entries(handlers)) ipcMain.handle(`wayfinder:${method}`, async (event, ...args) => {
      if (!release.preload_methods.includes(method)) throw new Error('Intent is not included in this build.');
      if (!main) throw new Error('Window unavailable.');
      if(event.sender===main.webContents)requireMainSender(event, main.webContents, rendererURL);
      else requireOverlayRequest(event,method,args);
      if (Buffer.byteLength(JSON.stringify(args)) > 65536) throw new Error('Desktop request too large.');
      try { if(!setup.ready()&&!['status','connect','setupStatus','setupDatabase','setupMemory','setupModel','setupFinish','setupChoices','setupFolder','setupNvidia','setupGoogle','setupHelp','setupDependencies','importConnections','disconnectConnection'].includes(method))throw new Error('Complete first-run setup before opening workspace resources.'); if(!permissions.get().agents&&['analyze','compare','startProfileTask','startSourceTask','startWorkflow','retryRead'].includes(method))throw new Error('Enable task agents in Settings before running an agent task.'); return { ok: true, data: await (handler as (...values:any[])=>Promise<any>)(...args) }; }
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
    initCompanion(appDirectory, rendererFile, main,setup.ready()?permissions.get():{pet:false,widget:false});
  });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', event => {
    if (quitReady) return;
    event.preventDefault();if(quitting)return;quitting = true;
    shutdownCompanion();
    void setup.close().finally(() => {quitReady=true;app.quit();});
  });
}
