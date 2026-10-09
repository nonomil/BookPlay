# -*- coding: utf-8 -*-
# 并行会话版 proto-action.html（2.5D 纵深架构）的手感适配补丁
# 只加不改骨架：起伏/压扁拉伸/尘土/顿帧/挥棒突进/小怪浮动/Boss呼吸/移动缓动
import io

p = r"G:\Game\BookPlay书戏\prj\engine\proto-action.html"
s = io.open(p, encoding="utf-8").read()

# ---------- CSS：尘土/压扁由 JS 控制 transform；扫击用既有 swingEl 加淡出 ----------
old = "#swing { position: absolute; width: 92px; height: 64px; margin: -32px 0 0 -10px; z-index: 25;"
new = (
    "#swing { position: absolute; width: 92px; height: 64px; margin: -32px 0 0 -10px; z-index: 25;\n"
    "    animation: swingSweep .2s ease-out forwards; }\n"
    "  @keyframes swingSweep {\n"
    "    0% { opacity: .5; filter: brightness(1.15); }\n"
    "    55% { opacity: 1; }\n"
    "    100% { opacity: 0; }\n"
    "  }\n"
    "  .boss-spr { animation: breathe 1.7s ease-in-out infinite; transform-origin: 50% 100%; }\n"
    "  @keyframes breathe {\n"
    "    0%, 100% { transform: scale(1, 1); }\n"
    "    50% { transform: scale(1.02, .98); }\n"
    "  }\n"
    "  .dust { position: absolute; z-index: 18; width: 11px; height: 11px; border-radius: 50%;\n"
    "    background: rgba(224,236,255,.6); pointer-events: none;\n"
    "    animation: dustPuff .5s ease-out forwards; }\n"
    "  @keyframes dustPuff {\n"
    "    0% { transform: translate(0,0) scale(.6); opacity: .85; }\n"
    "    100% { transform: translate(var(--dx,0), -16px) scale(1.35); opacity: 0; }\n"
    "  }"
)
assert old in s, "css"
s = s.replace(old, new)

# ---------- 移动缓动：模拟量平滑 ----------
old = (
    "    if (mv.m > 0.08) {\n"
    "      hero.x += mv.x * HERO_SPEED * dtS;\n"
    "      hero.z += mv.z * HERO_SPEED * dtS;\n"
    "      hero.facing = Math.atan2(mv.z, mv.x);\n"
    "      hero.goal = null;\n"
    "    } else if (hero.goal) {"
)
new = (
    "    // 移动缓动：平滑量趋近模拟输入（键盘 0/1 也变柔和），击退冲量同路径衰减\n"
    "    hero.mvx = (hero.mvx || 0) + (mv.x - (hero.mvx || 0)) * Math.min(1, dtS * 11);\n"
    "    hero.mvz = (hero.mvz || 0) + (mv.z - (hero.mvz || 0)) * Math.min(1, dtS * 11);\n"
    "    if (mv.m > 0.08) {\n"
    "      hero.x += (hero.mvx || mv.x) * HERO_SPEED * dtS;\n"
    "      hero.z += (hero.mvz || mv.z) * HERO_SPEED * dtS;\n"
    "      hero.facing = Math.atan2(mv.z, mv.x);\n"
    "      hero.goal = null;\n"
    "      hero.moving = true;\n"
    "    } else if (hero.goal) {"
)
assert old in s, "easing"
s = s.replace(old, new)

old = (
    "        var step = Math.min(d, HERO_SPEED * dtS);\n"
    "        hero.x += dx / d * step;\n"
    "        hero.z += dz / d * step;\n"
    "        hero.facing = Math.atan2(dz, dx);\n"
    "      }\n"
    "    }"
)
new = (
    "        var step = Math.min(d, HERO_SPEED * dtS);\n"
    "        hero.x += dx / d * step;\n"
    "        hero.z += dz / d * step;\n"
    "        hero.facing = Math.atan2(dz, dx);\n"
    "        hero.moving = true;\n"
    "      }\n"
    "    } else hero.moving = false;"
)
assert old in s, "goal-moving"
s = s.replace(old, new)

