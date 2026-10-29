"""Exact preset/source contracts with mocked provider HTTP and model only."""
import json,time
import pytest
from tests.test_connections import linked,PAGE
from tests.test_platform_sources import sources,Response,mock_google


class Model:
    def __init__(self,role):self.calls=[];self.role=role
    def run(self,payload,cancelled):
        self.calls.append(payload)
        if self.role=='W16':
            result=dict(inventory_id='synthetic',commitments=[],duplicates_suppressed_count=0,unresolved_ambiguities=['Only selected text was supplied.'])
        elif self.role=='W03':
            result=dict(plan_id='synthetic',intent_id='selected',goal='Review supplied data',steps=[dict(step_number=1,description='Review the source',assigned_worker='W35',required_capabilities=['selected_source'],expected_output='Advisory summary')],estimated_worker_count=1,requires_external_writes=False,requires_approval=False)
        else:
            result=dict(report_id='synthetic',query='Summarize selected evidence',executive_summary='Only synthetic content.',key_findings=['Selected observation'],sources=[],confidence=.5,unresolved_questions=['No additional sources were read.'],knowledge_gaps=['Selected excerpt only'])
        return dict(ok=True,effective_tools=[],text=json.dumps(result))


def prepare(app,role):
    model=Model(role);app.workers.bridge=model
    app.platform.inspector.snapshot=dict(compatible=True,fingerprint='fixture',observed=time.time(),expires=time.time()+300)
    return model


def finish(client,args,row):
    end=time.monotonic()+5
    while time.monotonic()<end:
        result=client.call('platform_profile_result',**args,id=row['id'])
        if result['status'] not in {'reserved','running'}:return result
        time.sleep(.01)
    raise AssertionError('Preset task did not settle')


def task(preset,profile,reference,source_kind):
    return dict(request_id='once',preset_id=preset,profile_id=profile,variant='source_contract',source_kind=source_kind,reference=reference,goal='Analyze the selected evidence only.')


def test_shared_notion_page_preset_reuses_exact_read_and_releases_its_grant(linked):
    app,client,args,_=linked;model=prepare(app,'W12')
    grant=client.call('platform_external_grant',**args,provider='notion',intent='read',item=PAGE)
    request=task('P04','A05',grant['id'],'external')
    row=client.call('platform_profile_start',**args,request=request);result=finish(client,args,row)
    assert result['status']=='completed' and result['envelope']['worker_role']=='W12'
    assert 'Only synthetic content.' in model.calls[0]['context']
    assert grant['id'] not in app.platform.connections.grants and not result['effects_executed']
    assert client.call('platform_profile_start',**args,request=request)['id']==row['id']
    assert len(model.calls)==1


@pytest.mark.parametrize('preset,profile,service,resource,payload,role',[
    ('P01','A02','tasks','@default',{'items':[{'id':'one','title':'Synthetic task','status':'needsAction'}]},'W03'),
    ('P02','A03','gmail_message','abc',{'id':'abc','raw':'U3ViamVjdDogVGVzdA0KDQpTeW50aGV0aWMgdGV4dA'},'W16'),
    ('P03','A02','tasks','@default',{'items':[]},'W03'),
    ('P06','A05','docs_text','doc',{'documentId':'doc','title':'Synthetic','body':{'content':[]}},'W12'),
])
def test_google_presets_use_only_the_selected_operation(sources,preset,profile,service,resource,payload,role):
    app,client,args,_=sources;model=prepare(app,role);_,calls=mock_google(sources,Response(payload))
    grant=client.call('platform_google_grant',**args,service=service,resource=resource,limit=1)
    row=client.call('platform_profile_start',**args,request=task(preset,profile,grant['id'],'google'))
    result=finish(client,args,row)
    assert result['status']=='completed' and model.calls[0]['role']==role
    assert len(calls)==1 and grant['id'] not in app.platform.google.grants
    assert not result['effects_executed']


def test_preset_cannot_broaden_a_grant_or_substitute_search_metadata_for_content(linked):
    app,client,args,_=linked;model=prepare(app,'W12')
    grant=client.call('platform_external_grant',**args,provider='notion',intent='search',query='synthetic')
    with pytest.raises(ValueError,match='page content'):
        client.call('platform_profile_start',**args,request=task('P04','A05',grant['id'],'external'))
    for preset,profile in [('P05','A04'),('P02','A03'),('P04','A02')]:
        with pytest.raises(ValueError):client.call('platform_profile_start',**args,request=task(preset,profile,grant['id'],'external'))
    assert not model.calls
