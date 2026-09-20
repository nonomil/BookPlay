# 书戏 / 西游记vs我的世界 · X35S 网页移植

当前 Android：**1.0.17**。掌机启动层：**2026-09-19**。仓库：`G:\Game\BookPlay书戏`。

X35S **不能装 APK**。网页经 retsurf（Servo）打开本地 `http://127.0.0.1:18787/index.html`。当前 Ports 入口是 **西游记vs我的世界**（书戏）。不要开 `bookplay`。**方块学园是另一个项目。**

对照已落地的 `G:\Game\2D我的世界\docs\x35s-web-port\`（plainland 0.2.1）写的，合同相同，产物路径不同。

| 你要做的事 | 打开 |
|---|---|
| 发布包是什么、和 APK 什么关系 | [01-发布版本与两条产物.md](./01-发布版本与两条产物.md) |
| 网页怎么改才能在 640×480 / Servo 上可读可点 | [02-网页适配合同.md](./02-网页适配合同.md) |
| 从文件到上卡 | [03-从构建到上卡.md](./03-从构建到上卡.md) |
| 开了浏览器却空白 | [04-空白页与日志.md](./04-空白页与日志.md) |
| 本机可玩的 640×480 对照 | [demo/](./demo/README.md) |

本机看 demo：

```bash
npm run x35s:demo
```

浏览器打开 `http://127.0.0.1:4180/`。窗口会锁在 640×480，对应真机屏幕。

核对仓库是否仍满足合同：

```bash
npm run x35s:check
```

书戏仓库 **没有** `npm run port:build`。拷启动器：

```bash
python -X utf8 scripts/copy-x35s-jttw-launcher.py --install-card
```
