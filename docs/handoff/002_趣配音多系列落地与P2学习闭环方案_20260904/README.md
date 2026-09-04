---
title: 趣配音多系列落地与P2学习闭环方案
seq: 002
created_at: 2026-09-04
handoff_from: ZCode 主会话（GLM）
handoff_to: CC 新会话 / Codex / 子代理
status: active
---

## 现状一句话

趣配音已从"仅西游记"落地为三系列（西游记全 108 集含 C01~C02 阶段包适配、我的世界 5 本、Mikey & JJ 10 本），`npm test` 272/272 全绿、浏览器实测通过；九环节分析与 P2 四特性方案+执行提示词已备好待新会话逐个执行；mikey 的 v3 气泡已改大弹窗，地图小人等用户按 SOP 用 GPT 生成图集后自动生效。

## 接手警告

- **不要直接相信的旧结论**：`docs/handoff/001_西游记巩固单元交接_20260830` 中"巩固链路未端到端验证"仍成立；本包不涉及 drill 改动。
- **必须先核对的数字**：
  1. 测试基线现为 **272**（267 基线 + dub 系列 5 个新合同用例），任何改动后必须仍 272+ 全绿；
  2. 旧配音存档键格式 `ep1:n001`（`bookplay_dub_v1`），多系列扩展后 mikey/mc 键为 `mj1:1`/`mc1:1`——**兼容性不可破坏**；
  3. Mikey & JJ 时间轴单位是**毫秒**（start_ms/end_ms），西游记/我的世界是秒。
- **数据陷阱**：`storybooks-minecraft/book1.json` 的**页级** `start_sec/end_sec` 与句级时间严重漂移（页0 标 0→38.65s，实际句在 158.35→165.17s），一切以**句级**为准（`normalizeDubBook` 已处理）。

## 关键指标摘要

| 指标 | 范围 | 基线 | 当前 | 口径 | 来源 |
|------|------|------|------|------|------|
| 单元测试 | 全仓 `npm test` | 267 pass | **272 pass / 0 fail** | node --test | 本次会话多次运行 |
| 趣配音覆盖系列 | content 范围 | 仅 jttw | jttw(108集) + minecraft(5本) + mikey-jj(10本) | dub.html 可用系列 | `prj/engine/dub.js` BOOK_URLS |
| 西游记 C01/C02 | 阶段数据包 | 无配音适配 | C01=第1-7集、C02=第8-14集引擎级可用；包内无整集MP3→听原声回退视频原声 | `dialogue_stories/collections.json` + `prj/tools/pack_datapack.py` SKIP_PREFIXES | `docs/plans/2026-09-04-西游记多形式学习闭环与趣配音/02-多系列扩展-*.md` |
| mikey-jj 台词数据 | 10 本 | — | 逐句 MP3 + zh + speaker + 词级时间（毫秒） | dialogue_stories 无此数据 | `prj/data/storybooks-mikey-jj/book1.json` |

## 下一跳建议

- **建议接手者**：CC 新会话（执行 P2 特性提示词）或 Codex（真机验证项）
- **建议先调用的 skill**：无强制；P2 各特性提示词自包含（`docs/plans/2026-09-04-西游记多形式学习闭环P2/prompts/`）
- **建议先看的工件**：
  1. `docs/plans/2026-09-04-西游记多形式学习闭环P2/prompts/README.md`（P2 执行顺序与用法）
  2. `docs/plans/2026-09-04-mikey地图小人与PDF气泡修正.md`（GPT 生图 SOP，需用户手动执行）
  3. `docs/reports/2026-09-04-趣配音多系列扩展验收.md`（已验证/真机待验清单）

## 文件阅读顺序

1. 本 README（全局视图）
2. 背景上下文/问题背景.md（需求来源与范围）
3. 背景上下文/关键发现.md（已验证结论与数据事实）
4. 技术分析/解决方案.md（三系列归一架构 + 回退链 + 入口）
5. 行动项/下一步行动.md（接手后做什么）

## 结论标注

- ✅ 已验证结论：三系列趣配音可用（浏览器实测）；272 测试全绿；v3 大弹窗气泡生效（红框 display:none）；旧存档键兼容（dub-core 用例覆盖）
- 🔲 待验证：Android WebView 实录/授权、iOS audio/mp4 分支、C01/C02 包内视频原声回退、TV 无麦降级、GPT 图集生成质量（尚未生成）
- ❌ 已否决：儿歌拓展接入（西游记无配套儿歌）；页级时间轴用于 MC（数据漂移已证伪）
- ⚠️ 口径冲突：无未决冲突；历史包 001 的 drill 状态未在本会话复核

## 交接类型

- `普通任务交接`

## 必含字段（接手确认用）

- **完整度模式**：完整（关键数字/路径/禁区已内嵌）
- **禁区**（不碰的口径 / 路线 / 已否决方案）：
  - 不接入儿歌拓展；发音评分 ISE/OEN 归语音评测线另立项
  - 配音**不是门禁**：不做"必须配音解锁下一集"，不发金币、不做商城化
  - `content/`、`data/`（含 `dialogue_stories`）只读；既有存储合同（`bookplay_sp`、`bookplay_adv_progress` 等）不改
  - 旧配音存档键 `ep{n}:{nodeId}` 格式不可变更（会丢孩子已录配音）
  - `wala.js` 播放序列/状态机不动（只允许加入口）
  - Demucs 伴奏轨是 P3 数据包项目，不在纯前端会话实施
- **接手确认协议**：先总结复述 → 用户确认 → 才动手（见 `handoff-next-session.md` §2）
- **当前会话 transcript 路径**：ZCode 宿主会话记录（本包生成会话），不可整读；持久化证据以本包 + `docs/reports/2026-09-04-*` 两份验收报告为准
- **凝蜕状态指向**：本项目无 `.claude/state/` 机制；最新进展以本包 + `docs/plans/2026-09-04-*/00-总览.md` 状态表为准
- **优先级链**：交接包 → plans 状态表 → 宿主 transcript；任两层冲突 → 停下问用户
