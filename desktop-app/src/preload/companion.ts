import {contextBridge,ipcRenderer} from 'electron';
import {exposeAppearance} from './appearance';
exposeAppearance(false);
const methods=['status','connect','listSpaces','chats','newChat','chat','sendChat','cancelChat','lookupChat','deleteChat'];
if(new URLSearchParams(location.search).get('companion')==='overlay')contextBridge.exposeInMainWorld('wayfinder',Object.freeze(Object.fromEntries(methods.map(method=>[method,async(...args:unknown[])=>{const result=await ipcRenderer.invoke('wayfinder:'+method,...args);if(!result?.ok)throw new Error(result?.error||'Request failed.');return result.data;}]))));
const controls=['showOverlay','hideOverlay','focusMain','hidePet','showSettings','getShortcut','shortcutRegistered','getContext','resizePet'];
contextBridge.exposeInMainWorld('companionAPI',Object.freeze(Object.fromEntries(controls.map(method=>[method,(...args:unknown[])=>ipcRenderer.invoke('companion:'+method,...args)]))));
