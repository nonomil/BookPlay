# plan/README.md — 计划索引

> 多阶段路线。任务卡是唯一执行事实源；进度只写真实事件。

## 阶段与任务

| 任务卡 | 内容 | 状态 | Owner |
|---|---|---|---|
| [T01](tasks/T01-原型与元素克制.md) | 快速原型：element-core 克制环 + 全屏/放大 UI + 提速定档 | ✅ 完成 | ZCode 主会话 |
| [T02](tasks/T02-战斗反馈与语音全量.md) | game-feedback 演出层 + 108 集静态语音 + BGM 接线 + HUD 按钮 | ✅ 完成 | ZCode 主会话 |
| [T03](tasks/T03-捕捉与图鉴.md) | 捕捉入图鉴 + dex.html 三态卡 + 卡框/进化链 + 无 TTS 降级 | ✅ 完成（捕捉答题交互待接 combat-core） | ZCode 主会话 |
| [T04](tasks/T04-词田与商店.md) | farm-core/schedule-core/economy-core + 词田商店浮层 + 真图地块 | ✅ 完成 | ZCode 主会话 |
| [T05](tasks/T05-引擎数值合并.md) | combat-core 数值层 × 并行会话 battle kit 体系合并 | 🔲 BLOCKED（等并行会话 battle-core kit 稳定） | 联合设计 |
| [T06](tasks/T06-真机验收.md) | 数据包导入 + 108 集逐辑真机验收（V 清单见 acceptance） | 🔲 待真机 | 人工 + 主会话 |

## 验收与测试入口

- 测试计划：[test-plan.md](test-plan.md)
- 验收矩阵：[../08-验收矩阵与后续集清单.md](../08-验收矩阵与后续集清单.md)（005 包遗产，T06 扩用）
- 当前基线：`npm test` **493 pass / 1 已知失败**（wala 版本钉死，并行会话域）
