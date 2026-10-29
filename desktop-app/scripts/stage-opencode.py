"""Stage official pinned OpenCode; --download acquires only public inputs."""
from pathlib import Path
import argparse,hashlib,json,zipfile
from urllib.request import urlopen
root=Path(__file__).resolve().parents[2];source=root/'.local/opencode-research';target=root/'desktop-app/resources/setup'
version='1.19.5';commit='810c0eba1a7348036f8bdf61e6632d0c36c6876c'
url=f'https://github.com/anomalyco/opencode/releases/download/v{version}/opencode-windows-x64-baseline.zip'
sha='e4dac5cd38a182a24e7b3e18853f01d08cdb137e50b3bd1397c1a89e54d28c63'
license_sha='625f0f619133f89bbbb2abe37369613dfa1885eba1e50d02170deb62bb42cb6b'
parser=argparse.ArgumentParser();parser.add_argument('--download',action='store_true');args=parser.parse_args()
archive=source/'opencode-windows-x64-baseline.zip';license=source/'source/LICENSE'
if args.download:
    source.mkdir(parents=True,exist_ok=True);license.parent.mkdir(parents=True,exist_ok=True)
    if not archive.exists():
        with urlopen(url,timeout=180) as response:archive.write_bytes(response.read())
    if not license.exists():
        with urlopen(f'https://raw.githubusercontent.com/anomalyco/opencode/{commit}/LICENSE',timeout=30) as response:license.write_bytes(response.read())
assert hashlib.sha256(archive.read_bytes()).hexdigest()==sha,'Unexpected OpenCode archive'
assert hashlib.sha256(license.read_bytes()).hexdigest()==license_sha,'Unexpected OpenCode license'
target.mkdir(parents=True,exist_ok=True)
with zipfile.ZipFile(archive) as package:binary=package.read('opencode.exe')
(target/'opencode.exe').write_bytes(binary);(target/'OpenCode-LICENSE.txt').write_bytes(license.read_bytes())
(target/'opencode-manifest.json').write_text(json.dumps(dict(version=version,source_commit=commit,archive_sha256='sha256:'+sha,exe_sha256=hashlib.sha256(binary).hexdigest(),url=url),indent=2)+'\n')
print('Official OpenCode baseline binary and license staged.')
