# 西游记vs我的世界 · 掌机启动快照（2026-09-19）

本仓库是 **书戏 / BookPlay**。这里只存启动脚本、MIME、retsurf 配置。不含 `retsurf.a55` 和完整 `gamedata`。

完整包在卡：`ports/西游记vs我的世界/`。  
**不是** 方块学园。方块学园是另一个项目。

| 快照文件 | 上卡位置 |
|---|---|
| `西游记vs我的世界.sh`（外层） | `ports/西游记vs我的世界.sh` |
| `inner-西游记vs我的世界.sh` | `ports/西游记vs我的世界/西游记vs我的世界.sh` |
| `httpd.conf` | `ports/西游记vs我的世界/httpd.conf` |
| `config.toml` | `ports/西游记vs我的世界/config.toml` |
| `serve.py` | `ports/西游记vs我的世界/serve.py` |
| `x35s.gptk` | `ports/西游记vs我的世界/x35s.gptk` |
| `index.html` | `ports/西游记vs我的世界/gamedata/index.html` |

```bash
python -X utf8 scripts/copy-x35s-jttw-launcher.py --install-card
```

改这些文件后拷到卡上对应路径。不要改 `disk=`。不要手改卡上 `gamedata/engine/` 当唯一源（源在 `prj/engine/`）。
