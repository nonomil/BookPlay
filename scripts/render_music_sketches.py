"""Render original, deterministic instrumental sketches; NOT ACE-Step output.

Dependencies: numpy, scipy, soundfile. Melody events use beats and MIDI notes.
"""
from pathlib import Path
import json
import numpy as np
import soundfile as sf
from scipy.signal import lfilter

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'assets/generated/music-demo'
SR = 44100
RNG = np.random.default_rng(20260906)


def voice(note, duration, kind):
    t = np.arange(int((duration + .30) * SR)) / SR
    f = 440 * 2 ** ((note - 69) / 12)
    release = np.exp(-np.maximum(t - duration, 0) * 25)
    attack = 1 - np.exp(-t * 140)
    if kind == 'bell':
        y = (np.sin(2*np.pi*f*t)*np.exp(-t*3.2) + .24*np.sin(2*np.pi*f*3*t)*np.exp(-t*7)
             + .08*np.sin(2*np.pi*f*7*t)*np.exp(-t*12))
    elif kind == 'pluck':
        y = sum(np.sin(2*np.pi*f*h*t) * np.exp(-t*(2.5+h)) / h**1.5 for h in range(1, 7))
    elif kind == 'flute':
        phase = 2*np.pi*f*t + .022*np.sin(2*np.pi*5*t)
        y = (np.sin(phase)+.10*np.sin(phase*2)+.035*np.sin(phase*3))
        attack = 1-np.exp(-t*28)
    elif kind == 'pixel':
        y = sum(np.sin(2*np.pi*f*h*t)/h**2 for h in (1,3,5,7))*np.exp(-t*2)
    elif kind == 'pad':
        y = .5*(np.sin(2*np.pi*f*t)+np.sin(2*np.pi*f*1.002*t))
        attack = 1-np.exp(-t*8)
    else:
        y = (np.sin(2*np.pi*f*t)+.15*np.sin(2*np.pi*f*2*t))*np.exp(-t*2)
    return y*attack*release


def render(name, bpm, key, melody, lead):
    beat = 60/bpm
    total_beats = 64
    mix = np.zeros((int((total_beats*beat+2.5)*SR), 2), np.float64)
    def add(y, start, amp, pan=0):
        offset = int(start*beat*SR)
        y = y[:max(0,len(mix)-offset)]*amp
        if not len(y): return
        mix[offset:offset+len(y),0] += y*np.sqrt((1-pan)/2)
        mix[offset:offset+len(y),1] += y*np.sqrt((1+pan)/2)
    # I - V - vi - IV - I - ii - V - I, repeated with added texture.
    chords = [(0,4,7),(-5,-1,2),(-3,0,4),(-7,-3,0),(0,4,7),(2,5,9),(-5,-1,2),(0,4,7)]
    for bar in range(16):
        chord = chords[bar%8]
        base = bar*4
        for idx,note in enumerate(chord):
            add(voice(key+note,3.8*beat,'pad'),base,.045,(idx-1)*.45)
        for b in (0,2):
            add(voice(key+chord[0]-12,1.35*beat,'bass'),base+b,.18,-.06)
        for step in range(8):
            n = key+chord[[0,1,2,1][step%4]] + (12 if name=='blocks' else 0)
            add(voice(n,.42*beat,'pixel' if name=='blocks' else 'pluck'),base+step*.5,.070,-.34 if step%2 else .32)
        for b in (0,2):
            t = np.arange(int(.18*SR))/SR
            kick = np.sin(2*np.pi*(58*t+1.8*(1-np.exp(-t*35))))*np.exp(-t*28)
            add(kick,base+b,.14)
        for b in (1,3):
            t=np.arange(int(.10*SR))/SR
            wood = np.sin(2*np.pi*880*t)*np.exp(-t*85)+.25*np.sin(2*np.pi*1530*t)*np.exp(-t*70)
            add(wood,base+b,.075,.20)
        for step in range(8):
            noise=RNG.normal(0,1,int(.055*SR))
            noise=lfilter([1,-.94],[1],noise)*np.exp(-np.arange(len(noise))/SR*85)
            add(noise,base+step*.5,.013 if step%2 else .008,-.45)
        phrase = melody[bar%8]
        pos = base
        for offset,length in phrase:
            if offset is not None:
                add(voice(key+12+offset,length*beat*.83,lead),pos,.21,.06)
                if bar>=8 and name=='home':
                    add(voice(key+offset,length*beat*.72,'pluck'),pos,.065,-.2)
            pos += length
    # A short tonic cadence, followed by a natural reverb tail.
    for n in (0,4,7,12): add(voice(key+n,1.1,'bell'),64,.085)
    dry=mix.copy()
    for delay,gain in ((.071,.12),(.113,.09),(.173,.065),(.257,.045)):
        shift=int(delay*SR)
        mix[shift:]+=dry[:-shift,::-1]*gain
    mix[:int(.025*SR)]*=np.linspace(0,1,int(.025*SR))[:,None]
    fade=int(.8*SR);mix[-fade:]*=np.linspace(1,0,fade)[:,None]
    mix-=mix.mean(axis=0)
    peak=float(np.max(np.abs(mix)))
    mix*=.79/max(peak,1e-9)
    path=OUT/f'{name}-sketch.wav'
    sf.write(path,mix,SR,subtype='PCM_16')
    return {'name':name,'file':path.name,'generator':'local procedural synthesis; NOT ACE-Step',
            'seconds':round(len(mix)/SR,2),'bpm':bpm,'peak_dbfs':round(20*np.log10(np.max(np.abs(mix))),2),
            'rms_dbfs':round(20*np.log10(np.sqrt(np.mean(mix**2))),2)}


