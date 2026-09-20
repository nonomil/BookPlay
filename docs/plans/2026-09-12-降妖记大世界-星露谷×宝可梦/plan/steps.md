# steps.md — 阶段步骤与当前状态

> 只写已确认步骤。每步的完整验收见对应任务卡；执行事实见 progress/。

## 已完成

### T01 快速原型与元素克制 ✅
- element-core（克制环 1.3/0.75/damage 钳制/simulateTurns）4 用例
- 全屏选关 + UI 放大 + 详情弹层（与并行会话迭代合流）
- 提速定档三轮：0.15 → 0.6（用户"太慢"）→ 0.38（用户"太快"）

### T02 战斗反馈与语音全量 ✅
- game-feedback.js：game-fx 事件消费器（浮字/星星/红晕，reduced-motion 降级）
- 108/108 集静态语音索引（3672 条，src 零缺失）
- BGM data-audio-scene 接线 + HUD 💡提示/⏸暂停 文字按钮
- 提交：8dd6ee1 / f3fba8e / 907fabf

### T03 捕捉与图鉴 ✅
- Boss 结算登记 bookplay_dex_v1（首捕徽标/图鉴链接）；击怪 markSeen
- dex.html 三态卡/详情卡框（铜银金玉按 tier/星级）/进化链（中文名）
- 无 TTS 听音轮降级（canListen 旗标 + 4 断言）
- 提交：0ccc209 / 8dd6ee1

### T04 词田与商店 ✅
- farm-core（种/浇/收/枯）6 用例；schedule-core（日切/体力/streak）4 用例；economy-core（物价/账本/防倒卖）5 用例
- 词田商店浮层（farm-ui 自注入 HUD）；体力答对才扣（用户友好修订）
- 真图地块 9 状态接入 + 双白名单 + check_game_assets 全过
- 提交：3156729 / 0d3f670 / f3fba8e

### T05 全量扩集 ✅
- walker-cast 解析 23 角色 → ep15-108 全部派生切磋关；词绑定取各集 official_words
- 108 集关卡入 COMMON_FILES；walker-gifs 补 10 条
- 提交：3156729 / a540b00

## 进行中

### T06 语音索引 APK 同步与真机验收 🔲
- 数据包 0.3.0（含 108 语音索引）已重打：10823 文件/908.7MB，zip 校验过
- APK v1.0.16 构建于语音索引补全**之前**——下次 `npm run android:build:jttw` 会带上
- 步骤：真机装 APK → 导入 0.3.0 数据包 → 按 acceptance.md 逐项

## 待启动（BLOCKED 或排期）

### T05 引擎数值合并 🔲
- combat-core（克制/捕捉/经验）× 并行会话 battle-core kit 体系（技能/打字轮/护体）
- 前置：并行会话 battle-core 稳定（git log 间隔 >3 天无改动）
- 联合设计点：谁拥有 Boss 回合状态；克制倍率进 skill.power 还是结算层
