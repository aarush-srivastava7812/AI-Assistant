"""Real isolated persistence, explicit fixture worker; no provider/native qualification."""
import time
import pytest
from wayfinder.platform.workflows import Definition,Workflows
from tests.test_platform_integration import platform

def call(f,op,**body):return f['client'].call(op,**f['args'],**body)
def definition(f):
    ref=f['request']['reference']
    return dict(title='Read then review selected evidence',nodes=[dict(id='read',role='W35',reference=ref,question='Read this note.'),dict(id='review',role='W35',reference=ref,question='Check the supplied analysis against the note.',dependencies=['read'])],concurrency=2,deadline_seconds=30)
def start(f,**changes):return call(f,'platform_workflow_start',request=dict(request_id='workflow-once',definition={**definition(f),**changes}))
def settle(f,rid):
    deadline=time.monotonic()+5
    while time.monotonic()<deadline:
        result=call(f,'platform_workflow_result',id=rid)
        if result['status']!='running':return result
        time.sleep(.01)
    raise AssertionError('Workflow did not settle')

def test_dependency_outputs_are_scoped_attributed_and_digest_bound(platform):
    row=start(platform);done=settle(platform,row['id'])
    assert done['status']=='completed' and done['metrics']['worker_invocations']==2 and not done['effects_executed']
    assert [e['node'] for e in done['events'] if e['status']=='dispatched']==['read','review']
    assert 'output_sha256' in platform['worker'].payloads[1]['question']
    assert all(n['output']['source']['sha256'] for n in done['nodes'])
    import hashlib
    expected=hashlib.sha256(platform['worker'].result['text'].encode()).hexdigest()
    assert done['nodes'][0]['output']['output_sha256']==expected
    assert expected in platform['worker'].payloads[1]['question']
    assert call(platform,'platform_workflow_runs')[0]['digest']==row['digest']
    with pytest.raises(ValueError):platform['client'].call('platform_workflow_result',space=platform['args']['space'],task='other',id=row['id'])

def test_duplicate_and_changed_definition_do_not_replay(platform):
    row=start(platform);done=settle(platform,row['id']);again=start(platform)
    assert again['id']==row['id'] and again['status']=='completed' and len(platform['worker'].payloads)==2
    with pytest.raises(ValueError,match='immutable'):start(platform,title='Changed')

@pytest.mark.parametrize('changes',[{'nodes':[dict(id='cycle',role='W35',reference='ref',question='Read',dependencies=['cycle'])]},{'nodes':[dict(id='read',role='terminal',reference='ref',question='Read')]},{'concurrency':3},{'deadline_seconds':111},{'approved':True}])
def test_invalid_graph_and_authority_never_dispatch(platform,changes):
    with pytest.raises(ValueError):start(platform,**changes)
    assert not platform['worker'].payloads

def test_cancel_withholds_dependent_steps_and_late_completion(platform):
    platform['worker'].release.clear();row=start(platform);assert platform['worker'].entered.wait(2)
    stopped=call(platform,'platform_workflow_cancel',id=row['id']);assert stopped['status']=='cancelled'
    platform['worker'].release.set();done=call(platform,'platform_workflow_result',id=row['id'])
    assert done['status']=='cancelled' and len(platform['worker'].payloads)==1 and all(n['output'] is None for n in done['nodes'])

def test_revocation_before_next_step_and_restart_do_not_replay(platform):
    platform['worker'].release.clear();row=start(platform);assert platform['worker'].entered.wait(2)
    call(platform,'worker_revoke',grant=platform['grant']['id']);platform['worker'].release.set()
    assert settle(platform,row['id'])['status']=='failed'
    assert len(platform['worker'].payloads)==1

def test_deadline_and_restart_preserve_original_attempt(platform):
    platform['worker'].release.clear();row=start(platform)
    with platform['app'].db() as db:db.execute('UPDATE bounded_workflows SET deadline=0 WHERE id=?',(row['id'],))
    assert call(platform,'platform_workflow_result',id=row['id'])['status']=='timed_out'
    platform['worker'].release.set()

def test_service_restart_interrupts_without_dispatch(platform):
    platform['worker'].release.clear();row=start(platform)
    old=platform['app'].platform.workflows;old.close();platform['app'].platform.workflows=Workflows(platform['app'].platform)
    replay=start(platform);assert replay['id']==row['id'] and replay['status']=='interrupted'
    assert len(platform['worker'].payloads)==1;platform['worker'].release.set()


def test_worker_completion_advances_dependencies_without_ui_polling(platform):
    row=start(platform)
    deadline=time.monotonic()+5
    while time.monotonic()<deadline:
        with platform['app'].db() as db:
            saved=db.execute('SELECT state FROM bounded_workflows WHERE id=?',(row['id'],)).fetchone()[0]
        import json
        state=json.loads(saved)
        if state['status']=='completed':break
        time.sleep(.02)
    assert state['status']=='completed' and len(platform['worker'].payloads)==2


def test_queued_workflow_wakes_when_unrelated_workers_release_global_capacity(platform):
    platform['worker'].release.clear()
    for _ in range(2):
        call(platform,'worker_start',role='W35',reference=platform['request']['reference'],question='Direct job occupies a slot.')
    row=start(platform)
    assert all(node['status']=='queued' for node in row['nodes'])
    platform['worker'].release.set()
    deadline=time.monotonic()+5
    while time.monotonic()<deadline:
        with platform['app'].db() as db:
            saved=db.execute('SELECT state FROM bounded_workflows WHERE id=?',(row['id'],)).fetchone()[0]
        import json
        state=json.loads(saved)
        if state['status']=='completed':break
        time.sleep(.02)
    assert state['status']=='completed' and len(platform['worker'].payloads)==4
