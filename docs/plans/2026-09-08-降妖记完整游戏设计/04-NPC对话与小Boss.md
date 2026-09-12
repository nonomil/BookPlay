# 04 NPC 对话与小 Boss

参考：`G:/StudyCode/宠物积分系统/docs/参考/探索地图对话剧情系统-跨项目参考.md`  
运行时真源是 `pixel-story-engine.js` 的播放方式，不是 `app/explore-terminal/` 静态原型。  
可移植模板：`G:\StudyCode\小游戏项目\games\dialogue-story-template\`（只学交互，不整包搬）。

## 人还在大地图上

对话不新开一页。走近弹层，播完回探索。  
只要：**台词数组 + 游标、一句一句推、选择题没答完不能翻、左侧立绘 + 底部对话框。**

不要：80 节点世界 tab、分页地图、分支 `goto` 树、新存档键、每集 11 句 galgame、场景立绘整包切换。

## 两种 NPC

### 开场 NPC（每集一个，出生点附近）

- 走近 **自动** 弹出一次。  
- 2 句本集原文（中英），点「继续」翻句，末句变「出发」。  
- 原文必须带 `sourceNodeId`，对得上 `dialogue_stories` 节点 / 字幕。  
- `from=battle` 回来不重弹（`shouldAutoIntro`）。`from=lesson` 仍弹。

### 小 Boss NPC（每集一个，第二波附近）

- **第一波清完**才可对话；未开门头顶「…」。  
- 流程：一句本集台词 → 1 题。题目优先用本集官方测验 `sentence_choice`；没有才退回本集词义三选一。  
- 答对：词卡 + `npcBonus`（第三颗星条件之一）。  
- 答错：只禁用点错的项，正确项保持可点；可再试一次。两次都错揭示并带读，不扣盾。  
- 每集奖励只发一次（`npcDone`）。  
- 电视：方向键选选项，OK 确认。

## 游标规则

```
state.dlg = { npc, lines, idx, retried, awaitingChoice }
advanceDialogue():
  若 awaitingChoice 且未作答 → 不推进
  若正在显示反馈 → 先收反馈再推进
  否则 idx += 1
关闭对话：停音频、dlg=null、面板 hidden、释放锁、清零意图
```

答错全禁（含正确项）会卡死，已否决。

## 台词数据

| 集 | 手写 `npcDialogue` / `dialogues/epN.json` | 音频索引 |
|---|---|---|
| ep1、ep5 | 有，含 `audioRef` | 有 `content/game/audio/epN.json` |
| ep2–4、6–7 | 无，回退 `intro[]` + `taunts.json` | 无，TTS 回退（设备上等于可能无声） |

七集玩法共用，但剧情/语音目前不齐。先把 ep1/ep5 播对，再按同一字段补其余集，不新开对话引擎。

## 字段（关卡 JSON）

开场 / quiz 行只允许：

- `type`: `dialogue` | `choice`  
- `text` / `textEn`  
- `speaker` / `sourceNodeId` / `audioRef`（可空，空则静音或已有词音频）  
- choice：`options[{id, text, correct}]`

不引入 pixel-story 的 `scenes[]` 多场结构。
