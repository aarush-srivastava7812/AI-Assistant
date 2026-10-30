/** Real rendered UI with synthetic backend/preferences; no vendor calls or native effects. */
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(process.env.WAYFINDER_PLAYWRIGHT_MODULE||import.meta.url),{chromium}=require('playwright');
const themes=JSON.parse(await fs.readFile(path.join(root,'src/shared/vscode-themes.json'),'utf8'));
const renderer=path.join(root,'dist/renderer'),output=path.join(root,'test-results/themes');await fs.mkdir(output,{recursive:true});
const server=http.createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost'),file=path.resolve(renderer,'.'+(url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname)));if(!file.startsWith(renderer+path.sep)){res.writeHead(403).end();return;}const type={'.js':'text/javascript','.html':'text/html','.css':'text/css','.ttf':'font/ttf'}[path.extname(file)]||'application/octet-stream';res.setHeader('Content-Type',type);res.end(await fs.readFile(file));}catch{res.writeHead(404).end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,executablePath:process.env.WAYFINDER_CHROME});
const checks=[],faults=[],remote=[];const check=(name,ok)=>{assert(ok,name);checks.push({name,passed:true});console.log('PASS',name);};
const context=await browser.newContext({viewport:{width:1440,height:1000},colorScheme:'light',reducedMotion:'reduce'});
await context.addInitScript(catalog=>{
 const defaults={version:1,mode:'system',lightTheme:'vscode-light-modern',darkTheme:'vscode-dark-modern'};
 let saved;try{saved=JSON.parse(localStorage.getItem('appearance-fixture')||'null')||defaults;}catch{saved=defaults;}
 const listeners=new Set(),snapshot=()=>({...saved,configured:true,resolvedTheme:saved[saved.mode==='dark'||saved.mode==='system'&&matchMedia('(prefers-color-scheme: dark)').matches?'darkTheme':'lightTheme']});
 window.__appearanceSaves=[];window.__permissionSaves=[];window.__optionalLoads=0;window.__setupFinishes=[];
 window.appearanceAPI={get:async()=>snapshot(),save:async patch=>{saved={...saved,...patch};localStorage.setItem('appearance-fixture',JSON.stringify(saved));window.__appearanceSaves.push(patch);const value=snapshot();for(const cb of listeners)cb(value);return value;},preview:async id=>{window.__captionPreview=id;},onChange:cb=>{listeners.add(cb);return()=>listeners.delete(cb);}};
 matchMedia('(prefers-color-scheme: dark)').addEventListener('change',()=>{for(const cb of listeners)cb(snapshot());});
 let permissions={version:1,pet:false,widget:false,agents:false,folders:[]};
 const ready={state:'ready',owner:'fixture',instance_generation:'fixture',runtime:'Synthetic local UI fixture',capabilities:{general_chat:true,memory:true}};
 const api={connect:async()=>ready,status:async()=>ready,listSpaces:async()=>[{id:'fixture',name:'Theme preview workspace'}],getSettings:async()=>({font_size:14}),setFontSize:async n=>({font_size:n}),snapshot:async()=>({actions:[],workflows:[],jobs:[]}),fileSelection:async()=>null,repositorySelection:async()=>null,chats:async()=>[],chat:async()=>({turns:[]}),profiles:async()=>({profiles:[],presets:[]}),setupChoices:async next=>{if(next){permissions=next;window.__permissionSaves.push(next);}return permissions;},googleStatus:async()=>({credential_file_present:false,setup:'Synthetic setup status.'}),quitApp:async()=>{},};
 if(new URL(location.href).searchParams.has('onboarding')){
  let completed=false;
  api.connect=async()=>completed?ready:{state:'setup',runtime:'Synthetic onboarding fixture'};
  api.status=api.connect;
  api.setupStatus=async()=>({databaseReady:true,memoryReady:true,modelReady:true,modelExpiresAt:Date.now()+300000,model:{provider:'custom',model:'synthetic-model',endpoint:'inference.invalid'},modelKey:{configured:true,provider:'nvidia',model:'synthetic-model',connectedProviders:['nvidia']}});
  api.setupDependencies=async()=>({});
  api.setupFinish=async(name,consent)=>{if(name!=='Personal'||consent!==true)throw Error('Explicit agreement and default workspace expected');window.__setupFinishes.push({name,consent});completed=true;return ready;};
  const choices=api.setupChoices;api.setupChoices=async next=>{window.__optionalLoads++;return choices(next);};
 }
 window.wayfinder=new Proxy(api,{get:(target,key)=>key in target?target[key]:async()=>{throw Error('Unsupported fixture method '+String(key));}});
 window.companionAPI={setSpace:async()=>{},onNavigate:()=>()=>{},getShortcut:async()=>'Ctrl+Shift+Space',shortcutRegistered:async()=>false};
},themes);
const page=await context.newPage();page.on('pageerror',error=>faults.push(error.message));page.on('request',request=>{if(!request.url().startsWith(origin+'/'))remote.push(request.url());});
const waitTheme=id=>page.waitForFunction(id=>document.documentElement.dataset.colorTheme===id,id);
const nav=()=>page.getByRole('navigation',{name:'Settings categories'});
try{
 await page.goto(origin);await page.getByText('Backend connected',{exact:true}).waitFor();await page.getByRole('button',{name:'Open settings',exact:true}).click();
 check('categorized_settings_navigation',await nav().getByRole('button').count()===8);
 await nav().getByRole('button',{name:'Appearance',exact:true}).click();await page.getByLabel('Preferred light theme').waitFor();
 for(const theme of themes){
  await page.getByLabel(`Preferred ${theme.kind} theme`).selectOption(theme.id);
  await page.getByRole('group',{name:'Color scheme'}).getByRole('button',{name:theme.kind==='dark'?'Dark':'Light',exact:true}).click();await waitTheme(theme.id);
  const actual=await page.evaluate(theme=>{const node=document.createElement('span');node.style.backgroundColor=theme.native.background;document.body.append(node);const expected=getComputedStyle(node).backgroundColor;node.remove();return {background:getComputedStyle(document.querySelector('.app')).backgroundColor,expected,scheme:document.documentElement.style.colorScheme};},theme);
  check('rendered_palette_'+theme.id,actual.background===actual.expected&&actual.scheme===theme.kind);
  if(['vscode-light-modern','vscode-dark-modern','vscode-monokai','vscode-solarized-dark','vscode-default-high-contrast','vscode-default-high-contrast-light'].includes(theme.id))await page.screenshot({path:path.join(output,theme.id+'.png')});
 }
 await page.getByLabel('Preferred dark theme').selectOption('vscode-dark-modern');await page.getByRole('group',{name:'Color scheme'}).getByRole('button',{name:'Dark',exact:true}).click();await waitTheme('vscode-dark-modern');
 const before=await page.evaluate(()=>window.__appearanceSaves.length);await page.getByRole('button',{name:'Change color theme'}).click();let picker=page.getByRole('dialog',{name:'Color theme'});await picker.getByRole('option',{name:'Abyss',exact:true}).focus();await waitTheme('vscode-abyss');check('gallery_preview_does_not_save',await page.evaluate(()=>window.__appearanceSaves.length)===before);
 await picker.getByRole('button',{name:'Cancel preview'}).click();await waitTheme('vscode-dark-modern');check('cancel_restores_saved_theme',true);
 await page.getByRole('button',{name:'Change color theme'}).click();picker=page.getByRole('dialog',{name:'Color theme'});await picker.getByRole('option',{name:'Abyss',exact:true}).focus();await page.keyboard.press('ArrowDown');check('gallery_keyboard_preview_moves_selection',await page.evaluate(()=>document.activeElement?.getAttribute('data-theme-option'))!=='vscode-abyss');await page.keyboard.press('Escape');await waitTheme('vscode-dark-modern');check('escape_restores_saved_theme',true);
 await page.getByRole('button',{name:'Change color theme'}).click();picker=page.getByRole('dialog',{name:'Color theme'});await picker.getByLabel('Search color themes').fill('Monokai');check('gallery_search_filters_themes',await picker.getByRole('option').count()===2);await picker.getByRole('option',{name:'Monokai',exact:true}).focus();await picker.getByRole('button',{name:'Apply theme'}).click();await waitTheme('vscode-monokai');
 await page.reload();await page.getByText('Backend connected',{exact:true}).waitFor();await waitTheme('vscode-monokai');check('theme_survives_ui_reload',true);
 await page.getByRole('button',{name:'Choose color theme'}).click();await page.getByLabel('Preferred light theme').selectOption('vscode-quiet-light');await page.getByLabel('Preferred dark theme').selectOption('vscode-abyss');await page.getByRole('group',{name:'Color scheme'}).getByRole('button',{name:'System',exact:true}).click();await waitTheme('vscode-quiet-light');
 await page.emulateMedia({colorScheme:'dark'});await waitTheme('vscode-abyss');check('system_scheme_tracks_os_change',true);
 check('appearance_does_not_grant_permissions',await page.evaluate(()=>window.__permissionSaves.length===0));
 await page.getByLabel('Search settings').fill('pet');await page.locator('.settings-results').getByRole('button',{name:/Desktop companions/}).click();await page.getByLabel('Enable the desktop pet').waitFor();check('settings_search_navigates_to_control',true);check('desktop_category_excludes_agent_and_account_controls',await page.getByLabel('Enable advisory task agents and source workflows').count()===0&&await page.getByRole('button',{name:'Connect Google account'}).count()===0);
 await nav().getByRole('button',{name:'Permissions',exact:true}).click();await page.getByLabel('Enable advisory task agents and source workflows').waitFor();check('permissions_category_keeps_source_controls',await page.getByRole('button',{name:'Choose an allowed folder'}).count()===1);
 for(const [width,height]of [[900,700],[600,600]]){await page.setViewportSize({width,height});await nav().getByRole('button',{name:'Appearance',exact:true}).click();await page.getByLabel('Preferred light theme').waitFor();check('settings_fits_'+width+'x'+height,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.mouse.move(width-60,height-150);await page.mouse.wheel(0,1000);await page.waitForFunction(()=>{const r=document.querySelector('[aria-label="Reading size"]').getBoundingClientRect();return r.top>36&&r.bottom<innerHeight;});check('reading_control_reachable_'+width+'x'+height,true);await page.screenshot({path:path.join(output,`settings-${width}x${height}.png`)});await page.getByRole('button',{name:'Change color theme'}).click();picker=page.getByRole('dialog',{name:'Color theme'});const box=await picker.boundingBox();check('theme_picker_fits_'+width+'x'+height,box.x>=0&&box.x+box.width<=width+1&&box.y>=0&&box.y+box.height<=height+1);await page.keyboard.press('Escape');}
 await page.emulateMedia({colorScheme:'light'});
 for(const [width,height]of [[1440,940],[900,700],[600,600]]){
  await page.setViewportSize({width,height});await page.evaluate(()=>localStorage.removeItem('appearance-fixture'));
  await page.goto(origin+'?onboarding');await page.getByRole('button',{name:'Agree and continue',exact:true}).waitFor();
  check('model_agreement_disclosed_'+width,await page.getByText(/By choosing/).count()===1);
  await page.getByRole('button',{name:'Agree and continue',exact:true}).click();await page.getByRole('heading',{name:'You’re ready to start.'}).waitFor();
  const forward=page.getByRole('button',{name:'Open Wayfinder',exact:true});
  check('optional_setup_not_loaded_'+width,await page.evaluate(()=>window.__optionalLoads===0)&&await page.getByRole('checkbox').count()===0);
  const box=await forward.boundingBox();check('ready_primary_visible_'+width,box&&box.y>=36&&box.y+box.height<=height&&await forward.isEnabled());
  check('ready_has_no_horizontal_overflow_'+width,await page.evaluate(()=>{const root=document.querySelector('.onboarding');return document.documentElement.scrollWidth<=innerWidth&&root.scrollWidth<=root.clientWidth+1&&root.scrollLeft===0;}));
  await page.screenshot({path:path.join(output,`onboarding-ready-${width}.png`)});
  await forward.click();await page.getByText('Backend connected',{exact:true}).waitFor();
  check('skip_uses_defaults_without_grants_'+width,await page.evaluate(()=>window.__setupFinishes.length===1&&window.__setupFinishes[0].name==='Personal'&&window.__optionalLoads===0&&window.__permissionSaves.length===0));
  if(width===1440){await page.getByRole('button',{name:'Open settings',exact:true}).click();for(const [category,label]of [['Appearance','Change color theme'],['Desktop companions','Open companion chat'],['Connections','Connect Google account']]){await nav().getByRole('button',{name:category,exact:true}).click();check('deferred_configuration_in_settings_'+category,await page.getByRole('button',{name:label,exact:true}).count()===1);}}
  await page.goto(origin+'?onboarding');await page.getByRole('button',{name:'Agree and continue',exact:true}).click();await page.getByRole('button',{name:'Customize now (optional)'}).click();
  check('customization_has_themes_and_optional_permissions_'+width,await page.getByLabel('Suggested themes').locator('button').count()===4&&await page.getByLabel('Enable advisory task agents and source workflows').isChecked()===false);
  const expanded=await page.getByRole('button',{name:'Open Wayfinder',exact:true}).boundingBox();check('expanded_customization_keeps_forward_visible_'+width,expanded&&expanded.y>=36&&expanded.y+expanded.height<=height);
  await page.screenshot({path:path.join(output,`onboarding-customize-${width}.png`)});
  await page.getByRole('button',{name:'Open Wayfinder',exact:true}).click();await page.getByText('Backend connected',{exact:true}).waitFor();
  check('browsing_customization_does_not_grant_permissions_'+width,await page.evaluate(()=>window.__permissionSaves.length===0));
 }
 check('no_renderer_faults',faults.length===0);check('no_external_runtime_requests',remote.length===0);
 const result={tier:'rendered Chromium fixtures, real application UI; synthetic backend and preference transport',checks,passed:checks.length,live_provider_calls:0,native_caption_verified:false};await fs.writeFile(path.join(output,'verification.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({passed:result.passed}));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
