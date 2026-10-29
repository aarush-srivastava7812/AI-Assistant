/** Main-process-only credential import and Windows account encryption. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {parseEnv} from 'node:util';
import {randomUUID} from 'node:crypto';
export interface ConnectionBundle {schema:1;google:string|null;tavily:string|null;notion:string|null}
export interface CredentialCrypto {available():Promise<boolean>;encrypt(value:string):Promise<Buffer>;decrypt(value:Buffer):Promise<string>}
const empty=():ConnectionBundle=>({schema:1,google:null,tavily:null,notion:null});
const scopes=new Set(['gmail','calendar','drive','documents','spreadsheets','contacts','tasks'].map(s=>'https://www.googleapis.com/auth/'+s+'.readonly'));
export function validateConnections(value:any):ConnectionBundle{
  if(!value||value.schema!==1||Object.keys(value).sort().join(',')!=='google,notion,schema,tavily')throw new Error('Invalid saved connection format.');
  for(const provider of ['google','tavily','notion'] as const)if(value[provider]!==null&&(typeof value[provider]!=='string'||!value[provider].trim()||Buffer.byteLength(value[provider])>(provider==='google'?24000:2048)||value[provider].includes('\0')))throw new Error('Invalid local connection credential.');
  if(value.google){
    let token:any;try{token=JSON.parse(value.google);}catch{throw new Error('Choose a valid Google OAuth token file.');}
    if(token.token_uri!=='https://oauth2.googleapis.com/token'||!Array.isArray(token.scopes)||!token.scopes.length||token.scopes.some((s:any)=>!scopes.has(s))||!['client_id','client_secret','refresh_token'].every(k=>typeof token[k]==='string'&&token[k].length>0&&token[k].length<=8000))throw new Error('Google needs an existing read-only Workspace token with offline access.');
    const allowed=['token','refresh_token','token_uri','client_id','client_secret','scopes','expiry'];
    value={...value,google:JSON.stringify(Object.fromEntries(allowed.filter(k=>k in token).map(k=>[k,token[k]])))};
  }
  return {...value};
}
export class ConnectionVault{
  readonly file:string;private bundle=empty();private busy=false;private loadError='';
  constructor(readonly userData:string,private crypto:CredentialCrypto){this.file=path.join(userData,'connections-v1.bin');}
  status(){return {encrypted:true,configured:{google:!!this.bundle.google,tavily:!!this.bundle.tavily,notion:!!this.bundle.notion},error:this.loadError};}
  snapshot(){return {...this.bundle};} // Never put this value in a renderer response.
  async load(){
    try{const stat=await fs.lstat(this.file);if(stat.isSymbolicLink()||stat.size>65536)throw new Error();if(!await this.crypto.available())throw new Error();this.bundle=validateConnections(JSON.parse(await this.crypto.decrypt(await fs.readFile(this.file))));}
    catch(e:any){this.bundle=empty();if(e?.code!=='ENOENT')this.loadError='Saved connections could not be decrypted for this Windows account. Re-import your local credentials.';}
    return this.status();
  }
  private async readFile(file:string,root:string){
    const target=path.resolve(file),base=path.resolve(root),relative=path.relative(base,target);
    if(relative.startsWith('..')||path.isAbsolute(relative))throw new Error('Referenced credentials must stay within the selected project folder.');
    let cursor=path.parse(target).root;
    for(const part of target.slice(cursor.length).split(path.sep).filter(Boolean)){cursor=path.join(cursor,part);if((await fs.lstat(cursor)).isSymbolicLink())throw new Error('Linked credential paths are not imported.');}
    const handle=await fs.open(target,'r');
    try{const before=await handle.stat();if(!before.isFile()||before.size>32768)throw new Error('Credential file exceeds the import limit.');const data=await handle.readFile('utf8'),after=await handle.stat();if(before.ino!==after.ino||before.mtimeMs!==after.mtimeMs||before.size!==after.size||Buffer.byteLength(data)>32768)throw new Error('Credential file changed during import.');return data;}finally{await handle.close();}
  }
  private async save(bundle:ConnectionBundle){
    if(!await this.crypto.available())throw new Error('Windows account encryption is unavailable. No plaintext credential store was created.');
    const sealed=await this.crypto.encrypt(JSON.stringify(bundle));await fs.mkdir(this.userData,{recursive:true});
    const temporary=this.file+'.'+randomUUID()+'.tmp';await fs.writeFile(temporary,sealed,{flag:'wx',mode:0o600});
    try{await fs.rename(temporary,this.file);}catch{await fs.unlink(temporary).catch(()=>{});throw new Error('Connections could not be saved. Existing credentials were preserved.');}
    this.bundle=bundle;this.loadError='';return this.status();
  }
  async saveGoogle(token:string){if(this.busy)throw new Error('A connection update is already in progress.');this.busy=true;try{return await this.save(validateConnections({...this.bundle,google:token}));}finally{this.busy=false;}}
  async importFile(file:string){
    if(this.busy)throw new Error('A connection update is already in progress.');this.busy=true;
    try{
      const root=path.dirname(path.resolve(file)),raw=await this.readFile(file,root);let next:ConnectionBundle;
      if(path.extname(file).toLowerCase()==='.json')next=validateConnections({...this.bundle,google:raw});
      else{
        const vars=parseEnv(raw),token=vars.GOOGLE_WORKSPACE_TOKEN_PATH;
        next={...this.bundle};
        if(vars.TAVILY_API_KEY?.trim())next.tavily=vars.TAVILY_API_KEY.trim();
        if(vars.NOTION_API_KEY?.trim())next.notion=vars.NOTION_API_KEY.trim();
        if(token)next.google=await this.readFile(path.resolve(root,token),root);
        next=validateConnections(next);
        if(!vars.TAVILY_API_KEY&&!vars.NOTION_API_KEY&&!token)throw new Error('The selected file has no supported connection credentials.');
      }
      return await this.save(next);
    }catch(e){if(e instanceof Error&&/^(Google needs|Choose a valid|Referenced credentials|Linked credential|Credential file|The selected|Windows account|Connections could)/.test(e.message))throw e;throw new Error('Could not import the selected credentials. No secret values were displayed.');}
    finally{this.busy=false;}
  }
  async disconnect(provider:unknown){
    if(!['google','tavily','notion'].includes(String(provider)))throw new Error('Choose a supported connection.');
    if(this.busy)throw new Error('A connection update is already in progress.');this.busy=true;
    try{return await this.save({...this.bundle,[String(provider)]:null});}finally{this.busy=false;}
  }
}
