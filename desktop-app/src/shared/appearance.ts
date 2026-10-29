import catalog from './vscode-themes.json';

export interface ColorTheme {
 id:string;name:string;kind:'light'|'dark';highContrast:boolean;
 variables:Record<string,string>;
 native:{background:string;captionBackground:string;captionForeground:string};source:string;
}
export const colorThemes=catalog as ColorTheme[];
export interface AppearancePreferences {version:1;mode:'system'|'light'|'dark';lightTheme:string;darkTheme:string}
export interface AppearanceSnapshot extends AppearancePreferences {resolvedTheme:string;configured:boolean}
export interface AppearanceAPI {
 get():Promise<AppearanceSnapshot>;
 save?(patch:Partial<Omit<AppearancePreferences,'version'>>):Promise<AppearanceSnapshot>;
 preview?(id:string|null):Promise<void>;
 onChange(callback:(value:AppearanceSnapshot)=>void):()=>void;
}
export const defaultAppearance=():AppearancePreferences=>({version:1,mode:'system',lightTheme:'vscode-light-modern',darkTheme:'vscode-dark-modern'});
export function themeById(id:string){return colorThemes.find(theme=>theme.id===id);}
export function resolveAppearance(value:AppearancePreferences,systemDark:boolean){return themeById(value[value.mode==='dark'||value.mode==='system'&&systemDark?'darkTheme':'lightTheme'])!;}
export function parseAppearance(value:unknown):AppearancePreferences {
 const v=value as AppearancePreferences;
 if(!v||Object.keys(v).sort().join(',')!=='darkTheme,lightTheme,mode,version'||v.version!==1||!['system','light','dark'].includes(v.mode)||themeById(v.lightTheme)?.kind!=='light'||themeById(v.darkTheme)?.kind!=='dark')throw new Error('Choose a built-in theme for each color scheme.');
 return {version:1,mode:v.mode,lightTheme:v.lightTheme,darkTheme:v.darkTheme};
}
declare global {interface Window {appearanceAPI?:AppearanceAPI}}
