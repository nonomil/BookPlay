# T07 Web与Android端到端验收

**关联发现：** F09、F14；见[详细报告](../../../../reports/2026-09-06-全项目审查/01-详细分析报告.md)。

**状态：** 查看[state.json](../state.json)与[总看板](../../STATUS.md)。建议责任角色：工程执行与独立验收，具体人选待领取。

**前置：** T02、T03、T04、T05、T06。**估算：** 3–4人日，含测试与证据，不含等待设备/外部素材时间。

## 文件与范围

新增 playwright.config.mjs、prj/e2e/smoke.spec.mjs、prj/e2e/offline.spec.mjs、prj/e2e/storage.spec.mjs；package.json；android/app/src/test、androidTest；prj/tests/fixtures。

新增文件为计划目标，目前不存在的命令须在对应步骤实现后执行。先对照HEAD/dirty diff确认没有覆盖其他工作。

## 子任务

- [T07-S01 搭建隔离浏览器测试入口](subtasks/S01.md)
- [T07-S02 实现学习与离线关键路径](subtasks/S02.md)
- [T07-S03 替换模板测试并完成设备矩阵](subtasks/S03.md)

## 验证命令

仓库根目录执行；以下包含本任务将新增的测试，未新增前不应声称已运行。

```powershell
npx playwright test --project=chromium
.\android\gradlew.bat -p android testMobileDebugUnitTest testTvDebugUnitTest
```

跨模块改动后执行 npm test 与完整 Python；对仍存在的已知基线失败逐项对照B01–B05，新失败必须修复。发布门禁不允许保留已知失败。

## 验收与证据

三个子任务全部done，相关 [ACCEPTANCE.md](../../ACCEPTANCE.md) 用例通过，才可关闭此任务。证据落在本目录 evidence/，包括实际命令、exit code、输入版本、预期与实际、复核人和日期。未执行真机项不能靠源码测试代签。

## 回滚

测试增量可独立回退；不得为测试修改真实用户存档；fixture与测试进程必须可清理自身资源。

