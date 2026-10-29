import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUp, ArrowUpRight, BookOpen, BrainCircuit, Check, ChevronDown, ChevronRight, Circle, CircleHelp, Command, FileText, FolderOpen, GitBranch, Layers3, Menu, MoreHorizontal, PanelRightClose, Plus, RefreshCw, Search, Settings2, ShieldCheck, Sparkles, Square, Workflow, X, Home, Link2, Sun, Moon } from 'lucide-react';
import type { BackendState, Row } from '../shared/types';
import release from '../../FEATURES.json';
import {WorkflowBuilder} from './Workflows';
import { AgentsPanel } from './Agents';
import {Onboarding} from './Onboarding';
import {AppearanceProvider,useAppearance} from './Appearance';
import {SettingsPanel} from './Settings';
import {ChatPanel,createConversationSession,type ConversationSession} from './Chat';
import { WorkspaceHome, ConnectionsPanel, PermissionsPanel, type WorkspacePage } from './Workspace';

type Page = WorkspacePage;
type Detail = { title: string; data: Row; kind?: 'source' | 'memory' | 'git' | 'worker' | 'workflow'; id?: string };
const active = new Set(['queued', 'running', 'stopping', 'worker_running', 'planned', 'context_ready', 'selected', 'executing']);
const pageIcons: Record<Page, typeof BrainCircuit> = { chat: Sparkles, home: Home, agents: Layers3, memory: BrainCircuit, documents: FileText, runs: Workflow, connections: Link2, repository: GitBranch, permissions: ShieldCheck, capabilities: Layers3, settings: Settings2 };
const nav = release.navigation.map(item => ({ ...item, id: item.id as Page, icon: pageIcons[item.id as Page] }));
const pretty = (data: unknown) => typeof data === 'string' ? data : JSON.stringify(data, null, 2);
const stamp = (value: number | undefined) => value ? new Date(value * 1000).toLocaleString() : 'Not reported';
function Badge({ children, good = false }: { children: React.ReactNode; good?: boolean }) { return <span className={`badge ${good ? 'good' : ''}`}>{children}</span>; }
function Empty({ icon: Icon = BrainCircuit, title, children }: { icon?: typeof BrainCircuit; title: string; children: React.ReactNode }) { return <div className="empty"><div className="empty-mark"><Icon size={28} strokeWidth={1.3} /></div><h2>{title}</h2><p>{children}</p></div>; }
function Raw({ data }: { data: unknown }) { return <details className="raw"><summary>Inspect evidence <ChevronDown size={13} /></summary><pre>{pretty(data)}</pre></details>; }
interface PanelProps { space: string; api: typeof window.wayfinder; busy: boolean; act: (job: () => Promise<any>, then?: (value: any) => void) => Promise<void>; inspect: (value: Detail | null) => void }

function trapDialogFocus(event: React.KeyboardEvent<HTMLDialogElement>) {
  if (event.key !== 'Tab') return;
  const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]')).filter(node => node.getClientRects().length > 0);
  const first = controls[0], last = controls.at(-1);
  if (!first) { event.preventDefault(); event.currentTarget.focus(); }
  else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}

