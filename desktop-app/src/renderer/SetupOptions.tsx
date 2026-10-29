import React,{useEffect,useState} from 'react';
import type {DesktopAPI,Row} from '../shared/types';
const services:Record<string,string>={calendar:'Calendar',tasks:'Tasks',gmail:'Gmail',drive:'Drive',docs:'Docs',sheets:'Sheets',contacts:'Contacts'};
type OptionsScope='all'|'desktop'|'permissions'|'connections';
export function SetupOptions({api,onboarding=false,scope='all',onBusy,onChanged}:{api:DesktopAPI;onboarding?:boolean;scope?:OptionsScope;onBusy?:(busy:boolean)=>void;onChanged?:()=>void}){
 const [value,setValue]=useState<Row|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[google,setGoogle]=useState(['calendar','tasks','gmail']);
 useEffect(()=>{let alive=true;void api.setupChoices().then(v=>{if(alive)setValue(v);}).catch(e=>{if(alive)setError(e.message);});return()=>{alive=false;};},[api]);
 async function run(job:()=>Promise<any>){if(busy)return;setBusy(true);onBusy?.(true);setError('');try{await job();setValue(await api.setupChoices());onChanged?.();}catch(e){setError(e instanceof Error?e.message:'Your choice was not saved.');}finally{setBusy(false);onBusy?.(false);}}
 const save=(change:Row)=>run(()=>api.setupChoices({version:1,pet:!!value?.pet,widget:!!value?.widget,agents:!!value?.agents,folders:value?.folders||[],...change}));
 const show=(part:OptionsScope)=>scope==='all'||scope===part;
 const title=onboarding?'Choose what Wayfinder may use':scope==='desktop'?'Desktop companion widget':scope==='permissions'?'Agents and folder access':scope==='connections'?'Connected accounts':'Permissions and desktop features';
 return <section className="settings-section setup-permissions" aria-label="Your permissions and optional features"><h2>{title}</h2><p>Everything here is optional. You can change these choices later in Settings.</p>{error&&<p role="alert">{error}</p>}{!value?<p>Loading saved choices…</p>:<>
  {show('desktop')&&<>
   <label className="setup-consent"><input type="checkbox" checked={!!value.pet} disabled={busy} onChange={e=>void save({pet:e.target.checked})}/>Enable the desktop pet</label>
   <label className="setup-consent"><input type="checkbox" checked={!!value.widget} disabled={busy} onChange={e=>void save({widget:e.target.checked})}/>Enable the chat widget and Ctrl+Shift+Space shortcut</label>
   <button disabled={busy||!value.widget} onClick={()=>void run(async()=>{await window.companionAPI?.showOverlay();})}>Open companion chat</button>
  </>}
  {show('permissions')&&<>
   <label className="setup-consent"><input type="checkbox" checked={!!value.agents} disabled={busy} onChange={e=>void save({agents:e.target.checked})}/>Enable advisory task agents and source workflows</label><p className="hint">Agents use only sources you select and disclose. This does not approve account writes, messages, native actions or automatic memory changes. Turning agents off prevents new runs; use Stop to cancel an active task.</p>
   <h3>Folders</h3><p>Choose read-only folders for file tasks. No folder is scanned or sent to AI automatically. Selected files still need disclosure before model use. Removing a saved folder also clears active file grants in all spaces.</p><button disabled={busy} onClick={()=>void run(()=>api.setupFolder())}>Choose an allowed folder</button>{value.folders?.map((folder:string)=><div className="allowed-folder" key={folder}><span>{folder}</span><button disabled={busy} onClick={()=>void save({folders:value.folders.filter((p:string)=>p!==folder)})}>Remove folder permission</button></div>)}
  </>}
  {show('connections')&&<>
   <h3>Connect Google (optional)</h3><p>Choose the read permissions you need. Google opens its own account and consent screen. This build asks you to select a Google Desktop OAuth client JSON first.</p><div className="google-service-choices">{Object.entries(services).map(([id,label])=><label key={id}><input type="checkbox" checked={google.includes(id)} disabled={busy} onChange={e=>setGoogle(old=>e.target.checked?[...old,id]:old.filter(s=>s!==id))}/>{label} read-only</label>)}</div>
   <button disabled={busy||!google.length} onClick={()=>void run(()=>api.setupGoogle(google))}>Connect Google account</button><span role="status">{value.connections?.configured?.google?'Google connected':'Google not connected'}</span>
   <h3>Other connections (optional)</h3><p>Import your Notion/Tavily keys or an existing Google token using the native file picker. Keys are encrypted for your Windows account. You can skip connections and add them later.</p><button disabled={busy} onClick={()=>void run(()=>api.importConnections())}>Add optional connections</button>
   <p className="hint">Notion: {value.connections?.configured?.notion?'connected':'not connected'} · Tavily: {value.connections?.configured?.tavily?'connected':'not connected'}</p>
  </>}
 </>}{busy&&<p role="status">Saving your explicit choices…</p>}</section>;
}
