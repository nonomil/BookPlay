"""Normalize selected ACE-Step takes and publish MP3s to the local preview assets."""
from pathlib import Path
import json
import shutil
import subprocess
import imageio_ffmpeg
import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'assets/generated/music-demo'
RUNTIME = ROOT / 'content/assets/music-demo'
SELECTED = ['home-ace', 'journey-confirmed-original', 'blocks-ace']


def encode(source, target, duration):
    subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), '-y', '-hide_banner', '-loglevel', 'error',
        '-i', str(source), '-t', str(duration), '-af',
        f'loudnorm=I=-18:TP=-2:LRA=9,afade=t=in:st=0:d=0.08,afade=t=out:st={duration-.6}:d=0.6',
        '-ar', '48000', '-codec:a', 'libmp3lame', '-b:a', '192k', str(target)], check=True)


def main():
    RUNTIME.mkdir(parents=True, exist_ok=True)
    checks = []
    for take in SELECTED:
        path = SOURCE / f'{take}.wav'
        data, rate = sf.read(path)
        assert np.isfinite(data).all() and data.ndim == 2 and data.shape[1] == 2
        peak = float(np.max(np.abs(data)))
        assert 0.01 < peak < 1, (path, peak)
        duration = len(data)/rate
        target = SOURCE / f'{take}.mp3'
        encode(path, target, duration)
        shutil.copy2(target, RUNTIME / target.name)
        checks.append({'file':target.name, 'source':path.name, 'seconds':duration, 'sample_rate':rate,
                       'channels':2, 'source_peak':peak, 'source_rms':float(np.sqrt(np.mean(data**2))),
                       'bytes':target.stat().st_size, 'normalization':'FFmpeg loudnorm -18 LUFS, -2 dBTP target'})
    target = SOURCE / 'home-opening-10s.mp3'
    encode(SOURCE/'home-ace.wav', target, 10)
    shutil.copy2(target, RUNTIME/target.name)
    shutil.copy2(SOURCE/'prompts.json', RUNTIME/'prompts.json')
    (SOURCE/'selected-audio-validation.json').write_text(json.dumps(checks,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(checks,ensure_ascii=False,indent=2))


if __name__ == '__main__':
    main()