export function App(){return <AppearanceProvider><AppContent/></AppearanceProvider>;}
function AppContent() {
  const api = window.wayfinder;
  const [backend, setBackend] = useState<BackendState>({ state: 'starting' });
  const [spaces, setSpaces] = useState<Row[]>([]), [space, setSpace] = useState('');
  const [page, setPage] = useState<Page>('chat'), [detail, setDetail] = useState<Detail | null>(null);
  useEffect(()=>{void window.companionAPI?.setSpace?.(space).catch(()=>{});},[space]);
  useEffect(()=>window.companionAPI?.onNavigate?.(destination=>{if(destination==='settings'){setSettingsSection('desktop');setPage('settings');}}),[]);
  const chatSessions=useRef(new Map<string,ConversationSession>());
  const chatNamespace=useRef('');
  const namespace=`${backend.owner||''}:${backend.instance_generation||''}`;
  if(chatNamespace.current!==namespace){chatSessions.current.clear();chatNamespace.current=namespace;}
  if(!chatSessions.current.has(space)){chatSessions.current.set(space,createConversationSession());if(chatSessions.current.size>16)chatSessions.current.delete(chatSessions.current.keys().next().value!);}
  const {theme}=useAppearance();
  const [settingsSection,setSettingsSection]=useState('general');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [snapshot, setSnapshot] = useState<Row>({ actions: [], workflows: [], jobs: [], metrics: {} });
  const [files, setFiles] = useState<Row | null>(null), [repository, setRepository] = useState<Row | null>(null);
  const [newSpace, setNewSpace] = useState(false), [spaceName, setSpaceName] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false), [font, setFont] = useState(14);
  const [paletteOpen, setPaletteOpen] = useState(false), [paletteQuery, setPaletteQuery] = useState('');
  const palette = useRef<HTMLDialogElement>(null);
  const [workflowGoal,setWorkflowGoal]=useState('');
  const [memoryTick, setMemoryTick] = useState(0);
  const drawer = useRef<HTMLDialogElement>(null), busyRef = useRef(false), currentSpace = useRef(space), scopeEpoch = useRef(0);
  if (currentSpace.current !== space) { currentSpace.current = space; scopeEpoch.current++; }
  const refresh = useCallback(async (sid: string) => {
    const epoch = scopeEpoch.current;
    const value = await api.snapshot(sid);
    if (currentSpace.current === sid && scopeEpoch.current === epoch) setSnapshot({ ...value, observed_at: Date.now() });
  }, [api]);
  const act = useCallback(async (job: () => Promise<any>, then?: (value: any) => void) => {
    if (busyRef.current) return;
    const epoch = scopeEpoch.current, sid = currentSpace.current;
    busyRef.current = true; setBusy(true); setError(''); setNotice('');
    try { const value = await job(); if (scopeEpoch.current === epoch) { then?.(value); if (sid) await refresh(sid); } }
    catch (e) { if (scopeEpoch.current === epoch) setError(e instanceof Error ? e.message : 'Request failed. No completion is asserted.'); }
    finally { busyRef.current = false; setBusy(false); }
  }, [refresh]);
  const connect = useCallback(async () => {
    setBackend({ state: 'starting' }); setError('');
    try {
      const result = await api.connect(); setBackend(result);
      if (result.state === 'ready') {
        const [list, settings] = await Promise.all([api.listSpaces(), api.getSettings()]);
        setSpaces(list); setFont(settings.font_size || 14); setSpace(old => list.some(s => s.id === old) ? old : list[0]?.id || '');
      }
    } catch (e) { setBackend({ state: 'offline', error: e instanceof Error ? e.message : 'Backend unavailable.' }); }
  }, [api]);
  useEffect(() => { void connect(); }, [connect]);
  useEffect(() => {
    const epoch = scopeEpoch.current;
    setDetail(null); setFiles(null); setRepository(null); setError(''); setNotice('');
    setSnapshot({ actions: [], workflows: [], jobs: [], metrics: {} });
    if (space && backend.state === 'ready') {
      void refresh(space).catch(e => { if (currentSpace.current === space && scopeEpoch.current === epoch) setError(String(e.message)); });
      void Promise.all([api.fileSelection(space), api.repositorySelection(space)]).then(([file, repo]) => { if (currentSpace.current === space && scopeEpoch.current === epoch) { setFiles(file); setRepository(repo); } }).catch(() => {});
    }
  }, [space, backend.state, refresh, api]);
  useEffect(() => {
    if (!space || backend.state !== 'ready') return;
    let alive = true, polling = false;
    const tick = async () => {
      if (polling) return; polling = true;
      try {
        const value = await api.snapshot(space);
        // The existing controller advances/validates a read when observed.
        for (const run of value.workflows || []) if (active.has(run.status)) await api.run(space, 'workflow', run.id);
        if (alive && currentSpace.current === space) await refresh(space);
      } catch { /* keep last observed data; foreground requests surface failures */ }
      finally { polling = false; }
    };
    const timer = setInterval(() => void tick(), 2200);
    return () => { alive = false; clearInterval(timer); };
  }, [space, backend.state, api, refresh]);
  useEffect(() => {
    const timer = setInterval(() => { void api.status().then(setBackend).catch(() => setBackend({ state: 'offline', error: 'Backend disconnected.' })); }, 15000);
    return () => clearInterval(timer);
  }, [api]);
  useEffect(() => {
    if (drawerOpen && !drawer.current?.open) drawer.current?.showModal();
    if (!drawerOpen && drawer.current?.open) drawer.current.close();
  }, [drawerOpen]);
  useEffect(() => {
    if (paletteOpen && !palette.current?.open) palette.current?.showModal();
    if (!paletteOpen && palette.current?.open) palette.current.close();
  }, [paletteOpen]);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (!event.isComposing && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault(); setDrawerOpen(false); setPaletteQuery(''); setPaletteOpen(value => !value);
      }
    };
    window.addEventListener('keydown', shortcut); return () => window.removeEventListener('keydown', shortcut);
  }, []);
  useEffect(() => {
    const onResize = () => { if (window.innerWidth > 900) setDrawerOpen(false); };
    window.addEventListener('resize', onResize); return () => window.removeEventListener('resize', onResize);
  }, []);
  const go = (next: Page) => { setPage(next); setDetail(null); setDrawerOpen(false); setPaletteOpen(false); };
  const panel = { space, api, busy, act, inspect: setDetail };
  const pending = snapshot.actions.filter((a: Row) => a.status === 'pending').length;
  const selection = spaces.find(s => s.id === space);
  const navigation = <nav aria-label="Workspace">{Array.from(new Set(nav.map(item => item.group))).map(group => <div className="nav-group" key={group}><div className="sidebar-label">{group}</div>{nav.filter(item => item.group === group).map(item => <button key={item.id} aria-current={page === item.id ? 'page' : undefined} onClick={() => go(item.id)}><item.icon size={16} strokeWidth={1.6} /><span>{item.title}</span>{item.id === 'runs' && pending > 0 && <span className="count">{pending}</span>}</button>)}</div>)}</nav>;
  if(backend.state==='setup')return <Onboarding api={api} done={()=>void connect()} />;
  return <div className={`app font-${font}`} data-theme={theme.kind} data-page={page}>
    <aside className="sidebar"><div className="wordmark"><span className="logo">W</span><div><strong>WAYFINDER</strong><span className="brand-description">AI WORKSPACE</span></div></div>{navigation}<div className="sidebar-bottom"><div className="mini-avatar">W</div><div><strong>Your local workspace</strong><span>{backend.state === 'ready' ? 'App service connected' : 'Connection needs attention'}</span></div><ShieldCheck size={16} /></div></aside>
    <div className="workspace"><header className="topbar"><button className="icon-button mobile-menu" aria-label="Open navigation" aria-expanded={drawerOpen} onClick={() => { setPaletteOpen(false); setDrawerOpen(true); }}><Menu size={19} /></button><span className="breadcrumb">Workspace <ChevronRight size={13} /></span><select aria-label="Memory space" value={space} onChange={e => setSpace(e.target.value)} disabled={backend.state !== 'ready'}><option value="">Choose a space</option>{spaces.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select><button className="icon-button" title="Create a space" aria-label="Create a space" disabled={backend.state !== 'ready'} onClick={() => setNewSpace(!newSpace)}><Plus size={16} /></button><div className="topbar-right"><button className="icon-button" aria-label="Open command palette" aria-keyshortcuts="Control+K Meta+K" title="Search destinations (Ctrl+K)" onClick={() => { setDrawerOpen(false); setPaletteQuery(''); setPaletteOpen(true); }}><Search size={17} /></button><span className={`health ${backend.state}`}><span />{backend.state === 'ready' ? 'Backend connected' : backend.state === 'starting' ? 'Connecting' : 'Backend offline'}</span><button className="icon-button" aria-label="Choose color theme" onClick={() => {setSettingsSection('appearance');go('settings');}}><Sun size={17} /></button><button className="icon-button" aria-label="Open settings" onClick={() => go('settings')}><Settings2 size={17} /></button></div></header>
      {newSpace && <form className="new-space" onSubmit={e => { e.preventDefault(); void act(() => api.createSpace(spaceName), s => { setSpaces(old => [...old, s]); setSpace(s.id); setNewSpace(false); setSpaceName(''); }); }}><label>Space name<input autoFocus value={spaceName} maxLength={100} onChange={e => setSpaceName(e.target.value)} placeholder="e.g. Personal" /></label><button className="primary" disabled={busy || !spaceName.trim()}>Create space</button><button type="button" onClick={() => setNewSpace(false)}>Cancel</button></form>}
      <main className={`body ${page==='chat'?'conversation-body':''} ${detail ? 'has-detail' : ''}`}><section className={`page ${page==='chat'?'chat-page':''}`}>{page!=='chat'&&<div className="page-heading"><div className="eyebrow">WORKSPACE // CONTEXT & EVIDENCE</div><div className="title-row"><h1>{nav.find(n => n.id === page)?.title}</h1><span className="page-subtitle">{selection?.name || 'Local workspace'}</span></div></div>}
        {error && <div className="message error" role="alert"><CircleHelp size={18} /><span>{error}</span><button className="icon-button" aria-label="Dismiss error" onClick={() => setError('')}><X size={15} /></button></div>}
        {notice && <div className="message" role="status">{notice}</div>}
        {backend.state !== 'ready' ? <div className="connection-state"><Empty icon={backend.state === 'starting' ? RefreshCw : CircleHelp} title={backend.state === 'starting' ? 'Connecting your existing backend' : 'Your backend needs attention'}>{backend.state === 'starting' ? 'Opening the owned service and existing memory engine. No test data or model replies are generated.' : backend.error || 'Check the configured Python environment, database and runtime ownership.'}</Empty><button className="primary" disabled={backend.state === 'starting'} onClick={() => void connect()}>Retry connection</button><p className="muted">Start the existing FalkorDB service if it is offline. This app does not install or reset services.</p></div> : !space ? <div className="connection-state"><Empty title="Start with a space">Keep each project’s evidence separate. Create your first space to use the connected backend.</Empty><button className="primary" onClick={() => setNewSpace(true)}><Plus size={16} />Create a space</button>{page === 'settings' && <SettingsPanel {...panel} backend={backend} setBackend={setBackend} font={font} setFont={setFont} section={settingsSection} onSection={setSettingsSection} onBack={()=>go('chat')} />}</div> : <>
          {page === 'chat' && <ChatPanel onTask={goal=>{setWorkflowGoal(goal);go('runs');}} key={`${namespace}:${space}`} session={chatSessions.current.get(space)} api={api} space={space} qualified={!!backend.capabilities?.general_chat} /> }
          {page === 'agents' && <AgentsPanel {...panel} files={files} setFiles={setFiles} go={go} />}
          {page === 'home' && <WorkspaceHome backend={backend} snapshot={snapshot} spaceName={selection?.name || 'Selected space'} go={go} />}
          {page === 'connections' && <ConnectionsPanel {...panel} backend={backend} go={go} />}
          {page === 'permissions' && <PermissionsPanel snapshot={snapshot} go={go} />}
          {page === 'memory' && <MemoryPanel key={`${space}:${memoryTick}`} {...panel} />}
          {page === 'documents' && <DocumentsPanel {...panel} files={files} setFiles={setFiles} qualified={!!backend.capabilities?.documents} onRuns={() => go('runs')} />}
          {page === 'runs' && <RunsPanel {...panel} snapshot={snapshot} repository={repository} files={files} setFiles={setFiles} workflowGoal={workflowGoal} />}
          {page === 'repository' && <RepositoryPanel {...panel} repository={repository} setRepository={setRepository} onRuns={() => go('runs')} />}
          {page === 'capabilities' && <CapabilitiesPanel {...panel} backend={backend} setBackend={setBackend} />}
          {page === 'settings' && <SettingsPanel {...panel} backend={backend} setBackend={setBackend} font={font} setFont={setFont} section={settingsSection} onSection={setSettingsSection} onBack={()=>go('chat')} />}
        </>}
      </section>{detail && <aside className="detail-panel"><div className="detail-heading"><span>DETAILS</span><button className="icon-button" aria-label="Close details" onClick={() => setDetail(null)}><PanelRightClose size={17} /></button></div><h2>{detail.title}</h2>{detail.data.status && <Badge good={detail.data.status === 'completed'}>{detail.data.status}</Badge>}{detail.data.answer_status && <Badge>{detail.data.answer_status}</Badge>}{detail.data.status === 'pending' && (detail.kind === 'memory' || detail.kind === 'git') && <div className="detail-review"><p>Nothing has changed. Inspect the exact plan below; approval opens the trusted confirmation.</p><button className="primary" disabled={busy} onClick={() => void act(() => detail.kind === 'memory' ? api.reviewMemory(space, detail.data.id) : api.reviewBranch(space, detail.data.id), r => { setDetail({ ...detail, title: 'Action outcome', data: r }); if (detail.kind === 'memory' && r.status === 'completed') setMemoryTick(t => t + 1); })}>Review exact change</button><button disabled={busy} onClick={() => void act(() => detail.kind === 'memory' ? api.rejectMemory(space, detail.data.id) : api.rejectBranch(space, detail.data.id), r => setDetail({ ...detail, data: r }))}>Reject</button></div>}{detail.data.result?.text && <pre className="answer-text">{detail.data.result.text}</pre>}{typeof detail.data.result?.synthesis === 'string' && <pre className="answer-text">{detail.data.result.synthesis}</pre>}{detail.kind === 'source' && <p className="source-copy">{detail.data.content || detail.data.text}</p>}{detail.data.result?.verified && <div className="verified"><ShieldCheck size={16} /> Independently verified receipt</div>}<Raw data={detail.data} /></aside>}</main>
      {page!=='chat'&&<footer className="statusbar"><span><ShieldCheck size={12} /> Scoped access · explicit reviews</span><span>Workspace parity <span className="footer-dot">·</span> Observed state, explicit authority</span></footer>}
    </div><dialog ref={drawer} onKeyDown={trapDialogFocus} tabIndex={-1} aria-label="Workspace navigation" onCancel={() => setDrawerOpen(false)} onClick={e => { if (e.target === drawer.current) setDrawerOpen(false); }} className="nav-dialog"><div className="dialog-heading"><strong>Workspace</strong><button className="icon-button" aria-label="Close navigation" onClick={() => setDrawerOpen(false)}><X size={18} /></button></div>{navigation}</dialog>
    <dialog ref={palette} onKeyDown={trapDialogFocus} tabIndex={-1} aria-label="Command palette" className="command-dialog" onCancel={() => setPaletteOpen(false)} onClick={e => { if (e.target === palette.current) setPaletteOpen(false); }}><div className="dialog-heading"><strong>Go to a destination</strong><button className="icon-button" aria-label="Close command palette" onClick={() => setPaletteOpen(false)}><X size={18} /></button></div><label className="command-search"><Search size={18} /><span className="sr-only">Search destinations</span><input autoFocus value={paletteQuery} onChange={e => setPaletteQuery(e.target.value)} placeholder="Search destinations" /></label><nav aria-label="Destination results">{nav.filter(item => item.title.toLowerCase().includes(paletteQuery.trim().toLowerCase())).map(item => <button key={item.id} onClick={() => go(item.id)}><item.icon size={17} /><span>{item.title}</span><span className="hint">{item.group}</span></button>)}{!nav.some(item => item.title.toLowerCase().includes(paletteQuery.trim().toLowerCase())) && <p className="empty-inline">No matching destination.</p>}</nav><p className="footnote">Navigation only. Actions still use their scoped service and exact review.</p></dialog>
  </div>;
}

function MemoryPanel({ space, api, busy, act, inspect }: PanelProps) {
  const [records, setRecords] = useState<Row[]>([]), [subject, setSubject] = useState('me'), [predicate, setPredicate] = useState('');
  const [temporal, setTemporal] = useState<'now' | 'historical'>('now'), [answer, setAnswer] = useState<Row | null>(null);
  const [form, setForm] = useState(false), [editing, setEditing] = useState<Row | null>(null);
  const [value, setValue] = useState(''), [evidence, setEvidence] = useState(''), [reason, setReason] = useState(''), [action, setAction] = useState('assert');
  const [composing, setComposing] = useState(false);
  const [loadError, setLoadError] = useState('');
  useEffect(() => { let valid = true; void api.inventory(space).then(r => { if (valid) setRecords(r.records || []); }).catch(e => { if (valid) setLoadError(e.message); }); return () => { valid = false; }; }, [space, api]);
  const lookup = () => act(() => api.recall(space, subject, predicate, temporal), r => { setAnswer(r.packet); inspect({ title: 'Recall evidence', data: r.packet }); });
  const edit = (claim: Row, next: string) => { setEditing(claim); setSubject(claim.subject); setPredicate(claim.predicate); setValue(pretty(claim.value)); setAction(next); setEvidence(`Explicit ${next}: ${claim.predicate}`); setReason(''); setForm(true); };
  const propose = () => {
    let parsed: unknown = value; try { parsed = JSON.parse(value); } catch { /* literal strings are permitted */ }
    return act(() => api.proposeMemory(space, { text: evidence, subject, predicate, value: parsed, kind: 'fact', action, targets: editing ? [editing.claim_id] : null, reason }), result => { setForm(false); setAnswer(null); inspect({ title: 'Pending memory review', data: result, kind: 'memory', id: result.id }); });
  };
  return <div className="memory-page"><div className="intro"><span className="intro-mark"><Sparkles size={23} strokeWidth={1.4} /></span><h2>What should we remember?</h2><p>Inspect real stored facts, recall a field, or propose a change.<br />Every change stays pending until you review it.</p></div>
    <form className="recall-composer" onSubmit={e => { e.preventDefault(); if (!composing) void lookup(); }}><div className="composer-label"><Search size={15} /><span>Recall from this space</span><select aria-label="Recall time" value={temporal} onChange={e => setTemporal(e.target.value as 'now' | 'historical')}><option value="now">Current evidence</option><option value="historical">Historical evidence</option></select></div><input aria-label="Memory field" value={predicate} maxLength={128} placeholder="Enter a field, e.g. retention_days" onChange={e => setPredicate(e.target.value)} onCompositionStart={() => setComposing(true)} onCompositionEnd={() => setComposing(false)} onKeyDown={e => { if (e.key === 'Enter' && (e.nativeEvent.isComposing || composing || e.keyCode === 229)) e.preventDefault(); }} /><div className="composer-bottom"><label>Subject<input aria-label="Memory subject" value={subject} maxLength={200} onChange={e => setSubject(e.target.value)} /></label><span>Grounded recall · no general chat</span><button className="send" aria-label="Recall memory" disabled={busy || !predicate.trim() || !subject.trim()}><ArrowUp size={19} /></button></div></form>
    {answer && <section className="answer-block"><div className="section-label"><ShieldCheck size={15} /> MEMORY EVIDENCE <Badge>{answer.answer_status}</Badge></div>{answer.evidence?.length ? answer.evidence.map((item: Row, i: number) => <div key={item.claim_id || i} className="answer-value"><strong>{pretty(item.value)}</strong><span>{item.predicate} · {item.accepted_for_current_use ? 'Accepted for current use' : 'Historical or disputed'}</span><button className="text-button" onClick={() => void act(() => api.source(space, item.memory_id), d => inspect({ title: 'Source record', data: d, kind: 'source' }))}>Inspect source <ArrowUpRight size={13} /></button></div>) : <p className="muted">No supporting evidence for this field. Nothing was invented.</p>}{answer.warnings?.map((w: string) => <p key={w} className="hint">{w}</p>)}</section>}
    <div className="section-heading"><div><h3>Stored sources</h3><span>{loadError ? 'Inventory unavailable' : `${records.length} ${records.length === 1 ? 'source' : 'sources'} in this space`}</span></div><div className="inline-actions"><button className="icon-button" aria-label="Refresh memory" disabled={busy} onClick={() => void act(() => api.inventory(space), r => { setRecords(r.records || []); setLoadError(''); })}><RefreshCw size={15} /></button><button onClick={() => { setEditing(null); setAction('assert'); setValue(''); setEvidence(''); setReason(''); setForm(!form); }}><Plus size={15} />Propose memory</button></div></div>
    {form && <form className="panel-form" onSubmit={e => { e.preventDefault(); void propose(); }}><div className="form-title"><h3>{editing ? `${action === 'retract' ? 'Retract' : 'Correct'} selected claim` : 'Propose a fact'}</h3><button type="button" className="icon-button" aria-label="Close memory form" onClick={() => setForm(false)}><X size={16} /></button></div><div className="form-grid"><label>Subject<input value={subject} onChange={e => setSubject(e.target.value)} required maxLength={200} /></label><label>Field<input value={predicate} onChange={e => setPredicate(e.target.value)} required maxLength={128} /></label></div><label>Value <span className="hint">Plain text or JSON</span><input value={value} onChange={e => setValue(e.target.value)} required maxLength={2000} /></label><label>Your source statement<textarea value={evidence} onChange={e => setEvidence(e.target.value)} required maxLength={8000} placeholder="State what this fact means and where it came from." /></label>{editing && <label>Reason for this change<input value={reason} onChange={e => setReason(e.target.value)} required maxLength={2000} /></label>}<div className="form-footer"><span>No memory changes until approval.</span><button className="primary" disabled={busy}>Create review <ArrowUpRight size={14} /></button></div></form>}
    {loadError ? <p className="message error" role="alert">Source inventory unavailable: {loadError}</p> : !records.length ? <div className="quiet-empty"><BookOpen size={20} /><p>No stored sources yet. Add a fact you want to inspect and recall.</p></div> : <div className="source-list">{records.map(record => <article className="source-card" key={record.memory_id || record.id}><div className="source-icon"><FileText size={19} /></div><div className="source-body"><h3>{record.content || record.text || record.memory_id || record.id}</h3><span className="hint">Graph {record.graph_stored ? 'stored' : 'unconfirmed'} · Vector {record.vector_stored ? 'stored' : 'unconfirmed'}</span>{record.claims?.map((c: Row) => <div key={c.claim_id} className="claim"><div><strong>{c.predicate}</strong><span>{pretty(c.value)}</span></div><div className="inline-actions"><button className="text-button" disabled={busy} onClick={() => edit(c, 'correct')}>Correct</button><button className="text-button" disabled={busy} onClick={() => edit(c, 'retract')}>Retract</button></div></div>)}</div><button className="icon-button" aria-label="Inspect memory source" disabled={busy} onClick={() => void act(() => api.source(space, record.memory_id || record.id), d => inspect({ title: 'Source record', data: d, kind: 'source' }))}><ArrowUpRight size={16} /></button></article>)}</div>}
    <p className="footnote">Retraction preserves history. Full cross-copy forgetting is not included in this build.</p>
  </div>;
}

function DocumentsPanel({ space, api, busy, act, inspect, files, setFiles, qualified, onRuns }: PanelProps & { files: Row | null; setFiles: (f: Row | null) => void; qualified: boolean; onRuns: () => void }) {
  const [selected, setSelected] = useState(''), [question, setQuestion] = useState(''), [pattern, setPattern] = useState('*');
  const [subject, setSubject] = useState('me'), [predicate, setPredicate] = useState('');
  const choose = (kind: 'document' | 'folder' | 'activity') => act(() => api.selectFiles(space, kind), r => { if (r) { setFiles(r); setSelected(r.files?.[0]?.id || ''); } });
  const run = (compare: boolean) => act(() => compare ? api.compare(space, selected, question, subject, predicate) : api.analyze(space, selected, question), r => { inspect({ title: compare ? 'Document + memory workflow' : 'Document analysis', data: r, kind: compare ? 'workflow' : 'worker', id: r.id }); onRuns(); });
  return <div><div className="feature-header"><div className="feature-icon"><FileText size={24} /></div><h2>Selected files. Bounded access.</h2><p>Choose one document or a folder. Discovery stays local; model analysis asks for separate disclosure approval. A new selection replaces prior access and stops document work bound to that selection.</p></div><div className="selection-toolbar"><button className="primary" disabled={busy} onClick={() => void choose('document')}><Plus size={16} />Select document</button><button disabled={busy} onClick={() => void choose('folder')}><FolderOpen size={16} />Read-only folder</button><button disabled={busy} onClick={() => void choose('activity')}>Local activity CSV</button></div>
    {files ? <><section className="panel-form"><div className="form-title"><h3>{files.grant.name}</h3><Badge>Read-only · 15-minute grant</Badge></div>{!files.grant.file_only && <form className="search-line" onSubmit={e => { e.preventDefault(); void act(() => api.searchFiles(space, files.grant.id, pattern), r => { setFiles({ ...files, ...r }); setSelected(r.files?.[0]?.id || ''); }); }}><input aria-label="Filename pattern" value={pattern} onChange={e => setPattern(e.target.value)} maxLength={150} /><button disabled={busy}>Find files</button></form>}<div className="file-list">{files.files.map((file: Row) => <button key={file.id} className={selected === file.id ? 'selected' : ''} onClick={() => setSelected(file.id)}><FileText size={16} /><span>{file.name}</span><small>{(file.bytes / 1024).toFixed(1)} KB</small>{selected === file.id && <Check size={14} />}</button>)}</div>{files.possibly_truncated && <p className="hint">Discovery reached its bound. Narrow the filename pattern.</p>}<button className="text-button danger" disabled={busy} onClick={() => void act(() => api.revokeFiles(space, files.grant.id), () => { setFiles(null); setSelected(''); })}>Revoke this selection</button></section>
      <section className="panel-form"><h3>Analyze with Hermes</h3>{!qualified && <p className="inline-note">Inspect the installed runtime in Capabilities to qualify this binding. File discovery works without a model.</p>}<label>Question<textarea value={question} onChange={e => setQuestion(e.target.value)} maxLength={1000} placeholder="What should the selected document help you understand?" /></label><div className="form-footer"><span>Only the selected file · isolated W35 · no tools</span><button className="primary" disabled={busy || !qualified || !selected || !question.trim()} onClick={() => void run(false)}>Analyze document <ArrowUpRight size={14} /></button></div><div className="form-divider" /><h3>Compare with one memory field</h3><p className="hint">Runs the existing fixed recipe: scoped recall → selected document → validation → synthesis.</p><div className="form-grid"><label>Subject<input value={subject} onChange={e => setSubject(e.target.value)} /></label><label>Memory field<input value={predicate} onChange={e => setPredicate(e.target.value)} placeholder="e.g. retention_days" /></label></div><button disabled={busy || !qualified || !selected || !question.trim() || !predicate.trim()} onClick={() => void run(true)}><Workflow size={15} />Run comparison</button></section>
      <section className="subtle-card"><h3>Canonical activity CSV</h3><p>Read the existing local CSV interface. No fitness vendor connection, health inference or memory write.</p><button disabled={busy || !selected} onClick={() => void act(() => api.readActivity(space, selected), r => inspect({ title: 'Local activity evidence', data: r }))}>Read selected CSV</button><details><summary>Required column order</summary><code>provider,record_id,revision,metric,value,unit,start_time,end_time,timezone</code></details></section></> : <Empty icon={FolderOpen} title="You decide what is shared">The app has no unrestricted file browser. Only a selection from the trusted picker enters the scoped file broker.</Empty>}
  </div>;
}

function RunsPanel({ space, api, busy, act, inspect, snapshot, repository, files, setFiles, workflowGoal }: PanelProps & { snapshot: Row; repository: Row | null; files: Row | null;setFiles:(value:Row|null)=>void;workflowGoal:string }) {
  const [phrases, setPhrases] = useState('');
  const runs = [...snapshot.workflows.map((r: Row) => ({ ...r, kind: 'workflow' })), ...snapshot.jobs.map((r: Row) => ({ ...r, kind: 'worker' }))];
  const actionButton = (item: Row, action: string) => {
    const memory = item.kind === 'memory';
    const fn = action === 'review' ? (memory ? api.reviewMemory : api.reviewBranch) : action === 'reject' ? (memory ? api.rejectMemory : api.rejectBranch) : action === 'revoke' ? (memory ? api.revokeMemory : api.revokeBranch) : memory ? api.reconcileMemory : (s: string, id: string) => api.reconcileBranch(s, id, repository?.id || '');
    return act(() => fn(space, item.id), r => inspect({ title: memory ? 'Memory action receipt' : 'Git action receipt', data: r, kind: item.kind, id: item.id }));
  };
  return <div><WorkflowBuilder key={`${space}:${workflowGoal}`} initialGoal={workflowGoal} api={api} space={space} files={files} setFiles={setFiles} busy={busy} act={act}/><div className="metrics"><div><span>Comparison recipe samples</span><strong>{snapshot.metrics.sampled || 0}</strong></div><div><span>Worker dispatches</span><strong>{snapshot.metrics.worker_dispatches || 0}</strong></div><div><span>Median latency</span><strong>{snapshot.metrics.median_elapsed_seconds == null ? '—' : `${snapshot.metrics.median_elapsed_seconds}s`}</strong></div><div><span>Model cost</span><strong>Unknown</strong></div></div>
    <div className="section-heading"><div><h3>Reviews & receipts</h3><span>Exact payloads, real outcomes</span></div></div>{!snapshot.actions.length && <p className="empty-inline">No action reviews in this space.</p>}{snapshot.actions.map((item: Row) => <article className="run-card" key={item.id}><div className="run-title"><ShieldCheck size={18} /><div><h3>{item.kind === 'memory' ? `${item.plan.body.action} memory · ${item.plan.body.predicate}` : `Create ${item.plan.branch}`}</h3><span className="hint">{stamp(item.expires)} expiry · {item.kind === 'memory' ? 'Scoped memory event' : 'Local branch only'}</span></div><Badge good={item.status === 'completed'}>{item.status}</Badge></div><div className="inline-actions"><button className="text-button" onClick={() => inspect({ title: 'Exact action envelope', data: item, kind: item.kind, id: item.id })}>Inspect payload</button>{item.status === 'pending' && <><button className="primary small" disabled={busy} onClick={() => void actionButton(item, 'review')}>Review exact change</button><button disabled={busy} onClick={() => void actionButton(item, 'reject')}>Reject</button><button className="text-button" disabled={busy} onClick={() => void actionButton(item, 'revoke')}>Revoke</button></>}{item.status === 'outcome_unknown' && <button disabled={busy || (item.kind === 'git' && !repository)} onClick={() => void actionButton(item, 'reconcile')}>Check outcome · no replay</button>}<button className="text-button" disabled={busy} onClick={() => void act(() => api.audit(space, item.kind, item.id), r => inspect({ title: 'Action audit', data: { events: r } }))}>Audit</button></div>{item.status === 'outcome_unknown' && <p className="hint">Result needs checking. {item.kind === 'git' && !repository ? 'Reselect the original repository before reconciliation.' : 'No ordinary retry is offered.'}</p>}</article>)}
    <div className="section-heading"><div><h3>Read runs</h3><span>Reconnecting observes; it never executes again</span></div></div>{!runs.length && <Empty icon={Workflow} title="No runs yet">Analyze a selected document or run a document-and-memory comparison. Actual progress and receipts will appear here.</Empty>}{runs.map((item: Row) => <article className="run-card" key={`${item.kind}:${item.id}`}><div className="run-title"><Workflow size={18} /><div><h3>{item.kind === 'workflow' ? 'Document + memory comparison' : 'Document Analyst · W35'}</h3><span className="hint">{stamp(item.created)} · {item.id.slice(0, 10)}</span></div><Badge good={item.status === 'completed'}>{item.status}</Badge></div><div className="inline-actions"><button className="text-button" disabled={busy} onClick={() => void act(() => api.run(space, item.kind, item.id), r => inspect({ title: 'Read run result', data: r, kind: item.kind, id: item.id }))}>Open result</button>{active.has(item.status) ? <button disabled={busy} onClick={() => void act(() => api.cancel(space, item.kind, item.id), r => inspect({ title: 'Stop outcome', data: r }))}><Square size={12} />Stop</button> : <button className="text-button" disabled={busy} onClick={() => void act(() => api.clearRun(space, item.kind, item.id), r => inspect({ title: 'Artifact clear receipt', data: r }))}>Clear this artifact</button>}{item.kind === 'workflow' && <button className="text-button" disabled={busy} onClick={() => void act(() => api.audit(space, 'workflow', item.id), r => inspect({ title: 'Workflow audit', data: { events: r } }))}>Audit</button>}{item.kind === 'workflow' && ['failed', 'blocked', 'cancelled', 'timed_out', 'stale', 'interrupted'].includes(item.status) && <button disabled={busy || !files?.files?.[0]} onClick={() => void act(() => api.retryRead(space, item.id, files!.files[0].id), r => inspect({ title: 'Explicit read retry', data: r }))}>New read attempt</button>}</div>{item.kind === 'workflow' && item.status === 'completed' && <div className="evaluate-line"><input aria-label={`Literal evaluation phrases for ${item.id}`} value={phrases} onChange={e => setPhrases(e.target.value)} placeholder="Optional literal phrases, separated by |" /><button disabled={busy} onClick={() => void act(() => api.evaluate(space, item.id, phrases.split('|').map(s => s.trim()).filter(Boolean)), r => inspect({ title: 'Historical artifact check', data: r }))}>Check artifact</button></div>}</article>)}<p className="footnote">Artifact checks are not factual-accuracy scores. Clearing a workflow artifact does not clear its separate worker result, memory, transcripts or backups.</p>
  </div>;
}

function RepositoryPanel({ space, api, busy, act, inspect, repository, setRepository, onRuns }: PanelProps & { repository: Row | null; setRepository: (r: Row | null) => void; onRuns: () => void }) {
  const [branch, setBranch] = useState('codex/'), [observed, setObserved] = useState<Row | null>(null);
  const ref = branch.startsWith('refs/heads/') ? branch : `refs/heads/${branch}`;
  return <div><div className="feature-header"><div className="feature-icon"><GitBranch size={25} /></div><h2>One bounded Git operation.</h2><p>Create a new local <code>codex/</code> branch after exact review. No checkout, file edits, commits, pushes, merge or network operation.</p></div><button className="primary" disabled={busy} onClick={() => void act(() => api.selectRepository(space), r => { if (r) { setRepository(r); setObserved(null); } })}><FolderOpen size={16} />Select repository</button>{repository ? <section className="panel-form"><h3>{repository.repository}</h3><p className="hint">Grant expires {stamp(repository.expires)}. Linked worktrees and redirected Git metadata are unsupported.</p><label>New branch<input aria-label="New branch name" value={branch} onChange={e => { setBranch(e.target.value); setObserved(null); }} maxLength={140} /></label><div className="inline-actions"><button disabled={busy || branch === 'codex/'} onClick={() => void act(() => api.observeRepository(space, repository.id, ref), r => { setObserved(r); inspect({ title: 'Repository preconditions', data: r }); })}>Inspect preconditions</button><button className="primary" disabled={busy || !observed || !!observed.target} onClick={() => void act(() => api.proposeBranch(space, repository.id, ref, observed!.head), r => { inspect({ title: 'Pending local branch review', data: r, kind: 'git', id: r.id }); onRuns(); })}>Prepare exact review</button><button className="text-button danger" disabled={busy} onClick={() => void act(() => api.revokeRepository(space, repository.id), () => { setRepository(null); setObserved(null); })}>Revoke repository access</button></div>{observed && <div className="observation"><Badge good={!observed.target}>{observed.target ? 'Destination already exists' : 'New destination'}</Badge><p>HEAD <code>{observed.head}</code></p><p>Target <code>{observed.branch}</code></p></div>}</section> : <Empty icon={GitBranch} title="Choose an authorized repository">Selection grants this one connector access for five minutes. Existing project Git state is never changed automatically.</Empty>}</div>;
}

function CapabilitiesPanel({ space, api, busy, act, inspect, backend, setBackend }: PanelProps & { backend: BackendState; setBackend: (v: BackendState) => void }) {
  const [query, setQuery] = useState('document file'), [candidates, setCandidates] = useState<Row[]>([]);
  return <div><div className="subtle-card runtime-card"><div><h3>Installed Hermes</h3><p>{backend.capabilities?.documents ? `Compatible isolated binding · ${backend.runtime_inspection?.runtime?.version || 'installed version'}` : 'Inspection required before model work'}</p><span className="hint">Inspects the actual SDK and isolated toolset. Registration alone is not qualification.</span></div><button disabled={busy} onClick={() => void act(() => api.inspectRuntime(space), r => { inspect({ title: 'Installed runtime evidence', data: r }); void api.status().then(setBackend); })}><RefreshCw size={15} />Inspect runtime</button></div><form className="search-line" onSubmit={e => { e.preventDefault(); void act(() => api.capabilities(space, query), r => setCandidates(r.candidates || [])); }}><Search size={18} /><input aria-label="Capability search" value={query} onChange={e => setQuery(e.target.value)} maxLength={1000} /><button disabled={busy || !query.trim()}>Search Atlas</button></form>{candidates.length ? candidates.map(c => <article className="capability-card" key={c.tool_id}><div className="run-title"><Layers3 size={19} /><div><h3>{c.name}</h3><code>{c.tool_id}</code></div><Badge good={c.availability === 'runtime_qualified'}>{c.availability}</Badge></div><p className="hint">{c.configuration} · Discovery is not authorization.</p><button className="text-button" onClick={() => inspect({ title: 'Capability candidate', data: c })}>Inspect candidate <ArrowUpRight size={13} /></button></article>) : <Empty icon={Layers3} title="Discover actual capabilities">Search the existing Atlas registry. Unqualified bindings remain candidates and cannot be executed from this list.</Empty>}</div>;
}
