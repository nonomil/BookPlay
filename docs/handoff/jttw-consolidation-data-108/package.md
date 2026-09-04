# DSH 交接包：西游记 108 集知识巩固数据

## 唯一目标

Revision 3 的 EP1-108 数据批次已由 Codex 独立验收：68 项测试、540 题、216 半册、5975 卡全部通过。Revision 4 将课件图片与文字资产全量整理到 lesson_guides：主课件导出 WebP、教师课件提取 text/notes、字幕课件仅保留元数据清单，并生成嵌图 lesson.md。

## 真实消费者

`data/*` → `prj/tools/*.py` → `content/lesson_guides/epNNN/lesson.json` → 后续 `prj/engine/lesson-cards.js` → `episode_complete` 知识巩固页。

## 当前最小缺口

`extract_courseware.py` 仍硬编码 EP1，并会把现有 lesson.json 覆盖为空卡池。当前最小缺口是泛化路径/CLI且保护现有卡池；先以 EP2 和不覆盖测试锁定，再运行全量资产导出。

## 首件与期限

- 首件：`content/lesson_guides/ep002/source-receipt.json`
- 同批代码：通用课件来源解析、WebP 导出、教师 text/notes、字幕元数据、嵌图 Markdown 与覆盖测试
- 默认期限：30 分钟内生成首件或返回精确 blocker

## 保留修改

- 保留 `prj/tools/extract_courseware.py` 和 10 项现有提取测试。
- 保留 EP1 的 20 张 WebP、lesson.md/json、source-receipt.json。
- 保留本轮 Codex 更新的计划文档。
- 当前 Git 尚无提交，工作区文件多数未跟踪；不要清理、回滚或提交。

## 禁止事项

- 不修改任何 `data/` 原始 PDF/PPTX/图片/视频。
- 不修改 `prj/engine/wala.js|html|css`，不实现 UI。
- 不覆盖现有 `lesson.json`；不导出字幕 PPT 的约 5000 张帧；不实现知识巩固 UI。
- 不覆盖 `.agent-control/dsh-current.md`。
- 不联网、不安装全局依赖、不写 `release/`、`dist/`、Android 包、不提交 Git。
