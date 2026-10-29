import {contextBridge,ipcRenderer} from 'electron';
import type {AppearanceSnapshot} from '../shared/appearance';
export function exposeAppearance(writable:boolean){
 const request=async(channel:string,input?:unknown)=>{const result=await ipcRenderer.invoke(channel,input);if(!result?.ok)throw new Error(result?.error||'Appearance could not be saved.');return result.data;};
 contextBridge.exposeInMainWorld('appearanceAPI',Object.freeze({
  get:()=>request('appearance:get'),
  ...(writable?{save:(input:unknown)=>request('appearance:save',input),preview:(id:string|null)=>request('appearance:preview',id)}:{}),
  onChange:(callback:(value:AppearanceSnapshot)=>void)=>{const listener=(_event:unknown,value:AppearanceSnapshot)=>callback(value);ipcRenderer.on('appearance:changed',listener);return()=>ipcRenderer.removeListener('appearance:changed',listener);},
 }));
}
