/* Shared offline music and short cues. Explicit foreground-media focus; no Audio monkeypatch. */
(function (root) {
  'use strict';
  const TRACKS = {home:'home', jttw:'jttw', minecraft:'minecraft'};
  const CUES = ['tap','correct','retry','attack','shield','reward','complete','start'];
  function createAudioManager(env) {
    const {document:doc, Audio:AudioClass} = env;
    const safeStore = name => { try { return env[name]; } catch (_) { return null; } };
    const storage=safeStore('localStorage'), session=safeStore('sessionStorage');
    const read = (store,key,fallback) => { try { return JSON.parse(store.getItem(key)) ?? fallback; } catch (_) { return fallback; } };
    const write = (store,key,value) => { try { store.setItem(key,JSON.stringify(value)); } catch (_) {} };
    let prefs = read(storage,'bookplay_audio_v1',{});
    let musicEnabled = prefs.music !== false, sfxEnabled = prefs.sfx !== false;
    let unlocked = read(session,'bookplay_audio_unlocked',false), scene = '', disposed = false;
    let foreground = new Set(), suspended = new Set(), watched = new Map(), own = new WeakSet();
    let activeCues = new Set(), lastCue = new Map(), listeners = [], ramp = null, controls = null, playRequest = null;
    const music = new AudioClass(); own.add(music); music.preload='metadata'; music.loop=true; music.volume=0;
    let mixVolume, duckVolume=0;
    const baseVolume = () => mixVolume ?? (scene === 'jttw' ? .15 : .18);
    const now = () => Date.now();
    function listen(target,event,fn,options) {
      target.addEventListener(event,fn,options); listeners.push(()=>target.removeEventListener(event,fn,options));
    }
    function savePrefs() { write(storage,'bookplay_audio_v1',{music:musicEnabled,sfx:sfxEnabled}); renderControls(); }
    function renderControls() {
      if (!controls) return;
      controls.music.textContent = musicEnabled ? (!unlocked ? '♫ 播放音乐' : (foreground.size ? '♫ 朗读避让' : '♫ 音乐开')) : '♫ 音乐关';
      controls.music.title = foreground.size ? (duckVolume > 0 ? '介绍期间轻声播放，结束后恢复音量' : '朗读期间静音，结束后恢复音乐') : '点击切换背景音乐';
      controls.music.setAttribute('aria-pressed',String(musicEnabled));
      controls.sfx.textContent = sfxEnabled ? '♪ 音效开' : '♪ 音效关';
      controls.sfx.setAttribute('aria-pressed',String(sfxEnabled));
      controls.music.hidden = !scene;
    }
    function volumeTo(value) {
      if (ramp) env.clearInterval(ramp);
      const initial=music.volume, started=now();
      ramp=env.setInterval(()=>{
        const fraction=Math.min(1,(now()-started)/240);
        music.volume=initial+(value-initial)*fraction;
        if (fraction===1) { env.clearInterval(ramp); ramp=null; }
      },30);
    }
    function stopCues() { for (const audio of activeCues) audio.pause(); activeCues.clear(); }
    const shouldPlay = () => !disposed && scene && musicEnabled && unlocked && !doc.hidden && !suspended.size;
    function sync() {
      if (disposed) return;
      if (!scene || !musicEnabled || !unlocked || doc.hidden || suspended.size) {
        if (ramp) {env.clearInterval(ramp); ramp=null;}
        music.pause(); music.volume=0; renderControls(); return;
      }
      if (foreground.size) {
        if (ramp) { env.clearInterval(ramp); ramp=null; }
        music.volume=Math.min(duckVolume,baseVolume());
      } else volumeTo(baseVolume());
      // Autoplay rejection is normal on a fresh browser/WebView. Retry on the next gesture.
      if (music.paused && !playRequest) {
        const request={}; playRequest=request;
        Promise.resolve(music.play()).then(()=>{
          if (!shouldPlay()) music.pause();
        }).catch(error=>{
          if (playRequest===request && error?.name==='NotAllowedError') unlocked=false;
        }).finally(()=>{if(playRequest===request)playRequest=null;renderControls();});
      }
      renderControls();
    }
    function unlock() { unlocked=true; write(session,'bookplay_audio_unlocked',true); sync(); }
    function focus(media,playing) {
      if (!media || own.has(media)) return;
      if (playing) { foreground.add(media); stopCues(); } else foreground.delete(media);
      sync();
    }
    function watchMedia(media) {
      if (!media || watched.has(media) || own.has(media)) return media;
      const start=()=>focus(media,true), stop=()=>focus(media,false);
      media.addEventListener('play',start);
      for (const event of ['pause','ended','error','emptied','abort']) media.addEventListener(event,stop);
      watched.set(media,()=>{media.removeEventListener('play',start); for(const event of ['pause','ended','error','emptied','abort']) media.removeEventListener(event,stop);});
      if (!media.paused && !media.ended) start();
      return media;
    }
    function configure(name, mix={}) {
      mixVolume=Number.isFinite(mix.volume) ? Math.max(0,Math.min(1,mix.volume)) : undefined;
      duckVolume=Number.isFinite(mix.duckVolume) ? Math.max(0,Math.min(1,mix.duckVolume)) : 0;
      name=TRACKS[name] ? name : '';
      if (scene===name) {sync();return;}
      savePosition(); music.pause(); playRequest=null; scene=name;
      if (name) { music.src=`../assets/music/${TRACKS[name]}.mp3`; music.load(); }
      sync();
    }
    function savePosition() { if (scene && Number.isFinite(music.currentTime)) write(session,`bookplay_music_position_${scene}`,music.currentTime); }
    let savedAt=0;
    listen(music,'timeupdate',()=>{if(now()-savedAt>1000){savedAt=now();savePosition();}});
    listen(music,'loadedmetadata',()=>{
      const position=Number(read(session,`bookplay_music_position_${scene}`,0));
      if(Number.isFinite(position) && position>=0 && position<music.duration-.5) music.currentTime=position;
    });
    listen(music,'error',()=>{music.pause();renderControls();});
    listen(music,'play',()=>{if(!shouldPlay())music.pause();});
    function sfx(name) {
      // pause() updates the element immediately; its DOM event arrives later.
      // An accepted answer may stop its spoken prompt and request a cue in one task.
      for (const media of foreground) if (media.paused || media.ended) foreground.delete(media);
      if (disposed || !sfxEnabled || doc.hidden || suspended.size || foreground.size || !CUES.includes(name)) return false;
      if (now()-(lastCue.get(name)||0)<100) return false;
      lastCue.set(name,now());
      // At most one short cue at a time, so rapid answers cannot build a wall of sound.
      stopCues();
      const audio=new AudioClass(`../assets/sfx/${name}.wav`); own.add(audio); audio.volume=.45;
      activeCues.add(audio);
      const clear=()=>activeCues.delete(audio);audio.addEventListener('ended',clear,{once:true});audio.addEventListener('error',clear,{once:true});
      Promise.resolve(audio.play()).catch(clear);
      return true;
    }
    function attachControls() {
      if (!doc.body || controls) return;
      const box=doc.createElement('div'); box.className='app-audio-controls';box.setAttribute('aria-label','声音设置');
      const musicButton=doc.createElement('button'), sfxButton=doc.createElement('button');
      musicButton.type=sfxButton.type='button';musicButton.dataset.audioControl='music';sfxButton.dataset.audioControl='sfx';
      box.append(musicButton,sfxButton);
      const slot=doc.querySelector('[data-audio-slot]');
      (slot || doc.body).append(box);if(slot)box.classList.add('app-audio-inline');
      controls={music:musicButton,sfx:sfxButton,box};
      musicButton.addEventListener('click',()=>{
        if (musicEnabled && !unlocked) {unlock(); return;}
        musicEnabled=!musicEnabled; savePrefs(); if(musicEnabled)unlock();else sync();
      });
      sfxButton.addEventListener('click',()=>{sfxEnabled=!sfxEnabled;if(!sfxEnabled)stopCues();savePrefs();});
      renderControls();
    }
    listen(doc,'click',event=>{if(!event.target.closest?.('[data-audio-control]'))unlock();},true);
    listen(doc,'keydown',event=>{if(['Enter',' ','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key) && !event.target.closest?.('[data-audio-control]'))unlock();},true);
    listen(doc,'play',event=>focus(event.target,true),true);
    for (const event of ['pause','ended','error','emptied','abort']) listen(doc,event,e=>focus(e.target,false),true);
    listen(doc,'visibilitychange',()=>{if(doc.hidden){savePosition();stopCues();} sync();});
    listen(env,'pagehide',()=>{savePosition();suspended.add('pagehide');stopCues();sync();});
    listen(env,'pageshow',()=>{suspended.delete('pagehide');sync();});
    listen(env,'storage',event=>{if(event.key==='bookplay_audio_v1'){prefs=read(storage,event.key,{});musicEnabled=prefs.music!==false;sfxEnabled=prefs.sfx!==false;if(!sfxEnabled)stopCues();sync();}});
    return {
      configure, watchMedia, setForeground:focus, sfx, unlock, attachControls,
      suspend(reason='manual'){suspended.add(reason);stopCues();sync();},
      resume(reason='manual'){suspended.delete(reason);sync();},
      setMusicEnabled(value){musicEnabled=!!value;savePrefs();sync();},
      setSfxEnabled(value){sfxEnabled=!!value;if(!sfxEnabled)stopCues();savePrefs();},
      getState(){return {scene,musicEnabled,sfxEnabled,unlocked,foreground:foreground.size,paused:music.paused,volume:music.volume,src:music.src};},
      destroy(){savePosition();disposed=true;music.pause();stopCues();if(ramp)env.clearInterval(ramp);listeners.forEach(fn=>fn());watched.forEach(fn=>fn());controls?.box.remove();},
    };
  }
  if(typeof module==='object' && module.exports) module.exports={createAudioManager,TRACKS,CUES};
  if (!root.document || !root.Audio) return;
  const manager=createAudioManager(root);root.BookPlayAudio=manager;
  function start(){
    let scene=root.document.body.dataset.audioScene||'';
    if(scene==='series') scene=new URLSearchParams(root.location.search).get('series')||'jttw';
    const data=root.document.body.dataset;
    manager.configure(scene,{volume: data.audioVolume === undefined ? undefined : Number(data.audioVolume),duckVolume:Number(data.audioDuckVolume)});
    manager.attachControls();
  }
  if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})(typeof window==='undefined'?globalThis:window);
