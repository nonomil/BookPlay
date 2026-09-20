# Demo：640×480 网页适配对照

对应真机屏幕。**不是完整游戏**，只演示本仓库已经写进合同的几条。

```bash
npm run x35s:demo
```

打开 http://127.0.0.1:4180/

| 案例 | 验证什么 | 对应仓库 |
|---|---|---|
| 视口 | 锁 640×480、顶栏按钮 ≥44px、无毛玻璃 | `prj/engine/handheld.css` |
| 学习卡 | 十字键选、A 确定、B 我不会 | `prj/engine/handheld-controls.js` |
| 模块 | ESM 无 `?v=` 查询串也能 import | `发布/西游记vs我的世界-x35s/httpd.conf` |

键盘（模拟 gptokeyb）：

- 左右：选选项
- Enter / F1：确定（A）
- F2：我不会（B）
- F10：假装打开键位菜单
- C：开关光标（对应真机 L3）

真机 Ports 入口是 **西游记vs我的世界**（书戏），不要开 bookplay。方块学园是另一个项目。
