import { randomUUID } from 'node:crypto';
import type { Row, DesktopAPI } from '../shared/types';
import type { Transport } from './bridge';

export interface NativeUI {
  pick(kind: 'document' | 'folder' | 'activity' | 'repository'): Promise<string | null>;
  confirm(title: string, details: string): Promise<boolean>;
}
const TASK = 'general';
function text(value: unknown, max = 200): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max || value.includes('\0')) throw new Error(`Enter text of 1 to ${max} characters.`);
  return value.trim();
}
function object(value: unknown, allowed: string[]): Row {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !allowed.includes(k))) throw new Error('Unsupported request fields.');
  return value as Row;
}
function scope(space: unknown) { return { space: text(space), task: TASK }; }
function kind(value: unknown, allowed: string[]): string { if (typeof value !== 'string' || !allowed.includes(value)) throw new Error('Unsupported operation kind.'); return value; }
function visible(value: unknown): string {
  // Reveal control/bidi characters in exact reviews; do not hide their payload.
  return JSON.stringify(value, null, 2).replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, c => c === '\n' ? c : `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
}
export function createHandlers(transport: Transport, ui: NativeUI, lifecycle: { status(): Promise<any>; connect(): Promise<any> }) {
  const activeReviews = new Set<string>();
  const selected = new Map<string, string>();
  const references = new Map<string, Row>();
  const fileSelections = new Map<string, Row>();
  const repositories = new Map<string, Row>();
  const request = (operation: string, space: unknown, body: Row = {}) => transport.call(operation, { ...scope(space), ...body });
  async function disclose(space: unknown, reference: unknown, question: unknown, context?: Row) {
    const sid = text(space), ref = text(reference), q = text(question, 4000);
    const metadata = references.get(`${sid}:${ref}`);
    if (!metadata) throw new Error('Select this document again before sending it to the model.');
    if (metadata.bytes > 2 * 1024 * 1024) throw new Error('Document exceeds the existing 2 MiB worker limit.');
    if (!(await ui.confirm('Allow selected evidence to the managed Hermes model?', visible({ space: sid, file: metadata.name, bytes: metadata.bytes, question: q, memory_fields: context || 'No memory supplied', disclosure: 'Only this selected document and the declared scoped evidence are sent through the existing managed model route. No desktop or clipboard access.' })))) throw new Error('Model disclosure was cancelled. Nothing was dispatched.');
  }
  async function review(type: 'memory' | 'git', space: unknown, id: unknown) {
    const sid = text(space), aid = text(id), key = `${type}:${sid}:${aid}`;
    if (activeReviews.has(key)) throw new Error('This review is already open.');
    activeReviews.add(key);
    try {
      const prefix = type === 'memory' ? 'platform_memory' : 'platform_action';
      const proposal = await request(`${prefix}_result`, sid, { id: aid });
      if (proposal.status !== 'pending') return proposal;
      if (proposal.expires * 1000 <= Date.now()) throw new Error('Review expired. Create and inspect a fresh proposal.');
      const detail = visible({ space: sid, task: TASK, operation: type === 'memory' ? 'memory.apply_event' : 'git.create_branch', id: proposal.id, digest: proposal.digest, expires: new Date(proposal.expires * 1000).toISOString(), exact_plan: proposal.plan });
      if (detail.length > 10000) throw new Error('Full proposal exceeds the trusted review limit for this build; no approval was issued.');
      const approved = await ui.confirm(type === 'memory' ? 'Review exact memory change' : 'Review new local branch', detail);
      if (proposal.expires * 1000 <= Date.now()) throw new Error('Review expired while open. No approval was sent.');
      return request(`${prefix}_decide`, sid, { id: aid, digest: proposal.digest, approve: approved });
    } finally { activeReviews.delete(key); }
  }
  const handlers: { [K in Exclude<keyof DesktopAPI, `setup${string}` | 'importConnections' | 'disconnectConnection'>]: (...args: any[]) => Promise<any> } = {
    connectionsStatus:space=>request('platform_connections_status',space),
    checkConnection:(space,provider)=>request('platform_connections_check',space,{provider:kind(provider,['google','tavily','notion'])}),
    googleGrant:(space,input)=>request('platform_google_grant',space,object(input,['service','resource','limit','time_min','time_max','range'])),
    googleRead:(space,grant)=>request('platform_google_read',space,{grant:text(grant)}),
    googleRevoke:(space,grant)=>request('platform_google_revoke',space,{grant:text(grant)}),
    externalGrant:(space,input)=>request('platform_external_grant',space,object(input,['provider','intent','query','item'])),
    externalRead:(space,grant)=>request('platform_external_read',space,{grant:text(grant)}),
    externalRevoke:(space,grant)=>request('platform_external_revoke',space,{grant:text(grant)}),
    chats: space => transport.call('chat_list',{space:text(space)}),
    newChat: space => transport.call('chat_new',{space:text(space)}),
    chat: (space,conversation,before) => transport.call('chat_get',{space:text(space),conversation:text(conversation),...(before?{before:text(before)}:{})}),
    sendChat: (space,conversation,request,message) => transport.call('chat_send',{space:text(space),conversation:text(conversation),request_id:text(request,100),message:text(message,4000)}),
    cancelChat: (space,conversation,turn) => transport.call('chat_cancel',{space:text(space),conversation:text(conversation),turn:text(turn)}),
    lookupChat: (space,conversation,request) => transport.call('chat_lookup',{space:text(space),conversation:text(conversation),request_id:text(request,100)}),
    deleteChat: (space,conversation) => transport.call('chat_delete',{space:text(space),conversation:text(conversation)}),
    startSourceTask:async(space,profile,sourceKind,source,goal,preset)=>{
      const pid=kind(profile,['A01','A02','A03','A04','A05','A06']),sourceType=kind(sourceKind,['google','external']);
      const input=object(structuredClone(source),sourceType==='google'?['service','resource','limit','time_min','time_max','range']:['provider','intent','query','item']);
      const presetId=preset===undefined?undefined:kind(preset,['P01','P02','P03','P04','P06']);
      const question=text(goal,1000),review=visible({space:text(space),profile:pid,preset:presetId,source_kind:sourceType,exact_source:input,goal:question,disclosure:'This explicit bounded read projection is sent to the managed Hermes model. Metadata, snippets and partial content remain partial. No tools, sends, external writes or automatic memory updates.'});
      if(review.length>8000)throw new Error('Source review exceeds its display budget.');
      if(!await ui.confirm('Review selected source and model disclosure',review))throw new Error('Source task cancelled. Nothing was read or dispatched.');
      const grant=await request(sourceType==='google'?'platform_google_grant':'platform_external_grant',space,input);
      try{return await request('platform_profile_start',space,{request:{request_id:randomUUID(),profile_id:pid,profile_version:'1',variant:'source_contract',source_kind:sourceType,reference:grant.id,goal:question,...(presetId?{preset_id:presetId}:{})}});}
      catch(error){await request(sourceType==='google'?'platform_google_revoke':'platform_external_revoke',space,{grant:grant.id}).catch(()=>{});throw error;}
    },
    startWorkflow:async(space,input)=>{
      const definition=object(structuredClone(input),['contract','version','title','nodes','concurrency','deadline_seconds']);
      if(definition.contract!=='wayfinder.workflow/1'||definition.version!==1||!Array.isArray(definition.nodes)||definition.nodes.length<1||definition.nodes.length>8)throw new Error('Invalid finite workflow definition.');
      const nodes=definition.nodes.map((value:unknown)=>{const n=object(value,['id','role','reference','question','dependencies']);
        kind(n.role,['W35','W01','W03','W06','W07','W09','W10','W12','W13','W14','W15','W16','W18','W19','W24']);
        const metadata=references.get(`${text(space)}:${text(n.reference)}`);if(!metadata)throw new Error('Select every workflow source again before disclosure.');
        return {id:text(n.id,32),role:n.role,file:metadata.name,bytes:metadata.bytes,question:text(n.question,1000),dependencies:n.dependencies||[]};});
      const preview=visible({space:text(space),definition:{...definition,nodes},effects:'No tools or external writes. Each node sends the selected source and bounded upstream output to the managed model.'});
      if(preview.length>10000)throw new Error('Workflow exceeds the trusted review display limit.');
      if(!await ui.confirm('Review this bounded workflow and model disclosure',preview))throw new Error('Workflow cancelled. Nothing was dispatched.');
      return request('platform_workflow_start',space,{request:{request_id:randomUUID(),definition}});
    },
    workflow:(space,id)=>request('platform_workflow_result',space,{id:text(id)}),
    workflows:space=>request('platform_workflow_runs',space),
    cancelWorkflow:(space,id)=>request('platform_workflow_cancel',space,{id:text(id)}),
    profiles: space => request('platform_profiles', space),
    startProfileTask: async (space, profile, reference, goal, variant='selected_file') => {
      const pid=kind(profile,variant==='source_contract'?['A01','A02','A03','A04','A05','A06']:['A01','A05','A06']);kind(variant,['selected_file','source_contract']);
      await disclose(space,reference,text(goal,1000));
      return request('platform_profile_start',space,{request:{request_id:randomUUID(),profile_id:pid,profile_version:'1',variant,reference:text(reference),goal:text(goal,1000)}});
    },
    profileTask: (space,id) => request('platform_profile_result',space,{id:text(id)}),
    profileTasks: space => request('platform_profile_runs',space),
    cancelProfileTask: (space,id) => request('platform_profile_cancel',space,{id:text(id)}),
    clearProfileTask: (space,id) => request('platform_profile_clear',space,{id:text(id)}),
    status: () => lifecycle.status(), connect: () => lifecycle.connect(),
    listSpaces: () => transport.call('spaces'),
    createSpace: name => transport.call('create_space', { name: text(name, 100) }),
    inventory: space => transport.call('inventory', { space: text(space) }),
    source: (space, id) => transport.call('source', { space: text(space), memory_id: text(id) }),
    recall: (space, subject, predicate, temporal) => transport.call('recall', { space: text(space), subject: text(subject), predicate: text(predicate, 128), task_id: TASK, temporal_mode: kind(temporal, ['now', 'historical']) }),
    context: (space, subject, predicate) => request('platform_context', space, { query: { subject: text(subject), predicate: text(predicate, 128) } }),
    proposeMemory: (space, input) => {
      const body = object(input, ['text', 'subject', 'predicate', 'value', 'kind', 'action', 'targets', 'reason']);
      text(body.text, 20000); text(body.subject); text(body.predicate, 128);
      kind(body.action, ['assert', 'correct', 'supersede', 'retract']);
      if (!('value' in body) || JSON.stringify(body.value) === undefined || JSON.stringify(body.value).length > 2000) throw new Error('Memory value is missing or exceeds the review limit.');
      return request('platform_memory_propose', space, { body: { ...body, task_id: TASK }, request_id: randomUUID() });
    },
    reviewMemory: (space, id) => review('memory', space, id),
    rejectMemory: async (space, id) => { const p = await request('platform_memory_result', space, { id: text(id) }); return request('platform_memory_decide', space, { id: p.id, digest: p.digest, approve: false }); },
    reconcileMemory: (space, id) => request('platform_memory_reconcile', space, { id: text(id) }),
    revokeMemory: (space, id) => request('platform_memory_revoke', space, { id: text(id) }),
    inspectRuntime: space => request('platform_inspect', space),
    capabilities: (space, query) => request('platform_capabilities', space, { query: text(query, 1000) }),
    selectFiles: async (space, fileKind) => {
      const sid = text(space); kind(fileKind, ['document', 'folder', 'activity']);
      const picked = await ui.pick(fileKind); if (!picked) return null;
      const grant = await request('worker_grant', sid, { path: picked });
      selected.set(`${sid}:${grant.id}`, fileKind);
      try {
        const result = await request('worker_search', sid, { grant: grant.id, pattern: '*' });
        const previous = fileSelections.get(sid);
        if (previous && previous.grant.id !== grant.id) {
          await request('worker_revoke', sid, { grant: previous.grant.id });
          selected.delete(`${sid}:${previous.grant.id}`);
          for (const [key, file] of references) if (key.startsWith(sid + ':') && file.grant === previous.grant.id) references.delete(key);
        }
        for (const file of result.files) references.set(`${sid}:${file.id}`, { ...file, grant: grant.id });
        const selection = { grant: { ...grant, expires_at: Date.now() + grant.expires_in * 1000 }, ...result };
        fileSelections.set(sid, selection); return selection;
      }
      catch (error) { await request('worker_revoke', sid, { grant: grant.id }).catch(() => {}); selected.delete(`${sid}:${grant.id}`); throw error; }
    },
    fileSelection: async space => { const value = fileSelections.get(text(space)); return value && value.grant.expires_at > Date.now() ? value : null; },
    searchFiles: async (space, grant, pattern) => {
      const sid = text(space), gid = text(grant); if (!selected.has(`${sid}:${gid}`)) throw new Error('Reselect this file or folder in the desktop picker.');
      const result = await request('worker_search', sid, { grant: gid, pattern: text(pattern, 150) }); for (const file of result.files) references.set(`${sid}:${file.id}`, { ...file, grant: gid }); const current = fileSelections.get(sid); if (current?.grant.id === gid) fileSelections.set(sid, { ...current, ...result }); return result;
    },
    revokeFiles: async (space, grant) => { const sid = text(space), gid = text(grant); const result = await request('worker_revoke', sid, { grant: gid }); selected.delete(`${sid}:${gid}`); if (fileSelections.get(sid)?.grant.id === gid) fileSelections.delete(sid); for (const [key, file] of references) if (key.startsWith(sid + ':') && file.grant === gid) references.delete(key); return result; },
    analyze: async (space, reference, question) => { await disclose(space, reference, question); return request('worker_start', space, { role: 'W35', reference: text(reference), question: text(question, 4000) }); },
    compare: async (space, reference, question, subject, predicate) => { const context = { subject: text(subject), predicate: text(predicate, 128) }; await disclose(space, reference, text(question, 1000), context); return request('platform_read_start', space, { request: { request_id: randomUUID(), question: text(question, 1000), reference: text(reference), context } }); },
    snapshot: space => transport.call('snapshot', { space: text(space) }),
    run: (space, runKind, id) => request(kind(runKind, ['worker', 'workflow']) === 'worker' ? 'worker_result' : 'platform_read_result', space, { id: text(id) }),
    cancel: (space, runKind, id) => request(kind(runKind, ['worker', 'workflow']) === 'worker' ? 'worker_cancel' : 'platform_read_cancel', space, { id: text(id) }),
    clearRun: (space, runKind, id) => request(kind(runKind, ['worker', 'workflow']) === 'worker' ? 'worker_forget' : 'platform_read_clear', space, { id: text(id) }),
    audit: (space, actionKind, id) => request(({ workflow: 'platform_audit', memory: 'platform_memory_audit', git: 'platform_action_audit' })[kind(actionKind, ['workflow', 'memory', 'git']) as 'workflow' | 'memory' | 'git'], space, { id: text(id) }),
    evaluate: (space, id, phrases) => {
      if (!Array.isArray(phrases) || phrases.length > 8) throw new Error('Use at most eight literal phrases.');
      return request('platform_workflow_evaluate', space, { id: text(id), request: { request_id: randomUUID(), required_phrases: phrases.map(p => text(p, 200)) } });
    },
    retryRead: async (space, id, reference) => { const original = await transport.call('retry_details', { space: text(space), id: text(id) }); await disclose(space, reference, original.question, original.context); return request('platform_read_retry', space, { id: text(id), request_id: randomUUID(), reference: text(reference) }); },
    readActivity: (space, reference) => request('platform_activity_read', space, { reference: text(reference) }),
    selectRepository: async space => { const sid = text(space), picked = await ui.pick('repository'); if (!picked) return null; const grant = await request('platform_git_grant', sid, { path: picked }); const previous = repositories.get(sid); if (previous && previous.id !== grant.id && previous.expires * 1000 > Date.now()) await request('platform_git_revoke', sid, { grant: previous.id }); repositories.set(sid, grant); return grant; },
    repositorySelection: async space => { const value = repositories.get(text(space)); return value && value.expires * 1000 > Date.now() ? value : null; },
    observeRepository: (space, grant, branch) => request('platform_git_observe', space, { grant: text(grant), branch: text(branch, 150) }),
    proposeBranch: (space, grant, branch, expectedHead) => request('platform_git_propose', space, { grant: text(grant), branch: text(branch, 150), expected_head: text(expectedHead, 40), request_id: randomUUID() }),
    reviewBranch: (space, id) => review('git', space, id),
    rejectBranch: async (space, id) => { const p = await request('platform_action_result', space, { id: text(id) }); return request('platform_action_decide', space, { id: p.id, digest: p.digest, approve: false }); },
    reconcileBranch: (space, id, grant) => request('platform_action_reconcile', space, { id: text(id), grant: text(grant) }),
    revokeRepository: async (space, grant) => { const sid = text(space), gid = text(grant); const result = await request('platform_git_revoke', sid, { grant: gid }); if (repositories.get(sid)?.id === gid) repositories.delete(sid); return result; },
    revokeBranch: (space, id) => request('platform_action_revoke', space, { id: text(id) }),
    googleStatus: space => request('platform_google_status', space),
    getSettings: () => transport.call('settings'),
    setFontSize: size => { if (!Number.isInteger(size) || size < 10 || size > 24) throw new Error('Choose a font size from 10 to 24.'); return transport.call('settings', { value: { font_size: size, background: false } }); },
  };
  return handlers;
}
