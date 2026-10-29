import { describe, expect, it, vi } from 'vitest';
import { createHandlers } from '../src/main/broker';
import type { Row } from '../src/shared/types';
function setup(approve = false) {
  const proposal = { id: 'action', status: 'pending', digest: 'canonical-digest', expires: Date.now() / 1000 + 120, plan: { body: { value: 30, predicate: 'retention_days' } } };
  const call = vi.fn(async (operation: string, body: Row = {}): Promise<any> => {
    if (operation.endsWith('_result')) return proposal;
    if (operation === 'worker_grant') return { id: 'grant' };
    if (operation === 'worker_search') return { files: [{ id: 'ref', name: 'selected.md', bytes: 150 }] };
    return { operation, ...body };
  });
  const ui = { pick: vi.fn(async () => 'D:\\selected.md'), confirm: vi.fn(async () => approve) };
  return { call, ui, proposal, handlers: createHandlers({ call }, ui, { status: vi.fn(), connect: vi.fn() }) };
}
describe('Privileged broker boundaries', () => {
  it('approval comes only from the trusted confirmation, not extra caller flags', async () => {
    const { handlers, call, ui } = setup(false);
    await handlers.reviewMemory('space', 'action', { approve: true, digest: 'forged' });
    expect(ui.confirm).toHaveBeenCalledOnce();
    expect(call).toHaveBeenLastCalledWith('platform_memory_decide', expect.objectContaining({ approve: false, digest: 'canonical-digest', task: 'general' }));
  });
  it('trusted approval uses the service-issued envelope and expiry', async () => {
    const { handlers, call, proposal } = setup(true);
    await handlers.reviewBranch('space', 'action');
    expect(call).toHaveBeenLastCalledWith('platform_action_decide', expect.objectContaining({ id: proposal.id, digest: proposal.digest, approve: true }));
  });
  it('an expired review is not sent even if a caller asks', async () => {
    const { handlers, proposal, ui, call } = setup(true); proposal.expires = Date.now() / 1000 - 1;
    await expect(handlers.reviewMemory('space', 'action')).rejects.toThrow('expired');
    expect(ui.confirm).not.toHaveBeenCalled(); expect(call).toHaveBeenCalledTimes(1);
  });
  it('an unknown outcome never opens a new approval or replays an effect', async () => {
    const { handlers, proposal, ui, call } = setup(true); proposal.status = 'outcome_unknown';
    expect((await handlers.reviewMemory('space', 'action')).status).toBe('outcome_unknown');
    expect(ui.confirm).not.toHaveBeenCalled(); expect(call).toHaveBeenCalledTimes(1);
  });
  it('a second concurrent review cannot race the first', async () => {
    const { handlers, ui } = setup(); let finish!: (value: boolean) => void;
    ui.confirm.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const first = handlers.reviewMemory('space', 'action'); await vi.waitFor(() => expect(ui.confirm).toHaveBeenCalled());
    await expect(handlers.reviewMemory('space', 'action')).rejects.toThrow('already open'); finish(false); await first;
  });
  it('unsupported model/authentication fields cannot enter memory proposals', async () => {
    const { handlers, call } = setup();
    expect(() => handlers.proposeMemory('space', { text: 'x', subject: 'me', predicate: 'field', value: 1, action: 'assert', approve: true })).toThrow('Unsupported');
    expect(call).not.toHaveBeenCalled();
    expect(handlers).not.toHaveProperty('call'); expect(handlers).not.toHaveProperty('execute'); expect(handlers).not.toHaveProperty('connections_configure');
  });
  it('paths come only from the native picker and references remain space-bound', async () => {
    const { handlers, call } = setup();
    await handlers.selectFiles('space', 'document', 'C:\\forged-secret.txt');
    expect(call).toHaveBeenCalledWith('worker_grant', { space: 'space', task: 'general', path: 'D:\\selected.md' });
    await expect(handlers.analyze('other-space', 'ref', 'read')).rejects.toThrow('Select this document');
  });
  it('cancelled disclosure never dispatches a model call', async () => {
    const { handlers, call } = setup(false); await handlers.selectFiles('space', 'document'); call.mockClear();
    await expect(handlers.analyze('space', 'ref', 'summarize')).rejects.toThrow('cancelled');
    expect(call).not.toHaveBeenCalled();
  });
  it('approved analysis uses only the existing W35 binding', async () => {
    const { handlers, call } = setup(true); await handlers.selectFiles('space', 'document'); await handlers.analyze('space', 'ref', 'summarize');
    expect(call).toHaveBeenLastCalledWith('worker_start', { space: 'space', task: 'general', reference: 'ref', role: 'W35', question: 'summarize' });
  });
  it('revocation removes the local disclosure references', async () => {
    const { handlers, ui } = setup(true); await handlers.selectFiles('space', 'document'); await handlers.revokeFiles('space', 'grant');
    await expect(handlers.analyze('space', 'ref', 'read')).rejects.toThrow('Select this document'); expect(ui.confirm).not.toHaveBeenCalled();
  });
  it('background cannot be enabled through settings', () => {
    const { handlers } = setup(); expect(() => handlers.setFontSize(0)).toThrow('font size');
    expect(handlers).not.toHaveProperty('setBackground');
  });
  it('an explicit retry also needs fresh document disclosure', async () => {
    const { handlers, call } = setup(false);
    await handlers.selectFiles('space', 'document');
    call.mockImplementation(async operation => operation === 'retry_details' ? { question: 'Original question', context: { subject: 'me', predicate: 'retention_days' } } : {});
    await expect(handlers.retryRead('space', 'original', 'ref')).rejects.toThrow('cancelled');
    expect(call.mock.calls.some(([operation]) => operation === 'platform_read_retry')).toBe(false);
  });
});

