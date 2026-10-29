"""The isolated runner's real output block must survive Windows code pages."""
import json
import os
from pathlib import Path
import subprocess
import sys
import pytest

@pytest.mark.parametrize('encoding',['cp1252','ascii'])
def test_native_worker_frame_preserves_unicode_under_legacy_stdout(encoding):
    result={'ok':True,'effective_tools':[],'text':'Résumé — 中文 😊'}
    block=Path('wayfinder/workers/hermes_runner.py').read_text().split('if __name__ == "__main__":',1)[1]
    program=("import base64,contextlib,io,json\nREQUEST_B64='e30='\n"
             'def main(request): return '+ascii(result)+'\n'
             'if __name__ == "__main__":'+block)
    process=subprocess.run([sys.executable,'-I','-'],input=program.encode('ascii'),capture_output=True,
                           env={**os.environ,'PYTHONIOENCODING':encoding},timeout=10)
    assert process.returncode==0
    assert process.stdout.isascii()
    frame=process.stdout.split(b'WAYFINDER_WORKER_RESULT=',1)[1]
    assert json.loads(frame)==result
