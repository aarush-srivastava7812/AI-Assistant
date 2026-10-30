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
it('offers a way forward from step 3 without bypassing the required local checks',async()=>{
  const api={setupChoices:vi.fn(async()=>({version:1,pet:false,widget:false,agents:false,folders:[]})),setupDependencies:vi.fn(async()=>({})),setupStatus:vi.fn(async()=>({storage:'isolated workspace'}))} as any;
  render(<Onboarding api={api} done={vi.fn()}/>);
  await waitFor(()=>expect(api.setupStatus).toHaveBeenCalled());
  expect((screen.getByRole('button',{name:'Continue'}) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button',{name:/STEP 3/}));
  const forward=screen.getByRole('button',{name:'Continue setup'}) as HTMLButtonElement;
  expect(forward.disabled).toBe(false);
  fireEvent.click(forward);
  expect(screen.getByRole('heading',{name:'Start with a private foundation.'})).toBeTruthy();
});

it('expires model consent while setup stays open and does not finish implicitly',async()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-27T00:00:00Z'));
  const api={setupChoices:vi.fn(async()=>({version:1,pet:false,widget:false,agents:false,folders:[]})),setupDependencies:vi.fn(async()=>({})),setupStatus:vi.fn(async()=>({databaseReady:true,memoryReady:true,modelReady:true,modelExpiresAt:Date.now()+5000,model:{model:'approved',provider:'custom',endpoint:'inference.local'}})),setupFinish:vi.fn()} as any;
  await act(async()=>{render(<Onboarding api={api} done={vi.fn()}/>);});
  fireEvent.click(screen.getByRole('button',{name:'Agree and continue'}));
  expect((screen.getByRole('button',{name:'Open Wayfinder'}) as HTMLButtonElement).disabled).toBe(false);
  await act(async()=>{vi.advanceTimersByTime(5001);});
  fireEvent.click(screen.getByRole('button',{name:'Continue setup'}));
  expect((screen.getByRole('button',{name:'Agree and continue'}) as HTMLButtonElement).disabled).toBe(true);
  expect(api.setupFinish).not.toHaveBeenCalled();
});

it('opens with defaults after explicit model agreement without loading optional configuration',async()=>{
 const done=vi.fn(),api={setupChoices:vi.fn(),setupDependencies:vi.fn(async()=>({})),setupStatus:vi.fn(async()=>({databaseReady:true,memoryReady:true,modelReady:true,modelExpiresAt:Date.now()+300000,model:{model:'approved',provider:'custom',endpoint:'inference.local'}})),setupFinish:vi.fn(async()=>({state:'ready'}))} as any;
 render(<Onboarding api={api} done={done}/>);
 await waitFor(()=>expect((screen.getByRole('button',{name:'Agree and continue'}) as HTMLButtonElement).disabled).toBe(false));
 expect(screen.getByText(/By choosing/).textContent).toContain('bounded recent conversation history');
 expect(api.setupFinish).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Agree and continue'}));
 expect(screen.queryByRole('checkbox')).toBeNull();expect(api.setupChoices).not.toHaveBeenCalled();
 expect(screen.getByRole('button',{name:'Customize now (optional)'}).getAttribute('aria-expanded')).toBe('false');
 fireEvent.click(screen.getByRole('button',{name:'Open Wayfinder'}));
 await waitFor(()=>expect(done).toHaveBeenCalledOnce());expect(api.setupFinish).toHaveBeenCalledWith('Personal',true);
});

it('optional configuration still loading does not block opening the workspace',async()=>{
 const api={setupChoices:vi.fn(()=>new Promise(()=>{})),setupDependencies:vi.fn(async()=>({})),setupStatus:vi.fn(async()=>({databaseReady:true,memoryReady:true,modelReady:true,modelExpiresAt:Date.now()+300000,workspaceName:'Existing workspace',model:{model:'approved',provider:'custom',endpoint:'inference.local'}})),setupFinish:vi.fn(async()=>({state:'ready'}))} as any;
 render(<Onboarding api={api} done={vi.fn()}/>);
 await waitFor(()=>expect(screen.getByRole('button',{name:'Agree and continue'})).toBeTruthy());
 fireEvent.click(screen.getByRole('button',{name:'Agree and continue'}));
 fireEvent.click(screen.getByRole('button',{name:'Customize now (optional)'}));
 expect(api.setupChoices).toHaveBeenCalledOnce();expect(screen.getByText('Loading saved choices…')).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Open Wayfinder'}));
 await waitFor(()=>expect(api.setupFinish).toHaveBeenCalledWith('Existing workspace',true));
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
