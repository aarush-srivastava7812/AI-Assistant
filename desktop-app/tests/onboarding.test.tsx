import React from 'react';
import {it,expect,vi,afterEach} from 'vitest';
import {render,screen,fireEvent,waitFor,act} from '@testing-library/react';
import {Onboarding} from '../src/renderer/Onboarding';
import {localDocker,validModel,SetupManager,DATABASE_IMAGE_ID} from '../src/main/setup';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
afterEach(()=>vi.useRealTimers());
it('accepts only local engines and exact public provider fields',()=>{
  expect(localDocker('npipe:////./pipe/dockerDesktopLinuxEngine')).toBe(true);
  for(const v of ['tcp://example.com:2375','ssh://server','npipe:////x/pipe/test'])expect(localDocker(v)).toBe(false);
  expect(validModel({model:'nvidia/nemotron-3.5-lightning-30b-a3b',provider:'custom',endpoint:'integrate.api.nvidia.com'})).toBe(true);
  expect(validModel({model:'nvidia/nemotron-3.5-lightning-30b-a3b',provider:'custom',endpoint:'integrate.api.nvidia.com',token:'secret'})).toBe(false);
});
it('fresh onboarding cannot finish without actual checks and consent',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'wayfinder-setup-unit-'));
  const setup=new SetupManager(root,path.join(root,'runtime'),'project','absent-backend','models',{} as any,vi.fn());
  await setup.load();expect(setup.ready()).toBe(false);
  expect((await setup.connect()).state).toBe('setup');
  await expect(setup.finish('Personal',true)).rejects.toThrow(/Complete/);
  await expect(setup.finish('Personal',false)).rejects.toThrow(/explicitly/);
});
it('rejects foreign Docker volume without starting or replacing it',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'wayfinder-setup-owner-'));
  const run=vi.fn(async(_file:string,args:string[])=>{
    if(args.join(' ')==='context show')return 'desktop-linux';
    if(args[0]==='context')return JSON.stringify([{Endpoints:{docker:{Host:'npipe:////./pipe/dockerDesktopLinuxEngine'}}}]);
    if(args.includes('version'))return JSON.stringify({Os:'linux'});
    if(args.includes('image'))return DATABASE_IMAGE_ID;
    if(args.includes('volume'))return JSON.stringify([{Labels:{'wayfinder.workspace':'foreign'}}]);
    throw new Error('Unexpected Docker operation');
  });
  const setup=new SetupManager(root,path.join(root,'runtime'),'project','exe','models',{} as any,run);
  await expect(setup.database(false)).rejects.toThrow(/not owned/);
  expect(run.mock.calls.some(([,args])=>args.includes('start')||args.includes('create')||args.includes('rm'))).toBe(false);
});
it('explains disclosure and leaves finish disabled for a new user',async()=>{
  const api={setupChoices:vi.fn(async()=>({version:1,pet:false,widget:false,agents:false,folders:[]})),setupDependencies:vi.fn(async()=>({})),setupStatus:vi.fn(async()=>({storage:'isolated workspace'}))} as any;
  render(<Onboarding api={api} done={vi.fn()}/>);
  await waitFor(()=>expect(api.setupStatus).toHaveBeenCalled());
  expect((screen.getByRole('button',{name:'Continue'}) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button',{name:/STEP 3/}));
  expect((screen.getByRole('button',{name:/Create workspace and open Wayfinder/}) as HTMLButtonElement).disabled).toBe(true);

  expect(screen.getByLabelText(/I agree to send/)).toBeTruthy();
});

it('expires model consent while setup stays open and does not finish implicitly',async()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-27T00:00:00Z'));
  const api={setupChoices:vi.fn(async()=>({version:1,pet:false,widget:false,agents:false,folders:[]})),setupDependencies:vi.fn(async()=>({})),setupStatus:vi.fn(async()=>({databaseReady:true,memoryReady:true,modelReady:true,modelExpiresAt:Date.now()+5000,model:{model:'approved',provider:'custom',endpoint:'inference.local'}})),setupFinish:vi.fn()} as any;
  await act(async()=>{render(<Onboarding api={api} done={vi.fn()}/>);});
  const finish=screen.getByRole('button',{name:/Create workspace and open Wayfinder/}) as HTMLButtonElement;
  fireEvent.click(screen.getByRole('checkbox',{name:/I agree to send/}));expect(finish.disabled).toBe(false);
  await act(async()=>{vi.advanceTimersByTime(5001);});expect(finish.disabled).toBe(true);
  expect((screen.getByRole('checkbox',{name:/I agree to send/}) as HTMLInputElement).checked).toBe(false);
  expect(api.setupFinish).not.toHaveBeenCalled();
});

it('resumes public setup hints but never restores readiness or consent',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'wayfinder-setup-resume-'));
  const model={model:'nvidia/nemotron-3.5-lightning-30b-a3b',provider:'custom',endpoint:'integrate.api.nvidia.com'};
  await fs.writeFile(path.join(root,'setup-progress.json'),JSON.stringify({version:1,context:'desktop-linux',workspaceName:'Draft workspace',model}));
  const setup=new SetupManager(root,path.join(root,'runtime'),'project','absent-backend','models',{} as any,vi.fn());await setup.load();
  expect(setup.status()).toMatchObject({resuming:true,modelReady:false,databaseReady:false,memoryReady:false,workspaceName:'Draft workspace',model});
  await expect(setup.finish('Draft workspace',true)).rejects.toThrow(/Complete/);
});
it('refuses readiness and secret fields injected into saved setup progress',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'wayfinder-setup-resume-invalid-'));
  await fs.writeFile(path.join(root,'setup-progress.json'),JSON.stringify({version:1,modelReady:true,token:'SYNTHETIC_SECRET'}));
  const setup=new SetupManager(root,path.join(root,'runtime'),'project','absent-backend','models',{} as any,vi.fn());await setup.load();
  expect(setup.status().modelReady).toBe(false);expect(setup.status().resuming).toBe(false);expect(setup.status().error).toContain('Recheck');
});

it('does not fall back to a managed credential when a user key is missing after restart',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'wayfinder-missing-key-'));
 await fs.writeFile(path.join(root,'onboarding.json'),JSON.stringify({version:1,complete:true,context:'desktop-linux',model:{model:'nvidia/nemotron-3.5-lightning-30b-a3b',provider:'custom',endpoint:'integrate.api.nvidia.com'},workspace:'owned',workspaceName:'Personal',modelSource:'user-key'}));
 const run=vi.fn(),bridge={state:{state:'offline'}} as any;
 const setup=new SetupManager(root,path.join(root,'runtime'),'project','exe','models',bridge,run);await setup.load();
 expect(setup.ready()).toBe(true);expect(await setup.connect()).toMatchObject({state:'setup',error:expect.stringContaining('provider key is unavailable')});expect(run).not.toHaveBeenCalled();expect(setup.ready()).toBe(false);
});
