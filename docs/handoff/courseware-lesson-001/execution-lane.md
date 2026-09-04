# 固定执行车道

## 首切片

```text
TEST_ENV
→ CHECK_CONTRACT
→ BASELINE_BUILD
→ READ_LOCKED_EP1_SOURCES
→ IMPLEMENT_DETERMINISTIC_EXTRACTOR
→ WRITE_SOURCE_RECEIPT
→ EXPORT_ONE_REAL_SLIDE
→ WRITE_EP1_LESSON_MD_JSON_SEED
→ VALIDATE_OUTPUT
→ WRITE_RESULT
```

首命令前最多 6 次 read/glob/grep。允许读取任务卡、recent-context、环境 manifest、主方案入口、三份 EP1 来源和 `ep1.json`。不得重新扫描 443 份课件，不得重新做全仓架构分析。

## 写入白名单

- `scripts/courseware/**`
- `prj/engine/lesson-cards.js`
- `prj/engine/lesson-cards.test.mjs`
- `content/lesson_guides/ep001/**`
- `.agent-control/tasks/courseware-lesson-001/**`
- `.agent-control/env/courseware-lesson-001/*receipt*.json`

首切片不得修改 `wala.js`、`wala.html`、`wala.css`；先证明内容链与数据合同，再续接 T04/T05。

## 停止条件

- 三份 EP1 来源无法唯一打开或内容映射相互矛盾；
- OCR/文本提取没有可用本地入口，且继续需要新增外部 provider；
- 任何命令准备写入 `data/`、`release/`、`dist/` 或 Git 历史；
- 运行时卡仍使用 `after_node_id` 或任何普通句结束后出现知识巩固；
- 基线测试失败；
- 试图进入 108 集批处理；
- 模型或权限与任务卡不一致。

返回精确命令、cwd、退出码、首个失败输入和最小下一步，不做猜测式修复。
