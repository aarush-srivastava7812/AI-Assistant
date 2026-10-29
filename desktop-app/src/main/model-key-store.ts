import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import type {CredentialCrypto} from './connection-vault';
import {customEndpoint,providerFor,validModelID} from '../shared/model-providers';
type Route={provider:string;model:string;base_url:string;api_mode:string;api_key:string};
export class ModelKeyStore{
 private route:Route|undefined;
 private keys:Record<string,string>={};
 private pending:Promise<unknown>=Promise.resolve();
 readonly file:string;
 constructor(userData:string,private crypto:CredentialCrypto){this.file=path.join(userData,'model-key-v1.bin');}
 private identity(provider:string,endpoint:string){return provider+'|'+endpoint;}
 private parse(input:any):Route{
  const provider=providerFor(input?.provider);if(!provider||!validModelID(input.model))throw new Error('Choose a provider and enter its model ID.');
  const endpoint=provider.id==='openai-compatible'?customEndpoint(input.endpoint):provider.base_url;
  const key=input.apiKey||this.keys[this.identity(provider.id,endpoint)];
  if(typeof key!=='string'||key.length<8||key.length>4096||/[^\x21-\x7e]/.test(key))throw new Error('Enter a valid API key from this provider.');
  return {provider:provider.id,model:input.model,base_url:endpoint,api_mode:provider.api_mode,api_key:key};
 }
 async load(){try{
  const stat=await fs.lstat(this.file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>128000||!await this.crypto.available())throw new Error();
  const raw=JSON.parse(await this.crypto.decrypt(await fs.readFile(this.file)));
  if(raw.version===2){
   if(!raw.keys||typeof raw.keys!=='object'||Array.isArray(raw.keys)||Object.keys(raw.keys).length>32)throw new Error();
   this.keys=Object.fromEntries(Object.entries(raw.keys).filter(([,v])=>typeof v==='string'&&v.length>=8&&v.length<=4096&&!/[^\x21-\x7e]/.test(v)) as [string,string][]);
   this.route=this.parse(raw.active);
  }else{
   this.route=this.parse({provider:'nvidia',model:raw.model,apiKey:raw.api_key});
   this.route.provider='custom';
   this.keys[this.identity('nvidia',this.route.base_url)]=this.route.api_key;
  }
 }catch{this.route=undefined;this.keys={};}}
 save(input:unknown){const job=this.pending.then(async()=>{
  const route=this.parse(input);if(!await this.crypto.available())throw new Error('Windows account encryption is unavailable. No model key was saved.');
  const keys={...this.keys,[this.identity(route.provider,route.base_url)]:route.api_key};
  if(Object.keys(keys).length>32)throw new Error('The saved provider limit has been reached.');
  const value={version:2,active:{provider:route.provider,model:route.model,endpoint:route.base_url},keys};
  const encrypted=await this.crypto.encrypt(JSON.stringify(value));await fs.mkdir(path.dirname(this.file),{recursive:true});
  const temporary=this.file+'.'+randomUUID()+'.tmp';
  try{await fs.writeFile(temporary,encrypted,{flag:'wx',mode:0o600});await fs.rename(temporary,this.file);}finally{await fs.rm(temporary,{force:true});}
  this.keys=keys;this.route=route;return this.status();
 });this.pending=job.catch(()=>{});return job;}
 status(){return {configured:!!this.route,model:this.route?.model,provider:this.route?.provider==='custom'?'nvidia':this.route?.provider,endpoint:this.route?.base_url,connectedProviders:[...new Set(Object.keys(this.keys).map(k=>k.split('|')[0]))]};}
 environment():NodeJS.ProcessEnv{return this.route?{WAYFINDER_PRIVATE_MODEL_ROUTE:JSON.stringify(this.route)}:{};}
}
