"""One provider catalog for desktop selection and isolated runtime validation."""
import json
from pathlib import Path
import re
from urllib.parse import urlsplit

CATALOG = json.loads((Path(__file__).parents[1] / 'model-providers.json').read_text(encoding='utf-8'))
PROVIDERS = {p['id']: p for p in CATALOG}

def validate_route(route):
    error = 'Choose your provider, API key and model, then connect again in setup.'
    if not isinstance(route, dict) or set(route) != {'provider', 'model', 'api_key', 'api_mode', 'base_url'}:
        raise ValueError(error)
    model, key = route['model'], route['api_key']
    if not isinstance(model, str) or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.:/@+\-]{0,199}', model) or not isinstance(key, str) or not re.fullmatch(r'[!-~]{8,4096}', key):
        raise ValueError(error)
    legacy = route['provider'] == 'custom'
    provider = PROVIDERS.get('nvidia' if legacy else route['provider'])
    if not provider or route['api_mode'] != provider['api_mode']:
        raise ValueError(error)
    base = route['base_url']
    if not isinstance(base, str) or len(base) > 500 or re.search(r'[\s{}\\]', base):
        raise ValueError(error)
    try:
        url = urlsplit(base)
        if url.scheme != 'https' or not url.hostname or url.username or url.password or url.query or url.fragment:
            raise ValueError(error)
        url.port
    except (ValueError, TypeError):
        raise ValueError(error) from None
    if provider['id'] != 'openai-compatible' and base != provider['base_url']:
        raise ValueError(error)
    if legacy and (model not in provider['models'] or not key.startswith('nvapi-')):
        raise ValueError(error)
    return dict(model=model, provider=route['provider'], endpoint=base if provider['id']=='openai-compatible' else url.hostname)

def provider_spec(route):
    validate_route(route)
    return PROVIDERS['nvidia' if route['provider']=='custom' else route['provider']]
