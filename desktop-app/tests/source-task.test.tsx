import React from 'react';
import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import {expect,it,vi} from 'vitest';
import {AgentsPanel} from '../src/renderer/Agents';

it('configures a Notion preset without reading, then sends only the selected page through review',async()=>{
  const api={profiles:vi.fn(async()=>({version:'1',profiles:[{id:'A05',name:'Knowledge',execution:{included:true,available:true,status:'ready_for_selected_source',default_variant:'selected_file',variants:[{id:'selected_file',role:'W35'},{id:'source_contract',role:'W12'}]}}],presets:[{id:'P04',name:'Notion Assistant',lead:'A05',included:true,source_kind:'external',operations:['notion']}]})),profileTasks:vi.fn(async()=>[]),startSourceTask:vi.fn(async()=>({id:'task',profile_id:'A05',status:'failed',goal:'Selected',metrics:{worker_invocations:1,delegations:0}}))} as any;
  render(<AgentsPanel api={api} space="owned" files={null} setFiles={vi.fn()} go={vi.fn()} busy={false} act={async(job,then)=>then?.(await job())}/>);
  fireEvent.click(await screen.findByRole('button',{name:'Configure Notion Assistant'}));
  expect(api.startSourceTask).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Exact source resource'),{target:{value:'01234567-1234-1234-1234-0123456789ab'}});
  fireEvent.click(screen.getByRole('button',{name:'Review and run source task'}));
  await waitFor(()=>expect(api.startSourceTask).toHaveBeenCalledWith('owned','A05','external',{provider:'notion',intent:'read',item:'01234567-1234-1234-1234-0123456789ab'},expect.any(String),'P04'));
  expect(screen.queryByText(/Source identity\/hash checked/)).toBeNull();
});
