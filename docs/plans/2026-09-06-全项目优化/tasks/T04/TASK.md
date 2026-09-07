# T04 录音与本地状态一致性

**关联发现：** F03、F10；见[详细报告](../../../../reports/2026-09-06-全项目审查/01-详细分析报告.md)。

**状态：** 查看[state.json](../state.json)与[总看板](../../STATUS.md)。建议责任角色：工程执行与独立验收，具体人选待领取。

**前置：** T01。**估算：** 2–4人日，含测试与证据，不含等待设备/外部素材时间。

## 文件与范围

prj/engine/dub-store.js、dub-store.test.mjs、dub.js、dub-recorder.js、dub-recorder.test.mjs、storage.js；新增 storage.test.mjs 和 dub-delete.test.mjs；按需要修改 map.js 调用边界。

新增文件为计划目标，目前不存在的命令须在对应步骤实现后执行。先对照HEAD/dirty diff确认没有覆盖其他工作。

## 子任务

- [T04-S01 统一录音删除合同](subtasks/S01.md)
- [T04-S02 保护录音异步生命周期](subtasks/S02.md)
- [T04-S03 为存储读写加结构校验和迁移收据](subtasks/S03.md)

## 验证命令

仓库根目录执行；以下包含本任务将新增的测试，未新增前不应声称已运行。

```powershell
node --test prj/engine/dub-store.test.mjs prj/engine/dub-recorder.test.mjs prj/engine/storage.test.mjs prj/engine/dub-delete.test.mjs
```

跨模块改动后执行 npm test 与完整 Python；对仍存在的已知基线失败逐项对照B01–B05，新失败必须修复。发布门禁不允许保留已知失败。

## 验收与证据

三个子任务全部done，相关 [ACCEPTANCE.md](../../ACCEPTANCE.md) 用例通过，才可关闭此任务。证据落在本目录 evidence/，包括实际命令、exit code、输入版本、预期与实际、复核人和日期。未执行真机项不能靠源码测试代签。

## 回滚

迁移前导出旧键原始值；保持旧键可读；不清用户进度或录音；仅回退代码提交。

