# -*- coding: utf-8 -*-
# proto-action.html 游戏手感补丁：缓动/起伏/压扁拉伸/顿帧/扫击/小怪转身
import io

p = r"G:\Game\BookPlay书戏\prj\engine\proto-action.html"
s = io.open(p, encoding="utf-8").read()
n0 = len(s)

# ---------- CSS：扫击动画/小怪转身/Boss呼吸/尘土 ----------
old = (
    "  #swing { position: absolute; z-index: 20; pointer-events: none; display: none;\n"
    "    width: 140px; height: 96px; border-radius: 14px 100px 100px 14px;\n"
    "    background: radial-gradient(ellipse at 18% 50%, rgba(255,240,170,.9), rgba(255,186,70,.28) 58%, transparent 76%); }"
)
new = (
    "  #swing { position: absolute; z-index: 20; pointer-events: none; display: none;\n"
    "    width: 140px; height: 96px; border-radius: 14px 100px 100px 14px;\n"
    "    background: radial-gradient(ellipse at 18% 50%, rgba(255,240,170,.9), rgba(255,186,70,.28) 58%, transparent 76%); }\n"
    "  @keyframes swingSweep {\n"
    "    0% { transform: translateY(-50%) rotate(-14deg) scale(.82); opacity: .55; }\n"
    "    55% { transform: translateY(-50%) rotate(6deg) scale(1.08); opacity: .95; }\n"
    "    100% { transform: translateY(-50%) rotate(16deg) scale(.96); opacity: 0; }\n"
    "  }\n"
    "  .mon.facing-left img { transform: scaleX(-1); }\n"
    "  .boss-spr { animation: breathe 1.7s ease-in-out infinite; transform-origin: 50% 100%; }\n"
    "  @keyframes breathe {\n"
    "    0%, 100% { transform: scale(1, 1); }\n"
    "    50% { transform: scale(1.025, .975); }\n"
    "  }\n"
    "  .dust { position: absolute; z-index: 8; width: 12px; height: 12px; border-radius: 50%;\n"
    "    background: rgba(220,232,255,.55); pointer-events: none;\n"
    "    animation: dustPuff .5s ease-out forwards; }\n"
    "  @keyframes dustPuff {\n"
    "    0% { transform: translate(0,0) scale(.6); opacity: .85; }\n"
    "    100% { transform: translate(var(--dx,0), -14px) scale(1.3); opacity: 0; }\n"
    "  }"
)
assert old in s, "css"
s = s.replace(old, new)

# ---------- 主角：加速减速+跑动起伏+跳拉伸/落地压扁+影子缩放 ----------
old = (
    "    hero.x = Math.max(46, Math.min(FW() - 46, hero.x + (hero.vx + dx * S.heroSpeed) * dt / 1000));\n"
    "    if (dx) { hero.face = dx; setState(\"移动中\"); }\n"
    "    hero.vy += GRAVITY * dt / 1000;\n"
    "    hero.y += hero.vy * dt / 1000;\n"
    "    if (hero.y >= GROUND()) {\n"
    "      if (!hero.grounded) setState(\"待命\");\n"
    "      hero.y = GROUND(); hero.vy = 0; hero.grounded = true;\n"
    "    }\n"
    "    G.heroEl.style.left = hero.x + \"px\";\n"
    "    G.heroEl.style.top = hero.y + \"px\";\n"
    "    G.heroEl.classList.toggle(\"facing-left\", hero.face < 0);\n"
    "    setShadow(G.heroSh, hero.x, GROUND() + 6, 76);"
)
new = (
    "    // 加速/减速：vx 平滑趋向目标速度（击退冲量由此自然衰减）\n"
    "    const target = dx * S.heroSpeed;\n"
    "    hero.vx += (target - hero.vx) * Math.min(1, dt / 1000 * 9);\n"
    "    if (Math.abs(hero.vx) < 2 && !dx) hero.vx = 0;\n"
    "    hero.x = Math.max(46, Math.min(FW() - 46, hero.x + hero.vx * dt / 1000));\n"
    "    if (dx) { hero.face = dx; setState(\"移动中\"); }\n"
    "    const wasAir = !hero.grounded;\n"
    "    hero.vy += GRAVITY * dt / 1000;\n"
    "    hero.y += hero.vy * dt / 1000;\n"
    "    if (hero.y >= GROUND()) {\n"
    "      if (wasAir && hero.vy > 260) { spawnDust(hero.x, GROUND()); S.heroSquashUntil = now + 110; }\n"
    "      hero.y = GROUND(); hero.vy = 0; hero.grounded = true;\n"
    "    }\n"
    "    G.heroEl.style.left = hero.x + \"px\";\n"
    "    G.heroEl.style.top = hero.y + \"px\";\n"
    "    G.heroEl.classList.toggle(\"facing-left\", hero.face < 0);\n"
    "    // 姿态：跑动起伏+前倾，跳跃拉伸，落地压扁——消灭平移贴图的僵硬感\n"
    "    const himg = G.heroEl.querySelector(\"img\");\n"
    "    let tf = \"\";\n"
    "    if (!hero.grounded) tf = \"scale(1.06, 1.12)\";\n"
    "    else if (now < (S.heroSquashUntil || 0)) tf = \"scale(1.08, .84)\";\n"
    "    else if (dx) {\n"
    "      const bob = Math.sin(now / 85) * 4;\n"
    "      tf = `translateY(${bob.toFixed(1)}px) rotate(${(dx > 0 ? 3 : -3).toFixed(1)}deg)`;\n"
    "    }\n"
    "    himg.style.transform = tf;\n"
    "    setShadow(G.heroSh, hero.x, GROUND() + 6, hero.grounded ? 76 : 76 - Math.min(26, (GROUND() - hero.y) * .12));"
)
assert old in s, "move"
s = s.replace(old, new)

