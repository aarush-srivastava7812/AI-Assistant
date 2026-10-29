export type Row = Record<string, any>;
export interface PlatformScope { readonly owner:string; readonly space:string; readonly task:string }
export interface ArtifactReference { readonly reference:string; readonly sha256:string; readonly media_type:string }
export interface TaskEnvelope {
  readonly contract:'wayfinder.task-envelope/1';readonly request_id:string;readonly run_id:string;
  readonly worker_role:string;readonly scope:PlatformScope;readonly artifacts:readonly ArtifactReference[];
  readonly deadline:number;readonly cancellation_id:string;
}
export interface WorkerOutcome {
  readonly contract:'wayfinder.worker-outcome/1';readonly run_id:string;
  readonly status:'completed'|'failed'|'cancelled'|'interrupted'|'stale'|'uncertain';
  readonly output:Row|null;readonly evidence:readonly ArtifactReference[];readonly warnings:readonly string[];
  readonly execution_ref:string;readonly error_ref:string|null;
}
export interface ProfileRun extends Row { id:string;status:string;envelope:TaskEnvelope|null;outcome:WorkerOutcome|null }
export interface BackendState {
  state: 'starting' | 'ready' | 'offline' | 'setup';
  error?: string;
  runtime?: string;
  owner?: string;
  backend?: Row;
  capabilities?: Record<string, boolean>;
  runtime_inspection?: Row;
  release?: { schema: string; variant: string; sha256: string };
  instance_generation?: string;
}
export interface DesktopAPI {
  quitApp():Promise<void>;
  setupChoices(input?:Row):Promise<Row>;
  setupFolder():Promise<Row>;
  setupProvider(input:Row):Promise<Row>;
  setupEditModel():Promise<BackendState>;
  setupGoogle(services:string[]):Promise<Row>;
  setupHelp(kind:string):Promise<void>;
  setupDependencies(install:boolean):Promise<Row>;
  importConnections():Promise<Row|null>;
  disconnectConnection(provider:'google'|'tavily'|'notion'):Promise<Row>;
  connectionsStatus(space:string):Promise<Row>;
  checkConnection(space:string,provider:'google'|'tavily'|'notion'):Promise<Row>;
  googleGrant(space:string,request:Row):Promise<Row>;
  googleRead(space:string,grant:string):Promise<Row>;
  googleRevoke(space:string,grant:string):Promise<Row>;
  externalGrant(space:string,request:Row):Promise<Row>;
  externalRead(space:string,grant:string):Promise<Row>;
  externalRevoke(space:string,grant:string):Promise<Row>;
  setupStatus(): Promise<Row>;
  setupDatabase(download: boolean): Promise<Row>;
  setupMemory(): Promise<Row>;
  setupModel(): Promise<Row>;
  setupFinish(name: string, consent: boolean): Promise<BackendState>;
  chats(space: string): Promise<Row[]>;
  newChat(space: string): Promise<Row>;
  chat(space: string, conversation: string, before?: string): Promise<Row>;
  sendChat(space: string, conversation: string, request: string, message: string): Promise<Row>;
  cancelChat(space: string, conversation: string, turn: string): Promise<Row>;
  lookupChat(space: string, conversation: string, request: string): Promise<Row>;
  deleteChat(space: string, conversation: string): Promise<Row>;
  startSourceTask(space:string,profile:string,sourceKind:'google'|'external',source:Row,goal:string,preset?:string):Promise<ProfileRun>;
  startWorkflow(space:string,definition:Row):Promise<Row>;
  workflow(space:string,id:string):Promise<Row>;
  workflows(space:string):Promise<Row[]>;
  cancelWorkflow(space:string,id:string):Promise<Row>;
  profiles(space: string): Promise<Row>;
  startProfileTask(space: string, profile: string, reference: string, goal: string, variant?:'selected_file'|'source_contract'): Promise<ProfileRun>;
  profileTask(space: string, id: string): Promise<ProfileRun>;
  profileTasks(space: string): Promise<ProfileRun[]>;
  cancelProfileTask(space: string, id: string): Promise<Row>;
  clearProfileTask(space: string, id: string): Promise<Row>;
  status(): Promise<BackendState>;
  connect(): Promise<BackendState>;
  listSpaces(): Promise<Row[]>;
  createSpace(name: string): Promise<Row>;
  inventory(space: string): Promise<Row>;
  source(space: string, id: string): Promise<Row>;
  recall(space: string, subject: string, predicate: string, temporal: 'now' | 'historical'): Promise<Row>;
  context(space: string, subject: string, predicate: string): Promise<Row>;
  proposeMemory(space: string, body: Row): Promise<Row>;
  reviewMemory(space: string, id: string): Promise<Row>;
  rejectMemory(space: string, id: string): Promise<Row>;
  reconcileMemory(space: string, id: string): Promise<Row>;
  revokeMemory(space: string, id: string): Promise<Row>;
  inspectRuntime(space: string): Promise<Row>;
  capabilities(space: string, query: string): Promise<Row>;
  selectFiles(space: string, kind: 'document' | 'folder' | 'activity'): Promise<Row | null>;
  fileSelection(space: string): Promise<Row | null>;
  searchFiles(space: string, grant: string, pattern: string): Promise<Row>;
  revokeFiles(space: string, grant: string): Promise<Row>;
  analyze(space: string, reference: string, question: string): Promise<Row>;
  compare(space: string, reference: string, question: string, subject: string, predicate: string): Promise<Row>;
  snapshot(space: string): Promise<Row>;
  run(space: string, kind: 'worker' | 'workflow', id: string): Promise<Row>;
  cancel(space: string, kind: 'worker' | 'workflow', id: string): Promise<Row>;
  clearRun(space: string, kind: 'worker' | 'workflow', id: string): Promise<Row>;
  audit(space: string, kind: 'workflow' | 'memory' | 'git', id: string): Promise<Row[]>;
  evaluate(space: string, id: string, phrases: string[]): Promise<Row>;
  retryRead(space: string, id: string, reference: string): Promise<Row>;
  readActivity(space: string, reference: string): Promise<Row>;
  selectRepository(space: string): Promise<Row | null>;
  repositorySelection(space: string): Promise<Row | null>;
  observeRepository(space: string, grant: string, branch: string): Promise<Row>;
  proposeBranch(space: string, grant: string, branch: string, expectedHead: string): Promise<Row>;
  reviewBranch(space: string, id: string): Promise<Row>;
  rejectBranch(space: string, id: string): Promise<Row>;
  reconcileBranch(space: string, id: string, grant: string): Promise<Row>;
  revokeRepository(space: string, grant: string): Promise<Row>;
  revokeBranch(space: string, id: string): Promise<Row>;
  googleStatus(space: string): Promise<Row>;
  getSettings(): Promise<Row>;
  setFontSize(size: number): Promise<Row>;
}
declare global { interface Window { wayfinder: DesktopAPI } }
