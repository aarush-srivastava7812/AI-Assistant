/** Persisted first-run choices. Secrets live in separate Windows-encrypted stores. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
export interface Permissions {version:1;pet:boolean;widget:boolean;agents:boolean;folders:string[]}
export const defaults=():Permissions=>({version:1,pet:false,widget:false,agents:false,folders:[]});
export function validatePermissions(value:unknown):Permissions{
 const v=value as Permissions;
 if(!v||Object.keys(v).sort().join(',')!=='agents,folders,pet,version,widget'||v.version!==1||['pet','widget','agents'].some(k=>typeof (v as any)[k]!=='boolean')||!Array.isArray(v.folders)||v.folders.length>8||v.folders.some(p=>typeof p!=='string'||!path.isAbsolute(p)||p.length>1024||p.includes('\0')))throw new Error('Invalid setup permission choices.');
 return {...v,folders:[...new Set(v.folders)]};
}
export class PermissionStore{
 private value=defaults();private chain=Promise.resolve();readonly file:string;
 constructor(userData:string){this.file=path.join(userData,'permissions-v1.json');}
 async load(){try{const stat=await fs.lstat(this.file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>16384)throw new Error();this.value=validatePermissions(JSON.parse(await fs.readFile(this.file,'utf8')));}catch{this.value=defaults();}return this.get();}
 get(){return validatePermissions(this.value);}
 save(input:unknown){const value=validatePermissions(input);const task=this.chain.then(async()=>{await fs.mkdir(path.dirname(this.file),{recursive:true});const temporary=this.file+'.'+randomUUID()+'.tmp';await fs.writeFile(temporary,JSON.stringify(value),{flag:'wx',mode:0o600});await fs.rename(temporary,this.file);this.value=value;return this.get();});this.chain=task.then(()=>{},()=>{});return task;}
}
