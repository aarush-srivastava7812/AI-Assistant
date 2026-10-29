import {validModelPin} from '../shared/model-providers';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash,randomBytes} from 'node:crypto';
import fs from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';
import type {BackendBridge} from './bridge';
import type {BackendState,Row} from '../shared/types';
const execute=promisify(execFile);
export const DATABASE_IMAGE='falkordb/falkordb:v4.20.7';
export const DATABASE_IMAGE_ID='sha256:13996aa523f0dd283f6bd6df6620b094dcea525452417c4d6ef9bef15dc9998d';
type Runner=(file:string,args:string[],options?:{env?:NodeJS.ProcessEnv;timeout?:number})=>Promise<string>;
const command:Runner=async(file,args,options={})=>{try{if(file==='docker'&&process.platform==='win32'){const candidates=[path.join(process.env.ProgramFiles||'C:\\Program Files','Docker','Docker','resources','bin','docker.exe'),path.join(process.env.LOCALAPPDATA||'','Programs','DockerDesktop','resources','bin','docker.exe')];file=candidates.find(candidate=>existsSync(candidate))||file;}return (await execute(file,args,{windowsHide:true,timeout:options.timeout||30000,maxBuffer:2*1024*1024,env:options.env||process.env})).stdout.toString();}catch{throw new Error('The requested local service check failed. Check Docker or the installed runtime and retry.');}};
export interface ModelPin{model:string;provider:string;endpoint:string}
interface Saved{version:1;complete:true;context:string;model:ModelPin;workspace:string;workspaceName:string;modelSource?:'user-key'|'managed'}
export function validModel(value:any):value is ModelPin{return validModelPin(value);}
export function localDocker(endpoint:string){return /^npipe:\/\/\/\/\.\/pipe\/[A-Za-z0-9_.-]+$/.test(endpoint)||endpoint.startsWith('unix:///');}
export class SetupManager{
  readonly id:string;readonly container:string;readonly volume:string;readonly configPath:string;
  private modelEnvironment:()=>NodeJS.ProcessEnv=()=>({});
  setModelEnvironment(source:()=>NodeJS.ProcessEnv){this.modelEnvironment=source;}
  private connectionSource?:()=>Promise<any>;
  setConnectionSource(source:()=>Promise<any>){this.connectionSource=source;}
  private saved?:Saved;private context?:string;private password?:string;private port?:string;
  private resume?:{context?:string;workspaceName?:string;model?:ModelPin};
  private model?:ModelPin;private modelChecked=0;private memory=false;private busy=false;private error='';private phase='Welcome';private connecting?:Promise<BackendState>;
  constructor(readonly userData:string,readonly runtime:string,readonly project:string,readonly executable:string,readonly models:string,readonly bridge:BackendBridge,private run:Runner=command){
    this.id=createHash('sha256').update(path.resolve(runtime).toLowerCase()).digest('hex').slice(0,16);
    this.container='wayfinder-memory-'+this.id;this.volume='wayfinder-memory-data-'+this.id;this.configPath=path.join(userData,'onboarding.json');
  }
  async load(){
    const progress=path.join(this.userData,'setup-progress.json');
    if(existsSync(progress))try{
      const raw=await fs.readFile(progress,'utf8');if(Buffer.byteLength(raw)>4096)throw new Error();const v=JSON.parse(raw);
      if(v.version!==1||Object.keys(v).some(k=>!['version','context','workspaceName','model'].includes(k))||v.context!==undefined&&(typeof v.context!=='string'||!/^[-A-Za-z0-9_.]{1,100}$/.test(v.context))||v.workspaceName!==undefined&&(typeof v.workspaceName!=='string'||v.workspaceName.length>100)||v.model!==undefined&&!validModel(v.model))throw new Error();
      this.resume=v;this.context=v.context;this.model=v.model;
    }catch{this.error='Saved setup progress could not be read. Recheck prerequisites; existing workspace data was preserved.';}
    if(!existsSync(this.configPath))return;
    try{
      const raw=await fs.readFile(this.configPath,'utf8');if(Buffer.byteLength(raw)>8192)throw new Error();const v=JSON.parse(raw);
      if(v.version!==1||v.complete!==true||!validModel(v.model)||typeof v.context!=='string'||!/^[-A-Za-z0-9_.]{1,100}$/.test(v.context)||typeof v.workspace!=='string'||typeof v.workspaceName!=='string'||v.modelSource!==undefined&&!['user-key','managed'].includes(v.modelSource)||Object.keys(v).filter(k=>k!=='modelSource').sort().join(',')!=='complete,context,model,version,workspace,workspaceName')throw new Error();
      this.saved=v;this.context=v.context;
    }catch{this.error='Saved setup is invalid. Existing workspace data was preserved. Run the checks again to repair the connection.';}
  }
  private async saveProgress(){
    await fs.mkdir(this.userData,{recursive:true});
    const value={version:1,...(this.context?{context:this.context}:{}),...(this.model?{model:this.model}:{}),...(this.saved?.workspaceName||this.resume?.workspaceName?{workspaceName:this.saved?.workspaceName||this.resume?.workspaceName}:{})};
    const target=path.join(this.userData,'setup-progress.json'),temporary=target+'.'+randomBytes(8).toString('hex')+'.tmp';
    await fs.writeFile(temporary,JSON.stringify(value),{flag:'wx',mode:0o600});await fs.rename(temporary,target);this.resume=value;
  }
  private sameModel(a:any,b:any){return validModel(a)&&validModel(b)&&a.model===b.model&&a.provider===b.provider&&a.endpoint===b.endpoint;}
  invalidateModel(){this.modelChecked=0;this.model=undefined;}
  async editModel(){if(this.busy)throw new Error('Wait for the current setup operation to finish.');await this.bridge.close();if(this.saved)this.resume={context:this.saved.context,workspaceName:this.saved.workspaceName};this.saved=undefined;this.invalidateModel();this.error='';await fs.rm(path.join(this.userData,'onboarding.json'),{force:true});await this.saveProgress();return {state:'setup' as const,runtime:this.runtime};}
  ready(){return !!this.saved;}
  status(){return {complete:!!this.saved,busy:this.busy,phase:this.phase,error:this.error,backendBundled:existsSync(this.executable),memoryReady:this.memory,databaseReady:!!this.port,modelReady:!!this.model&&Date.now()-this.modelChecked<300000,modelExpiresAt:this.model?this.modelChecked+300000:null,model:this.model||this.saved?.model,workspaceName:this.saved?.workspaceName||this.resume?.workspaceName,resuming:!!this.resume,checksMustBeRevalidated:!!this.resume,storage:this.runtime,requires:['Docker Desktop with Linux containers','Private Hermes runtime and your provider API key'],integrations:'Import Google, Tavily and Notion credentials in Connections after setup. Hosted GitHub and Fitness remain unavailable.'};}
  private async action<T>(phase:string,job:()=>Promise<T>):Promise<T>{
    if(this.busy)throw new Error('A setup check is already running.');this.busy=true;this.phase=phase;this.error='';
    try{return await job();}catch(e){this.error=e instanceof Error?e.message:'Setup could not confirm readiness.';throw new Error(this.error);}finally{this.busy=false;}
  }
  private async docker(args:string[],timeout?:number){if(!this.context)throw new Error('Check Docker first.');return this.run('docker',['--context',this.context,...args],{timeout});}
  private async dockerContext(){
    let name:string;
    try{name=(this.saved?.context||this.context||await this.run('docker',['context','show'])).trim();if(!/^[-A-Za-z0-9_.]{1,100}$/.test(name))throw new Error();
      const contexts=JSON.parse(await this.run('docker',['context','inspect',name]));if(!localDocker(contexts[0]?.Endpoints?.docker?.Host||''))throw new Error();
      this.context=name;const version=JSON.parse(await this.docker(['version','--format','{{json .Server}}']));if(version.Os!=='linux')throw new Error();
    }catch{throw new Error('Docker Desktop is unavailable or is not using a local Linux engine. Start it, then retry this check. Remote Docker connections are not used.');}
  }
  private async inspect(kind:'container'|'volume',name:string):Promise<any|null>{try{const list=JSON.parse(await this.docker([kind,'inspect',name]));return list[0];}catch{return null;}}
  private owned(labels:Row|undefined){return labels?.['wayfinder.app']==='local.wayfinder.desktop'&&labels?.['wayfinder.workspace']===this.id;}
  async database(download=false){return this.action('Preparing your private memory database',async()=>{
    await this.dockerContext();
    let image:string;try{image=(await this.docker(['image','inspect',DATABASE_IMAGE,'--format','{{.Id}}'])).trim();}catch{
      if(!download)throw new Error('The memory database image is missing. Choose Download database image to fetch the fixed FalkorDB release.');
      try{await this.docker(['pull','--platform','linux/amd64',DATABASE_IMAGE],240000);image=(await this.docker(['image','inspect',DATABASE_IMAGE,'--format','{{.Id}}'])).trim();}catch{throw new Error('The database image could not be downloaded. Check Docker/network access and retry.');}
    }
    if(image!==DATABASE_IMAGE_ID)throw new Error('The database image does not match the verified release. No container was started.');
    await fs.mkdir(this.userData,{recursive:true});const keyPath=path.join(this.userData,'database.key');
    try{this.password=(await fs.readFile(keyPath,'utf8')).trim();}catch{this.password=randomBytes(32).toString('hex');await fs.writeFile(keyPath,this.password,{flag:'wx',mode:0o600});}
    if(!/^[a-f0-9]{64}$/.test(this.password))throw new Error('The private database key is invalid. No data was deleted.');
    let volume=await this.inspect('volume',this.volume);
    if(!volume){await this.docker(['volume','create','--label','wayfinder.app=local.wayfinder.desktop','--label','wayfinder.workspace='+this.id,this.volume]);volume=await this.inspect('volume',this.volume);}
    if(!this.owned(volume?.Labels))throw new Error('The selected volume is not owned by this workspace. It was left untouched.');
    let container=await this.inspect('container',this.container);
    if(!container){
      await this.docker(['create','--name',this.container,'--label','wayfinder.app=local.wayfinder.desktop','--label','wayfinder.workspace='+this.id,'-p','127.0.0.1::6379','--mount','type=volume,source='+this.volume+',target=/data','-e','BROWSER=0','-e','REDIS_ARGS=--appendonly yes --save 60 1 --requirepass '+this.password,DATABASE_IMAGE_ID]);
      container=await this.inspect('container',this.container);
    }
    if(!this.owned(container?.Config?.Labels)||container?.Image!==DATABASE_IMAGE_ID||container?.Mounts?.length!==1||container.Mounts[0].Name!==this.volume||container.Mounts[0].Destination!=='/data')throw new Error('The database container identity differs from this workspace. It was not used.');
    const bindings=container.HostConfig?.PortBindings;
    if(container.HostConfig?.Privileged||container.HostConfig?.NetworkMode==='host'||!bindings||Object.keys(bindings).join(',')!=='6379/tcp'||bindings['6379/tcp']?.length!==1||bindings['6379/tcp'][0].HostIp!=='127.0.0.1'||!container.Config.Env.includes('REDIS_ARGS=--appendonly yes --save 60 1 --requirepass '+this.password))throw new Error('The private database launch settings changed. It was not started.');
    if(!container.State?.Running)await this.docker(['start',this.container]);
    for(let attempt=0;attempt<40;attempt++){
      container=await this.inspect('container',this.container);
      const bindings=container?.NetworkSettings?.Ports?.['6379/tcp'];
      if(bindings?.length===1&&bindings[0].HostIp==='127.0.0.1'&&/^\d{1,5}$/.test(bindings[0].HostPort)){
        try{if((await this.docker(['exec','-e','REDISCLI_AUTH='+this.password,this.container,'redis-cli','ping'])).trim()==='PONG'){this.port=bindings[0].HostPort;await this.saveProgress();return this.status();}}catch{}
      }
      await new Promise(resolve=>setTimeout(resolve,250));
    }
    throw new Error('The private database did not become ready. No other database was reset or stopped.');
  });}
  private async diagnostic(kind:'memory'|'hermes'){
    if(!existsSync(this.executable))throw new Error('The packaged backend is missing. Use the complete Windows build.');
    let output:string;try{output=await this.run(this.executable,['--project',this.project,'--runtime',this.runtime,'--diagnose',kind],{timeout:125000,env:{...process.env,...this.modelEnvironment(),WAYFINDER_MODELS_ROOT:this.models,USE_GPU:'false',PYTHONDONTWRITEBYTECODE:'1',HF_HUB_OFFLINE:'1',TRANSFORMERS_OFFLINE:'1'}});}catch{throw new Error(kind==='memory'?'The bundled memory model could not run. Re-extract the complete app and retry.':'The AI connection could not be verified. Install/repair required software, save a valid provider key and retry.');}
    const lines=output.split(/\r?\n/).filter(line=>line.startsWith('WAYFINDER_DIAGNOSTIC='));if(lines.length!==1)throw new Error('The backend returned an invalid setup report.');return JSON.parse(lines[0].slice('WAYFINDER_DIAGNOSTIC='.length));
  }
  async memoryCheck(){return this.action('Checking the bundled memory model',async()=>{const report=await this.diagnostic('memory');if(!report.ready||report.dimensions!==384)throw new Error('The memory model did not pass its real inference check.');this.memory=true;await this.saveProgress();return this.status();});}
  async modelCheck(){return this.action('Verifying OpenCode and your AI connection',async()=>{if(!this.modelEnvironment().WAYFINDER_PRIVATE_MODEL_ROUTE)throw new Error('Save your own provider API key before checking OpenCode chat.');const report=await this.diagnostic('hermes');if(!report.ready||!validModel(report.model_info)||report.memory!==false||!Array.isArray(report.tools)||report.tools.length||report.key_verified!==true)throw new Error('The OpenCode/provider connection or task-runtime isolation check failed. Check your key and install/repair the required software, then retry.');this.model=report.model_info;this.modelChecked=Date.now();await this.saveProgress();return this.status();});}
  private environment(model:ModelPin){if(!this.port||!this.password)throw new Error('Check the private database first.');return {...this.modelEnvironment(),FALKORDB_HOST:'127.0.0.1',FALKORDB_PORT:this.port,FALKORDB_PASSWORD:this.password,FALKORDB_USERNAME:'default',FALKORDB_GRAPH_NAME:'wayfinder_'+this.id,WAYFINDER_MODELS_ROOT:this.models,WAYFINDER_CHAT_PROVIDER_PIN:JSON.stringify(model),USE_GPU:'false'};}
  private async boot(model:ModelPin){
    this.bridge.configure({executable:this.executable,environment:this.environment(model)});
    const backend=await this.bridge.connect();if(backend.state!=='ready')throw new Error(backend.error||'The packaged backend could not start.');if(this.connectionSource)await this.bridge.call('connections_configure',{connections:await this.connectionSource()});return backend;
  }
  async finish(name:unknown,consent:unknown){return this.action('Creating your workspace',async()=>{
    if(typeof name!=='string'||!name.trim()||name.length>100||consent!==true)throw new Error('Choose a workspace name and explicitly approve use of the displayed model connection.');
    if(!this.memory||!this.model||Date.now()-this.modelChecked>300000||!this.context)throw new Error('Complete the database, memory and Hermes checks before finishing.');
    await this.bridge.close();await this.boot(this.model);
    const spaces=await this.bridge.call('spaces');const workspace=spaces.find((s:Row)=>s.name===name.trim())||await this.bridge.call('create_space',{name:name.trim()});
    const inspected=await this.bridge.call('platform_inspect',{space:workspace.id,task:'general'},120000);
    if(!this.sameModel(inspected.isolation?.model_info,this.model))throw new Error('The model connection changed during setup. Review and verify it again.');
    const saved:Saved={version:1,complete:true,context:this.context,model:this.model,workspace:workspace.id,workspaceName:name.trim(),modelSource:this.modelEnvironment().WAYFINDER_PRIVATE_MODEL_ROUTE?'user-key':'managed'};
    const temporary=this.configPath+'.'+randomBytes(8).toString('hex')+'.tmp';await fs.writeFile(temporary,JSON.stringify(saved),{flag:'wx',mode:0o600});await fs.rename(temporary,this.configPath);this.saved=saved;await fs.rm(path.join(this.userData,'setup-progress.json'),{force:true});this.resume=undefined;
    return this.bridge.describe();
  });}
  async connect():Promise<BackendState>{
    if(!this.saved)return {state:'setup',runtime:this.runtime};
    if(this.connecting)return this.connecting;
    this.connecting=(async()=>{try{
      if(this.bridge.state.state==='ready')return this.bridge.describe();
      if(this.saved!.modelSource!=='user-key'){this.resume={context:this.saved!.context,workspaceName:this.saved!.workspaceName};this.saved=undefined;throw new Error('This version uses OpenCode chat with your own provider key. Add your key in onboarding; existing spaces were preserved.');}
      if(this.saved!.modelSource==='user-key'&&!this.modelEnvironment().WAYFINDER_PRIVATE_MODEL_ROUTE){this.saved=undefined;throw new Error('Your saved provider key is unavailable. Enter it again in onboarding. Another model credential was not used.');}
      await this.database(false);const backend=await this.boot(this.saved!.model);
      const inspected=await this.bridge.call('platform_inspect',{space:this.saved!.workspace,task:'general'},120000);
      if(!this.sameModel(inspected.isolation?.model_info,this.saved!.model)){await this.bridge.close();this.saved=undefined;this.error='Your configured model/provider changed. Review and verify it again.';return {state:'setup',runtime:this.runtime};}
      return this.bridge.describe();
    }catch(e){this.error=e instanceof Error?e.message:'The backend connection is unavailable.';return {state:'setup',runtime:this.runtime,error:this.error};}finally{this.connecting=undefined;}})();return this.connecting;
  }
  async close(){await this.bridge.close();if(this.context){try{const container=await this.inspect('container',this.container);if(this.owned(container?.Config?.Labels)&&container?.State?.Running)await this.docker(['stop','--time','10',this.container],20000);}catch{/* Preserve the owned volume and report no broad cleanup claim. */}}}
}
