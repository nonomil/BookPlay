# 降妖记·单词复习游戏 设计总纲（Grok 协作版）

> 2026-09-12。主控：ZCode 主会话（架构/接线/浏览器审查）；执行：Grok Build 会话（独占写入目录的有界任务）。
> 规范遵循 `G:\AI编程--项目模板\美术和游戏设计\Grok游戏生成流水线\13-并发调度与Grok-Build.md`。

## 一句话

把"单词复习"做成西游记的**剧情任务链**：每集 = 一段剧情（三幕）→ 三站玩法（词球战斗 / NPC 问答 / Boss 对决）→ 每次提取练习都推进剧情。剧情文档由主控设计为**纯数据**（story-beats.json），Grok 负责把数据扩写成完整台词库与反馈演出，主控浏览器审查。

## 车道与写锁（并发原则：独占写入目录）

| lane | 内容 | 写锁（绝对路径） | 执行者 |
|---|---|---|---|
| 主控 D | 架构/接线/审查/合并 | prj/engine/game.js、game.html、game.css | ZCode 主会话 |
| G1 剧情数据 | 108 集剧情节拍与台词 | `content/game/story/`（独占新目录） | Grok 会话 1 |
| G2 战斗反馈演出 | 新文件 `prj/engine/game-feedback.js` + `.test.mjs` | 独占新文件 | Grok 会话 2 |
| G3 词球题库扩充 | `content/game/quests.json`（独占新文件） | Grok 会话 3（备用） |

**红线**：所有 lane 不得碰 game.js/game-core.js/battle-core.js/存储键/三白名单/既有资产目录。

## 审查协议（主控）

1. Grok 会话完成 → 主控独立跑 `node --test` + `git diff` 抽查 + `node --check`。
2. 浏览器实测：`http://127.0.0.1:18790/engine/game.html?ep=N` 截图/交互验证。
3. 不合格 → 同一 Grok session 发修正指令；两次不合格 → 主控接管。

## 文件

- [01-剧情总纲与三幕结构.md](01-剧情总纲与三幕结构.md)
- [02-词球战斗反馈设计.md](02-词球战斗反馈设计.md)
- contracts/grok-G1-剧情数据.md、contracts/grok-G2-反馈演出.md
