# test-plan.md — 测试计划

## 自动化（每任务必跑）

| 层 | 命令 | 当前基线 | 覆盖 |
|---|---|---|---|
| 全量 | `npm test` | **493 pass / 1 已知失败**（wala 版本钉死，并行会话域） | 引擎+页面合同 |
| 元素克制 | `node --test prj/engine/element-core.test.mjs` | 4 | 环形克制/伤害钳制/回合模拟 |
| 图鉴 | `node --test prj/engine/collection-core.test.mjs` | 6 | 解锁/登记幂等/进化/完成度 |
| 词田 | `node --test prj/engine/farm-core.test.mjs` | 6 | 种/浇/收/枯生命周期 |
| 日程经济 | `node --test prj/engine/schedule-economy.test.mjs` | 8 | 日切/体力/物价/防倒卖 |
| 资产完整性 | `python -X utf8 prj/tools/check_game_assets.py` | 全过 | sprites/dex 引用路径 + 三白名单覆盖 |
| 关卡数据 | `python -X utf8 prj/tools/build_game_levels.py --eps 1-108 --check` | 108 | schema/词数/点位边界 |

规则：只增不减；速度/数值档位变更必须同步对应钉值断言（本包已发生两次：hero 0.6→0.38、monster 0.28→0.16）。

## 浏览器 E2E（本地 18790，prj/ 为根）

| 场景 | 驱动方式 | 证据 |
|---|---|---|
| 击杀→拾取→连击演出 | `BookPlayGameDebug.step` 泵帧 + game-fx 事件断言 | 粒子/浮字计数 |
| Boss 全流程 | 标题语种分流驱动（en→zh orb / zh→term orb / LISTEN→TTS 截获） | 结算卡+图鉴落盘 |
| 跨页恢复 | 击杀→reload→deadMonsters/进度断言 | 中局持久化 |
| 进化仪式 | 预置 dex_v1 满足阈值→点✨→登记 to 形态 | 图鉴新条目 |

注意：本地预览无 `/api/tts` → LISTEN 轮自动降级 en-choice（`canListen` 探测）；泵帧测试设 `ignoreHidden=true`。

## 真机（人工，待执行）

- 触屏双指（移动+投掷）、摇杆死区、TV D-pad 全流程
- WebView 帧率（大世界 16 实体+粒子）、BGM 音量档
- 数据包导入链路（setup.html → 0.3.0 包）
