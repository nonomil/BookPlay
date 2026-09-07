# T02 内容可达性与安全导入

**关联发现：** F01、F02、F07；见[详细报告](../../../../reports/2026-09-06-全项目审查/01-详细分析报告.md)。

**状态：** 查看[state.json](../state.json)与[总看板](../../STATUS.md)。建议责任角色：工程执行与独立验收，具体人选待领取。

**前置：** T01。**估算：** 3–5人日，含测试与证据，不含等待设备/外部素材时间。

## 文件与范围

prj/tools/pack_android.py；prj/tools/pack_datapack.py；prj/engine/content-gate.js；android/app/src/main/java/com/nonomil/storyhall/DataPackStore.java、DataPackPlugin.java、ZipPack.java；新增 content-gate.test.mjs 和 DataPackStoreTest.java。

新增文件为计划目标，目前不存在的命令须在对应步骤实现后执行。先对照HEAD/dirty diff确认没有覆盖其他工作。

## 子任务

- [T02-S01 修正两档首发可用清单](subtasks/S01.md)
- [T02-S02 实现验证后切换与门禁刷新](subtasks/S02.md)
- [T02-S03 收紧数据源边界并做真源验证](subtasks/S03.md)

## 验证命令

仓库根目录执行；以下包含本任务将新增的测试，未新增前不应声称已运行。

```powershell
python -X utf8 -m pytest prj/tests/test_stage_pack.py prj/tests/test_stage_pack_runtime.py -q
node --test prj/engine/content-gate.test.mjs
```

跨模块改动后执行 npm test 与完整 Python；对仍存在的已知基线失败逐项对照B01–B05，新失败必须修复。发布门禁不允许保留已知失败。

## 验收与证据

三个子任务全部done，相关 [ACCEPTANCE.md](../../ACCEPTANCE.md) 用例通过，才可关闭此任务。证据落在本目录 evidence/，包括实际命令、exit code、输入版本、预期与实际、复核人和日期。未执行真机项不能靠源码测试代签。

## 回滚

保留上一有效 URI 和验证收据；按独立提交回退新导入逻辑；不删除原始 ZIP/目录。

