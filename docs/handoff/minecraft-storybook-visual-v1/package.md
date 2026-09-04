# Minecraft 绘本视觉落地交接包

## 唯一目标

把 Codex 已锁定的 Minecraft 绘本视觉原型落入真实 `storybook` 消费路径：桌面完整跨页画面在左，右侧依次为英文字幕、重点词卡和页导航；移动端上下排列；章末小测有清晰题卡与可访问反馈。

## 真实消费者

```text
http://127.0.0.1:8811/engine/storybook.html?series=minecraft&book=2
  -> prj/engine/storybook.html
  -> prj/engine/storybook.css
  -> prj/engine/storybook.js
  -> content/storybooks-minecraft/book2.json
```

## 首件

`prj/engine/storybook.css` 出现与 `visual-reference.html/png` 对齐的真实 diff，并由现有 Minecraft 页面加载。首件不是文档、清单或任务卡。

## 视觉参考

- 可交互原型：`docs/handoff/minecraft-storybook-visual-v1/visual-reference.html`
- 已渲染桌面图：`docs/handoff/minecraft-storybook-visual-v1/visual-reference.png`
- 原型展示三种状态：阅读页、重点单词、章末小测。

视觉优先级：阅读画面 > 英文字幕 > 本页重点词 > 页导航；金黄只做重点和主操作，避免把 Minecraft 界面做成花哨 HUD。

## 已知状态

- 5 本、每本 15 个有效跨页，图片已去重。
- 当前页面已经能加载、翻页、播放原音、保存进度、点词收入生词本、做题。
- 当前缺口是视觉层级与学习组件表现，不是路由、素材或音频。
- 当前基线：`python -m pytest prj/tests/test_minecraft_storybook_pipeline.py -q` 为 10 passed；`node --test prj/engine/storybook-route.test.mjs` 为 7 passed。

## 直接解锁的下一条真实命令

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File G:\Game\BookPlay书戏\.agent-control\env\bookplay-minecraft-ui\Test-Environment.ps1 -ManifestPath G:\Game\BookPlay书戏\.agent-control\env\bookplay-minecraft-ui\environment.json -Executor DSH -ReceiptPath G:\Game\BookPlay书戏\.agent-control\env\bookplay-minecraft-ui\receipt-dsh.json
```

随后校验任务合同，再运行锁定基线测试，之后立即读取精确目标 diff 并进入允许文件修改。
