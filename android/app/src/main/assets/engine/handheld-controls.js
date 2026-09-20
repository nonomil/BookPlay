(function (w) {
  'use strict';
  var actions = {confirm:'确认 / Enter',cancel:'返回 / Esc',left:'上一页 / 左',right:'下一页 / 右',jump:'跳跃',attack:'攻击',place:'放置',mine:'挖掘（按住）',sneak:'潜行 / 下蹲',run:'加速（按住）',interact:'交互',bag:'背包 / 合成',pause:'暂停 / 视角',slotPrev:'上一物品',slotNext:'下一物品',none:'不绑定'};
  var buttons = {F1:'A',F2:'B',F3:'X',F4:'Y',F5:'L1',F6:'R1',F7:'L2',F8:'R2',F9:'Select'};
  function autoMode(path,quiz) {return quiz?'quiz':/\/(game|adventure|battle)\.html$/.test(path)?'game':/\/(wala|lesson|lesson-words|drill|review)\.html$/.test(path)?'quiz':'learn';}
  function defaults(app,mode) {
    if(app==='bookplay' && mode==='game')return {F1:'attack',F2:'cancel',F3:'interact',F4:'pause',F5:'none',F6:'none',F7:'none',F8:'attack',F9:'pause'};
    if (app === 'bookplay') return {F1:'confirm',F2:'cancel',F3:'left',F4:'right',F5:'left',F6:'right',F7:'none',F8:'none',F9:'cancel'};
    if (app === 'blocklegend') return {F1:'jump',F2:'attack',F3:'place',F4:'sneak',F5:'slotPrev',F6:'slotNext',F7:'run',F8:'interact',F9:'bag'};
    return {F1:'jump',F2:'attack',F3:'place',F4:'mine',F5:'slotPrev',F6:'slotNext',F7:'run',F8:'bag',F9:'pause'};
  }
  function load(app, text, mode) {
    var m=defaults(app,mode), saved;
    try { saved=JSON.parse(text||'{}'); } catch (_) { saved={}; }
    var allowed=app==='bookplay'?{confirm:1,cancel:1,left:1,right:1,attack:1,interact:1,pause:1,none:1}:actions;
    Object.keys(m).forEach(function(k){ if(saved && Object.prototype.hasOwnProperty.call(allowed,saved[k])) m[k]=saved[k]; });
    return m;
  }
  var quizSelector='#sb-quiz button,#w-quiz button,.w-quiz-choice,#game-gate button,#game-bossgate button,#game-dialogue-choices button,#game-pause button,#battle-quiz button,.battle-quiz-choice,#battle-gate button,#battle-pause button,#battle-dialogue button,[data-choice],.quiz-choice,.quiz-option';
  if (typeof module==='object' && module.exports) { module.exports={defaults:defaults,load:load,autoMode:autoMode,quizSelector:quizSelector}; return; }
  if (!w.document || w.X35SControls) return;
  var d=w.document, tag=d.currentScript, app=tag && tag.getAttribute('data-app') || 'bookplay';
  var key='x35s-controls-v1:'+app, mapping=load(app,safeRead()), held={}, movement={}, look={}, slot=1, panel, status, opener, lastFocus, lastTime=0;
  var bridge=w.location.hostname==='127.0.0.1', selectors={}, ready=false, mode='learn', override='auto', axes;

  function visible(el){return el && el.getClientRects().length && !el.disabled;}
  function inClosedDetails(el){
    var n=el;
    while(n&&n!==d.documentElement){
      if(n.tagName==='DETAILS'&&!n.open)return true;
      n=n.parentElement;
    }
    return false;
  }
  function playable(el){
    return !!(el&&visible(el)&&el!==opener&&!(panel&&panel.contains(el))&&!el.hasAttribute('data-open-handheld')&&!inClosedDetails(el));
  }
  function focusDefault(){
    var list=Array.prototype.slice.call(d.querySelectorAll('.play-ep, .book-card, a.node, #map-track a[href], main a[href], a[href], button')).filter(playable);
    if(list[0]) list[0].focus();
  }
  function syncMode(){if(app!=='bookplay')return;var quiz=Array.prototype.some.call(d.querySelectorAll(quizSelector),visible);var next=override==='auto'?autoMode(w.location.pathname,quiz):override;if(next!==mode){release();mode=next;key='x35s-controls-v1:bookplay:'+mode;mapping=load(app,safeRead(),mode);Object.keys(selectors).forEach(function(k){selectors[k].value=mapping[k];});}if(axes)axes.textContent='当前：'+{learn:'学习｜左右翻页，上下选控件，A 确认',quiz:'知识巩固｜左摇杆/方向键选择答案，A 确认',game:'游戏｜左摇杆/十字键自由移动，A 攻击，X 交互，Y 暂停'}[mode]+'。右摇杆不模拟鼠标；Start 打开按键菜单。';}
  function quizLayer(appName){return appName==='blocklegend'&&d.querySelector('#quiz-layer:not(.is-hidden)');}
  function quizOpen(appName){return quizLayer(appName)&&d.querySelector('#quiz-choices button');}
  function navigate(dir){var list=app==='bookplay'&&mode==='quiz'?Array.prototype.slice.call(d.querySelectorAll(quizSelector)).filter(playable):app==='blocklegend'&&quizOpen(app)?Array.prototype.slice.call(d.querySelectorAll('#quiz-choices button')).filter(playable):[];if(!list.length)list=Array.prototype.slice.call(d.querySelectorAll('button,a[href],input,select')).filter(playable);if(!list.length)return;var current=d.activeElement,at=list.indexOf(current);if(at<0){list[0].focus();return;}var r=current.getBoundingClientRect(),best=null,score=Infinity;list.forEach(function(el){if(el===current)return;var q=el.getBoundingClientRect(),dx=q.left+q.width/2-r.left-r.width/2,dy=q.top+q.height/2-r.top-r.height/2;var main=dir==='Left'?-dx:dir==='Right'?dx:dir==='Up'?-dy:dy,cross=/Left|Right/.test(dir)?dy:dx;if(main>2&&main+Math.abs(cross)*2<score){score=main+Math.abs(cross)*2;best=el;}});(best||list[(at+(/Up|Left/.test(dir)?list.length-1:1))%list.length]).focus();}
  function safeRead(){try{return w.localStorage.getItem(key);}catch(_){return '';}}
  function save(){try{w.localStorage.setItem(key,JSON.stringify(mapping));status.textContent='已保存到本游戏';}catch(_){status.textContent='当前无法保存；本次会话仍生效';}}
  function editable(el){return el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));}
  function keyboard(k,code,down){
    var ev=new KeyboardEvent(down?'keydown':'keyup',{key:k,code:code,bubbles:true,cancelable:true});
    try { Object.defineProperty(ev,'x35sTest',{value:true}); } catch(_) { ev.x35sTest=true; }
    d.dispatchEvent(ev);
  }
  function action(a,down){
    if (a==='none') return;
    if(app==='blocklegend' && quizLayer(app) && a==='jump'){if(down){if(d.activeElement&&d.activeElement.closest&&d.activeElement.closest('#quiz-choices'))d.activeElement.click();else if(d.querySelector('#quiz-input:not([readonly])'))keyboard('Enter','Enter',true);}return;}
    if(app==='bookplay' && mode!=='game' && (a==='left'||a==='right')){if(down)navigate(a==='left'?'Left':'Right');return;}
    if(app==='bookplay' && mode==='game' && (a==='attack'||a==='interact'||a==='pause')){
      var focus=d.activeElement;
      if(down && focus && /^(BUTTON|A)$/.test(focus.tagName) && focus!==opener && (!panel||!panel.contains(focus))){focus.click();return;}
      var p=a==='pause'?['Escape','Escape']:['Enter','Enter'];
      keyboard(p[0],p[1],down);
      return;
    }
    if(a==='confirm' && down){
      var splash=d.getElementById('map-splash');
      if(splash && !splash.classList.contains('gone') && visible(splash)){splash.click();return;}
      if(!playable(d.activeElement) || !/^(BUTTON|A)$/.test(d.activeElement.tagName)) focusDefault();
      if(d.activeElement && /^(BUTTON|A)$/.test(d.activeElement.tagName) && playable(d.activeElement)){d.activeElement.click();return;}
    }
    var target, holdName={jump:'jump',mine:'mine',sneak:'down',run:'run'}[a];
    if(app==='blocklegend' && /^(jump|attack|place|sneak|run)$/.test(a)) {d.dispatchEvent(new CustomEvent('x35s-action',{detail:{action:a,down:down}}));return;}
    if(app!=='bookplay') {
      target=d.querySelector('[data-hold="'+(holdName||a)+'"]') || d.querySelector('[data-act="'+(a==='attack'&&app==='plainland'?'strike':a==='run'?'sprint':a)+'"]');
      if(target) { target.dispatchEvent(new PointerEvent(down?'pointerdown':'pointerup',{pointerId:89,pointerType:'touch',bubbles:true,cancelable:true,button:0,buttons:down?1:0})); return; }
    }
    if(a==='slotPrev'||a==='slotNext') {if(down){slot=(slot+(a==='slotNext'?1:8)-1)%9+1;keyboard(String(slot),'Digit'+slot,true);keyboard(String(slot),'Digit'+slot,false);}return;}
    var keys={confirm:['Enter','Enter'],cancel:['Escape','Escape'],left:['ArrowLeft','ArrowLeft'],right:['ArrowRight','ArrowRight'],jump:[' ','Space'],sneak:['Shift','ShiftLeft'],run:app==='plainland'?['Shift','ShiftLeft']:['r','KeyR'],interact:['f','KeyF'],bag:app==='plainland'?['e','KeyE']:['c','KeyC'],pause:['p','KeyP']};
    if(keys[a]) keyboard(keys[a][0],keys[a][1],down);
  }
  function release(){Object.keys(held).forEach(function(k){action(held[k],false);});held={};Object.keys(movement).forEach(function(k){var p=movement[k];keyboard(p[0],p[1],false);});movement={};look={};if(w.BookPlayNativeKeys&&typeof w.BookPlayNativeKeys.release==='function')w.BookPlayNativeKeys.release();}
  function open(on){if(!ready)return;release();syncMode();panel.hidden=!on;if(on){lastFocus=d.activeElement;selectors.F1.focus();}else {if(d.activeElement && panel.contains(d.activeElement))d.activeElement.blur();if(lastFocus && lastFocus.focus)lastFocus.focus();}}
  function menuKey(code){
    var fields=Array.prototype.slice.call(panel.querySelectorAll('select,button')), at=fields.indexOf(d.activeElement);
    if(code==='F2'||code==='Escape'||code==='F10'){open(false);return;}
    if(code==='ArrowDown'||code==='ArrowUp'||code==='KeyW'||code==='KeyS'){var delta=(code==='ArrowDown'||code==='KeyS')?1:-1; fields[(at+delta+fields.length)%fields.length].focus();return;}
    if((code==='ArrowLeft'||code==='ArrowRight'||code==='KeyA'||code==='KeyD') && d.activeElement.tagName==='SELECT') {var s=d.activeElement, step=(code==='ArrowLeft'||code==='KeyA')?-1:1;s.selectedIndex=(s.selectedIndex+step+s.options.length)%s.options.length;s.dispatchEvent(new Event('change'));return;}
    if(code==='F1'||code==='Enter'){if(d.activeElement.tagName==='BUTTON')d.activeElement.click();}
  }
  function onKey(e,down){
    if(!e.isTrusted && !e.x35sTest) return;
    var code=e.code || e.key, isLook=/^(PageUp|PageDown|Home|End)$/.test(code), ours=Object.prototype.hasOwnProperty.call(buttons,code)||code==='F10'||(app!=='bookplay'&&isLook);
    if(ours){bridge=true;if(status)status.textContent='已收到掌机输入：'+(buttons[code]||code);}
    if(!ready)return;
    syncMode();
    if(!panel.hidden){e.preventDefault();e.stopImmediatePropagation();if(down)menuKey(code);return;}
    if(code==='F10'&&down){e.preventDefault();e.stopImmediatePropagation();open(true);return;}
    // Synthesized Arrow/WASD must reach game-input on document bubble.
    if(e.x35sTest && /^(Key[WASD]|Arrow(Up|Down|Left|Right))$/.test(code)) return;
    // Always release a latched action, even if a text field gained focus meanwhile.
    if(!down && held[code]){e.preventDefault();e.stopImmediatePropagation();action(held[code],false);delete held[code];return;}
    if(!down && isLook){look[code]=false;return;}
    if(!down && movement[code]){var old=movement[code];delete movement[code];if(!Object.keys(movement).some(function(k){return movement[k][1]===old[1];}))keyboard(old[0],old[1],false);return;}
    if(editable(e.target))return;
    if(ours){e.preventDefault();e.stopImmediatePropagation();if(isLook){look[code]=down;return;}if(down && !held[code] && mapping[code]){held[code]=mapping[code];action(held[code],true);}return;}
    if(bridge && /^(Key[WASD]|Arrow(Up|Down|Left|Right))$/.test(code)){
      var dir={KeyW:'Up',KeyS:'Down',KeyA:'Left',KeyD:'Right',ArrowUp:'Up',ArrowDown:'Down',ArrowLeft:'Left',ArrowRight:'Right'}[code];
      var fromStick=/^Key[WASD]$/.test(code);
      if((app==='bookplay' && mode!=='game') || (app==='blocklegend' && quizOpen(app))){e.preventDefault();e.stopImmediatePropagation();if(down)navigate(dir);return;}
      if(app==='bookplay' && mode==='game' && !fromStick) return;
      e.preventDefault();e.stopImmediatePropagation();
      var p=app==='blocklegend'?{Up:['w','KeyW'],Down:['s','KeyS'],Left:['a','KeyA'],Right:['d','KeyD']}[dir]:['Arrow'+dir,'Arrow'+dir];
      var latch=p[1];
      if(down&&!movement[latch]){movement[latch]=p;keyboard(p[0],p[1],true);}else if(!down&&movement[latch]){keyboard(p[0],p[1],false);delete movement[latch];}
    }
  }
  function build(){
    var style=d.createElement('style');style.textContent='#x35s-open{position:fixed;right:6px;bottom:6px;z-index:2147483000;padding:8px 12px;background:#17334c;color:white;border:2px solid #9bd6ff;border-radius:8px;font:16px sans-serif}#x35s-panel{position:fixed;inset:12px;z-index:2147483001;overflow:auto;background:#102334;color:#fff;padding:14px;font:16px/1.5 sans-serif;border:2px solid #9bd6ff;border-radius:10px}#x35s-panel[hidden]{display:none}#x35s-panel label{display:flex;justify-content:space-between;align-items:center;margin:5px 0}#x35s-panel select,#x35s-panel button{font:16px sans-serif;padding:7px;max-width:75%}#x35s-panel :focus{outline:3px solid #ffcf65}#x35s-panel h2{margin:0;font-size:22px}';d.head.appendChild(style);
    opener=d.createElement('button');opener.id='x35s-open';opener.hidden=true;opener.textContent='掌机按键';
    panel=d.createElement('section');panel.id='x35s-panel';panel.hidden=true;panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-label','掌机按键设置');
    var h=d.createElement('h2');h.textContent='X35S 掌机操作';panel.appendChild(h);
    var desc=d.createElement('p');desc.textContent='Start 打开/关闭本菜单；Select + Start 退出游戏。上下选按钮，左右换动作，A 确认，B 返回。ABXY 按 SDL 映射命名，可按键查看检测结果。';panel.appendChild(desc);
    axes=d.createElement('p');axes.textContent='左摇杆和十字键负责移动/选择；右摇杆不模拟鼠标。ABXY、L1/R1、L2/R2、Select/Start 分配给动作。';panel.appendChild(axes);
    if(app==='bookplay'){var scene=d.createElement('select');scene.setAttribute('aria-label','书戏操作场景');['auto','learn','quiz','game'].forEach(function(v){var o=d.createElement('option');o.value=v;o.textContent={auto:'自动识别场景',learn:'学习 / 翻页',quiz:'知识巩固 / 选择答题',game:'游戏 / 自由移动'}[v];scene.appendChild(o);});scene.onchange=function(){override=scene.value;syncMode();};panel.appendChild(scene);}
    status=d.createElement('p');status.textContent='等待掌机输入；也可用鼠标设置。';panel.appendChild(status);
    Object.keys(buttons).forEach(function(k){var row=d.createElement('label');row.appendChild(d.createTextNode(buttons[k]+' '));var sel=d.createElement('select');Object.keys(actions).forEach(function(a){if(app==='bookplay' && !/^(confirm|cancel|left|right|attack|interact|pause|none)$/.test(a))return;var o=d.createElement('option');o.value=a;o.textContent=actions[a];sel.appendChild(o);});sel.value=mapping[k];sel.onchange=function(){release();mapping[k]=sel.value;save();};selectors[k]=sel;row.appendChild(sel);panel.appendChild(row);});
    var reset=d.createElement('button');reset.textContent='恢复默认';reset.onclick=function(){release();mapping=defaults(app,mode);Object.keys(selectors).forEach(function(k){selectors[k].value=mapping[k];});save();};panel.appendChild(reset);
    var close=d.createElement('button');close.textContent='返回游戏';close.onclick=function(){open(false);};panel.appendChild(close);d.body.appendChild(panel);ready=true;if(app==='bookplay'){mode='';syncMode();}
    if(d.documentElement)d.documentElement.setAttribute('data-handheld','1');
    focusDefault();
  }
  var aimX=0.5,aimY=0.5;
  function frame(t){var dt=Math.min((t-lastTime)/1000,0.05);lastTime=t;var x=(look.End?1:0)-(look.Home?1:0),y=(look.PageDown?1:0)-(look.PageUp?1:0);
    if(ready&&panel.hidden&&(x||y)&&app!=='bookplay'){
      if(app==='blocklegend')d.dispatchEvent(new CustomEvent('x35s-look',{detail:{x:x*dt*1.8,y:y*dt*1.8}}));
      else {var c=d.querySelector('canvas');if(c){var r=c.getBoundingClientRect();aimX=Math.max(0,Math.min(1,aimX+x*dt*0.65));aimY=Math.max(0,Math.min(1,aimY+y*dt*0.65));var opts={clientX:r.left+r.width*aimX,clientY:r.top+r.height*aimY,bubbles:true,pointerId:90,pointerType:'mouse'};c.dispatchEvent(new PointerEvent('pointermove',opts));c.dispatchEvent(new MouseEvent('mousemove',opts));}}
    }w.requestAnimationFrame(frame);
  }
  w.X35SControls={open:function(){open(true);},release:release};
  d.addEventListener('click',function(e){var t=e.target&&e.target.closest&&e.target.closest('[data-open-handheld]');if(!t||!ready||(panel&&panel.contains(t)))return;e.preventDefault();open(true);});
  w.addEventListener('keydown',function(e){onKey(e,true);},true);w.addEventListener('keyup',function(e){onKey(e,false);},true);
  w.addEventListener('blur',release);d.addEventListener('visibilitychange',function(){if(d.hidden)release();});
  if(d.readyState==='loading')d.addEventListener('DOMContentLoaded',build);else build();w.requestAnimationFrame(frame);
})(typeof window!=='undefined'?window:globalThis);
