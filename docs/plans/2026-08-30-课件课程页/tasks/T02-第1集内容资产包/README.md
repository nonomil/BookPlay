# T02 第 1 集内容资产包

**目标：** 生成第 1 集可人工审核的图片、文字和嵌图 Markdown。

**文件：**

- 创建：`prj/tools/extract_courseware.py`
- 创建：`prj/tests/test_courseware_extract.py`
- 输出：`content/lesson_guides/ep001/lesson.md`
- 输出：`content/lesson_guides/ep001/assets/`
- 输出：`content/lesson_guides/ep001/source-receipt.json`

**步骤：**

1. 写失败测试：20 页主 PPT 必须输出 20 个顺序稳定的页面记录。
2. 提取 slide relationship 对应的原始图片。
3. 转 WebP 并记录像素、哈希和来源 slide。
4. 提取教师课件文本与 notes。
5. 接入本地 OCR provider；不可用时保留 blocker 字段。
6. 生成按页嵌图 Markdown。
7. 人工抽查第 4、14、16、17、18、19 页。

**首件：** `lesson.md` 能直接浏览全部页面并看到来源/分类/OCR 状态。

