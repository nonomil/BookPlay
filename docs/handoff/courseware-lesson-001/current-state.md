# 当前状态

## 仓库

- 工作区：`G:\Game\BookPlay书戏`
- Git：已初始化，分支 `main`，尚无初始提交。
- 当前文件大多为未跟踪的用户原始工作区，必须保留。
- `.gitignore` 已约束 Git 只覆盖代码、配置、测试和文档；`data/`、`content/`、视频图片、构建物和发布物不跟踪。

## 已完成支持工作

- 已分析 335 份 PPTX、108 份 PDF，共约 5.82 GiB。
- 已形成主方案、5 份专题设计和 7 张 task 卡，全部经 UTF-8 严格解码验证。
- 已建立 DSH 环境清单，状态 `READY_ENV_ONLY`，环境指纹为 `8cd7dc921cc801ce82474195946d3c6a9031f25d28ca9c02377797feae9fe442`。
- 已实现 EP1 提取器草稿和主课件 20 页内容包；字幕帧来源仍未登记到 source receipt。尚未实现 `lesson-cards.js` 或整集知识巩固页。

## 相关现有入口

- `prj/engine/wala.js`：`runActs()`、`studyActsFor()`、`afterSentence()`、`renderPuzzle()`、`showFreezeQuiz()`、`next()`。
- `prj/engine/wala-player-ui.test.mjs`：现有 UI 行为测试入口。
- 基线命令封装：`.agent-control/env/courseware-lesson-001/Invoke-Build.ps1`。

## 精确 diff 摘要

没有已提交基线，因此不能把 `git diff` 当作完整工作区事实。当前本任务新建的支持文件仅位于：

- `docs/plans/2026-08-30-课件课程页.md`
- `docs/plans/2026-08-30-课件课程页/**`
- `docs/handoff/courseware-lesson-001/**`
- `.agent-control/env/courseware-lesson-001/**`
- `.agent-control/tasks/courseware-lesson-001/**`

DSH 必须按白名单写入，不得清理其他未跟踪文件。
