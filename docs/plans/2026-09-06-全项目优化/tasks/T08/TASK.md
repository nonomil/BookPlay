# T08 播放器渐进模块化

**关联发现：** F05、F11；见[详细报告](../../../../reports/2026-09-06-全项目审查/01-详细分析报告.md)。

**状态：** 查看[state.json](../state.json)与[总看板](../../STATUS.md)。建议责任角色：工程执行与独立验收，具体人选待领取。

**前置：** T07。**估算：** 3–4人日，含测试与证据，不含等待设备/外部素材时间。

## 文件与范围

prj/engine/wala.js、storybook.js、map.js及对应html；现有walker-cast.js、media.js、study-session.js、storybook-ui.js；按边界新增模块与行为测试；prj/tests/test_wala_modules.py。

新增文件为计划目标，目前不存在的命令须在对应步骤实现后执行。先对照HEAD/dirty diff确认没有覆盖其他工作。

## 子任务

- [T08-S01 锁定高风险行为与边界](subtasks/S01.md)
- [T08-S02 小步提取并恢复体积守卫](subtasks/S02.md)
- [T08-S03 对比回归与收益](subtasks/S03.md)

## 验证命令

仓库根目录执行；以下包含本任务将新增的测试，未新增前不应声称已运行。

```powershell
npm test
python -X utf8 -m pytest prj/tests/test_wala_modules.py -q
npx playwright test prj/e2e/smoke.spec.mjs --project=chromium
```

跨模块改动后执行 npm test 与完整 Python；对仍存在的已知基线失败逐项对照B01–B05，新失败必须修复。发布门禁不允许保留已知失败。

## 验收与证据

三个子任务全部done，相关 [ACCEPTANCE.md](../../ACCEPTANCE.md) 用例通过，才可关闭此任务。证据落在本目录 evidence/，包括实际命令、exit code、输入版本、预期与实际、复核人和日期。未执行真机项不能靠源码测试代签。

## 回滚

每个职责单独提交；出现进度/奖励/音频回归只回滚当前提取；保留行为测试，不做全页一次性替换。

