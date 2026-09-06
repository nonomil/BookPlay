import hashlib
import json
import wave
from pathlib import Path
from pack_datapack import included, _build_stage_pack
from pack_android import ENGINE_FILES, DATA_DIRS

ROOT = Path(__file__).resolve().parents[2]


def test_approved_music_identity_and_offline_pack():
    content = ROOT / 'content'
    manifest = json.loads((content / 'assets/music/manifest.json').read_text(encoding='utf-8'))
    files, *_ = _build_stage_pack(content, collections='c01', published='none', episodes='1')
    assert {'app-audio.js', 'app-audio.css'} <= set(ENGINE_FILES)
    assert {'assets/music', 'assets/sfx'} <= {name for name, _ in DATA_DIRS}
    for name, entry in manifest['music'].items():
        rel = 'assets/' + entry['file']
        data = (content / rel).read_bytes()
        assert hashlib.sha256(data).hexdigest() == entry['sha256']
        assert data == (ROOT / 'assets/generated/music-demo' / entry['source']).read_bytes()
        assert included(rel) and rel in files
    assert manifest['music']['jttw']['sha256'] == 'ebfb8a7eea13ddfdd8774eac98dac0841fbb3d5e1cf5f45e29dd02b005f007fb'
    for entry in manifest['sfx'].values():
        rel = 'assets/' + entry['file']
        assert included(rel) and rel in files
        with wave.open(str(content / rel)) as audio:
            assert audio.getnchannels() == 1 and audio.getsampwidth() == 2
            assert abs(audio.getnframes() / audio.getframerate() - entry['seconds']) < .001
