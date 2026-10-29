/** Test the delivered outer .exe from an unrelated directory, using app-only CDP. */
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createRequire} from 'node:module';
import {createHash,randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import net from 'node:net';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
const require=createRequire(process.env.WAYFINDER_PLAYWRIGHT_MODULE||import.meta.url),{chromium}=require('playwright'),execute=promisify(execFile);
const root=fileURLToPath(new URL('..',import.meta.url));
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'wayfinder-portable-user-')),profile=path.join(dir,'profile');
const version=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8')).version;
const exe=path.join(dir,'Wayfinder.exe'),source=path.join(root,'release/Wayfinder-'+version+'-Windows-x64.exe');await fs.copyFile(source,exe);
async function port(){const server=net.createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const value=server.address().port;await new Promise(resolve=>server.close(resolve));return value;}
const inspector=await port(),cdp=await port(),env={...process.env,WAYFINDER_VERIFY_HIDDEN:'1',WAYFINDER_VERIFY_PROFILE:profile};
for(const key of ['WAYFINDER_PYTHON','WAYFINDER_PROJECT_ROOT','WAYFINDER_DESKTOP_RUNTIME','WAYFINDER_CHAT_PROVIDER_PIN','FALKORDB_HOST','FALKORDB_PORT','FALKORDB_PASSWORD','ELECTRON_RUN_AS_NODE'])delete env[key];
const credentialSource=process.argv[2];
if(credentialSource){assert(path.isAbsolute(credentialSource));await execute(exe,['--import-connections-only',credentialSource],{cwd:dir,env,windowsHide:true,timeout:150000});const sealed=await fs.readFile(path.join(profile,'connections-v1.bin'));assert(sealed.length>100&&!sealed.includes(Buffer.from('refresh_token')),'Portable import must save ciphertext; live decryption is checked below');}
const child=spawn(exe,[`--inspect=127.0.0.1:${inspector}`,`--remote-debugging-port=${cdp}`,'--remote-debugging-address=127.0.0.1'],{cwd:dir,env,windowsHide:true,stdio:'ignore'});
let exited=false,exitCode;child.once('exit',code=>{exited=true;exitCode=code;});
let browser,context='desktop-linux',normalQuit=false;
const checks=[],check=(name,ok)=>{assert(ok,name);checks.push({name,passed:true});console.log('PASS',name);};
async function waitEndpoint(port,pathName){const deadline=Date.now()+150000;do{if(exited)throw new Error('Portable launcher exited before startup');try{const response=await fetch(`http://127.0.0.1:${port}/${pathName}`,{signal:AbortSignal.timeout(1500)});if(response.ok)return await response.json();}catch{}await new Promise(r=>setTimeout(r,350));}while(Date.now()<deadline);throw new Error('Portable launcher did not expose its private test endpoint');}
async function quit(){const targets=await waitEndpoint(inspector,'json/list'),url=targets[0].webSocketDebuggerUrl;assert(url.startsWith(`ws://127.0.0.1:${inspector}/`));const ws=new WebSocket(url);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});ws.send(JSON.stringify({id:1,method:'Runtime.evaluate',params:{expression:"(()=>{const {app}=process.getBuiltinModule('module').createRequire(process.execPath)('electron');setTimeout(()=>app.quit(),100);return true;})()",awaitPromise:true}}));await new Promise((resolve,reject)=>{ws.onmessage=event=>{const result=JSON.parse(event.data);if(result.id===1){if(result.result?.exceptionDetails)reject(new Error(JSON.stringify(result.result.exceptionDetails)));else resolve();}};setTimeout(()=>reject(new Error('No quit acknowledgement')),5000);});ws.close();const deadline=Date.now()+90000;while(!exited&&Date.now()<deadline)await new Promise(r=>setTimeout(r,200));ws.close();normalQuit=exited&&exitCode===0;}
try{
  await waitEndpoint(cdp,'json/version');browser=await chromium.connectOverCDP(`http://127.0.0.1:${cdp}`);let page;
  const mainDeadline=Date.now()+30000;
  while(Date.now()<mainDeadline){page=browser.contexts()[0].pages().find(p=>p.url().startsWith('file:')&&!p.url().includes('companion='));if(page)break;await new Promise(resolve=>setTimeout(resolve,100));}
  assert(page,'Portable main window must load');page.setDefaultTimeout(150000);
  await page.getByRole('heading',{name:'Start with a private foundation.'}).waitFor();check('delivered_exe_extracts_and_shows_first_run',true);
  const entry=fileURLToPath(page.url()),marker=path.sep+'app.asar'+path.sep,offset=entry.indexOf(marker);assert(offset>0,'Own extracted archive path required');
  const extractedArchive=entry.slice(0,offset)+path.sep+'app.asar',resources=path.dirname(extractedArchive);
  const digest=async file=>{const hash=createHash('sha256'),handle=await fs.open(file);try{for await(const chunk of handle.createReadStream())hash.update(chunk);return hash.digest('hex');}finally{await handle.close();}};
  check('portable_archive_matches_qualified_app',await digest(extractedArchive)===await digest(path.join(root,'release/win-unpacked/resources/app.asar')));
  const staged=JSON.parse(await fs.readFile(path.join(root,'.cache/backend-manifest.json'),'utf8'));let verified=0;
  for(const [relative,expected]of Object.entries(staged.files)){const target=path.resolve(resources,relative);assert(target.startsWith(resources+path.sep),'Bounded extraction path');assert(await digest(target)===expected,'Extracted resource mismatch: '+relative);verified++;}
  check('all_extracted_backend_sources_and_model_files_match',verified===Object.keys(staged.files).length&&verified>0);
  const initial=await page.evaluate(()=>window.wayfinder.setupStatus());check('extracted_backend_is_present',initial.backendBundled&&!initial.complete);
  check('no_development_python_or_project_selected',!env.WAYFINDER_PYTHON&&!env.WAYFINDER_PROJECT_ROOT);
  await page.getByRole('button',{name:'Verify bundled memory model'}).click();await page.getByRole('button',{name:'Memory model verified'}).waitFor();check('extracted_model_runs_real_cpu_inference',true);
  await page.getByRole('button',{name:'Check / prepare database'}).click();await page.getByRole('button',{name:'Database ready'}).waitFor();check('portable_prepares_owned_database',true);
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  await page.getByRole('button',{name:'Check Hermes connection'}).click();await page.getByRole('button',{name:'Recheck model connection'}).waitFor();check('portable_verifies_installed_hermes',true);
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  await page.getByLabel('Workspace name',{exact:true}).fill('Portable fresh user');await page.getByLabel(/I agree to send/).check();await page.getByRole('button',{name:/Create workspace and open Wayfinder/}).click();await page.getByText('Backend connected',{exact:true}).waitFor();
  await page.waitForFunction(()=>document.querySelector('[aria-label="Memory space"]').value);
  const state=await page.evaluate(()=>window.wayfinder.status()),sid=await page.getByLabel('Memory space').inputValue();
  check('portable_backend_is_live',state.state==='ready'&&state.capabilities.general_chat&&state.backend.models.includes('bounded conversation'));
  if(credentialSource){const connected=await page.evaluate(s=>window.wayfinder.connectionsStatus(s),sid);check('portable_decrypts_connections_across_extractions',Object.values(connected.configured).every(Boolean));const checked=await page.evaluate(s=>window.wayfinder.checkConnection(s,'tavily'),sid);check('portable_hermes_tavily_route_is_live',checked.checks.tavily?.passed);}
  const inventory=await page.evaluate(s=>window.wayfinder.inventory(s),sid);check('portable_fresh_memory_is_empty',inventory.records.length===0);
  context=JSON.parse(await fs.readFile(path.join(profile,'onboarding.json'),'utf8')).context;
  await quit();check('portable_quits_normally_and_preserves_profile',normalQuit&&(await fs.stat(path.join(profile,'workspace-v1/app.sqlite3'))).isFile());
  const sha=createHash('sha256').update(await fs.readFile(exe)).digest('hex');
  const evidence={tier:'actual delivered portable Windows executable extracted in an unrelated fresh directory',passed:checks.length,checks,portable_sha256:sha,extracted_resource_files_verified:verified,native_desktop_automation:false,live_google:false,live_tavily:!!credentialSource,chat_inference:'covered separately by the matching packaged app acceptance test'};
  await fs.writeFile(path.join(root,'test-results/portable-launcher.json'),JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify(evidence));
}finally{
  if(!exited){try{await quit();}catch{}if(!exited&&Number.isInteger(child.pid))await execute('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true}).catch(()=>{});}
  if(browser)await browser.close().catch(()=>{});
  await fs.rm(path.join(profile,'connections-v1.bin'),{force:true});
  const id=createHash('sha256').update(path.resolve(path.join(profile,'workspace-v1')).toLowerCase()).digest('hex').slice(0,16);
  for(const [kind,name,args]of [['container','wayfinder-memory-'+id,['rm','-f','wayfinder-memory-'+id]],['volume','wayfinder-memory-data-'+id,['volume','rm','wayfinder-memory-data-'+id]]]){
    try{const {stdout}=await execute('docker',['--context',context,kind,'inspect',name],{windowsHide:true}),item=JSON.parse(stdout)[0],labels=kind==='container'?item.Config.Labels:item.Labels;if(labels?.['wayfinder.app']==='local.wayfinder.desktop'&&labels?.['wayfinder.workspace']===id)await execute('docker',['--context',context,...args],{windowsHide:true});}catch{}
  }
}
