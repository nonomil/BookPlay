"""Read-only repository audit; HTTP probes use temporary bytes and loopback only."""
from pathlib import Path
import ast
import hashlib
import http.client
import json
import subprocess
import sys
import tempfile
import threading

ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT / 'prj/tools'))
import serve

engine = ROOT / 'prj/engine'
files = list(engine.iterdir())
result = {'root': str(ROOT), 'node_test_files': len(list(engine.glob('*.test.mjs')))}
result['large_js'] = sorted([{'file': p.name, 'lines': len(p.read_text(encoding='utf-8').splitlines()), 'bytes': p.stat().st_size} for p in files if p.suffix == '.js'], key=lambda x: -x['lines'])[:10]
result['trees'] = {}
for name in ['prj/engine', 'prj/tools', 'prj/tests', 'android/app/src/main/assets/engine', 'android/app/src/main/assets/public/engine']:
    folder = ROOT / name
    entries = [p for p in folder.rglob('*') if p.is_file() and '__pycache__' not in p.parts]
    result['trees'][name] = {'files': len(entries), 'bytes': sum(p.stat().st_size for p in entries), 'node_tests': sum(p.name.endswith('.test.mjs') for p in entries)}
tree = ast.parse((ROOT / 'prj/tools/pack_android.py').read_text(encoding='utf-8'))
allow = next(ast.literal_eval(n.value) for n in tree.body if isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and t.id == 'ENGINE_FILES' for t in n.targets))
result['legacy_engine_missing_js'] = sorted(p.name for p in files if p.suffix == '.js' and p.name not in allow)
result['legacy_engine_different'] = []
for p in (ROOT / 'android/app/src/main/assets/engine').glob('*'):
    q = engine / p.name
    if p.is_file() and q.is_file() and p.read_bytes() != q.read_bytes():
        result['legacy_engine_different'].append(p.name)

class Quiet(serve.RangeHandler):
    def log_message(self, *_): pass

with tempfile.TemporaryDirectory(prefix='bookplay-audit-') as temp:
    folder = Path(temp)
    (folder / 'sample.bin').write_bytes(bytes(range(100)))
    serve.URL_ROOTS['assets'] = folder
    server = serve.ThreadingHTTPServer(('127.0.0.1', 0), Quiet)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    result['desktop_range'] = []
    try:
        for value in ['bytes=0-16', 'bytes=90-', 'bytes=-10', 'bytes=100-', 'bytes=20-10']:
            conn = http.client.HTTPConnection('127.0.0.1', server.server_port, timeout=3)
            conn.request('GET', '/assets/sample.bin', headers={'Range': value})
            response = conn.getresponse()
            body = response.read()
            result['desktop_range'].append({'request': value, 'status': response.status, 'content_range': response.getheader('Content-Range'), 'length': len(body), 'first_byte': body[0] if body else None})
            conn.close()
    finally:
        server.shutdown()
        server.server_close()
        thread.join()

js = """const f=require('./prj/engine/dub-store.js');(async()=>{const s=f.create({indexedDB:null});await s.putClip('ep1:n001',{size:3},{});const deleted=await s.deleteClip('ep1:n001');console.log(JSON.stringify({deleted,remaining:await s.estimateCount(),stillReadable:!!(await s.getClip('ep1:n001'))}));})();"""
result['dub_delete_memory'] = json.loads(subprocess.check_output(['node', '-e', js], cwd=ROOT, text=True, encoding='utf-8'))
result['source_sha256'] = {name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest() for name in ['prj/tools/serve.py', 'prj/engine/dub-store.js', 'prj/engine/dub.js', 'prj/engine/content-gate.js', 'android/app/src/main/java/com/nonomil/storyhall/DataPackStore.java', 'android/app/src/main/java/com/nonomil/storyhall/LocalRangeServer.java']}
print(json.dumps(result, ensure_ascii=False, indent=2))
