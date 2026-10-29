"""Publish versioned desktop EXEs without rewriting tags or replacing assets.

Uses the existing Git Credential Manager credential in memory only. Each local
EXE must match both its retained checksum and original verification record.
"""
from pathlib import Path
import argparse,hashlib,json,subprocess
from urllib.parse import urlsplit
import requests
from requests.adapters import HTTPAdapter
ROOT=Path(__file__).resolve().parents[1]
FOLDER=ROOT/'desktop-app/release'
REPO='aarush-srivastava7812/AI-Assistant'
BASE='https://api.github.com/repos/'+REPO
TARGETS={'0.5.0-preview.6':'4633262','0.5.0-preview.5':'863e20a','0.5.0-preview.4':'70582f6','0.5.0-preview.3':'4880caa','0.5.0-preview.2':'5fa2dde','0.5.0-preview.1':'41042c3','0.4.1':'v0.4.1','0.4.0':'v0.4.0'}

def digest(path):
    with path.open('rb') as stream:return hashlib.file_digest(stream,'sha256').hexdigest()

def inputs(version):
    exe=FOLDER/f'Wayfinder-{version}-Windows-x64.exe'
    checksum=FOLDER/(exe.name+'.sha256')
    evidence=FOLDER/f'Wayfinder-{version}-verification.json'
    usage=FOLDER/f'START-HERE-{version}.md'
    record=json.loads(evidence.read_text(encoding='utf-8-sig'))
    sha=digest(exe)
    assert sha==checksum.read_text().split()[0]==record.get('sha256',record.get('portable_sha256')),f'EXE identity mismatch: {version}'
    assert exe.stat().st_size==record.get('bytes',record.get('portable_bytes')),f'EXE size mismatch: {version}'
    target=subprocess.check_output(['git','rev-parse',TARGETS[version]+'^{commit}'],cwd=ROOT,text=True).strip()
    files=[exe,checksum,evidence,usage]
    if 'setup_sha256' in record:
        setup=FOLDER/f'Wayfinder-Setup-{version}-Windows-x64.exe'
        setup_checksum=FOLDER/(setup.name+'.sha256')
        assert digest(setup)==record['setup_sha256']==setup_checksum.read_text().split()[0]
        assert setup.stat().st_size==record['setup_bytes']
        files.extend([setup,setup_checksum])
    return files,target

class ProgressFile:
    def __init__(self,path):self.file=path.open('rb');self.len=path.stat().st_size;self.count=0;self.last=0;self.name=path.name
    def read(self,size=-1):
        value=self.file.read(size);self.count+=len(value)
        if self.count-self.last>=64*1024*1024:
            self.last=self.count;print(f'Uploading {self.name}: {self.count*100//self.len}%',flush=True)
        return value

class UploadAdapter(HTTPAdapter):
    def init_poolmanager(self,*args,**kwargs):
        # Larger reads reduce Python/TLS overhead for the versioned EXE assets.
        kwargs['blocksize']=1024*1024
        return super().init_poolmanager(*args,**kwargs)

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--publish',action='store_true');args=parser.parse_args()
    # Validate every input before making any external mutation.
    versions={version:inputs(version) for version in TARGETS}
    discovered={p.name for p in FOLDER.glob('Wayfinder-*-Windows-x64.exe')}
    assert discovered=={p.name for files,_ in versions.values() for p in files if p.suffix=='.exe'},'Unaccounted versioned executable'
    result=subprocess.run(['git','credential','fill'],input='protocol=https\nhost=github.com\n\n',text=True,capture_output=True,check=True,cwd=ROOT)
    credential=dict(line.split('=',1) for line in result.stdout.splitlines() if '=' in line)
    session=requests.Session();session.headers.update({'Authorization':'Bearer '+credential['password'],'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'})
    session.mount('https://uploads.github.com/',UploadAdapter())
    del credential,result
    def call(method,url,**kwargs):
        assert urlsplit(url).hostname in {'api.github.com','uploads.github.com'},'Unexpected GitHub API host'
        response=session.request(method,url,allow_redirects=False,timeout=kwargs.pop('timeout',30),**kwargs)
        if not 200<=response.status_code<300:raise RuntimeError(f'GitHub {method} failed with HTTP {response.status_code}; no credentials logged.')
        return response.json()
    releases=[]
    for page in range(1,11):
        batch=call('GET',BASE+'/releases',params={'per_page':100,'page':page});releases+=batch
        if len(batch)<100:break
    existing={r['tag_name']:r for r in releases};published=[]
    for version,(files,target) in versions.items():
        tag='v'+version;release=existing.get(tag)
        print(('Publish/check ' if args.publish else 'Plan ')+tag,flush=True)
        if not args.publish:
            print(json.dumps({'tag':tag,'target':target,'exists':bool(release),'files':[dict(name=p.name,bytes=p.stat().st_size,sha256=digest(p)) for p in files]}),flush=True);continue
        if release is None:
            title='Wayfinder '+version+(' - OpenCode providers and streamlined onboarding' if version.endswith('preview.6') else ' - setup installer and permission-based onboarding' if version.endswith('preview.5') else ' - desktop pet and chat widget' if version.endswith('preview.4') else ' - Windows desktop preview')
            body=files[3].read_text(encoding='utf-8-sig')+'\n\nDownload the Windows x64 EXE and verify its attached SHA-256 checksum. The original build verification JSON is attached. Publication does not add new qualification or test coverage.'
            release=call('POST',BASE+'/releases',json={'tag_name':tag,'target_commitish':target,'name':title,'draft':True,'prerelease':'preview' in version,'make_latest':'false','body':body})
            print('Created draft '+tag,flush=True)
        assets={a['name']:a for a in release['assets']}
        for path in files:
            sha='sha256:'+digest(path)
            if path.name in assets:
                asset=assets[path.name]
                assert asset['state']=='uploaded' and asset['size']==path.stat().st_size and asset.get('digest')==sha,'Existing asset differs; no replacement performed: '+path.name
                print('Verified existing '+path.name,flush=True);continue
            payload=ProgressFile(path)
            try:asset=call('POST',release['upload_url'].split('{',1)[0],params={'name':path.name},data=payload,headers={'Content-Type':'application/octet-stream','Content-Length':str(payload.len)},timeout=(30,900))
            finally:payload.file.close()
            assert asset['state']=='uploaded' and asset['size']==path.stat().st_size and asset.get('digest')==sha,'Uploaded asset verification failed'
            print('Uploaded and verified '+path.name,flush=True)
        release=call('GET',BASE+'/releases/'+str(release['id']))
        names={a['name'] for a in release['assets']};assert {p.name for p in files}<=names
        if release['draft']:release=call('PATCH',BASE+'/releases/'+str(release['id']),json={'draft':False,'make_latest':'false'})
        assert not release['draft']
        row={'version':version,'url':release['html_url'],'prerelease':release['prerelease'],'assets':[{'name':a['name'],'bytes':a['size'],'digest':a.get('digest'),'url':a['browser_download_url']} for a in release['assets']]}
        published.append(row);print('Published and verified '+row['url'],flush=True)
        destination=ROOT/'.local/verification/all-desktop-releases.json';destination.parent.mkdir(parents=True,exist_ok=True);destination.write_text(json.dumps(published,indent=2)+'\n')
    print(json.dumps({'published_or_verified':len(published),'releases':[r['url'] for r in published]}),flush=True)
if __name__=='__main__':main()
