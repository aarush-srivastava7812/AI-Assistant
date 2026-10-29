import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {existsSync,readFileSync} from 'node:fs';
/** Fixed owned runtime and fixed installer; renderers cannot choose commands or paths. */
export class DependencyInstaller {
 private busy=false;private error='';
 readonly root:string;
 constructor(private resources:string,localAppData:string){this.root=path.join(localAppData,'WayfinderRuntime');}
 environment():NodeJS.ProcessEnv{
  const root=path.join(this.root,'hermes-v0.22.5'),python=path.join(root,'.venv','Scripts','python.exe');
  let installed=false;try{const state=JSON.parse(readFileSync(path.join(this.root,'installation.json'),'utf8').replace(/^\uFEFF/,''));installed=state.version===1&&state.runtimeReady===true&&state.sourceCommit==='bf0203a794a07aac3ff764972ab9087baa4e4f4e';}catch{}
  return installed&&existsSync(python)?{WAYFINDER_HERMES_ROOT:root,WAYFINDER_HERMES_PYTHON:python}:{};
 }
 async status(){let saved:any={};try{saved=JSON.parse((await fs.readFile(path.join(this.root,'installation.json'),'utf8')).replace(/^\uFEFF/,''));}catch{}
  return {busy:this.busy,error:this.error,installed:!!this.environment().WAYFINDER_HERMES_PYTHON,phase:typeof saved.phase==='string'?saved.phase:'not-installed',detail:typeof saved.detail==='string'?saved.detail:'The setup installer prepares Python, Hermes and Docker Desktop. Internet access and Windows permission prompts may be required.'};
 }
 async install(){
  if(this.busy)throw new Error('Dependency installation is already running.');
  const script=path.join(this.resources,'setup','install-dependencies.ps1');if(!existsSync(script))throw new Error('Use the complete setup installer to install dependencies.');
  this.busy=true;this.error='';
  try{await new Promise<void>((resolve,reject)=>{
   const child=spawn(path.join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe'),['-NoProfile','-ExecutionPolicy','Bypass','-File',script],{windowsHide:true,stdio:'ignore'});
   child.once('error',()=>reject(new Error('Dependency installation could not start.')));
   child.once('exit',code=>code===0?resolve():reject(new Error('Dependency installation needs attention. Check the status below, finish any Windows/Docker prompts, then retry.')));
  });}catch(e){this.error=e instanceof Error?e.message:'Dependency installation failed.';throw new Error(this.error);}finally{this.busy=false;}
  return this.status();
 }
}