HOME = [
 [(0,.5),(4,.5),(7,1),(9,.5),(7,.5),(4,1)],
 [(2,1),(7,.5),(4,.5),(2,1),(None,1)],
 [(4,.5),(7,.5),(9,1),(12,1),(9,1)],
 [(7,1),(4,1),(2,.5),(0,.5),(None,1)],
 [(0,.5),(4,.5),(7,1),(12,1),(9,1)],
 [(5,.5),(4,.5),(2,1),(5,1),(9,1)],
 [(7,.5),(9,.5),(7,1),(2,1),(4,.5),(2,.5)],
 [(0,2),(7,.5),(4,.5),(0,1)],
]
JOURNEY = [
 [(2,.5),(2,.5),(4,1),(7,1),(9,1)],
 [(7,1),(4,.5),(2,.5),(0,1),(None,1)],
 [(4,.5),(7,.5),(9,1),(12,1),(9,1)],
 [(7,.5),(4,.5),(2,1),(0,2)],
 [(7,1),(9,.5),(7,.5),(4,1),(7,1)],
 [(9,1),(7,.5),(4,.5),(2,1),(None,1)],
 [(2,.5),(4,.5),(7,1),(4,.5),(2,.5),(4,1)],
 [(2,1),(0,2),(None,1)],
]
BLOCKS = [
 [(7,1),(4,.5),(7,.5),(12,1),(None,1)],
 [(11,1),(7,1),(2,1),(None,1)],
 [(9,.5),(12,.5),(9,1),(7,1),(4,1)],
 [(5,1),(4,.5),(2,.5),(0,1),(None,1)],
 [(7,.5),(12,.5),(14,1),(12,1),(7,1)],
 [(9,1),(5,1),(2,1),(None,1)],
 [(7,.5),(9,.5),(11,1),(7,1),(2,1)],
 [(4,1),(2,1),(0,2)],
]
if __name__=='__main__':
    OUT.mkdir(parents=True,exist_ok=True)
    result=[render('home',100,60,HOME,'bell'),render('journey',108,62,JOURNEY,'flute'),render('blocks',96,55,BLOCKS,'pixel')]
    (OUT/'sketch-manifest.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(result,ensure_ascii=False,indent=2))
