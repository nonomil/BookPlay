# T06 内容质量与离线音频闭包

**关联发现：** F05；见[详细报告](../../../../reports/2026-09-06-全项目审查/01-详细分析报告.md)。

**状态：** 查看[state.json](../state.json)与[总看板](../../STATUS.md)。建议责任角色：内容工程与教学复核，具体人选待领取。

**前置：** T01。**估算：** 2–4人日，含测试与证据，不含等待设备/外部素材时间。

## 文件与范围

prj/tests/test_minecraft_collections.py、test_storybook_quiz_audio.py、test_storybook_quiz_migration.py；prj/tools/test_pack_companion_datapack.py；prj/tools/validate_storybook_quiz_evidence.py；相关生成器及content运行清单（先备份后生成）。

新增文件为计划目标，目前不存在的命令须在对应步骤实现后执行。先对照HEAD/dirty diff确认没有覆盖其他工作。

## 子任务

- [T06-S01 核实合集题型和角色发布合同](subtasks/S01.md)
- [T06-S02 修复新题离线音频缺口](subtasks/S02.md)
- [T06-S03 发布内容质量门禁](subtasks/S03.md)

## 验证命令

仓库根目录执行；以下包含本任务将新增的测试，未新增前不应声称已运行。

```powershell
python -X utf8 -m pytest prj/tests/test_minecraft_collections.py prj/tests/test_storybook_quiz_audio.py prj/tests/test_storybook_quiz_migration.py prj/tools/test_pack_companion_datapack.py -q
python -X utf8 prj/tools/validate_storybook_quiz_evidence.py --root prj/data/storybooks-mikey-jj prj/data/storybooks-minecraft
```

跨模块改动后执行 npm test 与完整 Python；对仍存在的已知基线失败逐项对照B01–B05，新失败必须修复。发布门禁不允许保留已知失败。

## 验收与证据

三个子任务全部done，相关 [ACCEPTANCE.md](../../ACCEPTANCE.md) 用例通过，才可关闭此任务。证据落在本目录 evidence/，包括实际命令、exit code、输入版本、预期与实际、复核人和日期。未执行真机项不能靠源码测试代签。

## 回滚

生成到staging内容目录；校验后替换引用；保留上一版manifest和媒体；未验收新增题可退回draft。

