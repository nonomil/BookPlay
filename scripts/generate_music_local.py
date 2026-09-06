"""Generate real ACE-Step samples on the local CUDA GPU in an isolated environment.

Run with D:/AI/acestep-venv/Scripts/python.exe -X utf8 scripts/generate_music_local.py
"""
from pathlib import Path
import argparse
import json
import os
import shutil
import sys
import time

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('tracks', nargs='*', default=['home', 'journey', 'blocks'])
parser.add_argument('--install', default='D:/AI/ACE-Step-1.5')
parser.add_argument('--thinking', action='store_true', help='Enable the local 1.7B music-planning LM with CPU offload')
parser.add_argument('--take', default='ace', help='Output take label')
args = parser.parse_args()
install = Path(args.install).resolve()
root = Path(__file__).resolve().parents[1]
out = root / 'assets/generated/music-demo'
os.environ['HF_HOME'] = str(install.parent / 'hf-cache')
os.environ['ACESTEP_CHECKPOINTS_DIR'] = str(install / 'checkpoints')
os.environ['HF_HUB_OFFLINE'] = '1'
os.environ['TRANSFORMERS_OFFLINE'] = '1'
os.environ['TOKENIZERS_PARALLELISM'] = 'false'
sys.path.insert(0, str(install))

import torch
from acestep.handler import AceStepHandler
from acestep.inference import GenerationParams, GenerationConfig, generate_music

if not torch.cuda.is_available():
    raise RuntimeError('CUDA is required; refusing to silently fall back to CPU')
torch.set_num_threads(8)
print('GPU', torch.cuda.get_device_name(0), 'torch', torch.__version__, flush=True)
handler = AceStepHandler()
status, ok = handler.initialize_service(
    project_root=str(install), config_path='acestep-v15-turbo', device='cuda',
    offload_to_cpu=True, offload_dit_to_cpu=True, compile_model=False,
    use_flash_attention=False, quantization=None, prefer_source='modelscope',
)
print(status, flush=True)
if not ok:
    raise RuntimeError('ACE-Step initialization failed')
lm = None
if args.thinking:
    from acestep.llm_inference import LLMHandler
    lm = LLMHandler()
    lm_status, lm_ok = lm.initialize(checkpoint_dir=str(install / 'checkpoints'),
        lm_model_path='acestep-5Hz-lm-1.7B', backend='pt', device='cuda', offload_to_cpu=True)
    print(lm_status, flush=True)
    if not lm_ok:
        raise RuntimeError('Music-planning LM initialization failed')
specs = json.loads((out / 'prompts.json').read_text(encoding='utf-8'))
for name in args.tracks:
    spec = specs[name]
    params = GenerationParams(
        caption=spec['prompt'], lyrics=spec['lyrics'], instrumental=spec['lyrics']=='[Instrumental]',
        bpm=spec['bpm'], keyscale=spec['key'], timesignature='4', vocal_language=spec['language'],
        duration=spec['duration'], seed=20260906, inference_steps=8,
        thinking=args.thinking, use_cot_caption=False, use_cot_language=False, use_cot_metas=False,
    )
    config = GenerationConfig(batch_size=1, use_random_seed=False, seeds=[20260906], audio_format='wav')
    started = time.monotonic()
    print('GENERATING', name, spec['duration'], 'seconds', flush=True)
    result = generate_music(handler, lm, params, config, save_dir=str(out / 'raw'))
    receipt = {'generator':'ACE-Step 1.5 local CUDA', 'model':'acestep-v15-turbo',
               'gpu':torch.cuda.get_device_name(0), 'torch':torch.__version__,
               'params':params.to_dict(), 'config':config.to_dict(),
               'elapsed_seconds':round(time.monotonic()-started,2),
               'success':result.success, 'error':result.error,
               'peak_cuda_allocated_gb':round(torch.cuda.max_memory_allocated()/1024**3,3)}
    if result.success and result.audios:
        source = Path(result.audios[0]['path'])
        target = out / f'{name}-{args.take}{source.suffix}'
        shutil.copy2(source, target)
        receipt['file'] = target.name
        print('GENERATED',target,flush=True)
    (out/f'{name}-{args.take}-receipt.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2),encoding='utf-8')
    if not result.success:
        raise RuntimeError(result.error)
