# 008 X35S AURKNIX 开机失败与书戏 Linux 端口

> 2026-09-13。本包给 Codex 审查：书戏离线 Port 已部署到游戏分区，但改 `disk=` 导致开机 overlay 失败；用户已命令停止对 STORAGE 分区做 e2fsck / 镜像写回。

## ⚠️ 异常升级声明

- **触发原因**：把 ROCKNIX `disk=` 从 ext4 STORAGE 改到 exFAT GAMES 后，开机出现 `Failed to mount tmp-*.mount`，随后 EmulationStation 报配置无效。改回 UUID 后用户仍报“还是不行”。
- **当前必须停止的动作**：不要再改 `J:\extlinux\extlinux.conf` 的 `disk=`；不要对 `/dev/sdf2`（STORAGE）做镜像、e2fsck 写回、格式化。
- **建议谁来审方向**：Codex / 独立审查。先判断“改回 UUID 后仍失败”是日志未回放、还是另有原因。
- **建议先看**：本 README → `背景上下文/关键发现.md` → `技术分析/根因分析.md` → `行动项/下一步行动.md`

## 必含字段（接手确认用）

- **完整度模式**：完整（跨会话 / Codex 审查，关键结论与禁区内嵌）
- **禁区**（不碰的口径 / 路线 / 已否决方案）：
  1. ❌ 再把 `disk=` 改成 K 盘 UUID `7BFA-BC4C`（已实机打出 overlay 失败）
  2. ❌ 把 APK 直接放进 AURKNIX 当可执行程序
  3. ❌ 用户未确认前对 STORAGE 做 `e2fsck -y`、整分区 `dd` 写回、格式化
  4. ❌ 把 ROM 从 K: 根目录“整理进 roms/”当成开机修复（那是另一条问题）
- **接手确认协议**：先总结复述需求+结论+方案+禁区 → 用户确认“方向对，开始” → 才动手
- **当前会话 transcript 路径**：`C:\Users\No'mi'l\.zcode\cli\rollout\model-io-sess_6bd51da4-d67b-42f6-bbf0-7f3114138c2a.jsonl`（约 23 MB，2026-09-13 14:02；禁止整读，按需 grep + offset/limit）
- **凝蜕状态指向**：本仓库 / 用户目录未找到 `.claude/state/session-progress.md` 与 `.claude/memory/recent-decisions.md`（🔲 待补充）。以本交接包 + transcript 为准。
- **优先级链**：交接包 → 凝蜕（缺失） → transcript；冲突则停下问用户
- **下一跳建议**：Codex 先审查“开机失败根因分层”，再决定是否只读 e2fsck、是否需要串口日志；不要先继续拷书戏资源

## 当前目标 + 已完成边界

- **原目标**：判断 BookPlay 书戏能否在 X35S 当前 AURKNIX/ROCKNIX（非 Android）上跑；若网页路线可行，做成可回滚 Port。
- **已完成边界**：
  - 书戏静态资源全量同步到 `K:\ports\bookplay\app\data`（108 集视频/音频/对白/关卡）
  - `K:\ports\BookPlay.sh` + 本地 Range 服务器 `serve.py`
  - PC 上 HTTP 抽检 1/50/108 集 200
  - `disk=` 已从错误的 exFAT UUID **改回** STORAGE `ebd704cf-8f34-408a-82ff-a733c5f9faff`
- **未完成**：
  - 真机 Ports 里启动书戏（开机 UI 都没起来）
  - STORAGE 日志回放（e2fsck）——用户叫停
  - 游戏列表为空的根因（与开机失败不是同一层）

## 建议阅读顺序

1. `背景上下文/关键发现.md`：三张分区、两次失败截图、改 `disk=` 的因果
2. `技术分析/根因分析.md`：overlay 为何必须 ext4、Lakka #1848 对照
3. `技术分析/解决方案.md`：已否决 / 待审 / 可做
4. `行动项/下一步行动.md`：P0 方向审查
5. `测试分析报告.md`：PC 侧验证了什么、真机没验证什么

## 关键产物路径

| 路径 | 用途 |
|---|---|
| `J:\extlinux\extlinux.conf` | 当前启动行（已回退正确 UUID） |
| `J:\extlinux\extlinux.conf.bak` | 改坏前的备份 |
| `K:\ports\BookPlay.sh` | 书戏启动器 |
| `K:\ports\bookplay\` | retsurf.a55 + config.toml + serve.py + app/ |
| `D:\WorkPlace\X35S\output\research\20260913-bookplay\` | 研究摘录、超级块转储、Cygwin e2fsck 工具（未写盘） |

## 多方接手建议

- **Codex 审查**：先读本包，复述根因分层与禁区，不要先修卡
- **人工**：卡可继续插在读卡器上；插回机器前确认 `extlinux.conf` 仍是 STORAGE UUID
- **继续执行代理**：等审查结论；若批准，最小动作是只读 `e2fsck -n` 或设备端 `fsck`，不是再改 UUID
