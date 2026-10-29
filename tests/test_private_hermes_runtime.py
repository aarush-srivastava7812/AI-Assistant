"""Private model bootstrap is separate from public requests and fixed to NVIDIA."""
import json
from pathlib import Path
import pytest
from wayfinder.workers.hermes import HermesBridge, HermesUnavailable

def runner():
    namespace={'__name__':'private_runner_contract'}
    exec(Path('wayfinder/workers/hermes_runner.py').read_text(),namespace)
    return namespace['main']

@pytest.mark.parametrize('change',[
    {'base_url':'http://integrate.api.nvidia.com/v1'},
    {'base_url':'https://attacker.invalid/v1'},
    {'provider':'openai'}, {'api_mode':'responses'}, {'api_key':'wrong'},
    {'model':'unapproved'}, {'extra':'secret'},
])
def test_private_route_rejects_unapproved_configuration_before_sdk_import(change):
    route=dict(model='nvidia/nemotron-3.5-lightning-30b-a3b',api_key='nvapi-SYNTHETIC_NOT_REAL',provider='custom',api_mode='chat_completions',base_url='https://integrate.api.nvidia.com/v1')
    route.update(change)
    with pytest.raises(ValueError):runner()({'role':'probe','_trusted_route':route})

def test_native_transport_is_explicit_and_never_interpolates_root_as_code(monkeypatch):
    root="C:/Program Files/WayfinderRuntime/it's a directory"
    monkeypatch.setenv('WAYFINDER_HERMES_ROOT',root)
    monkeypatch.setenv('WAYFINDER_HERMES_PYTHON','C:/owned/python.exe')
    monkeypatch.setenv('WAYFINDER_PRIVATE_MODEL_ROUTE',json.dumps({'api_key':'nvapi-SYNTHETIC_NOT_REAL'}))
    bridge=HermesBridge()
    assert bridge.command==['C:/owned/python.exe','-I','-']
    assert 'nvapi-' not in bridge.prepare_source('pass')
    compile(bridge.prepare_source('pass'),'<isolated>','exec')
    monkeypatch.delenv('WAYFINDER_HERMES_PYTHON')
    with pytest.raises(HermesUnavailable,match='incomplete'):HermesBridge()
