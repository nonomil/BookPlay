# -*- coding: utf-8 -*-
# proto-action.html：测试模式（全关卡可选）+ 学习地图风格选集卡片
import io

p = r"G:\Game\BookPlay书戏\prj\engine\proto-action.html"
s = io.open(p, encoding="utf-8").read()

# ---------- 1. CSS：学习地图风卡片 + 测试模式开关 ----------
old = "#ep-list { margin-top: 14px;"
new = (
    "#test-chip { flex: none; align-self: flex-start; background: rgba(46,66,110,.75);\n"
    "    border: 1px solid rgba(140,180,255,.4); color: #cfe0ff; border-radius: 999px;\n"
    "    padding: 6px 16px; font-size: 13px; font-weight: 800; cursor: pointer; }\n"
    "  #test-chip.on { background: linear-gradient(180deg,#7bd35f,#3ba032); color: #fff; border-color: #fff; }\n"
    "  .ep-card { display: flex; align-items: center; gap: 10px; text-align: left;\n"
    "    background: linear-gradient(180deg, #2b3f6e, #1a2c52); border: 2px solid rgba(150,190,255,.3);\n"
    "    border-radius: 14px; padding: 8px 10px; cursor: pointer; min-height: 68px; transition: transform .08s; }\n"
    "  .ep-card:active { transform: scale(.97); }\n"
    "  .ep-card .cover { width: 76px; height: 52px; object-fit: cover; border-radius: 8px; flex: none;\n"
    "    background: #10203c; }\n"
    "  .ep-card .tx { min-width: 0; }\n"
    "  .ep-card .nm { font-size: 13.5px; font-weight: 800; white-space: nowrap; overflow: hidden;\n"
    "    text-overflow: ellipsis; }\n"
    "  .ep-card .en { font-size: 11px; opacity: .72; white-space: nowrap; overflow: hidden;\n"
    "    text-overflow: ellipsis; }\n"
    "  .ep-card .st { position: absolute; }\n"
    "  .ep-card.now { border-color: #ffd24a; background: linear-gradient(180deg, #ffd75e, #f0a52c); color: #4a3405; }\n"
    "  .ep-card.now .en { opacity: .8; }\n"
    "  .ep-card.lock { opacity: .5; filter: grayscale(.65); }\n"
    "  .ep-card .bd { margin-left: auto; flex: none; font-size: 12px; font-weight: 900;\n"
    "    background: rgba(8,16,36,.55); border-radius: 999px; padding: 3px 10px; }\n"
    "  .ep-card.now .bd { background: rgba(255,255,255,.35); }\n"
    "  #ep-list { margin-top: 14px; display: grid; grid-template-columns: 1fr 1fr; gap: 10px;"
)
assert old in s, "css anchor"
s = s.replace(old, new, 1)

# ---------- 2. HTML：测试模式开关按钮 ----------
old = '    <div id="ep-list"></div>'
new = (
    '    <button id="test-chip" type="button">🧪 测试模式：关</button>\n'
    '    <div id="ep-list"></div>'
)
assert old in s, "html chip"
s = s.replace(old, new, 1)

