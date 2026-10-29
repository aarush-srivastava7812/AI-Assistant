import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url),JSON5=require('json5');
const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=path.resolve(process.argv[2]||'');
const commit=process.argv[3],version=process.argv[4];
if(!/^[a-f0-9]{40}$/.test(commit||'')||!version)throw new Error('Use the pinned VS Code source root, commit and version.');
const files=new Map();
function load(file,seen=new Set()){
 const target=path.resolve(file);if(!target.startsWith(source+path.sep)||seen.has(target))throw new Error('Invalid theme inheritance.');
 seen.add(target);const raw=fs.readFileSync(target);files.set(path.relative(source,target).replaceAll('\\','/'),raw);
 const theme=JSON5.parse(raw.toString('utf8')),parent=theme.include?load(path.resolve(path.dirname(target),theme.include),seen):{colors:{},tokenColors:[]};
 return {colors:{...parent.colors,...theme.colors},tokenColors:[...(parent.tokenColors||[]),...(Array.isArray(theme.tokenColors)?theme.tokenColors:[])]};
}
const valid=color=>typeof color==='string'&&/^#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i.test(color);
function solid(color,fallback){if(!valid(color))return fallback;let hex=color.slice(1);if(hex.length<5)hex=[...hex].map(c=>c+c).join('');if(hex.length===6)return '#'+hex;const alpha=parseInt(hex.slice(6),16)/255;return '#'+[0,2,4].map(i=>Math.round(parseInt(hex.slice(i,i+2),16)*alpha+parseInt(fallback.slice(i+1,i+3),16)*(1-alpha)).toString(16).padStart(2,'0')).join('');}
function contrast(a,b){const l=x=>{const c=x.slice(1).match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722;};const x=l(a),y=l(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
const themes=[];
for(const directory of fs.readdirSync(path.join(source,'extensions')).filter(n=>n.startsWith('theme-'))){
 const base=path.join(source,'extensions',directory),meta=JSON.parse(fs.readFileSync(path.join(base,'package.json'),'utf8')),nls=JSON.parse(fs.readFileSync(path.join(base,'package.nls.json'),'utf8'));
 for(const declaration of meta.contributes?.themes||[]){
  const file=path.resolve(base,declaration.path),resolved=load(file),c=resolved.colors;
  const dark=['vs-dark','hc-black'].includes(declaration.uiTheme),hc=declaration.uiTheme.startsWith('hc-'),fallback=dark?'#1e1e1e':'#ffffff';
  const color=(key,alt)=>solid(c[key],alt);
  const surface=color('editor.background',fallback),text=color('foreground',color('editor.foreground',hc?(dark?'#ffffff':'#292929'):dark?'#cccccc':'#616161'));
  const mutedCandidate=color('descriptionForeground',dark?'#a8a8a8':'#616161'),muted=contrast(mutedCandidate,surface)>=4.5?mutedCandidate:text;
  const low=color('sideBar.background',hc?surface:dark?'#252526':'#f3f3f3'),panel=color('editorWidget.background',low),line=color('contrastBorder',color('widget.border',color('input.border',hc?(dark?'#6fc3df':'#0f4a85'):dark?'#454545':'#cecece')));
  const primary=color('button.background',hc?(dark?'#0e639c':'#0f4a85'):dark?'#0e639c':'#007acc');
  const foreground=color('button.foreground','#ffffff'),focus=color('focusBorder',hc?(dark?'#f38518':'#006bbd'):dark?'#007fd4':'#0090f1');
  const success=color('testing.iconPassed',color('gitDecoration.addedResourceForeground',dark?'#89d185':'#388a34')),error=color('errorForeground',dark?'#f48771':'#a1260d'),attention=color('editorWarning.foreground',dark?'#cca700':'#855500');
  const keyword=[...resolved.tokenColors].reverse().find(t=>String(t.scope).includes('keyword')&&valid(t.settings?.foreground))?.settings.foreground||primary;
  const string=[...resolved.tokenColors].reverse().find(t=>String(t.scope).includes('string')&&valid(t.settings?.foreground))?.settings.foreground||success;
  const comment=[...resolved.tokenColors].reverse().find(t=>String(t.scope).includes('comment')&&valid(t.settings?.foreground))?.settings.foreground||muted;
  const variables={'--surface':surface,'--bg':surface,'--panel':panel,'--panel-low':low,'--panel-high':color('list.hoverBackground',hc?surface:dark?'#2a2d2e':'#e8e8e8'),'--text':text,'--muted':muted,'--line':line,'--primary':primary,'--accent':primary,'--accent-solid':primary,'--accent-text':foreground,'--knowledge':text,'--agent':text,'--green':success,'--success':success,'--success-bg':'color-mix(in srgb, '+success+' 12%, '+surface+')','--attention':attention,'--attention-bg':'color-mix(in srgb, '+attention+' 12%, '+surface+')','--error':error,'--error-bg':'color-mix(in srgb, '+error+' 12%, '+surface+')','--focus':focus,'--shadow':dark?'#00000040':'#00000012','--input-bg':color('input.background',hc?surface:dark?'#3c3c3c':'#ffffff'),'--input-text':color('input.foreground',text),'--titlebar-bg':color('titleBar.activeBackground',low),'--titlebar-text':color('titleBar.activeForeground',text),'--code-bg':color('textCodeBlock.background',panel),'--code-text':color('editor.foreground',text),'--syntax-keyword':keyword,'--syntax-string':string,'--syntax-comment':comment,'--contrast-border':hc?line:'transparent'};
  const name=declaration.label.startsWith('%')?nls[declaration.label.slice(1,-1)]:declaration.label;
  themes.push({id:'vscode-'+declaration.id.toLowerCase().replace(/\+/g,'-plus').replace(/[^a-z0-9]+/g,'-').replace(/-$/,''),name,kind:dark?'dark':'light',highContrast:hc,variables,native:{background:surface,captionBackground:variables['--titlebar-bg'],captionForeground:variables['--titlebar-text']},source:path.relative(source,file).replaceAll('\\','/')});
 }
}
if(themes.length!==19)throw new Error('Expected 19 pinned built-in color themes.');
const destination=path.join(app,'resources/themes/vscode');fs.mkdirSync(destination,{recursive:true});
for(const [relative,raw]of files){const dest=path.join(destination,relative);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,raw);}
fs.copyFileSync(path.join(source,'LICENSE.txt'),path.join(app,'resources/licenses/VSCode-Themes-LICENSE.txt'));
const provenance={project:'microsoft/vscode',version,commit,license:'MIT',themeCount:themes.length,files:[...files].map(([file,raw])=>({path:file,bytes:raw.length,sha256:crypto.createHash('sha256').update(raw).digest('hex')})),mapping:'Wayfinder semantic surfaces map to resolved VS Code workbench colors. Missing values use VS Code light/dark defaults. Muted text uses the theme foreground when its description color has insufficient contrast on the app surface.'};
fs.writeFileSync(path.join(destination,'provenance.json'),JSON.stringify(provenance,null,2)+'\n');
fs.writeFileSync(path.join(app,'src/shared/vscode-themes.json'),JSON.stringify(themes,null,2)+'\n');
console.log(JSON.stringify({themes:themes.length,inheritedSourceFiles:files.size,version,commit}));
