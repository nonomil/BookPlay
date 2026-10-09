# -*- coding: utf-8 -*-
# 选关页对齐学习地图真实排列：7 集一页 + 手绘锚点 + 白点虚线 + 辑信息条
import io

p = r"G:\Game\BookPlay书戏\prj\engine\proto-action.html"
s = io.open(p, encoding="utf-8").read()

# ---------- 1. CSS：锚点式节点样式 + 辑信息条 ----------
old = "  #ep-route { position: absolute; inset: 19% 7% 8%; overflow: visible; }"
new = """  #ep-route { position: absolute; inset: 0; overflow: hidden; }
  #scr-levels .shade, #scr-levels .bgimg { z-index: 0; }
  .node { position: absolute; transform: translate(-50%, -50%); z-index: 4;
    width: var(--card, 200px); cursor: pointer; transition: transform .14s; }
  .node:hover { transform: translate(-50%, -50%) scale(1.07); z-index: 8; }
  .node-cover { position: relative; display: block; width: 100%; aspect-ratio: 16 / 10;
    overflow: hidden; border-radius: 10px; border: 2.5px solid rgba(240, 210, 120, 0.9);
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.5); }
  .node-cover img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .node-badge { position: absolute; top: -9px; right: -9px; width: 30px; height: 30px;
    border-radius: 50%; display: flex; align-items: center; justify-content: center;
    font-size: 14px; font-weight: 900; background: linear-gradient(180deg, #9f8bff, #6c56d8);
    color: #fff; border: 2px solid #fff; box-shadow: 0 3px 8px rgba(0,0,0,.4); z-index: 3; }
  .node-badge.lock { background: linear-gradient(180deg, #ffd76a, #e8a923);
    border-color: #fff4c8; color: #241b0d; }
  .node-tip { position: absolute; top: -12px; right: -10px; background: linear-gradient(180deg, #ffe27a, #ffc93c);
    color: #4a3405; border: 2px solid #fff; border-radius: 999px; padding: 3px 12px;
    font-size: 13px; font-weight: 900; box-shadow: 0 3px 10px rgba(0,0,0,.45); z-index: 3;
    animation: tipBob 1.2s ease-in-out infinite; }
  @keyframes tipBob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }
  .node-text { display: block; text-align: center; margin-top: 7px;
    text-shadow: 0 2px 5px rgba(0, 0, 0, 0.85), 0 0 12px rgba(0,0,0,.5); }
  .node .episode-number { display: block; font-size: 12.5px; font-weight: 800;
    color: #ffd24a; letter-spacing: 1px; }
  .node .episode-name { display: block; font-size: 17px; font-weight: 900; color: #fff; }
  .node .episode-en { display: block; font-size: 11.5px; color: #e8f0ff; opacity: .95; }
  .node.locked .node-cover { filter: grayscale(.7) brightness(.62); }
  .node.locked .node-text { opacity: .75; }
  #ep-route .route-line path { stroke: #fdfdf2; stroke-width: 9;
    stroke-dasharray: 0.1 22; stroke-linecap: round; fill: none;
    filter: drop-shadow(0 2px 3px rgba(0,0,0,.45)); }
  #ep-nav { font-size: 15px; }
  #story-bar { position: absolute; left: 0; right: 0; bottom: 0; z-index: 20;
    background: linear-gradient(180deg, rgba(10,20,16,.15), rgba(8,16,12,.78));
    padding: 12px 26px 16px; text-align: center; }
  #story-bar .sb1 { font-size: clamp(16px, 2.6vh, 22px); font-weight: 900; color: #ffd24a;
    text-shadow: 0 2px 6px rgba(0,0,0,.8); }
  #story-bar .sb1 .en { font-size: 13px; color: #e8f0ff; margin-left: 12px; font-weight: 700; }
  #story-bar .sb2 { display: flex; gap: 10px; justify-content: center; margin-top: 6px; }
  #story-bar .sb2 span { background: rgba(8,16,36,.75); border-radius: 999px;
    padding: 3px 16px; font-size: 12.5px; font-weight: 700; color: #dfe9ff; }
  #story-bar .sb2 .done { color: #7be08a; }"""
assert old in s, "route css replace"
s = s.replace(old, new, 1)

# ---------- 2. 每页 7 集 ----------
old = "    var PER = 12;"
assert old in s, "per"
s = s.replace(old, "    var PER = 7;", 1)

