# 04 工程实现：game 探索页

## 1. 文件清单

```
prj/engine/game.html            # game.html?ep=N
prj/engine/game.css
prj/engine/game.js              # 探索层：地图/移动/小怪/NPC/入口 Boss
prj/engine/game-page.test.mjs   # 静态合同（script 顺序、tv 资源、存储键、reduced-motion、64px）
```

复用不新建：`battle-core.js`（判定/词球/结算/精灵解析）、`battle.html`（Boss 战，`&skip=intro,preview`）、`episode-vocab-quiz.js`、`tv-remote.js`、`walker-cast.js`（如需按集取 NPC 立绘）。

## 2. 页面结构与阶段机

```
game.html?ep=N
  ├─ boot：并行 fetch ../data/game/levels/epN.json + ../data/game/maps.json + sprites.json + taunts.json
  │         404 → 门禁卡"先去读这一集的故事"（复用 v1 gate 模式）
  ├─ explore（主阶段）
  │    ├─ 场景层：背景图（theme，未生成回退 adv_frames 模糊）+ 可行走区调试描边（?debug=1）
  │    ├─ 实体层：主角（四向 walk GIF / idle 帧）、小怪×3-5（游走 + 头顶单词气泡）、NPC×1-2（站桩 + 💬）、Boss 区标记（⚠️漩涡）
  │    ├─ HUD：护盾、进度（已消灭/总小怪+Boss）、目标条（中文目标词 + ♪ 朗读）、暂停
  │    └─ 底部收集栏：词卡/星星掉落动画终点
  ├─ encounter（击怪快卡）：点击目标怪 → 金箍棒飞出 → 3 选 1 快卡 → 结算特效（§01-2）
  ├─ bossGate：走近 Boss 弹确认卡 → location.href = battle.html?ep=N&skip=intro,preview
  └─ pause：继续 / 重玩 / 回地图
```

- 小怪游走：每怪一个游走状态机（在可行走区内随机目标点，3-5s 一换，CSS left/top transition 1.5s linear；`reduced-motion` 时静止）。
- 词分配：波次词表（core.buildWaveQuestions 含错词插队）顺序分配给 spawn 点；全部消灭后目标条显示"去挑战 Boss！"。漏打的小怪不影响进 Boss。
- 击怪快卡复用 `battle-core.buildOrbSet`（干扰词同集）；判定 `judgeHit`；错词写 `state.wrongWords`（结算写入同一 progress 键）。
- 移动：`requestAnimationFrame` 主循环（坐标归一化 0-1，按窗口尺寸换算）；触屏点击目的地 = 设定主角目标点自动走（walk GIF 按 dx/dy 主方向切四向）；摇杆 40px 半径；D-pad 每帧位移。
- 电视焦点：摇杆/小怪/NPC/Boss/暂停均 tabindex；D-pad 方向键在"移动模式"与"焦点模式"间用 OK 键长按切换（简单方案：方向键默认移动主角，Tab/下键切焦点选择模式——实现取简，验收时定稿）。

## 3. 存储合同

- 只读写 `bookplay_battle_progress_v1`（新增可选字段 `npcBonus/npcDone/mapExplored`，旧数据无字段视为 false）与 `bookplay_battle_collection_v1`（妖怪卡仍由 battle.html Boss 战写入）。
- 进游戏时读入上局 `wrongWords` 用于错词插队（同 v1）。

## 4. 入口（V2-T5）

- `map.js` 节点菜单：⚔️打怪 链接改为 🗺️探险 → `game.html?ep=N`（battle.html 保留直达，完成卡入口不动）。
- 版本 bump：map.html `map.js?v=` +1。

## 5. 验收清单

1. `npm test` 全绿零失败（新增 game-core/game-page 测试只增不减）；`node --check` 新 js。
2. 浏览器实测 ep5：点击地面移动、四向动画正确（南/北朝向不穿帮）、点怪飞棒 → 快卡 → 爆碎掉落、错词扣盾、NPC 对话与答题奖励、Boss 确认卡跳 battle Boss 战、回地图不重复开场、结算星星与错词落盘。
3. `?orientation=landscape` D-pad 可完成"移动→击一怪→进 Boss"。
4. `docs/reports/2026-09-XX-降妖记大地图ep5验收.md` + 更新本计划状态表。
