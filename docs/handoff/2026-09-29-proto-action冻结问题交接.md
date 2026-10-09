# 交接：proto-action.html 运行冻结问题（给并行会话/用户）

日期：2026-09-29
文件：`prj/engine/proto-action.html`（108 集版本，65KB→77KB，含我的手感适配补丁）
状态：**【已撤销】本报告的"冻结"结论是误判**——2026-09-29 晚间实测：phase=lose（用户战败）导致画面静止，被我误读为冻结；重开一局后战斗完全正常（词牌/小妖/投射物实时更新，截图为证）。文中取证方法（代理哨兵零写入等）是在败局静止画面上做的，全部无效。保留本文仅作调试方法记录。

## 症状（浏览器取证，全部可复现）

1. 管线能走通：标题→加载(108集)→选集→选人→战场渲染全部正常。
2. 战场内：主角静止（left 恒定 641.881px）、小怪不追人不扔冰、点击移动（pointerdown→goal）无反应、goal-pin 不出现。
3. `requestAnimationFrame` 60fps 存活且无异常（已用 wrapper 捕获验证）。
4. `state.hero` 代理哨兵 **1.25 秒零写入**——updateHero 从未执行到写路径。
5. 按键（document 派发）不改变 `state.keys`；遥测 `tel` 长度不增长。
6. `window.onerror` / rAF wrapper / unhandledrejection 三路均无异常。

## 关键线索

- `window.__v3.state` 可能是**旧引用**：若 boot/beginBattle 中途重.assign 了 `state`，`__v3.state` 指向旧对象，用它在浏览器控制台调试会看到"假状态"（我因此绕了很久）。请用闭包内 console.log 或断点在真实 state 上排查。
- 疑点集中在 **beginBattle/phase 门控**：render 能跑（battle 屏可见），update 被门控跳过。查 loop 处 `state.running / state.paused / state.screen` 在**真实 state** 上的值；以及 phase="debut"（我见过此值）是否挡住了 update→updateHero。
- 我的手感补丁（easing/bob/squash/hitstop/dust/boss 呼吸，patch_action_feel_v2.py）语法通过、无运行时异常，但尚未在真实运转的战斗中验证——冻结修好后它们应当直接生效。

## 修复建议（优先级）

1. 在 beginBattle 完成处（battle 首帧前）打印真实 `state.running/paused/screen/phase`——大概率是某个门控值没置位（如 running=false 或 phase 停在 debut）。
2. 检查 boot 异步链是否有 await 卡在音频/语音解锁（我的探针在 phase 见过 "debut"，可能是开场演出未释放）。
3. 冻结修复后按 `patch_action_feel_v2.py` 的锚点回归测试六项手感。

## 我这边已交付且不受影响的东西

- 4 关卡制原型 v4 的完整实现思路与 LEVELS 配置（本文件历史版本，git 未提交但补丁脚本在 prj/tools/）
- 9 张 Grok 生成资产已入库 `content/assets/generated/longgong-jiebao-v1/`（4 场景 1920×1080 + 5 立绘真 alpha），missing-paths.json 状态 review-pending
- 游戏手感补丁两份：patch_action_feel.py（横版帧制版）/ patch_action_feel_v2.py（2.5D 纵深版，即本文件）
