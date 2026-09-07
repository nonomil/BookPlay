# T10 文档收口与发布验收

**关联发现：** F13；见[详细报告](../../../../reports/2026-09-06-全项目审查/01-详细分析报告.md)。

**状态：** 查看[state.json](../state.json)与[总看板](../../STATUS.md)。建议责任角色：发布负责人，具体人选待领取。

**前置：** T08、T09。**估算：** 1–2人日，含测试与证据，不含等待设备/外部素材时间。

## 文件与范围

README.md；docs/README.md；docs/项目架构与优化路线.md；本计划STATUS.md、tasks；新增本轮release receipt与验收报告。

新增文件为计划目标，目前不存在的命令须在对应步骤实现后执行。先对照HEAD/dirty diff确认没有覆盖其他工作。

## 子任务

- [T10-S01 核对历史计划与当前事实](subtasks/S01.md)
- [T10-S02 执行发布总门禁](subtasks/S02.md)
- [T10-S03 验收签收与计划归档](subtasks/S03.md)

## 验证命令

仓库根目录执行；以下包含本任务将新增的测试，未新增前不应声称已运行。

```powershell
python -X utf8 docs/plans/2026-09-06-全项目优化/tools/sync_status.py --check
powershell -File scripts/verify-project.ps1
```

跨模块改动后执行 npm test 与完整 Python；对仍存在的已知基线失败逐项对照B01–B05，新失败必须修复。发布门禁不允许保留已知失败。

## 验收与证据

三个子任务全部done，相关 [ACCEPTANCE.md](../../ACCEPTANCE.md) 用例通过，才可关闭此任务。证据落在本目录 evidence/，包括实际命令、exit code、输入版本、预期与实际、复核人和日期。未执行真机项不能靠源码测试代签。

## 回滚

历史文档保留原日期；回退发布指针到上一个已验收版本，不清学习数据；用户升级兼容问题须走存档备份恢复方案。

