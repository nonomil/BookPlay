---
title: X35S书戏白屏与plainland对照
seq: 010
created_at: 2026-09-16
handoff_from: Grok Build 本会话
handoff_to: Codex / 新会话
status: active
handoff_type: 异常升级交接
---

# 010 X35S 书戏白屏与 plainland 对照

## ⚠️ 异常升级声明

- **触发原因**：掌机 BookPlay 能进 retsurf（有鼠标、白网页），但内容空白；用户要求对照能玩的 `K:\ports\plainland`，并交给其他 AI 继续。
- **当前必须停止的动作**：不要再改 ROCKNIX `disk=` / e2fsck STORAGE / 写 J:；不要再发明第三套启动器；不要恢复街机《西游释厄传》；不要代下 ROM。
- **建议谁来审方向**：Codex 或新主会话。先复测「MIME httpd.conf 拷卡」是否已被真机验证；未验证则先让用户开一次。
- **建议先看**：本 README → `背景上下文/关键发现.md` → `技术分析/根因分析.md` → `行动项/下一步行动.md`

## 现状一句话

降妖记玩法已在 PC 引擎落地。掌机阻塞在 **retsurf+busybox 打开书戏首页**：闪退→404→白屏带鼠标。对照 plainland，最像 **httpd 未带 MIME 配置**。2026-09-16 已按 plainland 把 `httpd.conf` + `-c` + 把 URL 传给 retsurf 拷进 `K:\ports\bookplay`，**真机尚未回报这次拷贝的结果**。

## 完整度模式

完整（异常升级）。长代码只引路径。

## 禁区

- 不改 `disk=`、不 e2fsck STORAGE、不写 J:（见 008）
- 不代下商业 ROM、不恢复释厄传
- 不新开 Phaser/Godot/横版砍人引擎
- 游戏失败不改 lesson `passed`
- 不要再把启动方式改回「不传 URL、不带 httpd.conf」除非真机证明 MIME 方案失败

## 接手确认协议

1. 先复述需求 + 已验证结论 + 方案 + 禁区  
2. 用户说「方向对」再改代码/再拷卡  
3. 交接包 / 凝蜕 / transcript 冲突则停下问用户  

## 当前会话 transcript 路径

- 路径：`C:\Users\No'mi'l\.grok\sessions\G%3A%5CGame%5CBookPlay%E4%B9%A6%E6%88%8F\01a09f80-1c23-7c62-91d6-3cbd8424cc5c\chat_history.jsonl`
- 使用：禁止整读；`rg -n -m 30 白屏|404|plainland|httpd.conf` 后 offset 读

## 凝蜕状态指向

本环境无 `.claude/state/session-progress.md`。以本包 + 卡上现文件为准。

## 优先级链

交接包 → 卡上现文件（`K:\ports\bookplay` 与 `K:\ports\plainland`）→ transcript grep

## 关键产物路径

| 类型 | 路径 |
|---|---|
| 能跑的对照 Port | `K:\ports\plainland.sh` + `K:\ports\plainland\` |
| 书戏 Port | `K:\ports\bookplay\` + `K:\ports\BookPlay.sh` |
| 本机镜像 | `D:\WorkPlace\X35S\htmljs-to-x35s\build\bookplay\` |
| 引擎 | `G:\Game\BookPlay书戏\prj\engine\` |
| 玩法设计 | `docs/plans/2026-09-15-降妖记一年级西游游戏设计\` |
| 开机禁区 | `docs/handoff/008_X35S-AURKNIX开机失败与书戏端口_20260913\` |

## 建议阅读顺序

1. 本 README  
2. `背景上下文/关键发现.md`  
3. `技术分析/根因分析.md`  
4. `行动项/下一步行动.md`  

## 下一跳建议

1. **P0 方向审查**：用户是否已用「带 `httpd.conf -c` 的那一版」开过掌机？若还没开，先开，看还是不是白屏。  
2. 若仍白屏：读 `K:\ports\bookplay\log.txt`、`httpd.log`；用 wget 在设备上打 `http://127.0.0.1:18787/index.html`。  
3. 回退基线：把 bookplay 启动脚本改到与 `plainland.sh` 逐行同构（端口可仍 18787），`gamedata/index.html` 做成无外链的自绘菜单。  
4. 玩法代码（playVerb 等）PC 已过测试，**真机首页未绿之前不要继续堆玩法**。

## 结论标注

- ✅ 白屏时 retsurf 已起来（用户：白色网页 + 鼠标）  
- ✅ plainland 能进、能看见网页、能运动（用户确认）  
- ✅ plainland `httpd.conf` 注释写明：无 MIME 则 Servo 白屏  
- ✅ 2026-09-16 已把 MIME conf + URL 传给 retsurf 拷到 K:（本机 `Copy-Item` 成功）  
- 🔲 该拷贝后的真机结果  
- ❌ 再改 disk=  
