"""Generate project music demos through the official ACE-Step HF Space queue.

This uses the live Gradio schema, and records the exact request and server events.
Requires requests. No credentials or model weights are stored in the project.
"""
from pathlib import Path
import argparse
import json
import time
import uuid
import requests

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'assets/generated/music-demo'
BASE = 'https://ace-step-ace-step-v1-5.hf.space'


def generate(name):
    spec = json.loads((OUT / 'prompts.json').read_text(encoding='utf-8'))[name]
    client = requests.Session()
    response = client.get(BASE + '/config', timeout=90)
    response.raise_for_status()
    config = response.json()
    dep = next(d for d in config['dependencies'] if d.get('api_name') == 'generation_wrapper')
    components = {c['id']: c for c in config['components']}
    values = {
        'models': 'acestep-v15-turbo', 'Prompt': spec['prompt'], 'Lyrics': spec['lyrics'],
        'BPM (optional)': spec['bpm'], 'Key Signature (optional)': spec['key'],
        'Time Signature (optional)': '4', 'Vocal Language': spec['language'],
        'Random Seed': False, 'Seed': '20260906', 'Audio Duration (seconds)': spec['duration'],
        'batch size': 1, 'Thinking': False, 'Audio Format': 'mp3',
    }
    data = []
    for cid in dep['inputs']:
        c = components[cid]
        props = c['props']
        value = None if c['type'] == 'state' else props.get('value')
        if props.get('label') in values:
            value = values[props['label']]
        # These are the published UI's optional LM caption/language/metadata rewrites.
        if cid in (160, 161, 162):
            value = False
        data.append(value)
    session = uuid.uuid4().hex
    payload = {'data': data, 'event_data': None, 'fn_index': dep['id'], 'session_hash': session}
    (OUT / f'{name}-request.json').write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding='utf-8')
    response = client.post(BASE + '/gradio_api/queue/join', json=payload, timeout=40)
    response.raise_for_status()
    print(name, 'submitted', response.text, flush=True)
    deadline = time.monotonic() + 600
    final = None
    with (OUT / f'{name}-events.jsonl').open('w', encoding='utf-8') as log:
        with client.get(BASE + '/gradio_api/queue/data', params={'session_hash': session}, stream=True, timeout=(30, 80)) as stream:
            stream.raise_for_status()
            for line in stream.iter_lines():
                if time.monotonic() > deadline:
                    raise TimeoutError('Generation exceeded 10 minutes')
                if not line or not line.startswith(b'data: '):
                    continue
                event = json.loads(line[6:])
                log.write(json.dumps(event, ensure_ascii=False) + '\n')
                log.flush()
                kind = event.get('msg')
                if kind != 'heartbeat':
                    print(name, kind, str(event.get('output', event.get('progress_data', '')))[:500], flush=True)
                if kind == 'process_completed':
                    final = event
                    break
    if not final or not final.get('success'):
        raise RuntimeError(f'Generation failed: {final}')
    files = []
    def find(value):
        if isinstance(value, dict):
            if value.get('url') and str(value.get('path', '')).lower().endswith(('.mp3', '.wav', '.flac')):
                files.append(value)
            for child in value.values():
                find(child)
        elif isinstance(value, list):
            for child in value:
                find(child)
    find(final)
    if not files:
        raise RuntimeError('No audio returned; inspect the event log')
    file = files[0]
    response = client.get(file['url'], timeout=120)
    response.raise_for_status()
    path = OUT / (name + Path(file['path']).suffix)
    path.write_bytes(response.content)
    print('SAVED', path, len(response.content), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('track', choices=['home', 'journey', 'blocks'])
    generate(parser.parse_args().track)
