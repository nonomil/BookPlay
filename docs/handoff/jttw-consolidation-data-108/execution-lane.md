# 固定执行车道（revision 4）

1. `TEST_ENV`：运行环境门，失败即返回精确 blocker。
2. `CHECK_CONTRACT`：运行任务合同 revision 检查。
3. `BASELINE_BUILD`：运行 revision 3 的 68 项数据测试；失败不得修改代码掩盖。
4. `READ_EXACT_SET`：只读任务卡、recent-context、计划、extract_courseware、source resolver、EP1/EP2 主课件与现有 lesson.json；首命令前最多 6 次 read/glob/grep。
5. `TDD_RED`：新增 EP2、批量 CLI、teacher 可选、截图元数据、WebP 和 lesson.json 不变测试，保存预期红灯。
6. `IMPLEMENT`：只改写提取器与测试；复用来源解析和三集哈希锁，不覆盖 lesson.json，不导出字幕帧。
7. `TDD_GREEN`：运行全部 68 项旧测试和新增课件测试。
8. `GENERATE_COURSEWARE_1_108`：先生成 EP2 receipt/md/assets，再生成 EP001-108 和 courseware coverage。
9. `VERIFY`：108 份 receipt/md、资产数与主课件页一致、WebP可解码、teacher/screenshots状态完整、lesson.json原SHA256全不变；差异即停止。
10. `WRITE_RESULT`：写任务 `result.json`，包含命令、退出码、文件、数量、blocker 和 claim ceiling 后停止。

禁止重新发现 SDK/Python、禁止改选 G092 的 42/61/97 版本、禁止导出字幕PPT帧、禁止覆盖lesson.json、禁止 UI/Git/release 修改。
