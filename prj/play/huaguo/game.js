(function () {
  "use strict";
  var Rules = globalThis.HuaguoFight;
  if (!Rules) throw new Error("fight-rules.js 没载入");
  var $ = function (id) { return document.getElementById(id); };
  var A = "../../assets/";

  function dirs(who, kind) {
    var out = {};
    ["south", "east", "north", "west"].forEach(function (d) {
      if (who === "wukong" && kind === "idle") {
        out[d] = A + "generated/arena/clay/wukong/wukong-" + d + "-idle.png";
      } else if (who === "wukong") {
        out[d] = A + "generated/jttw-player-walkers/wukong/directions/wukong-" + d + "-" + kind + ".gif";
      } else {
        var tail = kind === "idle" ? "idle.png" : kind + ".gif";
        out[d] = A + "game-sprites/monkey-minor/monkey-minor-" + d + "-" + tail;
      }
    });
    return out;
  }
  var SHEET = {
    wukong: { idle: dirs("wukong", "idle"), walk: dirs("wukong", "walk"), attack: dirs("wukong", "attack") },
    monkey: { idle: dirs("monkey", "idle"), walk: dirs("monkey", "walk"), attack: dirs("monkey", "attack") }
  };
  ["wukong", "monkey"].forEach(function (who) {
    ["idle", "walk", "attack"].forEach(function (pose) {
      ["south", "east", "north", "west"].forEach(function (d) {
        var img = new Image();
        img.src = SHEET[who][pose][d];
      });
    });
  });

  var CAST = [
    { name: "孙悟空", img: SHEET.wukong.idle.south, play: true, atk: "120+15", def: "100+10", hp: "1000+80", spd: "110+8", weapon: "如意金箍棒", line: "挥棒打中面前的猴子。对上这一棒的名字，这一下更重。" },
    { name: "猪八戒", img: A + "generated/jttw-player-walkers/bajie/directions/bajie-south-idle.png", play: false, atk: "105+12", def: "130+16", hp: "1400+100", spd: "80+5", weapon: "九齿钉耙", line: "还没上山。" },
    { name: "沙悟净", img: A + "generated/jttw-player-walkers/shawujing/directions/shawujing-south-idle.png", play: false, atk: "110+12", def: "120+14", hp: "1200+90", spd: "95+6", weapon: "降妖宝杖", line: "还没上山。" },
    { name: "唐三藏", img: A + "generated/jttw-player-walkers/tang/directions/tang-south-idle.png", play: false, atk: "80+8", def: "110+12", hp: "1050+85", spd: "100+7", weapon: "木鱼", line: "唐僧尚未解锁，敬请期待。" }
  ];
  var LEVEL = {
    words: [
      { zh: "旅行", en: "journey" }, { zh: "西方", en: "west" }, { zh: "劈开", en: "split" },
      { zh: "强大的", en: "powerful" }, { zh: "射击", en: "shot" }, { zh: "皇帝", en: "emperor" },
      { zh: "玉皇大帝", en: "Jade Emperor" }, { zh: "指挥官", en: "captain" }, { zh: "在附近", en: "nearby" },
      { zh: "南方的", en: "southern" }, { zh: "魔术的", en: "magical" }, { zh: "景色", en: "sight" }
    ],
    waves: [{ quota: 5, cap: 2, hp: 1 }, { quota: 5, cap: 2, hp: 2 }],
    bossHits: 6,
    countdownSec: 8,
    bossName: "猴群小头目"
  };
  fetch("ep1.json", { cache: "no-store" }).then(function (res) { return res.json(); }).then(function (data) {
    if (data && data.words && data.waves) LEVEL = data;
  }).catch(function () {});
  var WORLD = { w: 1000, d: 700 };
  var world = $("world");
  var field = $("field");
  var view = { w: 1, h: 1, horizon: 0, floor: 1 };
  var keys = { l: 0, r: 0, u: 0, d: 0 };
  var stick = { on: false, x: 0, y: 0, id: null };
  var fight = null;
  var last = 0;
  var toastTimer = 0;
  var pickIndex = 0;

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function dist(a, b) {
    var dx = a.x - b.x, dz = a.z - b.z;
    return Math.sqrt(dx * dx + dz * dz);
  }
  function show(id) {
    var nodes = document.querySelectorAll(".screen");
    for (var i = 0; i < nodes.length; i++) nodes[i].classList.toggle("on", nodes[i].id === id);
  }
  function toast(text) {
    var el = $("toast");
    el.hidden = false;
    el.textContent = text;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 1400);
  }
  function dirName(rad) {
    var a = Math.atan2(Math.sin(rad), Math.cos(rad));
    if (a > -Math.PI / 4 && a <= Math.PI / 4) return "east";
    if (a > Math.PI / 4 && a <= Math.PI * 3 / 4) return "south";
    if (a < -Math.PI / 4 && a >= -Math.PI * 3 / 4) return "north";
    return "west";
  }
  function paint(img, who, facing, pose) {
    var src = SHEET[who][pose][dirName(facing)];
    if (img.dataset.src !== src) {
      img.dataset.src = src;
      img.src = src;
    }
  }

  function paintRoster() {
    var box = $("roster");
    box.innerHTML = "";
    CAST.forEach(function (c, i) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "who" + (i === pickIndex ? " on" : "");
      b.innerHTML = "<img alt='' src=\"" + c.img + "\"><span><b>" + c.name + "</b><br><small>" + (c.play ? "可出战" : "待解锁") + "</small></span>";
      b.addEventListener("click", function () { pickIndex = i; paintRoster(); });
      box.appendChild(b);
    });
    var c = CAST[pickIndex];
    $("pick-fig").src = c.img;
    var go = c.play
      ? "<button class='gold' id='go' type='button'>选择角色</button>"
      : "<button class='ghost' id='go' type='button'>待解锁</button>";
    $("sheet").innerHTML = "<h3>" + c.name + "</h3><p>攻击 " + c.atk + "</p><p>防御 " + c.def + "</p><p>生命 " + c.hp + "</p><p>速度 " + c.spd + "</p><p>" + c.weapon + "</p><p>" + c.line + "</p>" + go;
    $("go").addEventListener("click", function () {
      if (!c.play) { toast(c.line); return; }
      $("shout").hidden = false;
      setTimeout(function () { $("shout").hidden = true; beginFight(); }, 650);
    });
  }

  function frame() {
    var r = field.getBoundingClientRect();
    view.w = r.width || 1;
    view.h = r.height || 1;
    view.horizon = view.h * 0.22;
    view.floor = view.h * 0.86;
  }
  function project(x, z) {
    var t = clamp(z / WORLD.d, 0, 1);
    var span = view.w * 0.86 * (0.62 + 0.38 * t);
    return {
      x: view.w * 0.5 + (x / WORLD.w - 0.5) * span,
      y: view.horizon + t * (view.floor - view.horizon),
      s: 0.55 + t * 0.72
    };
  }
  function screenToWorld(cx, cy) {
    frame();
    var r = field.getBoundingClientRect();
    var t = clamp((cy - r.top - view.horizon) / ((view.floor - view.horizon) || 1), 0, 1);
    var span = view.w * 0.86 * (0.62 + 0.38 * t) || 1;
    var x = ((cx - r.left - view.w * 0.5) / span + 0.5) * WORLD.w;
    return { x: clamp(x, 80, WORLD.w - 80), z: clamp(t * WORLD.d, 80, WORLD.d - 40) };
  }

  function actor(who, boss) {
    var el = document.createElement("div");
    el.className = "actor";
    el.innerHTML = "<i class='shadow'></i><img alt='' src='" + SHEET[who].idle.south + "'><b class='tag'></b>";
    if (boss) el.dataset.boss = "1";
    world.appendChild(el);
    return el;
  }

  function floatText(x, z, text) {
    var p = project(x, z);
    var el = document.createElement("div");
    el.className = "float";
    el.textContent = text;
    el.style.left = p.x + "px";
    el.style.top = (p.y - 90) + "px";
    world.appendChild(el);
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 1100);
  }

  function paintLives() {
    var box = $("lives");
    box.innerHTML = "";
    for (var i = 0; i < 5; i++) {
      var dot = document.createElement("i");
      if (i >= fight.lives) dot.className = "off";
      box.appendChild(dot);
    }
  }
  function setMove(i) {
    fight.move = i % LEVEL.words.length;
    $("move-zh").textContent = LEVEL.words[fight.move].zh;
  }

  function beginFight() {
    show("battle");
    world.innerHTML = "";
    var heroEl = actor("wukong", false);
    heroEl.querySelector(".tag").style.display = "none";
    fight = {
      running: true,
      phase: "wave",
      wave: 0,
      got: 0,
      need: LEVEL.waves[0].quota,
      lives: 5,
      move: 0,
      calm: 1600,
      nextShot: 1400,
      foes: [],
      shots: [],
      rings: [],
      boss: null,
      count: 0,
      hero: {
        x: 500, z: 620, facing: Math.PI / 2, moving: false,
        swing: 0, cool: 0, hop: 0, inv: 0, goal: null, el: heroEl
      }
    };
    setMove(0);
    paintLives();
    $("banner").hidden = false;
    $("banner").textContent = "他们从路上来了";
    $("wave").textContent = "第 1 波 · 击退 0/" + fight.need;
    $("win").classList.remove("on");
    $("lose").classList.remove("on");
    last = performance.now();
  }

  function spawnFoe(boss) {
    var lane = fight.foes.length % 2;
    var word = LEVEL.words[(fight.foes.length + fight.got + (boss ? 3 : 0)) % LEVEL.words.length];
    var el = actor("monkey", boss);
    el.querySelector(".tag").textContent = word.en;
    var foe = {
      x: boss ? 720 : 260 + lane * 420,
      z: boss ? 160 : 50 + lane * 40,
      hp: boss ? LEVEL.bossHits : LEVEL.waves[fight.wave].hp,
      max: boss ? LEVEL.bossHits : LEVEL.waves[fight.wave].hp,
      word: word,
      el: el,
      boss: !!boss,
      facing: Math.PI / 2,
      stepping: true,
      wind: 0,
      vx: 0,
      vz: 0
    };
    fight.foes.push(foe);
    if (boss) fight.boss = foe;
  }

  function hurt() {
    var step = Rules.hurt(fight);
    if (!step.hurt) return;
    paintLives();
    floatText(fight.hero.x, fight.hero.z, "-1");
    if (step.lost) $("lose").classList.add("on");
  }

  function defeat(f) {
    if (f.el.parentNode) f.el.parentNode.removeChild(f.el);
    var step = Rules.defeat(fight, f, LEVEL);
    if (step.type === "win") {
      $("banner").hidden = true;
      $("win").classList.add("on");
      return;
    }
    if (step.type === "progress") {
      $("wave").textContent = step.label;
      return;
    }
    step.leftoverFoes.forEach(function (foe) {
      if (foe.el.parentNode) foe.el.parentNode.removeChild(foe.el);
    });
    step.leftoverShots.forEach(function (shot) {
      if (shot.el.parentNode) shot.el.parentNode.removeChild(shot.el);
    });
    if (step.type === "wave") {
      $("wave").textContent = step.label;
      $("banner").hidden = false;
      $("banner").textContent = step.banner;
      setTimeout(function () { if (fight && fight.phase === "wave") $("banner").hidden = true; }, 900);
      return;
    }
    $("banner").hidden = false;
    $("banner").textContent = step.banner;
  }

  function throwPeach(f) {
    var el = document.createElement("div");
    el.className = "peach";
    world.appendChild(el);
    var dx = fight.hero.x - f.x;
    var dz = fight.hero.z - f.z;
    var d = Math.sqrt(dx * dx + dz * dz) || 1;
    fight.shots.push({ x: f.x, z: f.z, vx: dx / d * 150, vz: dz / d * 150, el: el });
    f.wind = 420;
    f.facing = Math.atan2(dz, dx);
  }
  function dropRing(x, z) {
    var el = document.createElement("div");
    el.className = "ring";
    world.appendChild(el);
    fight.rings.push({ x: x, z: z, t: 700, el: el });
  }

  function swing() {
    var ev = Rules.swing(fight, LEVEL);
    if (!ev || !ev.hit) return;
    floatText(ev.x, ev.z, ev.text);
    if (ev.killed) defeat(ev.foe);
    if (Rules.advanceMove(fight, LEVEL)) setMove(fight.move + 1);
  }

  function hop() {
    if (!fight || !fight.running || fight.hero.hop > 0) return;
    fight.hero.hop = 680;
    fight.hero.goal = null;
  }

  function update(dt) {
    if (!fight || !fight.running) return;
    var h = fight.hero;
    if (fight.calm > 0) {
      fight.calm -= dt;
      if (fight.calm <= 0) $("banner").hidden = true;
    }
    if (h.swing > 0) h.swing -= dt;
    if (h.cool > 0) h.cool -= dt;
    if (h.inv > 0) h.inv -= dt;
    if (h.hop > 0) h.hop -= dt;
    var ix = (keys.r ? 1 : 0) - (keys.l ? 1 : 0);
    var iz = (keys.d ? 1 : 0) - (keys.u ? 1 : 0);
    if (stick.on) { ix += stick.x; iz += stick.y; }
    if (h.goal) {
      var gx = h.goal.x - h.x;
      var gz = h.goal.z - h.z;
      if (Math.sqrt(gx * gx + gz * gz) < 14) h.goal = null;
      else { ix += gx; iz += gz; }
    }
    var len = Math.sqrt(ix * ix + iz * iz);
    h.moving = len > 0.18 && h.hop <= 0 && h.swing <= 0;
    if (h.moving) {
      ix /= len; iz /= len;
      h.x = clamp(h.x + ix * 320 * dt / 1000, 140, WORLD.w - 140);
      h.z = clamp(h.z + iz * 320 * dt / 1000, 520, WORLD.d - 36);
      h.facing = Math.atan2(iz, ix);
    }
    if (fight.phase === "countdown") {
      fight.count -= dt / 1000;
      $("banner").textContent = LEVEL.bossName + " " + Math.ceil(fight.count) + " 秒后上岸";
      if (fight.count <= 0) {
        fight.phase = "boss";
        spawnFoe(true);
        $("banner").textContent = LEVEL.bossName;
        $("wave").textContent = "头目 · 还要 " + LEVEL.bossHits + " 下";
      }
    }
    var wave = LEVEL.waves[fight.wave] || LEVEL.waves[0];
    if (fight.phase === "wave" && fight.foes.length < wave.cap && fight.got + fight.foes.length < fight.need) spawnFoe(false);
    var ripe = null;
    for (var i = fight.foes.length - 1; i >= 0; i--) {
      var f = fight.foes[i];
      if (f.wind > 0) f.wind -= dt;
      f.x = clamp(f.x + f.vx * dt / 1000, 40, WORLD.w - 40);
      f.z = clamp(f.z + f.vz * dt / 1000, 40, WORLD.d - 40);
      f.vx *= 0.86;
      f.vz *= 0.86;
      var dx = h.x - f.x, dz = h.z - f.z, dd = Math.sqrt(dx * dx + dz * dz) || 1;
      if (f.boss) {
        f.facing = Math.atan2(dz, dx);
        if (f.dash > 0) {
          f.dash -= dt;
          f.stepping = true;
          f.x += dx / dd * 420 * dt / 1000;
          f.z += dz / dd * 420 * dt / 1000;
          if (dist(f, h) < 72) hurt();
        } else {
          f.stepping = false;
          f.wait = (f.wait || 900) - dt;
          if (f.wait <= 0) {
            if (Math.random() < 0.5) dropRing(h.x, h.z);
            else { f.dash = 280; f.wind = 280; }
            f.wait = 1500;
          }
        }
      } else if (dd > 200) {
        f.stepping = true;
        f.facing = Math.atan2(dz, dx);
        f.x += dx / dd * 100 * dt / 1000;
        f.z += dz / dd * 100 * dt / 1000;
      } else {
        f.stepping = Math.abs(f.vx) + Math.abs(f.vz) > 40;
        if (f.wind <= 0) f.facing = Math.atan2(dz, dx);
        ripe = f;
      }
    }
    if (ripe && fight.calm <= 0) {
      fight.nextShot -= dt;
      if (fight.nextShot <= 0 && fight.shots.length === 0) {
        throwPeach(ripe);
        fight.nextShot = 2600;
      }
    }
    for (var s = fight.shots.length - 1; s >= 0; s--) {
      var shot = fight.shots[s];
      shot.x += shot.vx * dt / 1000;
      shot.z += shot.vz * dt / 1000;
      if (shot.x < 0 || shot.z < 0 || shot.x > WORLD.w || shot.z > WORLD.d) {
        shot.el.parentNode.removeChild(shot.el);
        fight.shots.splice(s, 1);
        continue;
      }
      if (dist(shot, h) < 34) {
        hurt();
        shot.el.parentNode.removeChild(shot.el);
        fight.shots.splice(s, 1);
      }
    }
    for (var r = fight.rings.length - 1; r >= 0; r--) {
      var ring = fight.rings[r];
      ring.t -= dt;
      if (ring.t <= 0) {
        ring.el.classList.add("hot");
        if (dist(ring, h) < 70) hurt();
        setTimeout(function (el) { if (el.parentNode) el.parentNode.removeChild(el); }, 180, ring.el);
        fight.rings.splice(r, 1);
      }
    }
    if (fight.boss && fight.phase === "boss") {
      $("wave").textContent = "头目 · 还要 " + Math.max(0, fight.boss.hp) + " 下";
    }
  }

  function place(el, x, z, lift, mul) {
    var p = project(x, z);
    var img = el.querySelector("img");
    var shadow = el.querySelector(".shadow");
    el.style.left = p.x + "px";
    el.style.top = (p.y - lift) + "px";
    el.style.zIndex = String(Math.round(z));
    img.style.transform = "translateX(-50%) scale(" + (p.s * mul) + ")";
    shadow.style.top = lift + "px";
    shadow.style.transform = "scale(" + p.s + ")";
  }
  function render() {
    if (!fight || !$("battle").classList.contains("on")) return;
    frame();
    var h = fight.hero;
    var lift = h.hop > 0 ? Math.sin((1 - h.hop / 680) * Math.PI) * 78 : 0;
    var pose = h.swing > 0 ? "attack" : (h.moving ? "walk" : "idle");
    paint(h.el.querySelector("img"), "wukong", h.facing, pose);
    place(h.el, h.x, h.z, lift, 1.35);
    h.el.style.opacity = h.inv > 0 && Math.floor(h.inv / 80) % 2 === 0 ? "0.45" : "1";
    fight.foes.forEach(function (f) {
      var foePose = f.wind > 0 || f.dash > 0 ? "attack" : (f.stepping ? "walk" : "idle");
      paint(f.el.querySelector("img"), "monkey", f.facing, foePose);
      var mul = f.boss ? (0.55 + 0.9 * (Math.max(0, f.hp) / f.max)) : 0.92;
      place(f.el, f.x, f.z, 0, mul);
    });
    fight.shots.forEach(function (s) {
      var p = project(s.x, s.z);
      s.el.style.left = p.x + "px";
      s.el.style.top = p.y + "px";
      s.el.style.transform = "scale(" + p.s + ")";
    });
    fight.rings.forEach(function (ring) {
      var p = project(ring.x, ring.z);
      var w = 96 * p.s;
      ring.el.style.left = p.x + "px";
      ring.el.style.top = p.y + "px";
      ring.el.style.width = w + "px";
      ring.el.style.height = (w * 0.42) + "px";
    });
  }

  function loop(now) {
    var dt = Math.min(40, now - last || 16);
    last = now;
    update(dt);
    render();
    requestAnimationFrame(loop);
  }

  document.addEventListener("keydown", function (e) {
    var k = e.key.toLowerCase();
    if (k === "a" || k === "arrowleft") keys.l = 1;
    else if (k === "d" || k === "arrowright") keys.r = 1;
    else if (k === "w" || k === "arrowup") keys.u = 1;
    else if (k === "s" || k === "arrowdown") keys.d = 1;
    else if (k === "j" || k === " ") { e.preventDefault(); swing(); }
    else if (k === "k") { e.preventDefault(); hop(); }
    else return;
    if ("wasdjk ".indexOf(k) >= 0 || e.key.indexOf("Arrow") === 0) e.preventDefault();
  });
  document.addEventListener("keyup", function (e) {
    var k = e.key.toLowerCase();
    if (k === "a" || k === "arrowleft") keys.l = 0;
    if (k === "d" || k === "arrowright") keys.r = 0;
    if (k === "w" || k === "arrowup") keys.u = 0;
    if (k === "s" || k === "arrowdown") keys.d = 0;
  });

  field.addEventListener("pointerdown", function (e) {
    if (!fight || !fight.running) return;
    if (e.target.closest("button")) return;
    fight.hero.goal = screenToWorld(e.clientX, e.clientY);
  });
  var stickEl = $("stick");
  var knob = $("knob");
  function moveStick(e) {
    var rect = stickEl.getBoundingClientRect();
    var max = rect.width / 2 - 14;
    var dx = clamp(e.clientX - (rect.left + rect.width / 2), -max, max);
    var dy = clamp(e.clientY - (rect.top + rect.height / 2), -max, max);
    knob.style.transform = "translate(calc(-50% + " + dx + "px), calc(-50% + " + dy + "px))";
    stick.x = dx / max;
    stick.y = dy / max;
    stick.on = true;
  }
  stickEl.addEventListener("pointerdown", function (e) {
    stick.id = e.pointerId;
    stickEl.setPointerCapture(e.pointerId);
    moveStick(e);
  });
  stickEl.addEventListener("pointermove", function (e) { if (e.pointerId === stick.id) moveStick(e); });
  function endStick(e) {
    if (e.pointerId !== stick.id) return;
    stick.id = null; stick.on = false; stick.x = 0; stick.y = 0;
    knob.style.transform = "translate(-50%,-50%)";
  }
  stickEl.addEventListener("pointerup", endStick);
  stickEl.addEventListener("pointercancel", endStick);
  $("atk").addEventListener("pointerdown", function (e) { e.preventDefault(); swing(); });
  $("jump").addEventListener("pointerdown", function (e) { e.preventDefault(); hop(); });

  function openPick() { show("pick"); paintRoster(); }
  $("enter").addEventListener("click", function () {
    show("load");
    var n = 0;
    var timer = setInterval(function () {
      n = Math.min(100, n + 8);
      $("load-bar").style.width = n + "%";
      $("load-pct").textContent = n + "%";
      if (n >= 100) { clearInterval(timer); show("lobby"); }
    }, 40);
  });
  $("start").addEventListener("click", openPick);
  $("chapter-play").addEventListener("click", openPick);
  document.querySelectorAll("[data-locked]").forEach(function (b) {
    b.addEventListener("click", function () { toast(b.getAttribute("data-locked") + "还没开"); });
  });
  $("pick-back").addEventListener("click", function () { show("lobby"); });
  $("again").addEventListener("click", beginFight);
  $("retry").addEventListener("click", beginFight);
  $("win-back").addEventListener("click", function () { show("lobby"); });
  requestAnimationFrame(loop);
})();