# ---------- 落地检测（hop 归零瞬间）+ 起跳尘土 ----------
old = (
    "    if (hero.hop > 0) {\n"
    "      hero.hop -= dt;\n"
    "      if (hero.hop <= 0) hero.hop = 0;\n"
    "    }\n"
    "    hero.hopping = hero.hop > 0;"
)
new = (
    "    if (hero.hop > 0) {\n"
    "      hero.hop -= dt;\n"
    "      if (hero.hop <= 0) { hero.hop = 0; hero.landAt = performance.now(); }\n"
    "    }\n"
    "    hero.hopping = hero.hop > 0;"
)
assert old in s, "land"
s = s.replace(old, new)

# ---------- 渲染：起伏/压扁/拉伸 + 影子已有缩放；落地尘土 ----------
old = (
    "    if (heroEl.classList.contains(\"noimg\")) {\n"
    "      heroCss.style.transform = \"translateX(-50%) scale(\" + (flip * sc) + \",\" + sc + \")\";\n"
    "    } else {\n"
    "      heroImg.style.transform = \"translateX(-50%) scale(\" + (flip * sc) + \",\" + sc + \")\";\n"
    "    }"
)
new = (
    "    // 姿态：跑动起伏+前倾，跳跃拉伸，落地压扁——由 hop 相位与 moving 驱动\n"
    "    var nowMs = performance.now();\n"
    "    var pose = flip * sc + \",\" + sc;\n"
    "    if (hero.hopping) {\n"
    "      var hp01 = 1 - hero.hop / HOP_MS;\n"
    "      var st = hp01 < 0.25 ? 1.1 : (hp01 > 0.8 ? 1.06 : 1.03);\n"
    "      pose = flip * sc * st + \",\" + sc / st;\n"
    "    } else if (hero.landAt && nowMs - hero.landAt < 110) {\n"
    "      pose = flip * sc * 1.07 + \",\" + sc * 0.85;\n"
    "    } else if (hero.moving) {\n"
    "      var bob = Math.sin(nowMs / 85) * 3.5;\n"
    "      pose = flip * sc + \",\" + sc + \" translateY(\" + bob.toFixed(1) + \"px) rotate(\" + (flip > 0 ? 2.5 : -2.5) + \"deg)\";\n"
    "    }\n"
    "    if (heroEl.classList.contains(\"noimg\")) {\n"
    "      heroCss.style.transform = \"translateX(-50%) scale(\" + pose + \")\";\n"
    "    } else {\n"
    "      heroImg.style.transform = \"translateX(-50%) scale(\" + pose + \")\";\n"
    "    }\n"
    "    if (hero.landAt && nowMs - hero.landAt < 60 && !hero._dusted) {\n"
    "      hero._dusted = true;\n"
    "      spawnDustScreen(p.sx, p.sy, sc);\n"
    "    }\n"
    "    if (!hero.hopping) hero._dusted = false;"
)
assert old in s, "pose"
s = s.replace(old, new)

# ---------- 小怪浮动 ----------
old = (
    "      var ff = state.hero.x < f.x ? -1 : 1;\n"
    "      placeSprite(f.el, f.spr, f.tag, f.x, f.z, 0, 1, ff, f.hpEl);"
)
new = (
    "      var ff = state.hero.x < f.x ? -1 : 1;\n"
    "      var fbob = Math.sin(nowMs / 230 + (f.phase = f.phase || Math.random() * 6.28)) * 4;\n"
    "      placeSprite(f.el, f.spr, f.tag, f.x, f.z, fbob, 1, ff, f.hpEl);"
)
assert old in s, "foe bob"
s = s.replace(old, new)

