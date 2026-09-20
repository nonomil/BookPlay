# 西游记vs我的世界 · X35S 掌机版（ROCKNIX Port）

启动层版本 2026-09-19。网页游戏是 **书戏 / 豆豆龙英语**（绘本馆、西游记地图、降妖记），由 retsurf（Servo）渲染，**不是 APK**。

## 安装

1. 卡插电脑，把 `西游记vs我的世界.sh` **和** `西游记vs我的世界/` 都拷到 `ports\` 根。
2. ROCKNIX 只扫 `roms/ports/*.sh`。
3. 弹卡、开机，PORTS 里选 **西游记vs我的世界**。不要开 BookPlay，不要开方块学园。
4. 首次启动：httpd 必须带 `-c httpd.conf`，否则白屏带鼠标。

## 按键（gptokeyb → handheld-controls.js，`data-app=bookplay`）

| 手柄 | 学习页 | 降妖记 |
|------|------|------|
| 十字 / 左摇杆 | 选控件 | 走 |
| A | 确定 | 攻击 |
| B | 返回 / 我不会 | 取消 |
| X / Y | 左右翻 | 交互 / 暂停 |
| Start | 键位菜单 | 同 |
| Select + Start | 退出 | 同 |
| 右摇杆 | 不模拟鼠标 | 同 |
| L3 | 开/关浏览器光标（默认关） | 同 |

## 文件

- `西游记vs我的世界.sh` PORTS 根启动器
- `西游记vs我的世界/gamedata/engine/` 书戏网页（home.html / game.html / map.html）
- `retsurf.a55` X35S 主二进制
- `log.txt` 出问题先看；应有 `xyjmc: … ready=1`
