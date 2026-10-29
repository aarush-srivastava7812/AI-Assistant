import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import type {CredentialCrypto} from './connection-vault';
const MODELS=['nvidia/nemotron-3.5-lightning-30b-a3b','nvidia/nemotron-3-ultra-550b-a55b'];
export class ModelKeyStore{
 private value:{model:string;api_key:string}|undefined;readonly file:string;
 constructor(userData:string,private crypto:CredentialCrypto){this.file=path.join(userData,'model-key-v1.bin');}
 async load(){try{const stat=await fs.lstat(this.file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>16384||!await this.crypto.available())throw new Error();const raw=JSON.parse(await this.crypto.decrypt(await fs.readFile(this.file)));this.validate(raw.api_key,raw.model);this.value={model:raw.model,api_key:raw.api_key};}catch{this.value=undefined;}}
 private validate(key:unknown,model:unknown){if(typeof key!=='string'||!key.startsWith('nvapi-')||key.length<20||key.length>2048||/\s/.test(key)||typeof model!=='string'||!MODELS.includes(model))throw new Error('Enter your NVIDIA API key and choose Lightning or Ultra.');}
 async save(key:unknown,model:unknown){this.validate(key,model);if(!await this.crypto.available())throw new Error('Windows account encryption is unavailable. No model key was saved.');const value={model:model as string,api_key:key as string};const encrypted=await this.crypto.encrypt(JSON.stringify(value));await fs.mkdir(path.dirname(this.file),{recursive:true});const temporary=this.file+'.'+randomUUID()+'.tmp';await fs.writeFile(temporary,encrypted,{flag:'wx',mode:0o600});await fs.rename(temporary,this.file);this.value=value;return this.status();}
 status(){return {configured:!!this.value,model:this.value?.model,provider:'custom',endpoint:'integrate.api.nvidia.com'};}
 environment():NodeJS.ProcessEnv{return this.value?{WAYFINDER_PRIVATE_MODEL_ROUTE:JSON.stringify({...this.value,provider:'custom',api_mode:'chat_completions',base_url:'https://integrate.api.nvidia.com/v1'})}:{};}
}
