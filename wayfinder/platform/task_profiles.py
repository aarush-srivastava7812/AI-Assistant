"""Versioned task focus over existing handlers; no agent loop or tool delegation runtime."""
import hashlib
import json
from pathlib import Path
from threading import RLock
import time
import uuid
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, ValidationError
from wayfinder.platform.worker_bindings import activation_ledger
from wayfinder.platform.contracts import ArtifactReference, TaskEnvelope, WorkerOutcome, Scope
def get_worker_activation(compatible=False) -> list[dict]:
    return activation_ledger(compatible)


SCHEMAS = {
    'platform_profiles': set(), 'platform_profile_start': {'request'},
    'platform_profile_result': {'id'}, 'platform_profile_cancel': {'id'},
    'platform_profile_runs': set(), 'platform_profile_clear': {'id'},
}
TERMINAL = {'completed','failed','stale','cancelled','interrupted'}
FILE_BINDINGS = frozenset({'A01','A05','A06'})
STRUCTURED_BINDINGS={'A01':'W09','A02':'W03','A03':'W16','A04':'W24','A05':'W12','A06':'W10'}
PRESET_BINDINGS={
    'P01':('A02','google',frozenset({'calendar','tasks','gmail_headers','gmail_message','drive','docs','docs_text','sheets','sheets_values'})),
    'P02':('A03','google',frozenset({'gmail_headers','gmail_message'})),
    'P03':('A02','google',frozenset({'calendar','tasks'})),
    'P04':('A05','external',frozenset({'notion'})),
    'P06':('A05','google',frozenset({'drive','docs','docs_text','sheets','sheets_values'})),
}
def canonical(value): return json.dumps(value,sort_keys=True,separators=(',',':'),allow_nan=False)

class TaskRequest(BaseModel):
    model_config = ConfigDict(extra='forbid',strict=True)
    request_id: str = Field(min_length=1,max_length=100)
    profile_id: str = Field(min_length=3,max_length=3)
    profile_version: str = '1'
    preset_id: str | None = None
    variant: Literal['selected_file','source_contract'] = 'selected_file'
    source_kind: Literal['file','google','external'] = 'file'
    reference: str = Field(min_length=1,max_length=200)
    goal: str = Field(min_length=1,max_length=1000)

