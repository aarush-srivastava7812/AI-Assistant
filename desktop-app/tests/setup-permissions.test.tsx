import React from 'react';
import {it,expect,vi} from 'vitest';
import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {PermissionStore,defaults} from '../src/main/permissions';
import {ModelKeyStore} from '../src/main/model-key-store';
import {SetupOptions} from '../src/renderer/SetupOptions';
it('fails closed by default and persists turning each feature off across restarts',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'wayfinder-permissions-'));
 const store=new PermissionStore(root);expect(await store.load()).toEqual(defaults());
 await store.save({...defaults(),pet:true,widget:true,agents:true});
 await store.save(defaults());expect(await new PermissionStore(root).load()).toEqual(defaults());
 await fs.writeFile(store.file,JSON.stringify({...defaults(),widget:'true'}));expect(await new PermissionStore(root).load()).toEqual(defaults());
 expect(()=>store.save({...defaults(),folders:['relative']})).toThrow();
});
it('keeps the NVIDIA key encrypted and out of public status, with an exact endpoint and models',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'wayfinder-model-key-'));
 const crypto={available:async()=>true,encrypt:async(v:string)=>Buffer.from(v.split('').reverse().join('')),decrypt:async(v:Buffer)=>v.toString().split('').reverse().join('')};
 const store=new ModelKeyStore(root,crypto),key='nvapi-SYNTHETIC_test_secret_1234';
 const status=await store.save({apiKey:key,provider:'nvidia',model:'nvidia/nemotron-3.5-lightning-30b-a3b'});
 expect(JSON.stringify(status)).not.toContain(key);expect((await fs.readFile(store.file)).toString()).not.toContain(key);
 const restored=new ModelKeyStore(root,crypto);await restored.load();
 expect(JSON.parse(restored.environment().WAYFINDER_PRIVATE_MODEL_ROUTE!)).toMatchObject({api_key:key,base_url:'https://integrate.api.nvidia.com/v1'});
 await expect(store.save({apiKey:key,provider:'unknown',model:'unapproved-model'})).rejects.toThrow();
 await expect(new ModelKeyStore(root,{...crypto,available:async()=>false}).save({apiKey:key,provider:'nvidia',model:'nvidia/nemotron-3.5-lightning-30b-a3b'})).rejects.toThrow(/encryption/);
});
it('presents optional choices off and saves explicit opt-in and opt-out independently',async()=>{
 let saved=defaults();const api={setupChoices:vi.fn(async(value?:any)=>{if(value)saved=value;return saved;})} as any;
 render(<SetupOptions api={api} onboarding/>);
 const pet=await screen.findByLabelText('Enable the desktop pet');
 expect((pet as HTMLInputElement).checked).toBe(false);
 fireEvent.click(pet);await waitFor(()=>expect(saved.pet).toBe(true));await waitFor(()=>expect((pet as HTMLInputElement).disabled).toBe(false));
 expect(saved.widget).toBe(false);expect(saved.agents).toBe(false);
 fireEvent.click(pet);await waitFor(()=>expect(saved.pet).toBe(false));
});
