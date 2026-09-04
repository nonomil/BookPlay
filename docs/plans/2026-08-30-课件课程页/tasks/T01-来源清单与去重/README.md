# T01 来源清单与去重

**目标：** 生成稳定 source manifest，锁定 108 集主课件、截图、PDF、教师课件之间的关系。

**文件：**

- 创建：`prj/tools/courseware_sources.py`
- 创建：`prj/tests/test_courseware_sources.py`
- 输出：`content/lesson_guides/source-manifest.json`

**步骤：**

1. 先写测试，覆盖 1..108 配对、105 个重复组和 42/61/97 版本分歧。
2. 运行失败测试。
3. 实现只读扫描与 SHA-256 清单。
4. 验证脚本不写 `data/`。
5. 运行测试并输出 manifest。

**停止条件：** 任何 episode 映射不唯一时停止并列出候选，不猜文件。

