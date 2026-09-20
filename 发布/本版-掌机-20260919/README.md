# 本版（2026-09-19）发布文件与改法

日期：2026-09-19。这是 **书戏掌机启动修复版**：Ports 名「西游记vs我的世界」，内容是绘本馆 / 降妖记，不是方块学园。APK 没重打。

## 1. 这版要发出去的文件

### 掌机（已打出 / 已上 L 盘）

拷到卡上 `ports\`（缺一不可）：

| 文件 | 作用 |
|---|---|
| `西游记vs我的世界.sh` | PORTS 列表入口 |
| `西游记vs我的世界/` | 书戏网页 + retsurf + `httpd.conf` + 启动脚本 |

本仓库快照（不含 100MB retsurf、不含完整素材）：[../西游记vs我的世界-x35s/](../西游记vs我的世界-x35s/)。

卡上完整包：`L:\ports\西游记vs我的世界\`（读卡器盘符可能是 K: 或 L:）。

首页：`engine/play-map.html`（降妖记选关，点进 `game.html`）。不要走绘本馆 / wala 学习页。

### 安卓（这版没重打）

| 文件 | 状态 |
|---|---|
| `release/v1.0.17/apk/豆豆龙英语-1.0.17-*.apk` | 上一版已发出，不要当成这次掌机修复包 |

### 不要发给玩家当入口

| 路径 | 原因 |
|---|---|
| `ports/bookplay/` | 同一套书戏网页的英文名；用户指定中文入口「西游记vs我的世界」 |
| `ports/方块学园/` | **另一个项目**（我的方块学园 / blocklegend），不是这本书戏 |

## 2. 相对上一版掌机，这版改了什么（按文件）

只列会进玩家包的改动。

| 玩家能感到的 | 改的源文件 | 怎么进包 |
|---|---|---|
| Ports 中文名「西游记vs我的世界」 | 外层 / 内层 `.sh`、`gamelist.xml` | 拷到 `ports\` |
| 不再白屏（Servo 当二进制） | `httpd.conf` MIME；httpd `-c httpd.conf` | 放在文件夹根（与 `gamedata` 同级） |
| 浏览器打开正确网址 | 内层 sh：wget 探活后 `"$BIN" "$URL"` | 覆盖卡上同名 sh |
| 默认无浏览器光标，L3 才开 | `config.toml` `[input]`、`retsurf-data/bindings.toml` | 拷进端口文件夹 |
| 右摇杆不当鼠标 | `x35s.gptk` `left_analog_as_mouse = false` | 拷进端口根 |
| 按键能走/能选 | 摇杆=十字键（与 plainland 相同），`bindings.toml` 不抢方向键；首页挂 `handheld-controls.js`；默认打开绘本馆 | 启动器 + `prj/engine/handheld-controls.js` |
| 启动失败可查 | 同脚本 `tee log.txt` | 卡上 `西游记vs我的世界/log.txt` |

对照能玩的 `plainland.sh`：同样 `-c httpd.conf`、同样把 URL 传给 retsurf。端口 **18787**（plainland 用 18888）。

游戏网页源码在 `prj/engine/`。APK **没重打**。

## 3. 以后要改，动哪、跑哪

| 你想改 | 改这里 | 然后 |
|---|---|---|
| 降妖记 / 绘本馆玩法 | `prj/engine/` | `npm test`，再拷到卡上 `西游记vs我的世界/gamedata/engine/` |
| 掌机启动 / 白屏 / MIME | `发布/西游记vs我的世界-x35s/` | `python -X utf8 scripts/copy-x35s-jttw-launcher.py --install-card` |
| 键位 | `发布/西游记vs我的世界-x35s/x35s.gptk` + `prj/engine/handheld-controls.js` | 拷卡 |
| 640×480 布局 | `prj/engine/handheld.css` | 拷进 `gamedata/engine/` |
| APK | `scripts/build-apks.mjs` | `npm run android:build` → `release/v*` |
| 上 X35S | — | `西游记vs我的世界.sh` 和文件夹都在 `L:\ports\` |
| 核对合同 | — | `npm run x35s:check` |
| 本机 640×480 对照 | — | `npm run x35s:demo` → http://127.0.0.1:4180/ |

不要手改卡上 `gamedata/` 当唯一源。书戏仓库 **没有** `npm run port:build`（那是 2D 我的世界的命令）。下次拷启动器会覆盖 `.sh` / `httpd.conf` / `config.toml`，**不会**整夹覆盖 `gamedata/`，除非你加 `--install-card` 且未带 `--no-gamedata`。

**不要**把启动器拷到 `ports/方块学园/`。

## 4. 游戏列表封面

| 文件 | 作用 |
|---|---|
| 卡上 `ports/gamelist.xml` 里 `./西游记vs我的世界.sh` | 名称「西游记vs我的世界」 |
| `发布/西游记vs我的世界-x35s/gameinfo.xml` | 仓库侧同文案 |
