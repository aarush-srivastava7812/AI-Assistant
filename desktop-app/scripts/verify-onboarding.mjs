/** Fresh packaged first-run check: app renderer only, no OS UI automation. */
import path from 'node:path';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import os from 'node:os';
import {createHash,randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const execute=promisify(execFile),require=createRequire(process.env.WAYFINDER_PLAYWRIGHT_MODULE||import.meta.url);
const {_electron:electron}=require('playwright');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const [profile,report]=process.argv.slice(2);assert(profile&&report&&path.isAbsolute(profile));
await fs.mkdir(profile,{recursive:true});assert(!(await fs.readdir(profile)).length,'Fresh empty profile required');
await fs.mkdir(path.join(root,'test-results/rendered'),{recursive:true});
const runtime=path.join(profile,'workspace-v1');
const id=createHash('sha256').update(path.resolve(runtime).toLowerCase()).digest('hex').slice(0,16);
const container='wayfinder-memory-'+id,volume='wayfinder-memory-data-'+id;
const env={...process.env,WAYFINDER_VERIFY_HIDDEN:'1',WAYFINDER_VERIFY_PROFILE:profile};
for(const key of ['WAYFINDER_PYTHON','WAYFINDER_PROJECT_ROOT','WAYFINDER_DESKTOP_RUNTIME','WAYFINDER_CHAT_PROVIDER_PIN','FALKORDB_HOST','FALKORDB_PORT','FALKORDB_PASSWORD','ELECTRON_RUN_AS_NODE'])delete env[key];
const checks=[];const check=(name,value)=>{assert(value,name);checks.push({name,passed:true});console.log('PASS',name);};
let application,context;
const testKey=process.env.WAYFINDER_TEST_NVIDIA_KEY;delete env.WAYFINDER_TEST_NVIDIA_KEY;
async function launch(){
  application=await electron.launch({executablePath:path.join(root,'release/win-unpacked/Wayfinder.exe'),env,timeout:150000});
  await application.firstWindow();let page;const deadline=performance.now()+30000;
  while(performance.now()<deadline){page=application.windows().find(p=>p.url().startsWith('file:')&&!p.url().includes('companion='));if(page)break;await new Promise(resolve=>setTimeout(resolve,100));}
  assert(page,'Main application window must load');page.setDefaultTimeout(150000);return page;
}
async function captureOwnWindow(page,name){
  for(let attempt=0;attempt<4;attempt++)try{
    const png=await application.evaluate(async({BrowserWindow},url)=>{const window=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL()===url);if(!window)throw new Error('Own window unavailable');return (await window.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG().toString('base64');},page.url());
    await fs.writeFile(path.join(root,'test-results/rendered',name),Buffer.from(png,'base64'));return;
  }catch(error){if(!String(error).includes('UnknownVizError'))throw error;await new Promise(resolve=>setTimeout(resolve,300));}
  console.log('Optional own-window screenshot unavailable in hidden compositor:',name);
}
async function completed(page,space,cid,count){
  const deadline=Date.now()+150000;let data;
  do{data=await page.evaluate(({space,cid})=>window.wayfinder.chat(space,cid),{space,cid});if(data.turns.length>=count&&!['reserved','running'].includes(data.turns.at(-1).status))break;await new Promise(resolve=>setTimeout(resolve,700));}while(Date.now()<deadline);
  if(data.turns.at(-1)?.status!=='completed')console.log('TURN_DIAGNOSTIC',JSON.stringify(data));
  check('model_turn_completed_'+checks.length,data.turns.length>=count&&data.turns.at(-1).status==='completed');return data;
}
try{
  let page=await launch();await page.getByRole('heading',{name:'Start with a private foundation.'}).waitFor();
  check('fresh_profile_shows_onboarding',true);
  check('optional_companions_off_before_consent',application.windows().length===1);
  check('optional_permissions_off_by_default',await page.evaluate(async()=>{const p=await window.wayfinder.setupChoices();return !p.pet&&!p.widget&&!p.agents&&!p.folders.length;}));
  check('window_stays_hidden',await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(w=>!w.isVisible())));
  check('workspace_access_denied_before_setup',await page.evaluate(async()=>{try{await window.wayfinder.listSpaces();return false;}catch{return true;}}));
  check('finish_requires_checks_and_consent',await page.getByRole('button',{name:'Continue',exact:true}).isDisabled());
  await captureOwnWindow(page,'actual-onboarding-foundation.png');
  await page.getByRole('button',{name:'Verify bundled memory model'}).click();await page.getByRole('button',{name:'Memory model verified'}).waitFor();check('frozen_cpu_memory_inference',true);
  await page.getByRole('button',{name:'Check / prepare database'}).click();await page.getByRole('button',{name:'Database ready'}).waitFor();check('isolated_private_database_prepared',true);
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  assert(testKey,'An authorized privately supplied NVIDIA test key is required');
  await page.getByLabel('NVIDIA API key',{exact:true}).evaluate((input,key)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,key);input.dispatchEvent(new Event('input',{bubbles:true}));},testKey);
  await page.getByRole('button',{name:'Save NVIDIA key securely',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('input[type=password]')?.value==='');
  const sealed=await fs.readFile(path.join(profile,'model-key-v1.bin'));
  check('key_saved_through_onboarding_and_encrypted',sealed.length>100&&!sealed.includes(Buffer.from(testKey)));
  await page.getByRole('button',{name:'Check AI connection'}).click();await page.getByRole('button',{name:'Recheck AI connection'}).waitFor();check('installed_hermes_isolation_verified',true);
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  check('agents_need_explicit_opt_in',!(await page.getByLabel('Enable advisory task agents and source workflows').isChecked()));
  await captureOwnWindow(page,'actual-onboarding-permissions.png');
  await page.getByLabel('Workspace name',{exact:true}).fill('New user acceptance');await page.getByLabel(/I agree to send/).check();await page.getByRole('button',{name:/Create workspace and open Wayfinder/}).click();
  await page.getByText('Backend connected',{exact:true}).waitFor();
  let state=await page.evaluate(()=>window.wayfinder.status());check('real_owned_backend_chat_ready',state.state==='ready'&&state.capabilities.general_chat&&state.release.variant==='workspace-parity');
  await page.waitForFunction(()=>document.querySelector('[aria-label="Memory space"]').value);
  const sid=await page.getByLabel('Memory space').inputValue();check('first_space_created',!!sid);
  const config=JSON.parse(await fs.readFile(path.join(profile,'onboarding.json'),'utf8'));context=config.context;
  check('setup_stores_no_provider_secrets',Object.keys(config.model).sort().join(',')==='endpoint,model,provider'&&!JSON.stringify(config).includes('password'));
  await page.getByRole('button',{name:'Chat',exact:true}).first().click();await page.getByRole('button',{name:'New conversation',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.conversation-workspace')?.dataset.conversationId);
  const cid=await page.locator('.conversation-workspace').getAttribute('data-conversation-id');const nonce='wayfinder-'+randomUUID().slice(0,8);
  await page.getByLabel('Message',{exact:true}).fill('For this conversation, the synthetic test code is '+nonce+'. Reply with just that code.');await page.getByRole('button',{name:'Send message',exact:true}).click();
  const first=await completed(page,sid,cid,1);check('actual_model_reply_contains_new_nonce',first.turns.at(-1).assistant_text.includes(nonce));
  await page.getByLabel('Message',{exact:true}).fill('What is the synthetic test code I gave you in the previous message? Reply with just that code.');await page.getByRole('button',{name:'Send message',exact:true}).click();
  const second=await completed(page,sid,cid,2);check('actual_model_uses_canonical_history',second.turns.at(-1).assistant_text.includes(nonce)&&second.turns.at(-1).history_count===2);
  await captureOwnWindow(page,'actual-packaged-chat.png');
  const inventory=await page.evaluate(s=>window.wayfinder.inventory(s),sid);check('chat_does_not_publish_automatic_memory',inventory.records.length===0);

  // Real companion windows and the same backend; no OS input or visible UI.
  check('widget_cannot_open_while_off',await page.evaluate(async()=>{try{await window.companionAPI.showOverlay();return false;}catch{return true;}}));
  await page.evaluate(async()=>{const p=await window.wayfinder.setupChoices();await window.wayfinder.setupChoices({version:1,pet:true,widget:true,agents:false,folders:p.folders});});
  await page.evaluate(()=>window.companionAPI.showOverlay());
  let overlay;
  const overlayDeadline=Date.now()+30000;
  while(Date.now()<overlayDeadline){overlay=application.windows().find(p=>p.url().includes('companion=overlay'));if(overlay)break;await new Promise(resolve=>setTimeout(resolve,100));}
  assert(overlay,'Overlay window must load');overlay.setDefaultTimeout(30000);await overlay.emulateMedia({reducedMotion:'reduce'});
  await overlay.getByRole('button',{name:'New conversation',exact:true}).waitFor();
  check('overlay_exposes_chat_only',await overlay.evaluate(()=>typeof window.wayfinder.sendChat==='function'&&!('inventory' in window.wayfinder)&&!('reviewMemory' in window.wayfinder)));
  const pet=application.windows().find(p=>p.url().includes('companion=pet'));assert(pet);
  check('pet_has_no_backend_bridge',await pet.evaluate(()=>typeof window.wayfinder==='undefined'));
  const previousOverlayCid=await overlay.locator('.conversation-workspace').getAttribute('data-conversation-id');
  await overlay.getByRole('button',{name:'New conversation',exact:true}).evaluate(button=>button.click());
  await overlay.waitForFunction(previous=>{const id=document.querySelector('.conversation-workspace')?.dataset.conversationId;return id&&id!==previous&&!document.querySelector('#chat-message')?.disabled;},previousOverlayCid);
  const overlayCid=await overlay.locator('.conversation-workspace').getAttribute('data-conversation-id');
  await overlay.getByLabel('Message',{exact:true}).evaluate((element,text)=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(element,text);element.dispatchEvent(new Event('input',{bubbles:true}));},'Reply with this synthetic companion test code: '+nonce);
  await overlay.waitForFunction(()=>!document.querySelector('[aria-label="Send message"]').disabled);
  await overlay.getByRole('button',{name:'Send message',exact:true}).evaluate(button=>button.click());
  const overlayTurn=await completed(page,sid,overlayCid,1);
  check('overlay_real_chat_visible_to_main_service',overlayTurn.turns[0].assistant_text.includes(nonce));
  await overlay.waitForFunction(()=>!document.body.innerText.includes('Loading your conversation'));
  await captureOwnWindow(overlay,'actual-companion-chat.png');
  await pet.getByRole('button',{name:'Open Wayfinder companion menu',exact:true}).evaluate(button=>button.click());
  await pet.getByRole('button',{name:'Widget settings',exact:true}).waitFor();
  check('pet_menu_expands_to_fit_controls',await application.evaluate(({BrowserWindow})=>{const pet=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('companion=pet'));return pet.getBounds().width===360&&pet.getBounds().height>180;}));
  await captureOwnWindow(pet,'actual-companion-pet.png');
  await overlay.getByRole('button',{name:'Close chat overlay',exact:true}).evaluate(button=>button.click());
  check('companion_testing_never_shows_any_window',await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().every(w=>!w.isVisible())));
  await page.evaluate(()=>window.companionAPI.showOverlay());
  check('overlay_reuses_single_window',application.windows().filter(p=>p.url().includes('companion=overlay')).length===1);
  await pet.evaluate(()=>window.companionAPI.showSettings());
  await page.getByRole('heading',{name:'Desktop companion widget',exact:true}).waitFor();
  check('pet_settings_navigates_main',true);
  await pet.evaluate(()=>window.companionAPI.hidePet());
  await page.evaluate(()=>window.companionAPI.showPet());
  check('pet_can_be_restored_from_main',application.windows().filter(p=>p.url().includes('companion=pet')).length===1);
  check('closing_main_preserves_companion_session',await application.evaluate(({BrowserWindow})=>{const main=BrowserWindow.getAllWindows().find(w=>!w.webContents.getURL().includes('companion='));main.close();return !main.isDestroyed();}));
  // Test-only native dialog stubs select this one synthetic file and accept
  // disclosure. Real IPC, grants, model execution and result checks still run.
  const selected=path.join(await fs.mkdtemp(path.join(os.tmpdir(),'wayfinder-synthetic-source-')),'selected.md');
  await fs.writeFile(selected,'Synthetic Aurora project note. The retention period is 42 days. This note requests no external actions or commitments.');
  await application.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});dialog.showMessageBox=async()=>({response:1,checkboxChecked:false});},selected);
  check('agent_run_denied_while_off',await page.evaluate(async sid=>{try{await window.wayfinder.startProfileTask(sid,'A05','missing','test');return false;}catch(e){return e.message.includes('Enable task agents');}},sid));
  await page.evaluate(async()=>{const p=await window.wayfinder.setupChoices();await window.wayfinder.setupChoices({version:1,pet:p.pet,widget:p.widget,agents:true,folders:p.folders});});
  const files=await page.evaluate(s=>window.wayfinder.selectFiles(s,'document'),sid);
  const reference=files.files[0].id;
  await page.evaluate(s=>window.wayfinder.inspectRuntime(s),sid);
  const waitRun=async(kind,id)=>{const end=Date.now()+150000;let result;do{result=await page.evaluate(({sid,kind,id})=>kind==='profile'?window.wayfinder.profileTask(sid,id):window.wayfinder.workflow(sid,id),{sid,kind,id});if(!['reserved','running'].includes(result.status))return result;await new Promise(resolve=>setTimeout(resolve,400));}while(Date.now()<end);throw new Error('Task did not settle');};
  const task=await page.evaluate(({sid,reference})=>window.wayfinder.startProfileTask(sid,'A05',reference,'What is the retention period? Cite the selected note.','selected_file'),{sid,reference});
  const taskResult=await waitRun('profile',task.id);
  check('actual_selected_file_profile_and_attributed_model_result',taskResult.status==='completed'&&taskResult.result.text.includes('42')&&!!taskResult.result.sources[0].sha256&&!taskResult.effects_executed);
  const workflow=await page.evaluate(({sid,reference})=>window.wayfinder.startWorkflow(sid,{contract:'wayfinder.workflow/1',version:1,title:'Synthetic read and verify',concurrency:1,deadline_seconds:110,nodes:[{id:'read',role:'W35',reference,question:'State the retention period from the note.',dependencies:[]},{id:'verify',role:'W35',reference,question:'Verify the upstream retention answer against the selected note.',dependencies:['read']}]}),{sid,reference});
  const workflowResult=await waitRun('workflow',workflow.id);
  check('actual_dependent_workflow_completes_without_effects',workflowResult.status==='completed'&&workflowResult.nodes.every(n=>n.output?.text.includes('42'))&&workflowResult.metrics.worker_invocations===2&&!workflowResult.effects_executed);
  check('task_execution_does_not_publish_memory',(await page.evaluate(s=>window.wayfinder.inventory(s),sid)).records.length===0);
  await page.evaluate(async()=>{const p=await window.wayfinder.setupChoices();await window.wayfinder.setupChoices({version:1,pet:false,widget:false,agents:false,folders:p.folders});});
  check('disabling_companions_destroys_windows',await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().length===1));
  const generation=state.instance_generation;await application.close();application=undefined;
  page=await launch();await page.getByText('Backend connected',{exact:true}).waitFor();state=await page.evaluate(()=>window.wayfinder.status());
  check('restart_creates_fresh_backend',state.instance_generation!==generation&&state.capabilities.general_chat);
  check('companion_off_survives_restart',await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().length===1));
  check('saved_off_choices_survive_restart',await page.evaluate(async()=>{const p=await window.wayfinder.setupChoices();return !p.pet&&!p.widget&&!p.agents;}));
  const persisted=await page.evaluate(({sid,cid})=>window.wayfinder.chat(sid,cid),{sid,cid});check('restart_preserves_real_conversation_without_replay',persisted.turns.length===2&&persisted.turns.every(t=>t.status==='completed'));
  check('app_needs_no_development_checkout_or_python_env',!env.WAYFINDER_PROJECT_ROOT&&!env.WAYFINDER_PYTHON&&await fs.stat(path.join(root,'release/win-unpacked/resources/backend/WayfinderBackend.exe')).then(s=>s.isFile()));
  await application.close();application=undefined;
  const evidence={tier:'actual hidden packaged Windows app + OpenCode 1.19.5/NVIDIA chat + native Hermes tasks + bundled Python/CPU model + private Docker database',checks,passed:checks.length,native_desktop_automation:false,google_connected:false,prerequisites:['Docker Desktop local Linux engine','Installed private Hermes/Python runtime','User-provided NVIDIA key'],profile,asar_sha256:createHash('sha256').update(await fs.readFile(path.join(root,'release/win-unpacked/resources/app.asar'))).digest('hex')};
  await fs.writeFile(report,JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify(evidence));
}catch(error){if(application){const page=await application.firstWindow().catch(()=>null);if(page)console.log((await page.locator('body').innerText()).slice(-6000));}throw error;}
finally{
  if(application)await application.close();
  await fs.rm(path.join(profile,'model-key-v1.bin'),{force:true});
  // Cleanup names are derived from this newly created isolated profile only.
  context=context||'desktop-linux';
  for(const [kind,name,args] of [['container',container,['rm','-f',container]],['volume',volume,['volume','rm',volume]]]){
    try{const {stdout}=await execute('docker',['--context',context,kind,'inspect',name],{windowsHide:true});const item=JSON.parse(stdout)[0],labels=kind==='container'?item.Config.Labels:item.Labels;if(labels?.['wayfinder.app']==='local.wayfinder.desktop'&&labels?.['wayfinder.workspace']===id)await execute('docker',['--context',context,...args],{windowsHide:true});}catch{}
  }
}
