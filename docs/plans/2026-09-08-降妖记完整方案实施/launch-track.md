# Launch track（降妖记）

渠道按 BookPlay：阶段包 + 三端 APK，不是小红书小工具。

## P0-1 现场记录（2026-09-08）

| 项 | 结果 |
|---|---|
| `git status` | 工作区脏：已跟踪修改约 50 个路径 + 未跟踪引擎拆分/交接包/本方案文档。**不还原无关 diff。** |
| `android/version.properties` | versionName **1.0.14**（1.0.14），versionCode **19** |
| mobile APK | `release/storyhall-jttw-mobile-debug.apk`，102,023,603 bytes，SHA-256 `6F001B80E1B6D98DEE1ECB46FE60F4F04838B789C90F292C66B8AC210D1486F7`（与 006 artifact-hashes 一致） |
| 同批 APK | `storyhall-jttw-tv-debug.apk`、`storyhall-jttw-handheld-debug.apk`（2026-09-08 17:28–17:29） |
| `adb` | 可执行文件在 `%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe`；`adb devices -l` **无设备** |
| 安装 / 真机整局 / 双指 / 断网语音 | **待验** |

## 包

| 项 | 当前值 | 核对 |
|---|---|---|
| mobile APK | `release/storyhall-jttw-mobile-debug.apk` | hash 已对 006 |
| 口径版本 | 1.0.14 / versionCode 19 | 源码与 APK 一致；设备未装 |
| 阶段包 | `docs/reports/降妖记优化验收/artifact-hashes.json` | `504A9669…` / 5,702 entries |
| 测试 | 408 pass（006） | 每次改代码后重跑 |

## 设备

| 日期 | serial | 端 | 安装 | 整局 | 双指 | 语音断网 | 备注 |
|---|---|---|---|---|---|---|---|
| 2026-09-08 | （无） | mobile | 待验 | 待验 | 待验 | 待验 | PATH 无 adb；SDK 有 adb，设备列表空 |

## P0-2 浏览器走查（2026-09-09，ep1 部分）

- 视口 1280×720，本地 `8799`，清空两游戏存档键。
- **通过**：开场 intro 自动对话；方向键走过中文球捡起；键盘跟打 `journey` 自动砸对应小怪，进度 0/12→1/12。
- **部分失败**：点击词球 `walkTo` 未在 40s 内捡起。
- **未执行**：故意扔错、撞击、清波、NPC、Boss、返回、ep5、真机。
- 记录：`docs/reports/降妖记优化验收/p0-2-ep1-走查.md`

## 检查单

- [ ] 断网可进已打包集
- [ ] 横屏 1280×720 样板 + 真机各一
- [ ] 引擎文件在 `assets/public/engine`
- [x] 未把浏览器结果写成真机通过
- [x] P0-1 无设备已写待验
- [x] ep1 跟打投掷已有浏览器证据（非整局）
