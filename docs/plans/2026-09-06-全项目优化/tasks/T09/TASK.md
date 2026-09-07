# T09 性能与可访问性定向优化

**关联发现：** F08、F14；见[详细报告](../../../../reports/2026-09-06-全项目审查/01-详细分析报告.md)。

**状态：** 查看[state.json](../state.json)与[总看板](../../STATUS.md)。建议责任角色：工程执行与独立验收，具体人选待领取。

**前置：** T07。**估算：** 2–4人日，含测试与证据，不含等待设备/外部素材时间。

## 文件与范围

prj/engine/map.js、map.css、storybook.css、storybook-v3.css、content-gate.js、tv-remote.js、app-audio.js；android/MainActivity相关路径；新增性能采样记录与prj/e2e/accessibility.spec.mjs。

新增文件为计划目标，目前不存在的命令须在对应步骤实现后执行。先对照HEAD/dirty diff确认没有覆盖其他工作。

## 子任务

- [T09-S01 建立同机性能基线](subtasks/S01.md)
- [T09-S02 只修证据指向的热点](subtasks/S02.md)
- [T09-S03 修焦点和字幕等可见体验](subtasks/S03.md)

## 验证命令

仓库根目录执行；以下包含本任务将新增的测试，未新增前不应声称已运行。

```powershell
npx playwright test prj/e2e/accessibility.spec.mjs --project=chromium
npx playwright test prj/e2e/smoke.spec.mjs --project=chromium
```

跨模块改动后执行 npm test 与完整 Python；对仍存在的已知基线失败逐项对照B01–B05，新失败必须修复。发布门禁不允许保留已知失败。

## 验收与证据

三个子任务全部done，相关 [ACCEPTANCE.md](../../ACCEPTANCE.md) 用例通过，才可关闭此任务。证据落在本目录 evidence/，包括实际命令、exit code、输入版本、预期与实际、复核人和日期。未执行真机项不能靠源码测试代签。

## 回滚

资源优化保留源文件与旧manifest；CSS/焦点/图片分批提交；指标退化超预算回滚对应项。

