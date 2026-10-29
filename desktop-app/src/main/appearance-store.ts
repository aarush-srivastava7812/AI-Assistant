import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {defaultAppearance,parseAppearance,resolveAppearance,type AppearancePreferences} from '../shared/appearance';

export class AppearanceStore {
 private preferences=defaultAppearance();private configured=false;private writes:Promise<unknown>=Promise.resolve();
 readonly file:string;
 constructor(userData:string){this.file=path.join(userData,'appearance-v1.json');}
 async load(){try{const stat=await fs.lstat(this.file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>8192)throw new Error();this.preferences=parseAppearance(JSON.parse(await fs.readFile(this.file,'utf8')));this.configured=true;}catch{this.preferences=defaultAppearance();this.configured=false;}}
 current(systemDark:boolean){return {...this.preferences,configured:this.configured,resolvedTheme:resolveAppearance(this.preferences,systemDark).id};}
 save(patch:unknown){const job=this.writes.then(async()=>{
  if(!patch||typeof patch!=='object'||Array.isArray(patch)||Object.keys(patch).some(k=>!['mode','lightTheme','darkTheme'].includes(k)))throw new Error('Unsupported appearance preference.');
  const next=parseAppearance({...this.preferences,...patch});
  await fs.mkdir(path.dirname(this.file),{recursive:true});const temporary=this.file+'.'+randomUUID()+'.tmp';
  try{await fs.writeFile(temporary,JSON.stringify(next)+'\n',{flag:'wx',mode:0o600});await fs.rename(temporary,this.file);}finally{await fs.rm(temporary,{force:true});}
  this.preferences=next;this.configured=true;
 });this.writes=job.catch(()=>{});return job;}
}
