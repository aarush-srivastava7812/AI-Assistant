import React from 'react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {act,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {AppearanceStore} from '../src/main/appearance-store';
import {colorThemes,defaultAppearance,parseAppearance,resolveAppearance,type AppearanceSnapshot} from '../src/shared/appearance';
import {AppearanceProvider} from '../src/renderer/Appearance';
import {ThemeChooser} from '../src/renderer/ThemeChooser';

const roots:string[]=[];
beforeEach(()=>{localStorage.clear();delete window.appearanceAPI;});
afterEach(async()=>{delete window.appearanceAPI;vi.restoreAllMocks();for(const root of roots.splice(0))await fs.rm(root,{recursive:true,force:true});});
async function store(){const root=await fs.mkdtemp(path.join(os.tmpdir(),'wayfinder-appearance-'));roots.push(root);return new AppearanceStore(root);}
function bridge(){let saved=defaultAppearance(),dark=false,listener:((value:AppearanceSnapshot)=>void)|undefined;
 const snapshot=():AppearanceSnapshot=>({...saved,configured:true,resolvedTheme:resolveAppearance(saved,dark).id});
 const api={get:vi.fn(async()=>snapshot()),save:vi.fn(async(patch:any)=>{saved=parseAppearance({...saved,...patch});return snapshot();}),preview:vi.fn(async()=>{}),onChange:vi.fn((callback:(value:AppearanceSnapshot)=>void)=>{listener=callback;return()=>{listener=undefined;};})};
 window.appearanceAPI=api;
 return {api,system(value:boolean){dark=value;listener?.(snapshot());}};
}
async function chooser(){const fake=bridge();await act(async()=>{render(<AppearanceProvider><ThemeChooser/></AppearanceProvider>);});await waitFor(()=>expect((screen.getByLabelText('Preferred light theme') as HTMLSelectElement).disabled).toBe(false));return fake;}
it('resolves all 19 built-in palettes and follows the system only in system mode',()=>{
 expect(colorThemes).toHaveLength(19);expect(new Set(colorThemes.map(t=>t.id)).size).toBe(19);
 for(const name of ['Light 2026','Dark 2026','Dark+','Light+','Monokai','Solarized Dark','Solarized Light','Dark High Contrast','Light High Contrast'])expect(colorThemes.some(t=>t.name===name)).toBe(true);
 for(const theme of colorThemes){expect(theme.native.background).toMatch(/^#[a-f0-9]{6}$/i);expect(theme.variables['--surface']).toBe(theme.native.background);expect(theme.variables['--text']).toMatch(/^#[a-f0-9]{6}$/i);}
 const value=defaultAppearance();expect(resolveAppearance(value,false).kind).toBe('light');expect(resolveAppearance(value,true).kind).toBe('dark');expect(resolveAppearance({...value,mode:'light'},true).kind).toBe('light');
});
it('persists preferences atomically and merges independent queued changes',async()=>{
 const first=await store();await first.load();expect(first.current(false)).toMatchObject({configured:false,mode:'system'});
 await Promise.all([first.save({mode:'light'}),first.save({lightTheme:'vscode-quiet-light'})]);
 const next=new AppearanceStore(path.dirname(first.file));await next.load();expect(next.current(true)).toMatchObject({configured:true,mode:'light',lightTheme:'vscode-quiet-light',resolvedTheme:'vscode-quiet-light'});
 const bytes=await fs.readFile(first.file,'utf8');
 for(const patch of [{mode:'unknown'},{darkTheme:'vscode-light-modern'},{lightTheme:'../../other'},{path:'other'}])await expect(first.save(patch)).rejects.toThrow();
 expect(await fs.readFile(first.file,'utf8')).toBe(bytes);
});
it('preserves the saved preference when a filesystem write cannot be committed',async()=>{
 const value=await store();await value.save({mode:'light'});const original=await fs.readFile(value.file,'utf8');
 vi.spyOn(fs,'rename').mockRejectedValueOnce(new Error('synthetic filesystem failure'));
 await expect(value.save({mode:'dark'})).rejects.toThrow();expect(value.current(true).mode).toBe('light');expect(await fs.readFile(value.file,'utf8')).toBe(original);
 expect((await fs.readdir(path.dirname(value.file))).filter(file=>file.endsWith('.tmp'))).toEqual([]);
});
it('previews without saving and restores the committed palette on cancel',async()=>{
 const {api}=await chooser();fireEvent.click(screen.getByRole('button',{name:'Change color theme'}));
 const picker=screen.getByRole('dialog',{name:'Color theme'}),abyss=within(picker).getByRole('option',{name:'Abyss'});
 fireEvent.focus(abyss);expect(document.documentElement.dataset.colorTheme).toBe('vscode-abyss');expect(api.save).not.toHaveBeenCalled();
 fireEvent.click(within(picker).getByRole('button',{name:'Cancel preview'}));await waitFor(()=>expect(document.documentElement.dataset.colorTheme).toBe('vscode-light-modern'));expect(api.save).not.toHaveBeenCalled();
});
it('searches built-in themes and commits a selected palette',async()=>{
 const {api}=await chooser();fireEvent.click(screen.getByRole('button',{name:'Change color theme'}));
 const picker=screen.getByRole('dialog',{name:'Color theme'});fireEvent.change(within(picker).getByLabelText('Search color themes'),{target:{value:'Solarized'}});
 expect(within(picker).getAllByRole('option')).toHaveLength(2);
 fireEvent.click(within(picker).getByRole('option',{name:'Solarized Dark'}));
 await waitFor(()=>expect(api.save).toHaveBeenCalledWith({mode:'dark',darkTheme:'vscode-solarized-dark'}));
 expect(document.documentElement.dataset.colorTheme).toBe('vscode-solarized-dark');expect(document.documentElement.style.getPropertyValue('--surface').toLowerCase()).toBe('#002b36');
});
it('restores the previous theme and reports a failed save',async()=>{
 const {api}=await chooser();api.save.mockRejectedValueOnce(new Error('synthetic save failure'));fireEvent.click(screen.getByRole('button',{name:'Change color theme'}));
 const picker=screen.getByRole('dialog',{name:'Color theme'});fireEvent.focus(within(picker).getByRole('option',{name:'Abyss'}));fireEvent.click(within(picker).getByRole('button',{name:'Apply theme'}));
 await screen.findByRole('alert');expect(document.documentElement.dataset.colorTheme).toBe('vscode-light-modern');
});
it('responds to system changes without rewriting preferences',async()=>{
 const fake=await chooser();await act(async()=>fake.system(true));expect(document.documentElement.dataset.colorTheme).toBe('vscode-dark-modern');expect(fake.api.save).not.toHaveBeenCalled();
});
it('shows four onboarding previews and a path to all themes',async()=>{
 bridge();await act(async()=>{render(<AppearanceProvider><ThemeChooser compact/></AppearanceProvider>);});
 expect(screen.getByLabelText('Suggested themes').querySelectorAll('button')).toHaveLength(4);expect(screen.getByRole('button',{name:/Browse all 19/})).toBeTruthy();
});
it('ignores a superseded initialization response after a theme is saved',async()=>{
 const fake=bridge();let oldResponse!:(value:AppearanceSnapshot)=>void;
 const original={...defaultAppearance(),configured:true,resolvedTheme:'vscode-light-modern'};
 fake.api.get.mockImplementationOnce(()=>new Promise(resolve=>{oldResponse=resolve;}));
 await act(async()=>{render(<React.StrictMode><AppearanceProvider><ThemeChooser compact/></AppearanceProvider></React.StrictMode>);});
 const dark=screen.getByRole('button',{name:'Dark Modern'});await waitFor(()=>expect((dark as HTMLButtonElement).disabled).toBe(false));fireEvent.click(dark);
 await waitFor(()=>expect(document.documentElement.dataset.colorTheme).toBe('vscode-dark-modern'));
 await act(async()=>oldResponse(original));expect(document.documentElement.dataset.colorTheme).toBe('vscode-dark-modern');
});
it('uses the registered contrast defaults when a high-contrast theme omits them',()=>{
 const dark=colorThemes.find(theme=>theme.name==='Dark High Contrast')!,light=colorThemes.find(theme=>theme.name==='Light High Contrast')!;
 expect(dark.variables['--line'].toLowerCase()).toBe('#6fc3df');expect(light.variables['--line'].toLowerCase()).toBe('#0f4a85');
 expect(dark.variables['--input-bg'].toLowerCase()).toBe('#000000');expect(light.variables['--input-bg'].toLowerCase()).toBe('#ffffff');
});
