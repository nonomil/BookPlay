(function () {
  var tabs = document.querySelectorAll('[data-tab]');
  var panels = document.querySelectorAll('.panel');
  var choices = Array.prototype.slice.call(document.querySelectorAll('.choice'));
  var skip = document.getElementById('skip');
  var learnStatus = document.getElementById('learn-status');
  var menuStatus = document.getElementById('menu-status');
  var focusAt = 0;

  function show(id) {
    panels.forEach(function (p) { p.classList.toggle('is-on', p.id === 'panel-' + id); });
    tabs.forEach(function (t) { t.classList.toggle('is-on', t.getAttribute('data-tab') === id); });
  }
  tabs.forEach(function (t) {
    t.addEventListener('click', function () { show(t.getAttribute('data-tab')); });
  });
  show('view');

  function paintChoices() {
    choices.forEach(function (btn, i) { btn.classList.toggle('is-on', i === focusAt); btn.tabIndex = i === focusAt ? 0 : -1; });
    if (choices[focusAt]) choices[focusAt].focus();
  }
  function confirmChoice() {
    if (learnStatus) learnStatus.textContent = '确定：' + (choices[focusAt] && choices[focusAt].textContent);
  }
  function miss() {
    if (learnStatus) learnStatus.textContent = '我不会 · 换一组';
  }
  paintChoices();

  document.addEventListener('keydown', function (e) {
    var code = e.code;
    if (code === 'KeyC') {
      document.body.classList.toggle('cursor-on');
      if (menuStatus) menuStatus.textContent = document.body.classList.contains('cursor-on') ? '光标开（模拟 L3）' : '光标关（默认）';
      e.preventDefault();
      return;
    }
    if (code === 'F10') {
      if (menuStatus) menuStatus.textContent = 'Start：键位菜单（真机由 handheld-controls 打开）';
      e.preventDefault();
      return;
    }
    var learnOpen = document.getElementById('panel-learn').classList.contains('is-on');
    if (!learnOpen) return;
    if (code === 'ArrowLeft' || code === 'KeyA') { focusAt = (focusAt + choices.length - 1) % choices.length; paintChoices(); e.preventDefault(); }
    if (code === 'ArrowRight' || code === 'KeyD') { focusAt = (focusAt + 1) % choices.length; paintChoices(); e.preventDefault(); }
    if (code === 'F1' || code === 'Enter') { confirmChoice(); e.preventDefault(); }
    if (code === 'F2' || code === 'Escape') { miss(); e.preventDefault(); }
  });
  choices.forEach(function (btn, i) {
    btn.addEventListener('click', function () { focusAt = i; paintChoices(); confirmChoice(); });
  });
  if (skip) skip.addEventListener('click', miss);

  import('./probe.mjs').then(function (mod) {
    var el = document.getElementById('module-status');
    if (!el) return;
    el.className = 'ok';
    el.textContent = '模块加载成功：' + mod.probe.kind;
  }).catch(function (err) {
    var el = document.getElementById('module-status');
    if (!el) return;
    el.className = 'bad';
    el.textContent = '模块失败：' + err.message;
  });
})();
