/** Static standalone inspection; actual app checks must match this archive. */
import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {listPackage,extractFile} from '@electron/asar';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('..',import.meta.url)),pack=path.join(root,'release/win-unpacked'),resources=path.join(pack,'resources'),archive=path.join(resources,'app.asar');
const hash=async p=>{const h=createHash('sha256');for await(const chunk of createReadStream(p))h.update(chunk);return h.digest('hex');};
const files=listPackage(archive).map(p=>p.replaceAll('\\','/')),get=p=>extractFile(archive,path.normalize(p));
const checks=[],check=(name,ok)=>{assert(ok,name);checks.push({name,passed:true});};
const metadata=JSON.parse(get('package.json').toString()),release=JSON.parse(await fs.readFile(path.join(root,'FEATURES.json'),'utf8'));
for(const name of ['main/index.js','preload/index.cjs','renderer/index.html'])check('included_'+name,files.includes('/dist/'+name));
if(release.preload_methods.includes('sendChat')){
  check('companion_preload_included',files.includes('/dist/preload/companion.cjs'));
  const companion=get('dist/preload/companion.cjs').toString();
  check('companion_preload_has_no_effect_or_private_operations',!companion.includes('reviewMemory')&&!companion.includes('importConnections')&&!companion.includes('selectFiles'));
}
check('version_and_variant',metadata.version===JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8')).version&&metadata.version===release.version&&release.variant==='workspace-parity');
check('build_label_matches_version',release.build==='wayfinder-desktop/'+metadata.version);
const main=get('dist/main/index.js').toString(),html=get('dist/renderer/index.html').toString();
check('no_application_menu_strip',main.includes('Menu.setApplicationMenu(null)'));
check('themed_native_caption',main.includes('titleBarStyle: "hidden"')&&main.includes('titleBarOverlay:'));
check('isolated_renderer',main.includes('contextIsolation: true')&&main.includes('nodeIntegration: false')&&main.includes('sandbox: true'));
check('no_renderer_network_or_inline_script',html.includes("connect-src 'none'")&&html.includes("script-src 'self'"));
const renderer=files.filter(p=>p.startsWith('/dist/renderer/')&&p.endsWith('.js')).map(p=>get(p.slice(1)).toString()).join('\n');
check('private_bootstrap_not_in_renderer',!renderer.includes('WAYFINDER_HOST_SECRET')&&!renderer.includes('Bearer '));
check('onboarding_and_chat_inclusion',release.preload_methods.includes('setupFinish')&&release.preload_methods.includes('sendChat')&&release.backend_operations.includes('chat_send'));
check('no_generic_ipc_or_native_actions',!release.preload_methods.some(n=>['invoke','exec','call'].includes(n))&&!release.backend_operations.includes('worker_action_decide')&&release.native_testing_enabled===false);
check('manifest_pairing',await hash(path.join(root,'FEATURES.json'))===await hash(path.join(resources,'backend/FEATURES.json'))&&JSON.stringify(JSON.parse(get('dist/release.json').toString()))===JSON.stringify(release));
check('embedded_frozen_manifest_matches_app',await hash(path.join(root,'FEATURES.json'))===await hash(path.join(resources,'backend/_internal/FEATURES.json')));
const staged=JSON.parse(await fs.readFile(path.join(root,'.cache/backend-manifest.json'),'utf8'));
staged.files=Object.fromEntries(Object.entries(staged.files).map(([name,digest])=>[name.replaceAll('\\','/'),digest]));
const backend=path.join(resources,'backend/WayfinderBackend.exe');
check('bundled_python_executable_matches_stage',await hash(backend)===staged.files['backend/WayfinderBackend.exe']);
check('python_interpreter_bundled',(await fs.stat(path.join(resources,'backend/_internal/python312.dll'))).isFile());
const trustPolicy=staged.files['backend/_internal/codex-rejected-cas.pem'];
check('build_python_trust_policy_preserved',!trustPolicy||await hash(path.join(resources,'backend/_internal/codex-rejected-cas.pem'))===trustPolicy);
for(const file of ['wayfinder/chat.py','wayfinder/platform/contracts.py','wayfinder/platform/task_profiles.py','wayfinder/platform/workflows.py','wayfinder/platform/worker_bindings.py','wayfinder/platform/worker_activation_ledger.py','wayfinder/platform/runtime_probe.py','wayfinder/platform/runtime.py','wayfinder/platform/catalog.py','wayfinder/service.py','wayfinder/api.py','wayfinder/workers/hermes.py','wayfinder/workers/hub.py','wayfinder/workers/opencode.py','wayfinder/workers/model_routes.py','wayfinder/model-providers.json','wayfinder/platform/connections.py','wayfinder/workers/hermes_runner.py','memory/engine.py'])check('source_identity_'+file,await hash(path.join(root,'..',file))===await hash(path.join(resources,'backend-project',file)));
check('executed_worker_script_identity',await hash(path.join(root,'../wayfinder/workers/hermes_runner.py'))===await hash(path.join(resources,'backend/_internal/wayfinder/workers/hermes_runner.py')));
const model=path.join(resources,'models/models--qdrant--bge-small-en-v1.5-onnx-q/blobs/51f1bd');
// Compare every staged model file, including the dereferenced snapshot contents.
let modelCount=0;for(const [name,digest] of Object.entries(staged.files))if(name.startsWith('models/')){assert(await hash(path.join(resources,name))===digest,'Model checksum '+name);modelCount++;}
check('bundled_public_model_checksums',modelCount>4);
const forbidden=[];
async function scan(folder){for(const entry of await fs.readdir(folder,{withFileTypes:true})){const full=path.join(folder,entry.name);if(entry.isDirectory())await scan(full);else if(/^\.env(?:\.|$)|^(?:credentials|token)\.json$|^app\.sqlite3(?:-wal|-shm)?$|^database\.key$|debug-original$/i.test(entry.name))forbidden.push(path.relative(resources,full));}}
await scan(resources);check('no_private_state_credentials_or_debug_copies',!forbidden.length);
for(const name of ['FlagEmbedding-LICENSE.txt','Python-LICENSE.txt','Qdrant-BGE-model-card.md','python-dependencies.json','javascript/react-LICENSE.txt','javascript/lucide-react-LICENSE.txt'])check('notice_'+name,(await fs.stat(path.join(resources,'licenses',name))).size>0);
const actual=JSON.parse(await fs.readFile(path.join(root,'test-results/onboarding-packaged.json'),'utf8'));
check('actual_fresh_profile_acceptance',actual.passed>=18&&actual.checks.every(c=>c.passed));
check('acceptance_matches_current_archive',actual.asar_sha256===await hash(archive));
const portable=path.join(root,'release/Wayfinder-'+metadata.version+'-Windows-x64.exe');const handle=await fs.open(portable),sig=Buffer.alloc(2);await handle.read(sig,0,2,0);await handle.close();check('portable_is_windows_executable',sig.toString()==='MZ');
const setup=path.join(root,'release/Wayfinder-Setup-'+metadata.version+'-Windows-x64.exe');
const manifest=JSON.parse(await fs.readFile(path.join(resources,'setup/runtime-manifest.json'),'utf8'));
check('pinned_runtime_archive_identity',await hash(path.join(resources,'setup/hermes-source.zip'))===manifest.source_sha256);
check('pinned_runtime_bootstrap_identity',await hash(path.join(resources,'setup/uv.exe'))===manifest.uv_sha256);
const chatManifest=JSON.parse(await fs.readFile(path.join(resources,'setup/opencode-manifest.json'),'utf8'));
check('pinned_opencode_binary_identity',await hash(path.join(resources,'setup/opencode.exe'))===chatManifest.exe_sha256&&chatManifest.version==='1.19.5');
check('dependency_script_matches_source',await hash(path.join(resources,'setup/install-dependencies.ps1'))===await hash(path.join(root,'resources/setup/install-dependencies.ps1')));
check('permissions_and_google_flow_are_main_owned',main.includes('PermissionStore')&&main.includes('ModelKeyStore')&&main.includes('code_challenge_method')&&main.includes('127.0.0.1')&&main.includes('applyCompanionPreferences'));
const themeProvenance=JSON.parse(await fs.readFile(path.join(resources,'themes/vscode/provenance.json'),'utf8'));
check('all_vscode_theme_sources_included',themeProvenance.themeCount===19&&themeProvenance.commit==='2c33b50b16c472efe58357d1d2a8a5414bc23fbf');
for(const file of themeProvenance.files)check('vscode_theme_source_'+file.path,await hash(path.join(resources,'themes/vscode',file.path))===file.sha256);
check('vscode_theme_license_included',(await fs.stat(path.join(resources,'licenses/VSCode-Themes-LICENSE.txt'))).size>1000);
check('appearance_is_main_owned_and_widget_is_read_only',main.includes('AppearanceStore')&&main.includes('appearance:save')&&main.includes('appearance:preview'));
const evidence={build:release.build,checks,passed:checks.length,asar_sha256:await hash(archive),backend_sha256:await hash(backend),portable_sha256:await hash(portable),setup_sha256:await hash(setup),native_desktop_automation:false,google_live:false,actual_packaged_checks:actual.passed};
await fs.writeFile(path.join(root,'test-results/onboarding-build-evidence.json'),JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify(evidence));
