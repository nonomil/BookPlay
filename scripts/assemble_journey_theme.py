"""Join the user-confirmed A and B chorus takes, preserving original voices."""
from pathlib import Path
import argparse
import hashlib
import json
import shutil
import subprocess

import imageio_ffmpeg
import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'assets/generated/music-demo'
RUNTIME = ROOT / 'content/assets/music-demo'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--with-outro', action='store_true', help='Append the original final refrain and natural instrumental ending')
    args = parser.parse_args()
    # Extend the identification excerpts to phrase endings, avoiding a cut
    # halfway through A's last lyric or the next verse in B.
    parts = [('journey-ace.wav', 18.0, 37.8), ('journey-ace-v2.wav', 18.6, 28.6)]
    if args.with_outro:
        parts.append(('journey-ace-v2.wav', 39.8, 55.0))
    fade = 0.65
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    name = 'journey-a-then-b-complete' if args.with_outro else 'journey-a-then-b'
    wav = SOURCE / f'{name}.wav'
    mp3 = SOURCE / f'{name}.mp3'
    filters = []
    for i, (_, start, end) in enumerate(parts):
        filters.append(f'[{i}:a]atrim=start={start}:end={end},asetpts=PTS-STARTPTS,'
                       f'loudnorm=I=-18:TP=-2:LRA=9,aresample=48000[a{i}]')
    duration = sum(end-start for _, start, end in parts)-fade*(len(parts)-1)
    previous = 'a0'
    for i in range(1, len(parts)):
        combined = f'mix{i}'
        filters.append(f'[{previous}][a{i}]acrossfade=d={fade}:c1=qsin:c2=qsin[{combined}]')
        previous = combined
    end_fade = 1.5 if args.with_outro else .5
    filters.append(f'[{previous}]loudnorm=I=-18:TP=-2:LRA=9,afade=t=in:st=0:d=0.025,'
                   f'afade=t=out:st={duration-end_fade}:d={end_fade}[out]')
    command = [ffmpeg, '-y', '-hide_banner', '-loglevel', 'error']
    for name, _, _ in parts:
        command += ['-i', str(SOURCE/name)]
    subprocess.run(command+['-filter_complex', ';'.join(filters), '-map', '[out]',
                   '-ar', '48000', '-c:a', 'pcm_s24le', str(wav)], check=True)
    subprocess.run([ffmpeg, '-y', '-hide_banner', '-loglevel', 'error', '-i', str(wav),
                    '-c:a', 'libmp3lame', '-b:a', '192k', str(mp3)], check=True)
    data, sr = sf.read(wav)
    assert data.shape[1] == 2 and np.isfinite(data).all()
    assert abs(len(data)/sr-duration) < .02
    assert .01 < np.max(np.abs(data)) < 1
    RUNTIME.mkdir(parents=True, exist_ok=True)
    shutil.copy2(mp3, RUNTIME/mp3.name)
    manifest = {
        'operation': 'Edit existing ACE-Step recordings; A then B; no new generation',
        'file':mp3.name, 'seconds':len(data)/sr, 'sample_rate':sr, 'channels':2,
        'parts':[{'source':name,'start':start,'end':end,
                  'sha256':hashlib.sha256((SOURCE/name).read_bytes()).hexdigest()}
                 for name,start,end in parts],
        'crossfade_seconds':fade, 'crossfade_start_seconds':parts[0][2]-parts[0][1]-fade,
        'with_outro':args.with_outro,
        'outro_description':'Original final refrain followed by its instrumental cadence and decay' if args.with_outro else None,
        'pitch_shift':False, 'time_stretch':False,
        'peak_dbfs':float(20*np.log10(np.max(np.abs(data)))),
        'normalization':'-18 LUFS target, -2 dBTP target',
    }
    (SOURCE/f'{name}-edit.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(manifest,ensure_ascii=False,indent=2))


if __name__ == '__main__':
    main()