# ---------- 跳跃：起跳尘土 ----------
old = (
    "  function doJump() {\n"
    "    if (S.running && S.hero.grounded) { S.hero.vy = JUMP_VY; S.hero.grounded = false; setState(\"跳跃\"); }\n"
    "  }"
)
new = (
    "  function doJump() {\n"
    "    if (S.running && S.hero.grounded) {\n"
    "      S.hero.vy = JUMP_VY; S.hero.grounded = false; setState(\"跳跃\");\n"
    "      spawnDust(S.hero.x, GROUND());\n"
    "    }\n"
    "  }"
)
assert old in s, "jump"
s = s.replace(old, new)

# ---------- 挥棒：扫击动画+前倾突进 ----------
old = (
    "    S.swingCd = now + SWING_COOLDOWN;\n"
    "    const sw = $(\"#swing\");\n"
    "    sw.style.display = \"block\";\n"
    "    if (S.hero.face > 0) { sw.style.left = (S.hero.x + 26) + \"px\"; sw.style.transform = \"translateY(-50%)\"; }\n"
    "    else { sw.style.left = (S.hero.x - 26 - 140) + \"px\"; sw.style.transform = \"translateY(-50%) scaleX(-1)\"; }\n"
    "    sw.style.top = (S.hero.y - 52) + \"px\";\n"
    "    setTimeout(() => { sw.style.display = \"none\"; }, SWING_ACTIVE_MS);"
)
new = (
    "    S.swingCd = now + SWING_COOLDOWN;\n"
    "    const sw = $(\"#swing\");\n"
    "    sw.style.display = \"block\";\n"
    "    if (S.hero.face > 0) { sw.style.left = (S.hero.x + 26) + \"px\"; sw.classList.remove(\"sweep-left\"); }\n"
    "    else { sw.style.left = (S.hero.x - 26 - 140) + \"px\"; sw.classList.add(\"sweep-left\"); }\n"
    "    sw.style.top = (S.hero.y - 52) + \"px\";\n"
    "    sw.style.animation = \"none\";\n"
    "    void sw.offsetWidth;                       // 重启 CSS 扫击动画\n"
    "    sw.style.animation = \"swingSweep .2s ease-out forwards\";\n"
    "    setTimeout(() => { sw.style.display = \"none\"; }, SWING_ACTIVE_MS + 60);\n"
    "    S.hero.x = Math.max(46, Math.min(FW() - 46, S.hero.x + S.hero.face * 10));  // 挥棒前倾突进"
)
assert old in s, "swing"
s = s.replace(old, new)

