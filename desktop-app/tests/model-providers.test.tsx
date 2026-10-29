import React from 'react';
import {it,expect,vi} from 'vitest';
import {render,screen,fireEvent,waitFor,act} from '@testing-library/react';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {ModelKeyStore} from '../src/main/model-key-store';
import {providers,validModelPin} from '../src/shared/model-providers';
import {ModelConnection} from '../src/renderer/ModelConnection';
const crypto={available:async()=>true,encrypt:async(v:string)=>Buffer.from(v.split('').reverse().join('')),decrypt:async(v:Buffer)=>v.toString().split('').reverse().join('')};
it.each(providers.filter(p=>p.base_url))('stores and restores $name without exposing its key',async provider=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'wayfinder-provider-'));
 try{
  const store=new ModelKeyStore(root,crypto),key='SYNTHETIC-provider-key-1234';
  await store.save({provider:provider.id,model:provider.models[0],apiKey:key});
  const copy=new ModelKeyStore(root,crypto);await copy.load();
  expect(JSON.stringify(copy.status())).not.toContain(key);
  const route=JSON.parse(copy.environment().WAYFINDER_PRIVATE_MODEL_ROUTE!);
  expect(route).toMatchObject({provider:provider.id,base_url:provider.base_url,api_mode:provider.api_mode,api_key:key});
  expect(validModelPin({provider:route.provider,model:route.model,endpoint:new URL(route.base_url).hostname})).toBe(true);
  await copy.save({provider:provider.id,model:'another-valid-model'});
  expect(JSON.parse(copy.environment().WAYFINDER_PRIVATE_MODEL_ROUTE!).api_key).toBe(key);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
it('migrates the previous NVIDIA key without changing its consent pin',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'wayfinder-old-key-'));
 try{const store=new ModelKeyStore(root,crypto);await fs.writeFile(store.file,await crypto.encrypt(JSON.stringify({model:'nvidia/nemotron-3.5-lightning-30b-a3b',api_key:'nvapi-SYNTHETIC-previous-key'})));await store.load();expect(store.status()).toMatchObject({configured:true,provider:'nvidia'});expect(JSON.parse(store.environment().WAYFINDER_PRIVATE_MODEL_ROUTE!).provider).toBe('custom');}finally{await fs.rm(root,{recursive:true,force:true});}
});
it('binds custom keys to the exact endpoint and rejects unsafe URLs',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'wayfinder-custom-key-'));
 try{const store=new ModelKeyStore(root,crypto);
  await store.save({provider:'openai-compatible',endpoint:'https://example.com/v1',model:'my-model',apiKey:'SYNTHETIC-custom-key'});
  await expect(store.save({provider:'openai-compatible',endpoint:'https://another.example/v1',model:'my-model'})).rejects.toThrow(/key/);
  for(const endpoint of ['http://example.com/v1','https://user:secret@example.com/v1','https://example.com/v1?key=secret','https://example.com/{env:KEY}'])await expect(store.save({provider:'openai-compatible',endpoint,model:'my-model',apiKey:'SYNTHETIC-key'})).rejects.toThrow();
  expect(validModelPin({provider:'openai-compatible',model:'my-model',endpoint:'https://example.com/v1'})).toBe(true);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
it('searches providers, asks for the selected key, and clears it before verification',async()=>{
 const api={setupStatus:vi.fn(async()=>({})),setupHelp:vi.fn()} as any,onConnect=vi.fn(async()=>{}),onEdit=vi.fn();
 await act(async()=>{render(<ModelConnection api={api} busy={false} verified={false} onConnect={onConnect} onEdit={onEdit}/>);});
 fireEvent.change(screen.getByLabelText('Search AI providers'),{target:{value:'Gemini'}});
 expect(screen.queryByRole('button',{name:/Connect OpenAI/})).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:/Connect Google Gemini/}));
 const input=screen.getByLabelText('Google Gemini API key') as HTMLInputElement;
 fireEvent.change(input,{target:{value:'SYNTHETIC-google-key'}});
 fireEvent.click(screen.getByRole('button',{name:'Show API key'}));expect(input.type).toBe('text');
 fireEvent.click(screen.getByRole('button',{name:'Connect and verify'}));
 await waitFor(()=>expect(onConnect).toHaveBeenCalledWith(expect.objectContaining({provider:'google',apiKey:'SYNTHETIC-google-key'})));
 expect(input.value).toBe('');expect(input.type).toBe('password');expect(onEdit).toHaveBeenCalled();
});