it('workflow disclosure cannot use another space reference or forged authority',async()=>{
 const {handlers,call,ui}=setup(false);await handlers.selectFiles('space','document');call.mockClear();
 const definition={contract:'wayfinder.workflow/1',version:1,title:'Read',nodes:[{id:'read',role:'W35',reference:'ref',question:'Read',dependencies:[]}],concurrency:1,deadline_seconds:30};
 await expect(handlers.startWorkflow('other',definition)).rejects.toThrow(/Select every/);expect(ui.confirm).not.toHaveBeenCalled();
 await expect(handlers.startWorkflow('space',{...definition,approved:true})).rejects.toThrow(/Unsupported/);
 await expect(handlers.startWorkflow('space',definition)).rejects.toThrow(/cancelled/);expect(call).not.toHaveBeenCalled();
});

it('freezes the reviewed workflow before awaiting the trusted confirmation',async()=>{
 const {handlers,call,ui}=setup(true);await handlers.selectFiles('space','document');let finish!:(value:boolean)=>void;ui.confirm.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
 const definition={contract:'wayfinder.workflow/1',version:1,title:'Original',nodes:[{id:'read',role:'W35',reference:'ref',question:'Original question',dependencies:[]}],concurrency:1,deadline_seconds:30};
 const pending=handlers.startWorkflow('space',definition);await vi.waitFor(()=>expect(ui.confirm).toHaveBeenCalled());definition.nodes[0].question='CHANGED_AFTER_REVIEW';finish(true);await pending;
 expect(call).toHaveBeenLastCalledWith('platform_workflow_start',expect.objectContaining({request:expect.objectContaining({definition:expect.objectContaining({nodes:[expect.objectContaining({question:'Original question'})]})})}));
});

it('provider task cancellation reads nothing and dispatches nothing',async()=>{
 const {handlers,call}=setup(false);
 await expect(handlers.startSourceTask('space','A05','external',{provider:'notion',intent:'read',item:'page'},'Summarize','P04')).rejects.toThrow(/cancelled/);
 expect(call).not.toHaveBeenCalled();
});

it('provider task freezes the selected read and passes its preset binding without fallback',async()=>{
 const {handlers,call,ui}=setup(true);let finish!:(value:boolean)=>void;
 ui.confirm.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
 call.mockImplementation(async op=>op==='platform_external_grant'?{id:'trusted-grant'}:{});
 const source={provider:'notion',intent:'read',item:'original-page'};
 const pending=handlers.startSourceTask('space','A05','external',source,'Summarize','P04');
 await vi.waitFor(()=>expect(ui.confirm).toHaveBeenCalled());source.item='changed-page';finish(true);await pending;
 expect(call).toHaveBeenCalledWith('platform_external_grant',expect.objectContaining({item:'original-page'}));
 expect(call).toHaveBeenLastCalledWith('platform_profile_start',expect.objectContaining({request:expect.objectContaining({preset_id:'P04',reference:'trusted-grant',source_kind:'external',variant:'source_contract'})}));
});
