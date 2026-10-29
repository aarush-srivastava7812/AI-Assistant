// Reuse electron-builder's supported archive setting. Its default ultra level
// spends unnecessary CPU on this large bundled Python/model payload.
import {spawn} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {constants,setPriority} from 'node:os';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const child=spawn(process.execPath,[path.join(root,'node_modules/electron-builder/cli.js'),'--win','nsis','portable','--x64','--publish','never'],{
  cwd:root,windowsHide:true,stdio:'inherit',
  env:{...process.env,ELECTRON_BUILDER_COMPRESSION_LEVEL:process.env.ELECTRON_BUILDER_COMPRESSION_LEVEL??'1'},
});
child.on('spawn',()=>{try{setPriority(child.pid,constants.priority.PRIORITY_BELOW_NORMAL);console.log('Packager running at Below Normal priority.');}catch{/* Keep the build usable on hosts without priority control. */}});
child.on('error',error=>{console.error(error.message);process.exitCode=1;});
child.on('exit',code=>{process.exitCode=code??1;});
