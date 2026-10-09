(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var WUKONG = "../../assets/generated/arena/clay/wukong/wukong-south-idle.png";
  var MONKEY = "../../assets/generated/arena/clay/monkey-minor/monkey-minor.png";
  var DIRS = ["east", "south", "west", "north"];
  var POSE = {
    wukong: {
      idle: {
        south: "../../assets/generated/arena/clay/wukong/wukong-south-idle.png",
        east: "../../assets/generated/arena/clay/wukong/wukong-east-idle.png",
        north: "../../assets/generated/arena/clay/wukong/wukong-north-idle.png",
        west: "../../assets/generated/arena/clay/wukong/wukong-west-idle.png"
      },
      walk: {
        south: "../../assets/generated/jttw-player-walkers/wukong/directions/wukong-south-walk.gif",
        east: "../../assets/generated/jttw-player-walkers/wukong/directions/wukong-east-walk.gif",
        north: "../../assets/generated/jttw-player-walkers/wukong/directions/wukong-north-walk.gif",
        west: "../../assets/generated/jttw-player-walkers/wukong/directions/wukong-west-walk.gif"
      },
      attack: {
        south: "../../assets/generated/jttw-player-walkers/wukong/directions/wukong-south-attack.gif",
        east: "../../assets/generated/jttw-player-walkers/wukong/directions/wukong-east-attack.gif",
        north: "../../assets/generated/jttw-player-walkers/wukong/directions/wukong-north-attack.gif",
        west: "../../assets/generated/jttw-player-walkers/wukong/directions/wukong-west-attack.gif"
      }
    },
    monkey: {
      idle: {
        south: "../../assets/game-sprites/monkey-minor/monkey-minor-south-idle.png",
        east: "../../assets/game-sprites/monkey-minor/monkey-minor-east-idle.png",
        north: "../../assets/game-sprites/monkey-minor/monkey-minor-north-idle.png",
        west: "../../assets/game-sprites/monkey-minor/monkey-minor-west-idle.png"
      },
      walk: {
        south: "../../assets/game-sprites/monkey-minor/monkey-minor-south-walk.gif",
        east: "../../assets/game-sprites/monkey-minor/monkey-minor-east-walk.gif",
        north: "../../assets/game-sprites/monkey-minor/monkey-minor-north-walk.gif",
        west: "../../assets/game-sprites/monkey-minor/monkey-minor-west-walk.gif"
      },
      attack: {
        south: "../../assets/game-sprites/monkey-minor/monkey-minor-south-attack.gif",
        east: "../../assets/game-sprites/monkey-minor/monkey-minor-east-attack.gif",
        north: "../../assets/game-sprites/monkey-minor/monkey-minor-north-attack.gif",
        west: "../../assets/game-sprites/monkey-minor/monkey-minor-west-attack.gif"
      }
    }
  };
  DIRS.forEach(function (dir) {
    ["wukong", "monkey"].forEach(function (id) {
      ["idle", "walk", "attack"].forEach(function (pose) {
        var img = new Image();
        img.src = POSE[id][pose][dir];
      });
    });
  });
  var CAST = [
    { id: "wukong", name: "孙悟空", img: WUKONG, play: true, atk: "120+15", def: "100+10", hp: "1000+80", spd: "110+8", weapon: "如意金箍棒", line: "挥棒打中面前的猴子。对上这一棒的名字，这一下更重。" },
    { id: "bajie", name: "猪八戒", img: "../../assets/generated/jttw-player-walkers/bajie/directions/bajie-south-idle.png", play: false, atk: "105+12", def: "130+16", hp: "1400+100", spd: "80+5", weapon: "九齿钉耙", line: "还没上山。" },
    { id: "sha", name: "沙悟净", img: "../../assets/generated/jttw-player-walkers/shawujing/directions/shawujing-south-idle.png", play: false, atk: "110+12", def: "120+14", hp: "1200+90", spd: "95+6", weapon: "降妖宝杖", line: "还没上山。" },
    { id: "tang", name: "唐三藏", img: "../../assets/generated/jttw-player-walkers/tang/directions/tang-south-idle.png", play: false, atk: "80+8", def: "110+12", hp: "1050+85", spd: "100+7", weapon: "木鱼", line: "唐僧尚未解锁，敬请期待。" }
  ];
  var WORDS = [
    { zh: "旅行", en: "journey" }, { zh: "西方", en: "west" }, { zh: "劈开", en: "split" },
    { zh: "强大的", en: "powerful" }, { zh: "射击", en: "shot" }, { zh: "景色", en: "sight" }
  ];
  var WORLD = { w: 1000, d: 680 };
  var world = $("world");
  var arena = $("arena");
  var M = { w: 1, h: 1, horizon: 0, floor: 1 };
  var keys = { l: 0, r: 0, u: 0, d: 0 };
  var stick = { on: false, x: 0, y: 0, id: null };
  var state = null;
  var last = 0;
  var toastTimer = 0;
  var pickIndex = 0;

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function dist(a, b) { var dx = a.x - b.x, dz = a.z - b.z; return Math.sqrt(dx * dx + dz * dz); }
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
  function wordAt(i) { return WORDS[i % WORDS.length]; }

  function paintRoster() {
    var box = $("roster");
    box.innerHTML = "";
    CAST.forEach(function (c, i) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "who" + (i === pickIndex ? " on" : "");
      b.innerHTML = "<img alt='' src=\"" + c.img + "\"><span><b>" + c.name + "</b><br><small>" + (c.play ? "可出战" : "待解锁") + "</small></span>";
      b.addEventListener("click", function () { pickIndex = i; paintRoster(); paintSheet(); });
      box.appendChild(b);
    });
    paintSheet();
  }
  function paintSheet() {
    var c = CAST[pickIndex];
    $("pick-fig").src = c.img;
    var go = c.play ? "<button class='gold' id='btn-go' type='button'>选择角色</button>" : "<button class='ghost' id='btn-go' type='button'>待解锁</button>";
    $("pick-sheet").innerHTML = "<h3>" + c.name + "</h3><p>攻击 " + c.atk + "</p><p>防御 " + c.def + "</p><p>生命 " + c.hp + "</p><p>速度 " + c.spd + "</p><p>" + c.weapon + "</p><p>" + c.line + "</p>" + go;
    $("btn-go").addEventListener("click", function () {
      if (!c.play) { toast(c.line); return; }
      var shout = $("shout");
      shout.hidden = false;
      setTimeout(function () { shout.hidden = true; beginBattle(); }, 650);
    });
  }

  function project(x, z) {
    var t = clamp(z / WORLD.d, 0, 1);
    var sy = M.horizon + t * (M.floor - M.horizon);
    var span = (M.w * 0.86) * (0.62 + 0.38 * t);
    var sx = M.w * 0.5 + (x / WORLD.w - 0.5) * span;
    return { sx: sx, sy: sy, scale: 0.55 + t * 0.7 };
  }
  function frame() {
    var r = arena.getBoundingClientRect();
    M.w = r.width || 1;
    M.h = r.height || 1;
    M.horizon = M.h * 0.22;
    M.floor = M.h * 0.84;
  }
  function screenToWorld(cx, cy) {
    frame();
    var r = arena.getBoundingClientRect();
    var py = cy - r.top;
    var px = cx - r.left;
    var spanY = M.floor - M.horizon || 1;
    var t = clamp((py - M.horizon) / spanY, 0, 1);
    var span = (M.w * 0.86) * (0.62 + 0.38 * t) || 1;
    var x = ((px - M.w * 0.5) / span + 0.5) * WORLD.w;
    return { x: clamp(x, 40, WORLD.w - 40), z: clamp(t * WORLD.d, 40, WORLD.d - 40) };
  }

  function makeActor(img, boss) {
    var el = document.createElement("div");
    el.className = "actor" + (boss ? " boss" : "");
    el.innerHTML = "<i class='shadow'></i><img alt='' src='" + img + "'><b class='tag'></b>";
    world.appendChild(el);
    return el;
  }
  function floatText(x, z, text) {
    var p = project(x, z);
    var el = document.createElement("div");
    el.className = "float";
    el.textContent = text;
    el.style.left = p.sx + "px";
    el.style.top = (p.sy - 80) + "px";
    world.appendChild(el);
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 1400);
  }

  function fresh() {
    world.innerHTML = "";
    var heroEl = makeActor(WUKONG, false);
    heroEl.querySelector(".tag").style.display = "none";
    state = {
      running: true,
      phase: "wave",
      wave: 0,
      got: 0,
      need: 4,
      lives: 5,
      move: 0,
      foes: [],
      shots: [],
      rings: [],
      boss: null,
      count: 0,
      calm: 1800,
      nextShot: 1400,
      hero: {
        x: 500, z: 560, facing: Math.PI / 2, hop: 0, inv: 0, goal: null, el: heroEl,
        swing: 0, moving: false
      }
    };
    setMove(0);
    paintLives();
    $("banner").hidden = false;
    $("banner").textContent = "他们从路上来了";
    $("ov-win").classList.remove("on");
    $("ov-lose").classList.remove("on");
    $("wave").textContent = "第 1 波 · 击退 0/4";
  }

  function setMove(i) {
    state.move = i % WORDS.length;
    $("move-zh").textContent = WORDS[state.move].zh;
  }
  function paintLives() {
    var box = $("lives");
    box.innerHTML = "";
    for (var i = 0; i < 5; i++) {
      var dot = document.createElement("i");
      if (i >= state.lives) dot.className = "off";
      box.appendChild(dot);
    }
  }

  function spawnFoe(boss) {
    var lane = state.foes.length % 3;
    var w = wordAt(state.foes.length + state.got + (boss ? 3 : 0));
    var el = makeActor(MONKEY, boss);
    el.querySelector(".tag").textContent = w.en;
    var foe = {
      x: boss ? 500 : 180 + lane * 320,
      z: boss ? 80 : 36 + lane * 24,
      hp: boss ? 8 : (state.wave === 0 ? 1 : 2),
      max: boss ? 8 : (state.wave === 0 ? 1 : 2),
      word: w,
      el: el,
      boss: !!boss,
      cd: boss ? 1200 : 2200 + lane * 350,
      dash: 0,
      vx: 0,
      vz: 0,
      facing: Math.PI / 2,
      wind: 0
    };
    state.foes.push(foe);
    if (boss) state.boss = foe;
    return foe;
  }

  function beginBattle() {
    show("scr-battle");
    fresh();
    last = performance.now();
  }

  function hurtHero() {
    var h = state.hero;
    if (state.calm > 0 || h.inv > 0 || h.hop > 0) return;
    state.lives -= 1;
    h.inv = 1200;
    paintLives();
    floatText(h.x, h.z, "-1");
    if (state.lives <= 0) {
      state.running = false;
      state.phase = "lose";
      $("ov-lose").classList.add("on");
    }
  }

  function swing() {
    var h = state.hero;
    if (!state.running || h.swing > 0) return;
    h.swing = 460;
    var hit = false;
    var best = null;
    var bestD = 1e9;
    var bestDx = 0;
    var bestDz = 0;
    for (var i = state.foes.length - 1; i >= 0; i--) {
      var f = state.foes[i];
      if (!f) continue;
      var dx = f.x - h.x;
      var dz = f.z - h.z;
      var d = Math.sqrt(dx * dx + dz * dz) || 1;
      var reach = f.boss ? 230 : 220;
      if (d > reach || dz > 40 || d >= bestD) continue;
      best = f;
      bestD = d;
      bestDx = dx;
      bestDz = dz;
    }
    if (best) {
      var match = best.word.en === WORDS[state.move].en;
      var dmg = best.boss ? 1 : (match ? best.hp : 1);
      best.hp -= dmg;
      best.vx = bestDx / bestD * (match ? 320 : 180);
      best.vz = bestDz / bestD * (match ? 320 : 180);
      floatText(best.x, best.z, match ? best.word.zh : "击退");
      hit = true;
      if (best.hp <= 0) defeat(best);
    }
    if (hit && state.phase === "wave") {
      var any = false;
      for (var k = 0; k < state.foes.length; k++) if (state.foes[k].word.en === WORDS[state.move].en) any = true;
      if (!any) setMove(state.move + 1);
    }
  }

  function defeat(f) {
    if (f.el.parentNode) f.el.parentNode.removeChild(f.el);
    state.foes.splice(state.foes.indexOf(f), 1);
    if (f.boss) {
      state.running = false;
      state.phase = "win";
      $("banner").hidden = true;
      $("ov-win").classList.add("on");
      return;
    }
    state.got += 1;
    $("wave").textContent = "第 " + (state.wave + 1) + " 波 · 击退 " + state.got + "/" + state.need;
    if (state.got >= state.need) nextWave();
  }

  function nextWave() {
    state.foes.forEach(function (f) { if (f.el.parentNode) f.el.parentNode.removeChild(f.el); });
    state.foes = [];
    state.shots.forEach(function (s) { if (s.el.parentNode) s.el.parentNode.removeChild(s.el); });
    state.shots = [];
    if (state.wave === 0) {
      state.wave = 1;
      state.got = 0;
      state.need = 4;
      $("wave").textContent = "第 2 波 · 击退 0/4";
      $("banner").hidden = false;
      $("banner").textContent = "第二波，猴子更耐打";
      setTimeout(function () { if (state.phase === "wave") $("banner").hidden = true; }, 900);
      return;
    }
    state.phase = "countdown";
    state.count = 6;
    $("banner").hidden = false;
    $("banner").textContent = "猴群小头目 6 秒后上岸";
  }

  function spawnShot(f) {
    var el = document.createElement("div");
    el.className = "shot";
    world.appendChild(el);
    var dx = state.hero.x - f.x;
    var dz = state.hero.z - f.z;
    var d = Math.sqrt(dx * dx + dz * dz) || 1;
    state.shots.push({ x: f.x, z: f.z, vx: dx / d * 150, vz: dz / d * 150, el: el });
  }
  function spawnRing(x, z) {
    var el = document.createElement("div");
    el.className = "ring";
    world.appendChild(el);
    state.rings.push({ x: x, z: z, t: 700, el: el });
  }

  function update(dt) {
    if (!state || !state.running) return;
    var h = state.hero;
    if (state.calm > 0) {
      state.calm -= dt;
      if (state.calm <= 0) $("banner").hidden = true;
    }
    if (h.swing > 0) h.swing -= dt;
    if (h.inv > 0) h.inv -= dt;
    if (h.hop > 0) h.hop -= dt;
    var ix = (keys.r ? 1 : 0) - (keys.l ? 1 : 0);
    var iz = (keys.d ? 1 : 0) - (keys.u ? 1 : 0);
    if (stick.on) { ix += stick.x; iz += stick.y; }
    if (h.goal) {
      var gx = h.goal.x - h.x;
      var gz = h.goal.z - h.z;
      if (Math.sqrt(gx * gx + gz * gz) < 12) h.goal = null;
      else { ix += gx; iz += gz; }
    }
    var len = Math.sqrt(ix * ix + iz * iz);
    h.moving = len > 0.15 && h.hop <= 0;
    if (h.moving) {
      ix /= len; iz /= len;
      h.x = clamp(h.x + ix * 340 * dt / 1000, 160, WORLD.w - 160);
      h.z = clamp(h.z + iz * 340 * dt / 1000, 430, WORLD.d - 48);
      h.facing = Math.atan2(iz, ix);
    }
    if (state.phase === "countdown") {
      state.count -= dt / 1000;
      $("banner").textContent = "猴群小头目 " + Math.ceil(state.count) + " 秒后上岸";
      if (state.count <= 0) {
        state.phase = "boss";
        spawnFoe(true);
        $("banner").textContent = "猴群小头目";
        $("wave").textContent = "头目 · 还要 8 下";
      }
    }
    if (state.phase === "wave" && state.foes.length < 3 && state.got + state.foes.length < state.need) spawnFoe(false);
    state.ripe = null;
    for (var i = state.foes.length - 1; i >= 0; i--) {
      var f = state.foes[i];
      f.cd -= dt;
      if (f.wind > 0) f.wind -= dt;
      f.x = clamp(f.x + f.vx * dt / 1000, 40, WORLD.w - 40);
      f.z = clamp(f.z + f.vz * dt / 1000, 40, WORLD.d - 40);
      f.vx *= 0.86; f.vz *= 0.86;
      if (f.boss) {
        f.facing = Math.atan2(h.z - f.z, h.x - f.x);
        f.stepping = f.dash > 0;
        if (f.dash > 0) {
          f.dash -= dt;
          var dx = h.x - f.x, dz = h.z - f.z, dd = Math.sqrt(dx * dx + dz * dz) || 1;
          f.x += dx / dd * 420 * dt / 1000;
          f.z += dz / dd * 420 * dt / 1000;
          if (dist(f, h) < 70) hurtHero();
        } else if (f.cd <= 0) {
          if (Math.random() < 0.45) spawnRing(h.x, h.z);
          else f.dash = 280;
          f.cd = 1400;
        }
      } else {
        var dx2 = h.x - f.x, dz2 = h.z - f.z, dd2 = Math.sqrt(dx2 * dx2 + dz2 * dz2) || 1;
        f.facing = Math.atan2(dz2, dx2);
        f.stepping = dd2 > 175;
        if (dd2 > 175) {
          f.x += dx2 / dd2 * 90 * dt / 1000;
          f.z += dz2 / dd2 * 90 * dt / 1000;
        } else state.ripe = f;
      }
    }
    if (state.ripe && state.calm <= 0) {
      state.nextShot -= dt;
      if (state.nextShot <= 0 && state.shots.length === 0) {
        spawnShot(state.ripe);
        state.ripe.wind = 420;
        state.ripe.facing = Math.atan2(h.z - state.ripe.z, h.x - state.ripe.x);
        state.nextShot = 2800;
      }
    }
    for (var s = state.shots.length - 1; s >= 0; s--) {
      var shot = state.shots[s];
      shot.x += shot.vx * dt / 1000;
      shot.z += shot.vz * dt / 1000;
      if (shot.x < 0 || shot.z < 0 || shot.x > WORLD.w || shot.z > WORLD.d) {
        shot.el.parentNode.removeChild(shot.el);
        state.shots.splice(s, 1);
        continue;
      }
      if (dist(shot, h) < 36) {
        hurtHero();
        shot.el.parentNode.removeChild(shot.el);
        state.shots.splice(s, 1);
      }
    }
    for (var r = state.rings.length - 1; r >= 0; r--) {
      var ring = state.rings[r];
      ring.t -= dt;
      if (ring.t <= 0) {
        ring.el.classList.add("hot");
        if (dist(ring, h) < 70) hurtHero();
        setTimeout(function (el) { if (el.parentNode) el.parentNode.removeChild(el); }, 180, ring.el);
        state.rings.splice(r, 1);
      }
    }
    if (state.boss && state.phase === "boss") {
      var left = Math.max(0, state.boss.hp);
      $("wave").textContent = "头目 · 还要 " + left + " 下";
    }
  }

  function render() {
    if (!state || !$("scr-battle").classList.contains("on")) return;
    frame();
    var h = state.hero;
    var lift = h.hop > 0 ? Math.sin((1 - h.hop / 700) * Math.PI) * 70 : 0;
    var punch = h.swing > 0 ? 1.08 : 1;
    var heroPose = h.swing > 0 ? "attack" : (h.moving ? "walk" : "idle");
    paintPose(h.el, "wukong", h.facing, heroPose);
    place(h.el, h.x, h.z, lift, 1.42 * punch);
    h.el.style.opacity = h.inv > 0 && Math.floor(h.inv / 80) % 2 === 0 ? "0.45" : "1";
    state.foes.forEach(function (f) {
      var foePose = (f.wind > 0 || f.dash > 0) ? "attack" : (f.stepping ? "walk" : "idle");
      paintPose(f.el, "monkey", f.facing, foePose);
      place(f.el, f.x, f.z, 0, f.boss ? (0.45 + 0.55 * (f.hp / f.max)) : 1);
    });
    state.shots.forEach(function (s) {
      var p = project(s.x, s.z);
      s.el.style.left = p.sx + "px";
      s.el.style.top = p.sy + "px";
      s.el.style.transform = "scale(" + p.scale + ")";
    });
    state.rings.forEach(function (ring) {
      var p = project(ring.x, ring.z);
      var w = 90 * p.scale;
      ring.el.style.left = p.sx + "px";
      ring.el.style.top = p.sy + "px";
      ring.el.style.width = w + "px";
      ring.el.style.height = (w * 0.42) + "px";
    });
  }
  function dirOf(ang) {
    var a = ang || 0;
    if (a > -Math.PI / 4 && a <= Math.PI / 4) return "east";
    if (a > Math.PI / 4 && a <= Math.PI * 3 / 4) return "south";
    if (a < -Math.PI / 4 && a >= -Math.PI * 3 / 4) return "north";
    return "west";
  }
  function paintPose(el, id, ang, pose) {
    var img = el.querySelector("img");
    var table = POSE[id][pose] || POSE[id].idle;
    var src = table[dirOf(ang)] || table.south;
    if (img.dataset.src !== src) {
      img.dataset.src = src;
      img.src = src;
    }
  }
  function place(el, x, z, lift, mul) {
    var p = project(x, z);
    var img = el.querySelector("img");
    var shadow = el.querySelector(".shadow");
    el.style.left = p.sx + "px";
    el.style.top = (p.sy - lift) + "px";
    el.style.zIndex = String(10 + Math.round(z));
    img.style.transform = "translateX(-50%) scale(" + (p.scale * mul) + ")";
    shadow.style.left = "0px";
    shadow.style.top = lift + "px";
    shadow.style.transform = "scale(" + p.scale + ")";
  }

  function loop(now) {
    var dt = Math.min(40, now - last || 16);
    last = now;
    update(dt);
    render();
    requestAnimationFrame(loop);
  }

  function hop() {
    if (!state || !state.running || state.hero.hop > 0) return;
    state.hero.hop = 700;
    state.hero.goal = null;
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

  arena.addEventListener("pointerdown", function (e) {
    if (!state || !state.running) return;
    if (e.target.closest("button")) return;
    state.hero.goal = screenToWorld(e.clientX, e.clientY);
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
  $("btn-atk").addEventListener("pointerdown", function (e) { e.preventDefault(); swing(); });
  $("btn-jump").addEventListener("pointerdown", function (e) { e.preventDefault(); hop(); });

  function openPick() { show("scr-pick"); paintRoster(); }
  $("btn-enter").addEventListener("click", function () {
    show("scr-load");
    var n = 0;
    var bar = $("load-bar");
    var pct = $("load-pct");
    var timer = setInterval(function () {
      n = Math.min(100, n + 8);
      bar.style.width = n + "%";
      pct.textContent = n + "%";
      if (n >= 100) { clearInterval(timer); show("scr-lobby"); }
    }, 40);
  });
  // 测试模式：全关可进（占位战斗为花果山猴群，标题换成对应关）
  var testMode = false;
  try { testMode = localStorage.getItem("hg_test") === "1"; } catch (e) { /* storage off */ }
  var chip = document.getElementById("test-chip");
  if (chip) {
    var paintChip = function () {
      chip.textContent = testMode ? "🧪 测试模式：开（全关可进）" : "🧪 测试模式：关";
      chip.className = testMode ? "on" : "";
    };
    paintChip();
    chip.addEventListener("click", function () {
      testMode = !testMode;
      try { localStorage.setItem("hg_test", testMode ? "1" : "0"); } catch (e2) { /* storage off */ }
      paintChip();
      Array.prototype.forEach.call(document.querySelectorAll(".lv-card.soon"), function (card) {
        card.classList.toggle("armed", testMode);
        var bd = card.querySelector(".bd");
        if (bd) bd.textContent = testMode ? "测试" : "🔒";
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll(".lv-card.soon"), function (card) {
      card.classList.toggle("armed", testMode);
    });
  }
  $("btn-start").addEventListener("click", openPick);
  // 关卡卡：花果山可玩（等效开始），锁定卡提示
  var lvPlay = document.getElementById("lv-huaguoshan");
  if (lvPlay) lvPlay.addEventListener("click", function () { openPick(); });
  Array.prototype.forEach.call(document.querySelectorAll(".lv-card.soon"), function (card) {
    card.addEventListener("click", function () {
      if (testMode) {
        var nm = card.getAttribute("data-lock");
        var line = document.getElementById("pick-ep");
        if (line) line.textContent = "第?关 · " + nm + "（占位·猴群）";
        openPick();
        return;
      }
      var t = document.createElement("div");
      t.className = "float ok";
      t.textContent = card.getAttribute("data-lock") + " · 这一仗在备战中（开测试模式可进）";
      t.style.cssText = "left:50%;top:32%;transform:translateX(-50%)";
      document.body.appendChild(t);
      setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 1400);
    });
  });
  $("btn-pick-back").addEventListener("click", function () { show("scr-lobby"); });
  $("btn-again").addEventListener("click", beginBattle);
  $("btn-retry").addEventListener("click", beginBattle);
  $("btn-win-back").addEventListener("click", function () { show("scr-lobby"); });

  requestAnimationFrame(loop);
})();
