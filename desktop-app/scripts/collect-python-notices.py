"""Record actual build-environment versions and their shipped license notices."""
from importlib import metadata
from pathlib import Path
import hashlib,json,shutil,sys

app=Path(__file__).resolve().parents[1]
licenses=app/'resources/licenses'
output=licenses/'python'
assert output.resolve().is_relative_to((app/'resources').resolve())
if output.exists():shutil.rmtree(output)
output.mkdir(parents=True)
packages=[]
for distribution in sorted(metadata.distributions(),key=lambda d:d.metadata['Name'].lower()):
    name=distribution.metadata['Name'];notices=[]
    for entry in distribution.files or ():
        if not any(part.lower().startswith(('license','licence','copying','notice')) for part in entry.parts):continue
        source=Path(distribution.locate_file(entry))
        if not source.is_file():continue
        # Preserve only package notices, never parent-relative executable paths.
        parts=[part for part in entry.parts if part not in {'.','..'}]
        if parts and parts[0].endswith('.dist-info'):parts=parts[1:]
        target=output/name/Path(*parts)
        assert target.resolve().is_relative_to(output.resolve())
        target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(source,target)
        notices.append(dict(file=target.relative_to(licenses).as_posix(),sha256=hashlib.sha256(target.read_bytes()).hexdigest()))
    packages.append(dict(name=name,version=distribution.version,license=distribution.metadata.get('License-Expression') or distribution.metadata.get('License'),notices=notices))
(licenses/'python-dependencies.json').write_text(json.dumps(dict(scope='Actual Python build environment; development packages may be excluded from the executable.',python=sys.version,packages=packages),indent=2)+'\n',encoding='utf-8')
shutil.copyfile(Path(sys.base_prefix)/'LICENSE.txt',licenses/'Python-LICENSE.txt')
print(f'Collected notices for {len(packages)} Python build distributions.')