# ---------- Boss 呼吸类名 ----------
old = 'state.boss.el.innerHTML || "";'
if old not in s:
    # 找 boss el 创建点：直接给 img 加 class 的另一方式——渲染时补
    old2 = "    if (state.boss) {\n      var b = state.boss;\n      var mul = 1.55 * (0.38 + 0.62 * (b.left / b.hits));"
    new2 = (
        "    if (state.boss) {\n"
        "      var b = state.boss;\n"
        "      var bimg = b.el.querySelector(\"img\");\n"
        "      if (bimg && !bimg.classList.contains(\"boss-spr\")) bimg.classList.add(\"boss-spr\");\n"
        "      var mul = 1.55 * (0.38 + 0.62 * (b.left / b.hits));"
    )
    assert old2 in s, "boss breathe"
    s = s.replace(old2, new2)

# ---------- 顿帧 + 挥棒突进 + 尘土工厂 ----------
old = (
    "  function swing() {\n"
    "    var now = performance.now();\n"
    "    if (!state.running || state.paused) return;\n"
    "    if (now < state.swingCd) return;\n"
    "    state.swingCd = now + 420;\n"
    "    state.swingUntil = now + 170;"
)
new = (
    "  function swing() {\n"
    "    var now = performance.now();\n"
    "    if (!state.running || state.paused) return;\n"
    "    if (now < state.swingCd) return;\n"
    "    state.swingCd = now + 420;\n"
    "    state.swingUntil = now + 170;\n"
    "    // 挥棒前倾突进（沿面向方向）\n"
    "    state.hero.x = clamp(state.hero.x + Math.cos(state.hero.facing) * 10, 36, WORLD.w - 36);\n"
    "    state.hero.z = clamp(state.hero.z + Math.sin(state.hero.facing) * 10, 28, WORLD.d - 28);"
)
assert old in s, "swing lunge"
s = s.replace(old, new)

# hurtFoe / hitBoss 命中顿帧
old = "  function hurtFoe(f) {\n    var matched = f.word.en === state.plateWord.en;"
new = (
    "  function hurtFoe(f) {\n"
    "    state.hitstopUntil = performance.now() + 50;\n"
    "    var matched = f.word.en === state.plateWord.en;"
)
assert old in s, "hitstop foe"
s = s.replace(old, new)

i = s.find("  function hitBoss(n) {")
assert i > 0, "hitBoss"
j = s.find("{", i) + 1
s = s[:j] + "\n    state.hitstopUntil = performance.now() + 60;" + s[j:]

# ---------- loop 吃顿帧 ----------
old = (
    "  function loop(now) {\n"
    "    var dt = Math.min(48, now - last);\n"
    "    last = now;\n"
    "    if (state.screen === \"battle\" && state.running && !state.paused) update(dt);"
)
new = (
    "  function loop(now) {\n"
    "    var dt = Math.min(48, now - last);\n"
    "    last = now;\n"
    "    if (state.hitstopUntil && now < state.hitstopUntil) dt = 0;  // 顿帧：世界冻结\n"
    "    state.hitstopUntil = 0;\n"
    "    if (state.screen === \"battle\" && state.running && !state.paused) update(dt);"
)
assert old in s, "loop hitstop"
s = s.replace(old, new)

# ---------- 尘土工厂（屏幕坐标版） ----------
old = "  var last = performance.now();"
new = (
    "  function spawnDustScreen(sx, sy, sc) {\n"
    "    for (var i = 0; i < 3; i++) {\n"
    "      var d = document.createElement(\"div\");\n"
    "      d.className = \"dust\";\n"
    "      d.style.left = (sx - 12 + i * 12) + \"px\";\n"
    "      d.style.top = (sy - 5) + \"px\";\n"
    "      d.style.setProperty(\"--dx\", ((i - 1) * 16) + \"px\");\n"
    "      world.appendChild(d);\n"
    "      (function (el) { setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 520); })(d);\n"
    "    }\n"
    "  }\n"
    "\n"
    "  var last = performance.now();"
)
assert old in s, "dust factory"
s = s.replace(old, new)

io.open(p, "w", encoding="utf-8", newline="\n").write(s)
print("adapted feel patch applied:", len(s))
