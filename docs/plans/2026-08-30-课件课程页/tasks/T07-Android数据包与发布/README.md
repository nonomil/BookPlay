# T07 Android 数据包与发布

**前置：** Web EP1 与批量数据验证完成。

**目标：** 让 lesson guide 和精选课程资产进入外置数据包，并在 Android 本地服务中可读取。

**文件：**

- 修改：`prj/tools/pack_datapack.py`
- 修改：`android/app/src/main/java/com/nonomil/storyhall/DataPackStore.java`
- 测试：数据包 manifest 与 Android 路由相关测试

**步骤：**

1. 先为 lesson guide include 规则写失败测试。
2. 只包含运行时 JSON 和精选 WebP，不包含 PPTX/PDF/审核 Markdown。
3. manifest 写入 schema、集数和哈希。
4. Android ready 检查 lesson guide 为可选能力，不阻塞旧数据包。
5. 构建 debug APK。
6. 真机选择 ZIP，验证插页、返回视频和横竖屏。

**禁止：** 未经用户授权生成正式发布、签名包或公开分发。

