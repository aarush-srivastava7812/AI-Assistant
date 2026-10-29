import React,{useEffect,useRef,useState} from 'react';
import {Check,ChevronRight,Monitor,Search,X} from 'lucide-react';
import {colorThemes,themeById,type ColorTheme} from '../shared/appearance';
import {useAppearance} from './Appearance';

export function ThemePreview({theme,large=false}:{theme:ColorTheme;large?:boolean}){
 return <span className={`theme-preview ${large?'large':''}`} style={theme.variables as React.CSSProperties} aria-hidden="true"><span className="theme-preview-sidebar"><i/><i/><i/><i/></span><span className="theme-preview-content"><span className="theme-preview-toolbar"><i/><i/><i/></span><span className="theme-preview-code"><span><b>const</b> assistant = <em>"Wayfinder"</em>;</span><span className="theme-preview-comment">// A space for your ideas</span><span><b>return</b> a clearer day;</span></span><span className="theme-preview-message">How can I help?</span><span className="theme-preview-composer">Ask anything <strong>↑</strong></span></span></span>;
}
const recommended=['vscode-light-modern','vscode-dark-modern','vscode-default-high-contrast','vscode-default-high-contrast-light'];
export function ThemeChooser({compact=false}:{compact?:boolean}){
 const appearance=useAppearance(),[open,setOpen]=useState(false),[query,setQuery]=useState(''),[filter,setFilter]=useState('all'),[candidate,setCandidate]=useState(appearance.theme.id);
 const dialog=useRef<HTMLDialogElement>(null);
 const close=()=>{appearance.preview(null);setOpen(false);};
 useEffect(()=>{if(open&&!dialog.current?.open)dialog.current?.showModal();if(!open&&dialog.current?.open)dialog.current.close();return()=>{};},[open]);
 useEffect(()=>()=>appearance.preview(null),[]);
 const available=colorThemes.filter(theme=>(filter==='all'||filter==='contrast'&&theme.highContrast||filter===theme.kind&&!theme.highContrast)&&theme.name.toLowerCase().includes(query.toLowerCase()));
 function preview(id:string){setCandidate(id);appearance.preview(id);}
 async function apply(id:string){if(await appearance.choose(id))close();}
 function openGallery(){setQuery('');setFilter('all');setCandidate(appearance.theme.id);setOpen(true);}
 function arrow(event:React.KeyboardEvent){if(!['ArrowDown','ArrowUp','ArrowLeft','ArrowRight'].includes(event.key))return;event.preventDefault();const choices=Array.from(dialog.current!.querySelectorAll<HTMLButtonElement>('[data-theme-option]'));if(!choices.length)return;const active=choices.indexOf(document.activeElement as HTMLButtonElement),direction=['ArrowUp','ArrowLeft'].includes(event.key)?-1:1;choices[(active+direction+choices.length)%choices.length].focus();}
 return <div className={`theme-chooser ${compact?'compact':''}`}>
  <div className="appearance-mode-row"><div><h3>{compact?'Choose your look':'Color scheme'}</h3><p>{compact?'Make this space feel like yours. You can change it any time.':'Match your system, or keep a light or dark appearance.'}</p></div><div className="appearance-modes" role="group" aria-label="Color scheme">{(['system','light','dark'] as const).map(mode=><button type="button" key={mode} aria-pressed={appearance.preferences.mode===mode} disabled={appearance.busy} onClick={()=>void appearance.update({mode})}>{mode==='system'&&<Monitor size={14}/ >}{mode[0].toUpperCase()+mode.slice(1)}</button>)}</div></div>
  {compact?<div className="theme-quick-grid" aria-label="Suggested themes">{recommended.map(id=>{const theme=themeById(id)!;return <button type="button" key={id} className="theme-card" disabled={appearance.busy} aria-pressed={appearance.theme.id===id} onClick={()=>void appearance.choose(id)}><ThemePreview theme={theme}/><span>{theme.name}{appearance.theme.id===id&&<Check size={15}/>}</span></button>;})}</div>:<>
   <div className="theme-current-preview"><ThemePreview theme={appearance.theme} large/><div><strong>{appearance.theme.name}</strong><p>{appearance.preferences.mode==='system'?'Following your system appearance':appearance.theme.highContrast?'High contrast color theme':appearance.theme.kind==='dark'?'Dark color theme':'Light color theme'}</p><button type="button" onClick={openGallery}>Change color theme<ChevronRight size={14}/></button></div></div>
   <div className="preferred-theme-grid">{(['light','dark'] as const).map(kind=><label key={kind}>{kind==='light'?'Preferred light theme':'Preferred dark theme'}<select aria-label={`Preferred ${kind} theme`} value={appearance.preferences[kind==='light'?'lightTheme':'darkTheme']} disabled={appearance.busy} onChange={e=>void appearance.update({[kind==='light'?'lightTheme':'darkTheme']:e.target.value})}>{colorThemes.filter(theme=>theme.kind===kind).map(theme=><option key={theme.id} value={theme.id}>{theme.name}</option>)}</select></label>)}</div>
  </>}
  {compact&&<button type="button" className="text-button" onClick={openGallery}>Browse all 19 built-in themes<ChevronRight size={14}/></button>}
  <p className="theme-attribution">Built-in Visual Studio Code color palettes · saved on this device.</p>
  {appearance.error&&!open&&<p className="message error" role="alert">{appearance.error}</p>}
  <dialog className="theme-dialog" ref={dialog} aria-labelledby="theme-picker-title" onCancel={event=>{event.preventDefault();close();}} onClose={close} onClick={event=>{if(event.target===event.currentTarget)close();}} onKeyDown={arrow}>
   <div className="theme-dialog-heading"><div><h2 id="theme-picker-title">Color theme</h2><p>Preview a theme, then apply it. Escape restores your saved theme.</p></div><button type="button" className="icon-button" aria-label="Close theme picker" onClick={close}><X size={18}/></button></div>
   <label className="theme-search"><Search size={16}/><input autoFocus aria-label="Search color themes" value={query} placeholder="Search themes" onChange={e=>setQuery(e.target.value)}/></label>
   <div className="theme-filters" role="group" aria-label="Filter themes">{[['all','All'],['light','Light'],['dark','Dark'],['contrast','High contrast']].map(([id,label])=><button type="button" key={id} aria-pressed={filter===id} onClick={()=>setFilter(id)}>{label}</button>)}</div>
   <div className="theme-gallery" role="listbox" aria-label="Built-in color themes">{available.map(theme=><button type="button" role="option" aria-selected={candidate===theme.id} aria-label={theme.name} data-theme-option={theme.id} className="theme-card" key={theme.id} disabled={appearance.busy} onFocus={()=>preview(theme.id)} onMouseEnter={()=>preview(theme.id)} onClick={()=>void apply(theme.id)}><ThemePreview theme={theme}/><span>{theme.name}{candidate===theme.id&&<Check size={15}/>}</span></button>)}</div>
   {!available.length&&<p className="theme-no-results">No themes match your search.</p>}
   <div className="theme-dialog-footer"><span>{available.length} built-in themes</span><button type="button" onClick={close}>Cancel preview</button><button type="button" className="primary" disabled={appearance.busy||!available.some(theme=>theme.id===candidate)} onClick={()=>void apply(candidate)}>Apply theme</button></div>
   {appearance.error&&<p role="alert" className="message error">{appearance.error}</p>}
  </dialog>
 </div>;
}
