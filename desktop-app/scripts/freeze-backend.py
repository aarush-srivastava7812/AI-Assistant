"""Build a self-contained Windows backend from the verified CPU environment.

No user state, provider credentials, development venv, or Docker engine is copied.
PyInstaller supplies the interpreter/runtime; existing Wayfinder/Iron Web stay the implementation.
"""
from pathlib import Path
import hashlib,json,os,shutil,sys,ssl
root=Path(__file__).resolve().parents[2];app=root/'desktop-app';bundle=app/'.cache/bundle'
assert os.name=='nt' and sys.version_info[:2]==(3,12)
tools=app/'.cache/packaging-tools';sys.path.insert(0,str(tools));sys.path.insert(0,str(root))
from PyInstaller.__main__ import run
source=bundle/'backend-project'
def clear_owned_stage(path):
    resolved=path.resolve()
    assert resolved.is_relative_to(bundle.resolve()) and resolved!=bundle.resolve()
    if resolved.exists():shutil.rmtree(resolved)
clear_owned_stage(source)
for package in ['memory','wayfinder']:
    for p in (root/package).rglob('*'):
        if p.is_file() and p.suffix in {'.py','.json','.yaml','.yml','.toml'} and not any(part in {'__pycache__','_index'} for part in p.parts):
            dest=source/p.relative_to(root);dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(p,dest)
# Dereference ONLY public model-cache files within this one approved model.
cached=Path(os.environ.get('WAYFINDER_BUILD_MODEL_CACHE',str(Path(os.environ['TEMP'])/'fastembed_cache/models--qdrant--bge-small-en-v1.5-onnx-q')))
assert cached.is_dir()
assert cached.name=='models--qdrant--bge-small-en-v1.5-onnx-q'
model_files=[p for p in cached.rglob('*') if p.is_file()]
# An existing but empty cache must never silently produce an incomplete EXE.
assert len(model_files)>=5 and any(p.suffix=='.onnx' for p in model_files), 'Complete public embedding model cache required'
for p in model_files:
    resolved=p.resolve();assert resolved.is_relative_to(cached.resolve())
    dest=bundle/'models'/cached.name/p.relative_to(cached);dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(resolved,dest)
args=[str(app/'backend/host.py'),'--name','WayfinderBackend','--onedir','--console','--noconfirm','--clean','--distpath',str(bundle/'frozen'),'--workpath',str(app/'.cache/freeze-work'),'--specpath',str(app/'.cache'),'--paths',str(root),'--add-data',str(app/'FEATURES.json')+';.', '--add-data',str(source/'memory')+';memory','--add-data',str(source/'wayfinder')+';wayfinder']
# This installed Python's ssl.py explicitly loads this public trust-policy file.
# Retain the installed verification policy instead of disabling TLS verification.
trust_file=Path(ssl.__file__).with_name('codex-rejected-cas.pem')
if trust_file.exists():args+=['--add-data',str(trust_file)+';.']
for package in ['memory','wayfinder','fastembed','qdrant_client','onnxruntime','tokenizers','grpc','falkordb','huggingface_hub','pydantic','loguru']:
    args+=['--collect-all',package]
for package in ['torch','tensorflow','transformers','sentence_transformers','pandas','scipy','matplotlib','pytest','IPython','jupyter','onnx','setuptools']:
    args+=['--exclude-module',package]
if '--stage-only' in sys.argv:
    embedded=bundle/'frozen/WayfinderBackend/_internal/FEATURES.json'
    assert embedded.is_file() and embedded.read_bytes()==(app/'FEATURES.json').read_bytes(), 'Frozen backend manifest differs; run a full freeze before staging'
else:run(args)
target=bundle/'backend';clear_owned_stage(target);target.mkdir(exist_ok=True)
shutil.copytree(bundle/'frozen/WayfinderBackend',target,dirs_exist_ok=True,ignore=shutil.ignore_patterns('__pycache__','*.pyc','*.debug-original'))
if trust_file.exists():shutil.copyfile(trust_file,target/'_internal'/trust_file.name)
# The host uses an adjacent manifest. Frozen imports also have the internal copy.
shutil.copyfile(app/'FEATURES.json',target/'FEATURES.json')
manifest={p.relative_to(bundle).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in bundle.rglob('*') if p.is_file() and 'frozen' not in p.parts}
(app/'.cache/backend-manifest.json').write_text(json.dumps(dict(python=sys.version,files=manifest),indent=2)+'\n')
print('Bundled backend and public memory model',len(manifest),'files')