# ---------- 命中顿帧 + 尘土工厂 ----------
old = (
    "    if (hitAny) {\n"
    "      frame().classList.add(\"shake\");\n"
    "      setTimeout(() => frame().classList.remove(\"shake\"), 170);\n"
    "    }\n"
    "    renderHud();\n"
    "  }"
)
new = (
    "    if (hitAny) {\n"
    "      S.hitstopUntil = performance.now() + 55;   // 顿帧：命中瞬间世界停 55ms\n"
    "      frame().classList.add(\"shake\");\n"
    "      setTimeout(() => frame().classList.remove(\"shake\"), 170);\n"
    "    }\n"
    "    renderHud();\n"
    "  }\n"
    "\n"
    "  function spawnDust(x, y) {\n"
    "    for (let i = 0; i < 3; i++) {\n"
    "      const d = document.createElement(\"div\");\n"
    "      d.className = \"dust\";\n"
    "      d.style.left = (x - 14 + i * 14) + \"px\";\n"
    "      d.style.top = (y - 6) + \"px\";\n"
    "      d.style.setProperty(\"--dx\", ((i - 1) * 18) + \"px\");\n"
    "      frame().appendChild(d);\n"
    "      setTimeout(() => d.remove(), 520);\n"
    "    }\n"
    "  }"
)
assert old in s, "hitstop"
s = s.replace(old, new)

# ---------- step 吃顿帧 ----------
old = (
    "  function step(dtMs) {\n"
    "    if (!S.running || S.screen !== \"scr-battle\") return;\n"
    "    let remaining = Math.min(320, dtMs);"
)
new = (
    "  function step(dtMs) {\n"
    "    if (!S.running || S.screen !== \"scr-battle\") return;\n"
    "    if (S.hitstopUntil && performance.now() < S.hitstopUntil) return;  // 顿帧中冻结物理\n"
    "    S.hitstopUntil = 0;\n"
    "    let remaining = Math.min(320, dtMs);"
)
assert old in s, "step"
s = s.replace(old, new)

# ---------- 小怪：起伏+追击方向转身 ----------
old = (
    "      m.el.style.left = m.x + \"px\"; m.el.style.top = m.y + \"px\";\n"
    "      m.bar.style.left = m.x + \"px\"; m.bar.style.top = (m.y - 96) + \"px\";\n"
    "      setShadow(m.sh, m.x, m.y + 4, 58);\n"
    "    });"
)
new = (
    "      const bob = Math.sin(now / 220 + (m.phase = m.phase || Math.random() * 6.28)) * 5;\n"
    "      m.el.style.left = m.x + \"px\"; m.el.style.top = (m.y + bob) + \"px\";\n"
    "      m.el.classList.toggle(\"facing-left\", dir < 0);   // 追击方向转身\n"
    "      m.bar.style.left = m.x + \"px\"; m.bar.style.top = (m.y - 96) + \"px\";\n"
    "      setShadow(m.sh, m.x, m.y + 4, 58);\n"
    "    });"
)
assert old in s, "mon"
s = s.replace(old, new)

# ---------- Boss 呼吸类名 ----------
old = "    el.innerHTML = `<img src=\"${S.level.boss.gen || S.level.boss.spr}\" alt=\"\" onerror=\"this.onerror=null;this.src='${S.level.boss.spr}'\">`;"
new = "    el.innerHTML = `<img class=\"boss-spr\" src=\"${S.level.boss.gen || S.level.boss.spr}\" alt=\"\" onerror=\"this.onerror=null;this.src='${S.level.boss.spr}'\">`;"
assert old in s, "boss breathe"
s = s.replace(old, new)

# ---------- 击退冲量化 ----------
old = (
    "    S.hero.vx = Math.sign(S.hero.x - fromX || 1) * 300;\n"
    "    setTimeout(() => { S.hero.vx = 0; }, 180);"
)
new = "    S.hero.vx = Math.sign(S.hero.x - fromX || 1) * 300;  // 冲量由加速度模型自然衰减"
assert old in s, "kb"
s = s.replace(old, new)

io.open(p, "w", encoding="utf-8", newline="\n").write(s)
print("game-feel patch applied:", n0, "->", len(s))