# ---------- 3. openLobby：卡片化渲染 + 测试模式解锁 ----------
old = (
    '    var list = $("ep-list");\n'
    '    while (list.firstChild) list.removeChild(list.firstChild);\n'
    '    for (var i = 0; i < state.episodes.length; i++) {\n'
    '      var item = state.episodes[i];\n'
    '      var row = document.createElement("div");\n'
    '      var later = item.order > state.unlocked;\n'
    '      var now = item.order === state.unlocked;\n'
    '      row.className = "ep" + (now ? " now" : later ? " lock" : " done");\n'
    '      var name = document.createElement("b");\n'
    '      name.textContent = "第 " + item.order + " 集 · " + (item.titleZh || "");\n'
    '      var st = document.createElement("span");\n'
    '      st.className = "st";\n'
    '      st.textContent = now ? "当前" : later ? "未解锁" : "已通关";\n'
    '      row.appendChild(name);\n'
    '      row.appendChild(st);\n'
    '      list.appendChild(row);\n'
    '    }\n'
    '    show("scr-lobby");'
)
new = (
    '    var list = $("ep-list");\n'
    '    while (list.firstChild) list.removeChild(list.firstChild);\n'
    '    var chip = $("test-chip");\n'
    '    if (chip) {\n'
    '      chip.className = state.testMode ? "on" : "";\n'
    '      chip.id = "test-chip";\n'
    '      chip.textContent = state.testMode ? "🧪 测试模式：开（全关卡可玩）" : "🧪 测试模式：关";\n'
    '    }\n'
    '    for (var i = 0; i < state.episodes.length; i++) {\n'
    '      var item = state.episodes[i];\n'
    '      var later = item.order > state.unlocked;\n'
    '      var now = item.order === state.unlocked;\n'
    '      var playable = now || state.doneOrder[item.order] || state.testMode;\n'
    '      var card = document.createElement("div");\n'
    '      card.className = "ep-card" + (now ? " now" : later ? (state.testMode ? " test" : " lock") : " done");\n'
    '      var cover = document.createElement("img");\n'
    '      cover.className = "cover";\n'
    '      cover.loading = "lazy";\n'
    '      cover.src = item.illustration || ("../assets/game-backgrounds/ep" + item.order + ".jpg");\n'
    '      cover.onerror = function () { this.onerror = null; this.src = "../assets/game-backgrounds/ep1.jpg"; };\n'
    '      var tx = document.createElement("span");\n'
    '      tx.className = "tx";\n'
    '      tx.innerHTML = \'<span class="nm"></span><br><span class="en"></span>\';\n'
    '      tx.querySelector(".nm").textContent = "第 " + item.order + " 集 · " + (item.titleZh || "");\n'
    '      tx.querySelector(".en").textContent = item.titleEn || "";\n'
    '      var bd = document.createElement("span");\n'
    '      bd.className = "bd";\n'
    '      bd.textContent = now ? "当前" : later ? (state.testMode ? "测试" : "🔒") : "✓";\n'
    '      card.appendChild(cover);\n'
    '      card.appendChild(tx);\n'
    '      card.appendChild(bd);\n'
    '      card.addEventListener("click", (function (it, canPlay) {\n'
    '        return function () {\n'
    '          if (!canPlay) { toast("未解锁：通关前一集，或开测试模式"); return; }\n'
    '          state.pickEp = it;\n'
    '          openPick();\n'
    '        };\n'
    '      })(item, playable));\n'
    '      list.appendChild(card);\n'
    '    }\n'
    '    show("scr-lobby");'
)
assert old in s, "openLobby"
s = s.replace(old, new, 1)

# ---------- 4. openPick / confirmWukong 用 pickEp ----------
old = (
    "    var ep = currentEp();\n"
    "    var theme = (ep && ep.theme) || \"flower-fruit-mountain\";"
)
new = (
    "    var ep = state.pickEp || currentEp();\n"
    "    var theme = (ep && ep.theme) || \"flower-fruit-mountain\";"
)
assert old in s, "openPick ep"
s = s.replace(old, new, 1)

old = '      beginBattle(currentEp());\n      requestAnimationFrame(function () {\n        floatText(state.hero.x, state.hero.z, "俺老孙来也", "ok");'
new = (
    '      beginBattle(state.pickEp || currentEp());\n'
    '      state.pickEp = null;\n'
    '      requestAnimationFrame(function () {\n'
    '        floatText(state.hero.x, state.hero.z, "俺老孙来也", "ok");'
)
assert old in s, "confirm ep"
s = s.replace(old, new, 1)

# ---------- 5. 状态与开关事件 ----------
old = "    unlocked: 1,"
new = (
    "    unlocked: 1,\n"
    "    testMode: false,\n"
    "    pickEp: null,\n"
    "    doneOrder: {},"
)
assert old in s, "state fields"
s = s.replace(old, new, 1)

old = '  $("btn-play").addEventListener("click", openPick);'
new = (
    '  try { state.testMode = localStorage.getItem("bookplay_action_test") === "1"; } catch (e) { /* storage off */ }\n'
    '  try {\n'
    '    var doneMap = JSON.parse(localStorage.getItem("bookplay_action_done") || "{}");\n'
    '    if (doneMap && typeof doneMap === "object") state.doneOrder = doneMap;\n'
    '  } catch (e2) { /* storage off */ }\n'
    '  $("test-chip").addEventListener("click", function () {\n'
    '    state.testMode = !state.testMode;\n'
    '    try { localStorage.setItem("bookplay_action_test", state.testMode ? "1" : "0"); } catch (e3) { /* storage off */ }\n'
    '    openLobby();\n'
    '  });\n'
    '  $("btn-play").addEventListener("click", function () { state.pickEp = null; openPick(); });'
)
assert old in s, "chip wiring"
s = s.replace(old, new, 1)

# 通关记录：advance 处记 doneOrder
old = "    if (nxt && state.unlocked === beaten) state.unlocked = nxt.order;"
new = (
    "    if (nxt && state.unlocked === beaten) state.unlocked = nxt.order;\n"
    "    try {\n"
    "      var doneMap2 = state.doneOrder;\n"
    "      doneMap2[beaten] = 1;\n"
    "      localStorage.setItem(\"bookplay_action_done\", JSON.stringify(doneMap2));\n"
    "    } catch (e4) { /* storage off */ }"
)
assert old in s, "done record"
s = s.replace(old, new, 1)

io.open(p, "w", encoding="utf-8", newline="\n").write(s)
print("test-mode + map cards patch applied:", len(s))
