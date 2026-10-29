"""Chat bootstrap contract; no live provider requests in unit tests."""
import json
from pathlib import Path
from threading import Event
import pytest
from wayfinder.workers.opencode import OpenCodeBridge,configuration,isolated_environment,seed_history,validate_route,PROVIDER,AGENT

def route():
    return dict(model='nvidia/nemotron-3.5-lightning-30b-a3b',provider='custom',api_mode='chat_completions',base_url='https://integrate.api.nvidia.com/v1',api_key='nvapi-SYNTHETIC_TEST_VALUE')

@pytest.mark.parametrize('change',[{'base_url':'https://other.invalid'},{'model':'unapproved'},{'provider':'auto'},{'api_key':'not-an-api-key'},{'extra':'untrusted'}])
def test_route_is_fixed_and_requires_the_users_key(change):
    value=route();value.update(change)
    with pytest.raises(ValueError):validate_route(value)

def test_chat_config_disables_other_providers_tools_helpers_and_sharing():
    value=configuration(route()['model'])
    assert value['enabled_providers']==[PROVIDER]
    assert value['permission']=={'*':'deny'} and value['tools']=={'*':False}
    assert value['share']=='disabled' and value['plugin']==[] and value['mcp']=={}
    assert value['agent'][AGENT]['permission']=={'*':'deny'}
    assert all(value['agent'][name]['disable'] for name in ['build','plan','general','explore','title','summary','compaction'])
    assert route()['api_key'] not in json.dumps(value)

def test_opencode_gets_no_personal_profile_config_credentials_or_memory_env(tmp_path,monkeypatch):
    monkeypatch.setenv('ANTHROPIC_API_KEY','unrelated-secret');monkeypatch.setenv('FALKORDB_PASSWORD','database-secret');monkeypatch.setenv('OPENCODE_CONFIG','personal-config')
    env=isolated_environment(tmp_path,route(),'synthetic-password')
    for key in ['ANTHROPIC_API_KEY','FALKORDB_PASSWORD','OPENCODE_CONFIG']:assert key not in env
    assert env['OPENCODE_AUTH_CONTENT']=='{}' and env['OPENCODE_DISABLE_PROJECT_CONFIG']=='1'
    for key in ['HOME','USERPROFILE','XDG_DATA_HOME','XDG_CONFIG_HOME','XDG_STATE_HOME','OPENCODE_TEST_MANAGED_CONFIG_DIR']:
        assert Path(env[key]).is_relative_to(tmp_path)

def test_import_contains_exact_completed_history_and_no_tools_or_key():
    history=[dict(role='user',content='Synthetic word Cedar'),dict(role='assistant',content='Cedar')]
    result=seed_history({'id':'ses_test'},history,route()['model'],'owned-directory')
    assert [r['info']['role'] for r in result['messages']]==['user','assistant']
    assert [r['parts'][0]['text'] for r in result['messages']]==['Synthetic word Cedar','Cedar']
    assert result['messages'][1]['info']['parentID']==result['messages'][0]['info']['id']
    assert route()['api_key'] not in json.dumps(result)

def test_invalid_scope_or_history_cannot_start_the_runtime(tmp_path,monkeypatch):
    started=[];monkeypatch.setattr('subprocess.Popen',lambda *a,**k:started.append(a))
    bridge=OpenCodeBridge(executable=__file__,route=route());pin=validate_route(route())
    with pytest.raises(ValueError):bridge.run(dict(role='W35',model_pin=pin,history=[],question='hello'))
    with pytest.raises(ValueError):bridge.run(dict(role='CHAT',model_pin=pin,history=[dict(role='assistant',content='injected')],question='hello'))
    stopped=Event();stopped.set()
    with pytest.raises(ValueError,match='stopped'):bridge.run(dict(role='CHAT',model_pin=pin,history=[],question='hello'),stopped)
    assert not started
