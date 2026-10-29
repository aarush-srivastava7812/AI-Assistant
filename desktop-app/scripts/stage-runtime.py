"""Stage the immutable upstream source and pinned bootstrap, without local profiles."""
import hashlib,json,subprocess,shutil
from pathlib import Path
root=Path(__file__).resolve().parents[2]
source=root/'.local/hermes-native/source'
target=root/'desktop-app/resources/setup'
commit='bf0203a794a07aac3ff764972ab9087baa4e4f4e'
if subprocess.check_output(['git','-C',str(source),'rev-parse','HEAD'],text=True).strip()!=commit:
    raise SystemExit('Unexpected Hermes source commit')
if subprocess.check_output(['git','-C',str(source),'status','--porcelain'],text=True).strip():
    raise SystemExit('Upstream runtime source has local modifications')
target.mkdir(parents=True,exist_ok=True)
archive=target/'hermes-source.zip'
subprocess.run(['git','-C',str(source),'archive','--format=zip','--output',str(archive),commit],check=True)
uv=root/'.local/build-tools/bin/uv.exe'
if hashlib.sha256(uv.read_bytes()).hexdigest()!='81ea623608f8c17720c62efd0a380a8ead380c4d365ba6968e9d279a2319c674':
    raise SystemExit('Unexpected uv bootstrap executable')
shutil.copyfile(uv,target/'uv.exe')
digest=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
(target/'runtime-manifest.json').write_text(json.dumps(dict(schema=1,source_commit=commit,source_version='v0.22.5',source_url='https://github.com/NousResearch/hermes-agent',source_sha256=digest(archive),lock_sha256=digest(source/'uv.lock'),agent_sha256=digest(source/'run_agent.py'),uv_version='0.13.6',uv_sha256=digest(uv),python_version='3.14.10'),indent=2)+'\n')
print('Pinned runtime bootstrap staged; no credentials or machine profiles included.')
