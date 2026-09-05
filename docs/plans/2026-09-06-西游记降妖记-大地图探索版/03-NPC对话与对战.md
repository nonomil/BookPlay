# 03 NPC 对话与对战接入

## 1. NPC 对话数据契约（运行时组装，不入关卡 JSON）

NPC 点击后的对话序列，运行时按序取用（全部本地数据，无网络）：

1. **intro 型 NPC**：`level.intro` 的台词（v1 已派生，2 句原文）；
2. **quiz 型 NPC**：`taunts.json[role]` 随机 1 条 + 本集 `official_words` 出 1 道 3 选 1（题面 = 英文词 + IPA + TTS，选项 = 中文，干扰项用 battle-core.buildOrbSet 同源逻辑）；
3. **兜底**：`taunts.json.guide`（新增 2-3 条引导台词："往右走，妖怪在那边！"等）。

对话框复用 v1 `.battle-dialogue` 结构与样式（立绘 = sprites 注册表帧/GIF）。

## 2. NPC 答题奖励

- 答对：`npcBonus = true`（写 `bookplay_battle_progress_v1[ep].npcBonus`）；星星规则升级为——⭐⭐ 条件的"护盾≥2 或 quiz 通过"放宽为"护盾≥2 或 quiz 通过或 npcBonus"；奖励词卡弹出展示 1.5s。
- 答错：显示正确答案 + 中文，不惩罚，可重答一次；两次都错仅展示答案。
- 每集 NPC 奖励只发一次（progress 里 `npcDone` 标记，重进本集不重复发）。

## 3. Boss 接入（battle.html 扩展）

- battle.js 的 `SKIP` 集合已支持 `intro,preview,quiz`；新增 `waves`：`startWave(0)` 前若 `SKIP.has("waves")` 直接 `startBoss()`。
- URL：`battle.html?ep=N&skip=intro,preview`（小怪在地图打，战斗页只打 Boss）。探索层把 `state.wrongWords` 带过去：URL 加 `&wrong=term1,term2`（battle.js boot 时并入错词表，让 Boss 词序优先错词——与 buildWaveQuestions 的错词插队同语义，需 battle-core 支持 boss 词序重排：`reorderBossWords(level, wrongWords)` 小函数 + 测试）。
- 返回探索层：Boss 结算页"返回地图"按钮改为 `game.html?ep=N`（带 `?from=battle` 标记避免重复开场对话）。

## 4. 开场对话迁移

v2 由图内 intro NPC 承担开场剧情（走近自动弹一次），`game.js` 不再放全屏 intro；`battle.html` 独立进入时仍保留 v1 intro（行为不变）。