class TaskProfiles:
    def __init__(self,platform):
        self.platform,self.app,self.lock = platform,platform.app,RLock()
        raw=Path(__file__).with_name('task-profiles.json').read_bytes()
        self.manifest=json.loads(raw)
        if self.manifest.get('contract')!='wayfinder.task-profiles/1':raise ValueError('Unsupported task-profile manifest.')
        self.manifest_hash=hashlib.sha256(raw).hexdigest()
        self.source_checks={}
        self.source_releases={}
        with self.app.db() as db:
            db.execute('''CREATE TABLE IF NOT EXISTS task_profile_runs(
                id TEXT PRIMARY KEY,scope TEXT,request TEXT,digest TEXT,body TEXT,profile TEXT,
                manifest TEXT,source TEXT,job TEXT,status TEXT,created REAL,
                UNIQUE(scope,request))''')
            db.execute("UPDATE task_profile_runs SET status='interrupted' WHERE status IN ('reserved','running')")

        self.unsubscribe=self.app.workers.subscribe_completion(self.on_completed)

    def on_completed(self,worker_scope,jid):
        with self.lock:
            if self.platform.closed:return
            scope=Scope(owner=worker_scope[0],space=worker_scope[1],task=worker_scope[2])
            with self.app.db() as db:rows=db.execute("SELECT id FROM task_profile_runs WHERE scope=? AND job=? AND status='running'",(canonical(scope.worker_scope()),jid)).fetchall()
            for row in rows:self.result(scope,row['id'])

    def release_source(self,rid):
        self.source_checks.pop(rid,None)
        release=self.source_releases.pop(rid,None)
        if release:release()

    def close(self):
        with self.lock:
            self.unsubscribe()
            for rid in list(self.source_releases):self.release_source(rid)

    def catalog(self):
        qualified=bool(self.platform.inspector.current().get('compatible'))
        profiles=[]
        for item in self.manifest['profiles']:
            file_binding=item['id'] in FILE_BINDINGS
            structured_binding=STRUCTURED_BINDINGS.get(item['id'])
            included=file_binding or bool(structured_binding)
            profiles.append(dict(item,execution=dict(
                available=included and qualified,
                included=included,
                variants=[dict(id="selected_file",role="W35")]*(1 if file_binding else 0)+[dict(id="source_contract",role=structured_binding)]*(1 if structured_binding else 0),
                default_variant="selected_file" if file_binding else "source_contract",
                mode='selected_source' if included else 'existing_memory_view' if item['id']=='A07' else None,
                status='ready_for_selected_source' if included and qualified else 'runtime_inspection_required' if included else 'existing_memory_view' if item['id']=='A07' else 'deferred' if item['id']=='A08' else 'connection_or_adapter_unqualified',
                binding='existing.W35' if file_binding else 'hermes.definition/1:'+structured_binding if structured_binding else None,
                note='Explicit selected text or bounded provider observation only. Advisory output; no tools, writes, sends, helpers or automatic memory publication.' if included else item['limitation'])))
        configured=self.platform.connections.status()['configured']
        presets=[]
        for item in self.manifest['presets']:
            binding=PRESET_BINDINGS.get(item['id'])
            provider='notion' if item['id']=='P04' else 'google'
            ready=bool(binding and qualified and configured.get(provider))
            presets.append(dict(item,available=ready,included=bool(binding),
                status='selected_read_adapter_ready' if ready else 'runtime_or_connection_required' if binding else 'provider_operations_unqualified',
                source_kind=binding[1] if binding else None,operations=sorted(binding[2]) if binding else [],
                live_qualified=False,reason='Exact read scope and account permissions are checked at use; model disclosure is explicit. Live account qualification is separate.' if binding else 'No Wayfinder GitHub product authorization or qualified repository adapter.'))
        return dict(contract=self.manifest['contract'],version=self.manifest['version'],manifest_sha256=self.manifest_hash,
                    worker_activation=activation_ledger(qualified),main=self.manifest['main'],profiles=profiles,presets=presets,
                    limits=dict(max_active_existing_workers=2,max_worker_invocations=1,delegation_depth=0,deadline_seconds=110,cost=None,tokens=None))

    def call(self,who,scope,operation,body):
        self.app.authorize(who);self.app.space(who,scope.space)
        if who.owner!=scope.owner or operation not in SCHEMAS or set(body)-({'space','task'}|SCHEMAS[operation]):raise ValueError('Invalid task-profile scope or fields.')
        with self.lock:
            if self.app.closed or self.platform.closed:raise ValueError('Task routing is stopped.')
            if operation=='platform_profiles':return self.catalog()
            if operation=='platform_profile_start':
                try:request=TaskRequest.model_validate(body.get('request'))
                except ValidationError:raise ValueError('Invalid task-profile request fields or limits.') from None
                return self.start(scope,request,who)
            if operation=='platform_profile_runs':
                with self.app.db() as db:rows=db.execute('SELECT id FROM task_profile_runs WHERE scope=? ORDER BY created DESC LIMIT 8',(canonical(scope.worker_scope()),)).fetchall()
                return [dict(self.result(scope,row['id']),result=None) for row in rows]
            row=self.row(scope,body.get('id'))
            if operation=='platform_profile_cancel':
                if row['status'] not in TERMINAL:
                    self.update(row['id'],status='cancelled')
                    if row['job']:self.app.workers.cancel(scope.worker_scope(),row['job'])
                return self.result(scope,row['id'])
            if operation=='platform_profile_clear':
                if row['status'] not in TERMINAL:raise ValueError('Stop this task before clearing its artifact.')
                if row['job']:self.app.workers.forget(scope.worker_scope(),row['job'])
                with self.app.db() as db:db.execute('DELETE FROM task_profile_runs WHERE id=?',(row['id'],))
                return dict(cleared=True,scope='This task and its separate worker artifact only; no memory or backups erased.')
            return self.result(scope,row['id'])

    def row(self,scope,rid):
        if not isinstance(rid,str) or not 1<=len(rid)<=100:raise ValueError('Choose one bounded task ID.')
        with self.app.db() as db:row=db.execute('SELECT * FROM task_profile_runs WHERE id=? AND scope=?',(rid,canonical(scope.worker_scope()))).fetchone()
        if not row:raise ValueError('Task unavailable in this scope.')
        return dict(row)

    def update(self,rid,*,status,job=None):
        with self.app.db() as db:
            if job is None:db.execute('UPDATE task_profile_runs SET status=? WHERE id=?',(status,rid))
            else:db.execute('UPDATE task_profile_runs SET status=?,job=? WHERE id=?',(status,job,rid))

    def provider_source(self,who,scope,request):
        if who is None or request.variant!='source_contract':raise ValueError('Provider context requires a scoped structured task.')
        adapter=self.platform.google if request.source_kind=='google' else self.platform.connections
        with adapter.lock:
            grant=adapter.grants.get(request.reference)
            if not grant or grant['scope']!=scope:raise ValueError('Provider source grant belongs to another task or is unavailable.')
        operation='platform_google_read' if request.source_kind=='google' else 'platform_external_read'
        observed=adapter.call(who,scope,operation,dict(grant=request.reference))
        text=json.dumps(observed,sort_keys=True,ensure_ascii=False,allow_nan=False)
        if len(text.encode())>24000:raise ValueError('Selected provider observation exceeds the model context budget. Select fewer records.')
        def revalidate():
            adapter.live(grant)
            if request.source_kind=='google':
                session=adapter.session(grant['service'],grant['connection']);session.close()
        revalidate()
        digest=hashlib.sha256(text.encode()).hexdigest()
        source=dict(reference='provider:'+uuid.uuid4().hex,name='Selected '+(grant.get('service') or grant['provider'])+' observation',sha256=digest,source_kind=request.source_kind,coverage='Only the explicit selected read projection; metadata/snippets/excerpts remain partial.',observed_at=observed['observed_at'])
        def release():
            with adapter.lock:
                if adapter.grants.get(grant['id']) is grant:adapter.grants.pop(grant['id'],None)
        return text,source,revalidate,release

    def start(self,scope,request,who=None):
        body=request.model_dump();digest=hashlib.sha256(canonical(body).encode()).hexdigest()
        with self.app.db() as db:old=db.execute('SELECT id,digest FROM task_profile_runs WHERE scope=? AND request=?',(canonical(scope.worker_scope()),request.request_id)).fetchone()
        if old:
            if old['digest']!=digest:raise ValueError('Task request ID belongs to different immutable input.')
            return self.result(scope,old['id'])
        if request.preset_id is not None:
            binding=PRESET_BINDINGS.get(request.preset_id)
            if not binding or request.profile_id!=binding[0] or request.source_kind!=binding[1] or request.variant!='source_contract':
                raise ValueError('This preset has no adapter for the selected profile/source variant. No fallback task was dispatched.')
            adapter=self.platform.google if request.source_kind=='google' else self.platform.connections
            with adapter.lock:
                grant=adapter.grants.get(request.reference)
                if not grant or grant['scope']!=scope or (grant.get('service') or grant.get('provider')) not in binding[2]:
                    raise ValueError('The exact selected read is outside this preset or task.')
                if request.preset_id=='P04' and grant.get('intent')!='read':
                    raise ValueError('Select a shared Notion page; search metadata is not page content.')
        role=STRUCTURED_BINDINGS.get(request.profile_id) if request.variant=='source_contract' else 'W35' if request.profile_id in FILE_BINDINGS else None
        if role is None or request.profile_version!='1':raise ValueError('This profile/version has no qualified execution adapter.')
        if not request.goal.strip() or len(request.goal.encode('utf-8'))>1000:raise ValueError('Enter a nonblank goal within the bounded text limit (1,000 UTF-8 bytes).')
        self.platform.inspector.require()
        provided=None
        if request.source_kind=='file':
            source=self.app.workers.files.read(scope.worker_scope(),request.reference)
            if source['extension'] not in {'.txt','.md','.csv','.json','.log'}:raise ValueError('Task profiles currently accept selected UTF-8 text files only.')
            source_ref=dict(reference=request.reference,name=source['name'],sha256=source['sha256'])
        else:
            text,source_ref,revalidate,release=self.provider_source(who,scope,request)
            provided=(text,source_ref,revalidate,release)
        rid=uuid.uuid4().hex
        # Transport metadata is issued by the service after the scoped read. It
        # does not alter the worker's definition or transfer the file grant.
        envelope=TaskEnvelope(request_id=request.request_id,run_id=rid,worker_role=role,scope=scope,
            artifacts=(ArtifactReference(reference=source_ref['reference'],sha256=source_ref['sha256'],media_type='text/plain'),),
            deadline=float(time.time()+110),cancellation_id=rid)
        stored_body=dict(body,platform_envelope=envelope.model_dump(mode='json'))
        with self.app.db() as db:db.execute("INSERT INTO task_profile_runs VALUES (?,?,?,?,?,?,?,?,NULL,'reserved',?)",(rid,canonical(scope.worker_scope()),request.request_id,digest,canonical(stored_body),request.profile_id,self.manifest_hash,canonical(source_ref),time.time()))
        try:
            # One existing isolated worker is the entire qualified lead path. No nested model loop.
            if provided:
                self.source_checks[rid]=provided[2]
                self.source_releases[rid]=provided[3]
                job=self.app.workers.start_context(scope.worker_scope(),role=role,question=request.goal,context=provided[0],evidence=provided[1],revalidate=provided[2])
            else:job=self.app.workers.start(scope.worker_scope(),role=role,question=request.goal,reference=request.reference)
            self.update(rid,status='running',job=job['id'])
        except Exception:
            self.update(rid,status='failed')
            self.release_source(rid)
            raise ValueError('The bounded selected-file task could not start. No automatic retry was made.') from None
        return self.result(scope,rid)

    def result(self,scope,rid):
        row=self.row(scope,rid);result=None;warning=None
        job=None
        if row['job']:
            try:job=self.app.workers.get(scope.worker_scope(),row['job'])
            except ValueError:warning='The underlying worker artifact is unavailable.'
        if row['status']=='running' and job:
            if job['status']=='completed':
                try:
                    saved_source=json.loads(row['source'])
                    expected=saved_source['sha256']
                    if saved_source.get('source_kind'):
                        check=self.source_checks.get(rid)
                        if not check:raise ValueError('Source qualification was not retained across restart.')
                        check();selected=saved_source
                    else:selected=self.app.workers.files.read(scope.worker_scope(),json.loads(row['body'])['reference'])
                    if selected['sha256']!=expected or job['result'].get('evidence',{}).get('sha256')!=expected:raise ValueError('Source changed')
                    self.update(rid,status='completed')
                except ValueError:self.update(rid,status='stale')
            elif job['status'] in {'failed','stopped','interrupted'}:self.update(rid,status='cancelled' if job['status']=='stopped' else job['status'])
            row=self.row(scope,rid)
        if row['status']=='completed' and job and job['status']=='completed':
            result=dict(text=job['result']['text'] if not job['result'].get('structured') else 'Validated structured output from '+job['role'],structured=job['result'].get('structured'),sources=[dict(json.loads(row['source']),truncated=job['result'].get('evidence',{}).get('truncated',False))],historical_artifact=True)
        if row['status'] in TERMINAL:self.release_source(rid)
        saved=json.loads(row['body']);envelope=saved.get('platform_envelope');outcome=None
        warning=warning or ('Upstream abort/billing is unconfirmed; no automatic replay.' if row['status'] in {'cancelled','interrupted'} else None)
        if envelope:
            # Round-trip the versioned wrapper. Legacy records remain readable
            # without fabricating a deadline, cancellation ID or provenance.
            checked=TaskEnvelope.model_validate_json(canonical(envelope))
            if checked.run_id!=row['id'] or checked.scope!=scope:raise ValueError('Task envelope scope mismatch.')
            if row['status'] in TERMINAL:
                outcome=WorkerOutcome(run_id=row['id'],status=row['status'],output=result,
                    evidence=checked.artifacts if result else (),warnings=(warning,) if warning else (),
                    execution_ref=row['job'] or row['id'],error_ref=row['id'] if row['status']=='failed' else None).model_dump(mode='json')
        return dict(id=row['id'],profile_id=row['profile'],profile_version='1',manifest_sha256=row['manifest'],status=row['status'],created=row['created'],goal=saved['goal'],envelope=envelope,outcome=outcome,job=row['job'],binding='existing.W35' if not envelope or envelope['worker_role']=='W35' else 'hermes.definition/1:'+envelope['worker_role'],result=result,warning=warning,metrics=dict(worker_invocations=1 if row['job'] else 0,delegations=0,tokens=None,cost=None),effects_executed=False)