# ---------- 3. openLobby 渲染：锚点定位 + 辑信息条 ----------
old = (
    '    var nav = $("ep-nav");\n'
    '    if (nav) {\n'
    '      var from = state.routePage * PER + 1, to = Math.min(state.episodes.length, (state.routePage + 1) * PER);\n'
    '      nav.textContent = "第 " + from + " - " + to + " 集（第 " + (state.routePage + 1) + "/" + totalPages + " 页）";\n'
    '    }\n'
    '    var pageStart = state.routePage * PER;'
)
new = (
    '    var nav = $("ep-nav");\n'
    '    if (nav) {\n'
    '      var from = state.routePage * PER + 1, to = Math.min(state.episodes.length, (state.routePage + 1) * PER);\n'
    '      nav.textContent = "第 " + from + " - " + to + " 集（第 " + (state.routePage + 1) + "/" + totalPages + " 页）";\n'
    '    }\n'
    '    // 辑信息条（对标学习地图底部栏）\n'
    '    var STORY_NAMES = ["石猴出世 · 拜师学艺", "龙宫借宝 · 地府除名", "官封弼马温 · 蟠桃园",\n'
    '      "大战天兵 · 大闹天宫", "五行山下 · 取经起程", "鹰愁涧 · 高老庄", "流沙河 · 收沙僧",\n'
    '      "偷吃人参果", "三打白骨精", "宝象国 · 平顶山", "乌鸡国 · 红孩儿", "车迟国 · 通天河",\n'
    '      "金兜洞 · 女儿国", "真假美猴王 · 火焰山", "祭赛国 · 小雷音", "狮驼岭 · 比丘国"];\n'
    '    var storyName = $("story-name");\n'
    '    if (storyName) {\n'
    '      var sn = STORY_NAMES[state.routePage % STORY_NAMES.length];\n'
    '      storyName.childNodes[0].textContent = sn;\n'
    '      var en = $("story-en");\n'
    '      if (en) en.textContent = "Chapter " + (state.routePage + 1);\n'
    '    }\n'
    '    var doneCnt = 0;\n'
    '    for (var d2 = from; d2 <= to; d2++) if (state.doneOrder[d2] || d2 < state.unlocked) doneCnt += 1;\n'
    '    var doneEl = $("story-done");\n'
    '    if (doneEl) doneEl.textContent = "已学 " + doneCnt + "/" + PER;\n'
    '    var pageStart = state.routePage * PER;'
)
assert old in s, "story bar"
s = s.replace(old, new, 1)

# ---------- 4. 锚点布局替换蛇形网格 ----------
old = (
    "    var cols = 4;\n"
    "    var cardW = Math.min(w * 0.2, 190);\n"
    "    routeEl.style.setProperty(\"--card\", cardW + \"px\");\n"
    "    var cardH = cardW * 9 / 16 + 44;\n"
    "    var rows = Math.ceil(nodes.length / cols);\n"
    "    var top = 26;\n"
    "    var spanY = Math.max(cardH + 26, h - top * 2);\n"
    "    var rowGap = rows > 1 ? (spanY - cardH) / (rows - 1) : 0;\n"
    "    var pts = [];\n"
    "    for (var i = 0; i < nodes.length; i++) {\n"
    "      var row = Math.floor(i / cols);\n"
    "      var off = i % cols;\n"
    "      var col = row % 2 === 0 ? off : cols - 1 - off;\n"
    "      var x = w * 0.10 + (w * 0.80) * (cols === 1 ? 0.5 : col / (cols - 1));\n"
    "      var y = top + cardH / 2 + row * rowGap;\n"
    "      nodes[i].style.left = ((x / w) * 100).toFixed(2) + \"%\";\n"
    "      nodes[i].style.top = ((y / h) * 100).toFixed(2) + \"%\";\n"
    "      pts.push({ px: x, py: y });\n"
    "    }"
)
new = (
    "    var cardW = Math.min(w * 0.155, 210);\n"
    "    routeEl.style.setProperty(\"--card\", cardW + \"px\");\n"
    "    // 手绘锚点（对标学习地图第1—7集的落点比例）：贴场景地标的不规则路线\n"
    "    var ANCHORS = [\n"
    "      [0.085, 0.10], [0.37, 0.115], [0.665, 0.125],\n"
    "      [0.865, 0.475], [0.555, 0.50], [0.245, 0.535], [0.095, 0.83],\n"
    "    ];\n"
    "    var pts = [];\n"
    "    for (var i = 0; i < nodes.length; i++) {\n"
    "      var a = ANCHORS[i] || ANCHORS[ANCHORS.length - 1];\n"
    "      var x = a[0] * w, y = a[1] * h;\n"
    "      nodes[i].style.left = ((x / w) * 100).toFixed(2) + \"%\";\n"
    "      nodes[i].style.top = ((y / h) * 100).toFixed(2) + \"%\";\n"
    "      pts.push({ px: x, py: y });\n"
    "    }"
)
assert old in s, "anchors"
s = s.replace(old, new, 1)

# ---------- 5. 移除 ep-list 旧容器残留（渲染已不写它） ----------
s = s.replace('    <div id="ep-list"></div>\n', "", 1)

io.open(p, "w", encoding="utf-8", newline="\n").write(s)
print("anchor route applied:", len(s))
