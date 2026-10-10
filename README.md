# BookPlay 书戏 / 豆豆龙英语

本项目是一套离线优先的《西游记》英语学习播放器及内容生产流水线。当前工作区版本为 `0.1.9`，包含 Web 播放器、Python 内容工具和 Capacitor Android 外壳；音视频、图片与生成数据不进入 Git。

## 快速开始

桌面运行：

```bat
启动服务.bat
```

浏览器会打开 `http://127.0.0.1:8810/engine/home.html`。播放器依赖 HTTP Range，不要改用 `python -m http.server`。

降妖记暂停菜单有「洞中认词」（也可直接打开 `/engine/word-quiz.html`）：补字母、看图选词、听音选图。进度在 `bookplay_jttw_word_quiz_v1`，不写西游主进度，也不改扔球战斗。没有本集关卡时用花果山短词；听不到原声就改看大字。不到 70% 不算过。说明见 [洞中认词](docs/降妖记认词.md)。

首页另有「星际探查」：四站舱内任务，用英语把舱务接上才得任务星，星点亮了才能飞下一站。进度在 `bookplay_scout_orbit_progress_v1`。说明见 [星际探查](docs/星际探查.md)。

验证当前源码与数据合同：

```powershell
python -X utf8 -m pytest prj/tests -q
$nodeTests = Get-ChildItem prj/engine -Filter "*.test.mjs" -File | ForEach-Object FullName
node --test $nodeTests
python -X utf8 prj/tools/validate_data.py
python -X utf8 prj/tools/validate_storybooks.py
```

Android debug 构建：

```powershell
npm run android:build
```

APK 首次启动自带一个可玩的首发体验：西游记第 1 集、Minecraft 第 1 本和 Mikey & JJ 第 1 本（含实际引用的图片、原声、词汇与测验音频）。后续目录仍会显示，但点击未内置的下一集/下一本会提示选择对应数据包 ZIP 或已解压文件夹；构建脚本会在 Gradle 前自动生成这棵内置资源树。

如果分发场景只需要西游记首发体验，并要求单个文件小于 100MB，可使用精简档：

```powershell
npm run android:build:jttw
```

该命令输出 `release/storyhall-jttw-mobile-debug.apk` 和 `release/storyhall-jttw-tv-debug.apk`，每个 APK 仅内置西游记第 1 集；下一集继续通过内容门控提示导入阶段数据包。构建会先清理 Gradle 产物，避免切换档案时旧资源残留造成体积虚高。

## 阶段数据包

为了避免每次携带 108 集媒体，阶段包按合辑选择资源。当前已生成：

```text
release/西游记数据包-01-c01.zip
```

数据包 01 的组成固定为：公共索引、公共音频（公共索引全量保留，音频按 c01 实际引用收集）、已发布的 Mikey & JJ 与 Minecraft 绘本，以及西游记 c01（第 1–7 集）的播放/巩固资源。不会携带 `assets/lf_ep*` 旧绘本页或 108 集未使用共享音频。清单和 SHA-256 位于 ZIP 根目录 `pack-manifest.json`，体积明细见 [阶段数据包体积报告](docs/reports/2026-09-01-阶段数据包体积.md)。

当前另有一个 c01+c02（第 1–13 集）修正版发布包：`release/西游记数据包-0.1.8-c01-c02.zip`；该包已补入首页西游记封面和测验双语音频。

重新生成 c01：

```powershell
python -X utf8 prj/tools/pack_datapack.py --collections c01 --published all --version 0.1.8 --out release/西游记数据包-01-c01.zip
```

生成 c01+c02（第 1–13 集）使用同一选择器：

```powershell
python -X utf8 prj/tools/pack_datapack.py --collections c01,c02 --published all --version 0.1.8 --out release/西游记数据包-0.1.8-c01-c02.zip
```

Android 当前只保存一个 ZIP；多个阶段包要先合并解压到同一个 `BookPlay` 文件夹后选择文件夹。不要把 ZIP、音视频、图片或 APK 加入 Git。

`prj/tools/pack_datapack.py` 不带 `--collections` 时仍是旧的全量包模式，供正式全量发布流程使用；根目录 `打包数据包.bat` 已改为快速生成 c01 阶段包。

## 仓库边界

Git 跟踪：源码、脚本、配置、测试、Markdown 文档和必要的文本清单。为保证 Android 构建可复现，保留 `android/gradle/wrapper/gradle-wrapper.jar` 这一项构建引导程序例外。

Git 不跟踪：`data/` 原始素材、`content/` 运行时数据、音视频、图片、字体、Office/PDF 文件、依赖、构建产物、APK、ZIP 和发布包。

运行时素材需要从项目自己的本地资料或数据包恢复，不能从纯代码仓库重建全部 108 集媒体。

## 文档入口

- [文档索引](docs/README.md)
- [当前架构与优化路线](docs/项目架构与优化路线.md)
- [代码仓库基线实施计划](docs/plans/2026-08-30-代码仓库基线与优化.md)
- [`wala.js` 模块化拆分计划](docs/plans/2026-08-31-wala模块化拆分.md)
