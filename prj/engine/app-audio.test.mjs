import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {createAudioManager}=createRequire(import.meta.url)('./app-audio.js');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
class Element extends EventTarget {
  constructor(){super();this.dataset={};this.children=[];this.classList={add(){}};}
  setAttribute(key,value){this[key]=value;}
  append(...nodes){this.children.push(...nodes);}
  remove(){}
}
function setup(t,{prefs={},session={},reject=false,delayed=false}={}) {
  const audios=[];
  class Audio extends EventTarget {
    constructor(src=''){super();Object.assign(this,{src,paused:true,ended:false,currentTime:0,duration:55,volume:1,plays:0});audios.push(this);}
    play(){
      this.plays++;
      if(reject){reject=false;return Promise.reject(Object.assign(new Error('gesture'),{name:'NotAllowedError'}));}
      if(delayed && this===audios[0])return new Promise(resolve=>{this.resolvePlay=()=>{this.paused=false;this.dispatchEvent(new Event('play'));resolve();};});
      this.paused=false;this.dispatchEvent(new Event('play'));return Promise.resolve();
    }
    pause(){if(!this.paused){this.paused=true;this.dispatchEvent(new Event('pause'));}}
    load(){this.currentTime=0;}
  }
  const store=initial=>{const data=new Map(Object.entries(initial).map(([k,v])=>[k,JSON.stringify(v)]));return {getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)};};
  const doc=new Element();doc.body=new Element();doc.hidden=false;doc.createElement=()=>new Element();doc.querySelector=()=>null;
  const env=Object.assign(new EventTarget(),{Audio,document:doc,localStorage:store({bookplay_audio_v1:prefs}),sessionStorage:store(session),setInterval,clearInterval});
  const manager=createAudioManager(env);t.after(()=>manager.destroy());
  return {manager,env,doc,audios,Audio};
}
test('fresh gesture starts the selected track; autoplay rejection can recover',async t=>{
  const {manager,audios}=setup(t,{reject:true});manager.configure('jttw');assert.equal(audios[0].plays,0);
  manager.unlock();await tick();assert.equal(manager.getState().unlocked,false);
  manager.unlock();await tick();assert.equal(manager.getState().paused,false);assert.equal(audios[0].src,'../assets/music/jttw.mp3');
});
test('separate persisted music and cue preferences are respected',async t=>{
  const {manager,env,audios}=setup(t,{prefs:{music:false,sfx:true}});manager.configure('home');manager.unlock();
  assert.equal(audios[0].plays,0);assert.equal(manager.sfx('correct'),true);
  manager.setSfxEnabled(false);assert.equal(audios[1].paused,true);assert.equal(manager.sfx('retry'),false);
  assert.deepEqual(JSON.parse(env.localStorage.getItem('bookplay_audio_v1')),{music:false,sfx:false});
});
test('overlapping narration holds music silent until all speakers stop',async t=>{
  const {manager,Audio,audios}=setup(t);manager.configure('jttw');manager.unlock();await tick();
  const a=manager.watchMedia(new Audio()),b=manager.watchMedia(new Audio());
  await a.play();await b.play();assert.equal(manager.getState().foreground,2);assert.equal(audios[0].volume,0);
  a.pause();assert.equal(manager.getState().foreground,1);assert.equal(audios[0].volume,0);assert.equal(manager.sfx('correct'),false);
  b.pause();await new Promise(resolve=>setTimeout(resolve,300));assert.equal(manager.getState().foreground,0);assert.equal(audios[0].volume,.15);
});
test('map mix keeps music audible under an introduction, then restores it',async t=>{
  const {manager,Audio,audios}=setup(t);manager.configure('jttw',{volume:.30,duckVolume:.08});manager.unlock();await tick();
  const intro=manager.watchMedia(new Audio());await intro.play();
  assert.equal(audios[0].paused,false);assert.equal(audios[0].volume,.08);
  intro.pause();await new Promise(resolve=>setTimeout(resolve,300));assert.equal(audios[0].volume,.30);
  const speech={};manager.setForeground(speech,true);assert.equal(audios[0].volume,.08);
  manager.setForeground(speech,false);manager.setMusicEnabled(false);assert.equal(audios[0].paused,true);assert.equal(audios[0].volume,0);
});
test('rapid cues replace instead of overlap and narration stops cues',async t=>{
  const {manager,audios,Audio}=setup(t);assert.equal(manager.sfx('correct'),true);assert.equal(manager.sfx('correct'),false);
  assert.equal(manager.sfx('retry'),true);assert.equal(audios[1].paused,true);assert.equal(audios[2].paused,false);
  await manager.watchMedia(new Audio()).play();assert.equal(audios[2].paused,true);
});
test('page hiding and independent pause reasons cannot resume each other',async t=>{
  const {manager,env,doc,audios}=setup(t);manager.configure('jttw');manager.unlock();await tick();
  audios[0].currentTime=12;manager.suspend('battle-pause');doc.hidden=true;doc.dispatchEvent(new Event('visibilitychange'));
  doc.hidden=false;doc.dispatchEvent(new Event('visibilitychange'));assert.equal(audios[0].paused,true);
  manager.resume('battle-pause');await tick();assert.equal(audios[0].paused,false);
  env.dispatchEvent(new Event('pagehide'));assert.equal(audios[0].paused,true);
  assert.equal(JSON.parse(env.sessionStorage.getItem('bookplay_music_position_jttw')),12);
  env.dispatchEvent(new Event('pageshow'));await tick();assert.equal(audios[0].paused,false);
});
test('saved track position survives navigation and invalid series clears music',async t=>{
  const {manager,audios}=setup(t,{session:{bookplay_music_position_jttw:21,bookplay_audio_unlocked:true}});
  manager.configure('jttw');audios[0].dispatchEvent(new Event('loadedmetadata'));assert.equal(audios[0].currentTime,21);
  manager.configure('minecraft');assert.match(audios[0].src,/minecraft/);manager.configure('mikey-jj');assert.equal(manager.getState().scene,'');assert.equal(audios[0].paused,true);
});
test('late play resolution cannot restart music after disabling or pagehide',async t=>{
  const {manager,audios}=setup(t,{delayed:true});manager.configure('home');manager.unlock();manager.unlock();assert.equal(audios[0].plays,1);
  manager.setMusicEnabled(false);audios[0].resolvePlay();await tick();assert.equal(audios[0].paused,true);
});
test('music control can switch off while game is paused',async t=>{
  const {manager,doc}=setup(t);manager.configure('jttw');manager.unlock();await tick();manager.attachControls();manager.suspend('battle-pause');
  doc.body.children[0].children[0].dispatchEvent(new Event('click'));assert.equal(manager.getState().musicEnabled,false);
});
test('answer cue can follow a paused prompt before its asynchronous pause event',async t=>{
  const {manager,Audio}=setup(t);const prompt=manager.watchMedia(new Audio());await prompt.play();
  prompt.paused=true; // Browser pause() state changes before the queued pause event.
  assert.equal(manager.sfx('correct'),true);assert.equal(manager.getState().foreground,0);
});
test('storage change updates controls and stops both channels',async t=>{
  const {manager,env,audios}=setup(t);manager.configure('home');manager.unlock();await tick();manager.sfx('reward');
  env.localStorage.setItem('bookplay_audio_v1',JSON.stringify({music:false,sfx:false}));const e=new Event('storage');e.key='bookplay_audio_v1';env.dispatchEvent(e);
  assert.equal(audios[0].paused,true);assert.equal(audios[1].paused,true);assert.equal(manager.getState().sfxEnabled,false);
});
