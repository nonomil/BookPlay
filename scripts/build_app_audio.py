"""Install approved music and synthesize gentle, original offline UI/game cues."""
from pathlib import Path
import hashlib
import json
import shutil
import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT/'content/assets'
SR = 44100


def main():
    (OUT/'music').mkdir(parents=True, exist_ok=True)
    (OUT/'sfx').mkdir(parents=True, exist_ok=True)
    music = {'home':'home-ace.mp3', 'jttw':'journey-confirmed-original.mp3', 'minecraft':'blocks-ace.mp3'}
    manifest = {'music':{}, 'sfx':{}, 'sfx_generator':'Deterministic local synthesis; not ACE-Step'}
    for name, source in music.items():
        origin = ROOT/'assets/generated/music-demo'/source
        target = OUT/'music'/f'{name}.mp3'
        shutil.copy2(origin,target)
        manifest['music'][name] = {'file':f'music/{name}.mp3', 'source':source,
            'sha256':hashlib.sha256(target.read_bytes()).hexdigest()}
    cues = {
        'tap':(.13, [(0,880,.075,.25)]),
        'correct':(.55, [(0,659,.24,.4),(.14,880,.32,.38)]),
        'retry':(.38, [(0,392,.12,.30),(.14,330,.17,.22)]),
        'attack':(.27, [(0,440,.10,.24),(.06,880,.12,.3)]),
        'shield':(.45, [(0,294,.15,.3),(.08,440,.22,.22)]),
        'reward':(.95, [(0,523,.28,.3),(.14,659,.3,.3),(.28,784,.4,.3),(.45,1047,.42,.25)]),
        'complete':(1.4, [(0,523,.35,.25),(.16,659,.35,.25),(.32,784,.4,.25),(.58,1047,.65,.25),(.58,659,.65,.12)]),
        'start':(.75, [(0,392,.22,.28),(.17,523,.25,.28),(.34,784,.32,.28)]),
    }
    for name,(duration,notes) in cues.items():
        audio=np.zeros(round(duration*SR))
        for start,freq,length,gain in notes:
            t=np.arange(round(length*SR))/SR
            tone=(np.sin(2*np.pi*freq*t)+.14*np.sin(2*np.pi*freq*2*t))*np.exp(-t*7)
            tone*=np.minimum(t/.008,1)*np.minimum((length-t)/.035,1)*gain
            at=round(start*SR);n=min(len(tone),len(audio)-at);audio[at:at+n]+=tone[:n]
        audio=np.clip(audio,-.7,.7)
        file=OUT/'sfx'/f'{name}.wav';sf.write(file,audio,SR,subtype='PCM_16')
        manifest['sfx'][name]={'file':f'sfx/{name}.wav','seconds':duration,'peak':float(abs(audio).max())}
    (OUT/'music/manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf8')
    print(json.dumps(manifest,ensure_ascii=False,indent=2))


if __name__=='__main__':
    main()
