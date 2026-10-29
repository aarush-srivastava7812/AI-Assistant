"""Catalog and isolation contracts; these do not claim live vendor access."""
import json
from pathlib import Path
import pytest
from wayfinder.workers.model_routes import CATALOG, validate_route
from wayfinder.workers.opencode import configuration, isolated_environment, PROVIDER

@pytest.mark.parametrize('provider',[p for p in CATALOG if p['base_url']],ids=lambda p:p['id'])
def test_each_provider_uses_its_own_transport_endpoint_and_private_key(provider,tmp_path):
    route=dict(provider=provider['id'],model=provider['models'][0],api_mode=provider['api_mode'],base_url=provider['base_url'],api_key='SYNTHETIC-private-key')
    assert validate_route(route)['provider']==provider['id']
    config=configuration(route)
    entry=config['provider'][PROVIDER]
    assert entry['npm']==provider['npm'] and entry['options']['baseURL']==provider['base_url']
    assert list(entry['models'])==[route['model']]
    env=isolated_environment(tmp_path,route,'synthetic-password')
    assert env['WAYFINDER_MODEL_API_KEY']==route['api_key']
    assert route['api_key'] not in env['OPENCODE_CONFIG_CONTENT']
    assert config['permission']=={'*':'deny'} and config['enabled_providers']==[PROVIDER]
    with pytest.raises(ValueError):validate_route(dict(route,base_url='https://different.invalid/v1'))

def test_custom_pin_includes_full_endpoint_path():
    route=dict(provider='openai-compatible',model='your-model',api_mode='chat_completions',base_url='https://example.com/provider/v1',api_key='SYNTHETIC-private-key')
    assert validate_route(route)['endpoint']==route['base_url']
    for url in ['http://example.com/v1','https://user:secret@example.com/v1','https://example.com/v1?key=secret','https://example.com/{env:KEY}']:
        with pytest.raises(ValueError):validate_route(dict(route,base_url=url))

def test_injected_runner_validator_compiles_without_importing_application_packages(monkeypatch):
    from wayfinder.workers.hermes import HermesBridge
    monkeypatch.setenv('WAYFINDER_HERMES_ROOT','C:/owned/hermes')
    monkeypatch.setenv('WAYFINDER_HERMES_PYTHON','C:/owned/python.exe')
    bridge=HermesBridge()
    source=Path('wayfinder/workers/model_routes.py').read_text().replace("CATALOG = json.loads((Path(__file__).parents[1] / 'model-providers.json').read_text(encoding='utf-8'))",'CATALOG = '+repr(CATALOG))
    compile(bridge.prepare_source(source),'private-validator','exec')
