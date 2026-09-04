# T03 课程数据合同

**目标：** 把已审核 EP1 内容变成播放器可消费的 `lesson.json`。

**文件：**

- 创建：`prj/tools/build_lesson_guide.py`
- 创建：`prj/tools/validate_lesson_guides.py`
- 创建：`prj/tests/test_lesson_guides.py`
- 输出：`content/lesson_guides/ep001/lesson.json`

**步骤：**

1. 为 card id、trigger、choice answer、source、review status 写失败测试。
2. 实现 schema 与验证器。
3. 建立 node 文本匹配，输出候选但不自动接受低置信度锚点。
4. 和官方词汇/题目去重。
5. 生成至少四类 EP1 卡：word、choice、sequence、free_talk。
6. 验证所有 trigger 和答案。

