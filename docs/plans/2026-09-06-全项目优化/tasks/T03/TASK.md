# T03 媒体协议与服务可靠性

**关联发现：** F04、F08、F12；见[详细报告](../../../../reports/2026-09-06-全项目审查/01-详细分析报告.md)。

**状态：** 查看[state.json](../state.json)与[总看板](../../STATUS.md)。建议责任角色：工程执行与独立验收，具体人选待领取。

**前置：** T01。**估算：** 3–4人日，含测试与证据，不含等待设备/外部素材时间。

## 文件与范围

prj/tools/serve.py；android/app/src/main/java/com/nonomil/storyhall/LocalRangeServer.java；新增 prj/tests/test_http_range_contract.py、test_serve_tts_concurrency.py；新增 android/app/src/test/java/com/nonomil/storyhall/RangeSpecTest.java。

新增文件为计划目标，目前不存在的命令须在对应步骤实现后执行。先对照HEAD/dirty diff确认没有覆盖其他工作。

## 子任务

- [T03-S01 建立跨端 Range 合同并修解析](subtasks/S01.md)
- [T03-S02 修复 TTS 同键并发](subtasks/S02.md)
- [T03-S03 增加原生健康状态与资源上限](subtasks/S03.md)

## 验证命令

仓库根目录执行；以下包含本任务将新增的测试，未新增前不应声称已运行。

```powershell
python -X utf8 -m pytest prj/tests/test_http_range_contract.py prj/tests/test_serve_tts_persistent.py prj/tests/test_serve_tts_concurrency.py -q
```

跨模块改动后执行 npm test 与完整 Python；对仍存在的已知基线失败逐项对照B01–B05，新失败必须修复。发布门禁不允许保留已知失败。

## 验收与证据

三个子任务全部done，相关 [ACCEPTANCE.md](../../ACCEPTANCE.md) 用例通过，才可关闭此任务。证据落在本目录 evidence/，包括实际命令、exit code、输入版本、预期与实际、复核人和日期。未执行真机项不能靠源码测试代签。

## 回滚

按协议、TTS、资源预算分别提交并可独立回退；保留旧音频缓存；不改客户端时间轴。

