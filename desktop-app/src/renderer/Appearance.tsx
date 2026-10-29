import React,{createContext,useContext,useEffect,useLayoutEffect,useRef,useState} from 'react';
import {defaultAppearance,resolveAppearance,themeById,type AppearancePreferences,type AppearanceSnapshot,type ColorTheme} from '../shared/appearance';

const systemDark=()=>typeof window.matchMedia==='function'&&window.matchMedia('(prefers-color-scheme: dark)').matches;
function initial():AppearanceSnapshot{const value=defaultAppearance();return {...value,configured:false,resolvedTheme:resolveAppearance(value,systemDark()).id};}
type Patch=Partial<Omit<AppearancePreferences,'version'>>;
interface AppearanceContext {preferences:AppearanceSnapshot;theme:ColorTheme;busy:boolean;error:string;update:(patch:Patch)=>Promise<boolean>;choose:(id:string)=>Promise<boolean>;preview:(id:string|null)=>void}
const fallback=initial();
const Context=createContext<AppearanceContext>({preferences:fallback,theme:themeById(fallback.resolvedTheme)!,busy:false,error:'',update:async()=>false,choose:async()=>false,preview:()=>{}});
export function applyColorTheme(theme:ColorTheme){const root=document.documentElement;root.dataset.colorTheme=theme.id;root.dataset.theme=theme.kind;root.style.colorScheme=theme.kind;for(const [name,value] of Object.entries(theme.variables))root.style.setProperty(name,value);}
export function AppearanceProvider({children}:{children:React.ReactNode}){
 const [preferences,setPreferences]=useState(initial),[previewId,setPreview]=useState<string|null>(null),[busy,setBusy]=useState(true),[error,setError]=useState('');
 const value=useRef(preferences),alive=useRef(true),pending=useRef(false);
 const theme=themeById(previewId||preferences.resolvedTheme)||themeById(defaultAppearance().lightTheme)!;
 useLayoutEffect(()=>{applyColorTheme(theme);void window.appearanceAPI?.preview?.(previewId).catch(()=>{});},[theme,previewId]);
 useEffect(()=>{let live=true;alive.current=true;const api=window.appearanceAPI;
  const receive=(next:AppearanceSnapshot)=>{if(!live)return;value.current=next;setPreferences(next);};
  const unsubscribe=api?.onChange(receive);
  void (async()=>{try{let next=api?await api.get():initial();if(!live)return;
   let legacy:string|null=null;try{if(!next.configured)legacy=localStorage.getItem('wayfinder-theme');}catch{/* Main-owned preferences work without localStorage. */}
   if(!next.configured&&(legacy==='light'||legacy==='dark')){const patch={mode:legacy as 'light'|'dark'};next=api?.save?await api.save(patch):{...next,...patch,resolvedTheme:resolveAppearance({...next,...patch},systemDark()).id};try{localStorage.removeItem('wayfinder-theme');}catch{/* Preference migration already completed. */}}
   receive(next);
  }catch{if(live)setError('Appearance preferences could not be loaded. Default colors are shown.');}finally{if(live)setBusy(false);}})();
  const media=typeof window.matchMedia==='function'?window.matchMedia('(prefers-color-scheme: dark)'):null;
  const change=()=>{if(api)return;const next={...value.current,resolvedTheme:resolveAppearance(value.current,systemDark()).id};receive(next);};
  media?.addEventListener('change',change);
  return()=>{live=false;alive.current=false;unsubscribe?.();media?.removeEventListener('change',change);};
 },[]);
 async function update(patch:Patch){if(pending.current)return false;pending.current=true;setBusy(true);setError('');
  try{const next=window.appearanceAPI?.save?await window.appearanceAPI.save(patch):{...value.current,...patch,configured:true,resolvedTheme:resolveAppearance({...value.current,...patch},systemDark()).id};if(alive.current){value.current=next;setPreferences(next);setPreview(null);}return true;}
  catch{if(alive.current){setError('Your theme could not be saved. The previous appearance has been restored.');setPreview(null);}return false;}
  finally{pending.current=false;if(alive.current)setBusy(false);}
 }
 const choose=async(id:string)=>{const selected=themeById(id);return selected?update({mode:selected.kind,[selected.kind==='light'?'lightTheme':'darkTheme']:id}):false;};
 return <Context.Provider value={{preferences,theme,busy,error,update,choose,preview:setPreview}}>{children}</Context.Provider>;
}
export const useAppearance=()=>useContext(Context);
