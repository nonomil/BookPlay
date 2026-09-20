# 发布文件夹

这里放 **已经打出来、可以拷走的包** 的门口说明，以及本版「发哪些 / 改了什么 / 以后怎么改」。

对照写法来自能落地的 `G:\Game\2D我的世界\发布\`（0.2.1），不是空模板。

本仓库是 **书戏 / BookPlay / 降妖记**。掌机 Ports 名单：**西游记vs我的世界**。  
**方块学园是另一个项目**（`G:\StudyCode\blocklegend`），不要写进本书戏的发布包。

当前 Android：**1.0.17**（`android/version.properties`，versionCode 22）。  
当前掌机启动层：**2026-09-19**（MIME + URL 对齐 plainland）。

| 给谁 | 拷什么 | 现在有没有 |
|---|---|---|
| X35S / ROCKNIX | [西游记vs我的世界-x35s/](./西游记vs我的世界-x35s/) 里的 `.sh` + `httpd.conf`；完整游戏在卡 `L:\ports\西游记vs我的世界\` | **启动器 2026-09-19 已按 plainland 对齐并拷上 L 盘** |
| 安卓手机 / 电视 | `release/v1.0.17/apk/` 三份 APK | **有**（1.0.17 / versionCode 22） |
| 看改了什么 | [版本说明.md](./版本说明.md) | 有 |
| 本版文件清单与改法 | [本版-掌机-20260919/](./本版-掌机-20260919/) | 有 |

详细网页适配（640×480、Servo、空白页）：[docs/x35s-web-port/](../docs/x35s-web-port/README.md)。

APK 大包仍在仓库英文目录 `release/`（历史路径，不要搬）。掌机 retsurf 二进制约 100MB，不进 git 快照。

## 不要混用

- **X35S 不能装 APK。** ROCKNIX 不是 Android。
- **不要开 `bookplay`。** 那是同一套网页的英文 Ports 名；玩家入口用 **西游记vs我的世界**。
- **不要开「方块学园」。** 那是 blocklegend，不是这本书戏。
- 不能只拷文件夹：EmulationStation 扫 `ports/*.sh`。
- APK ≠ 掌机包。改 `prj/engine` 之后要再拷进 `西游记vs我的世界/gamedata/engine/`。
