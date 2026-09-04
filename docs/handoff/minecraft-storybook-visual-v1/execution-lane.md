# 固定执行车道

```text
TEST_ENV
  -> CHECK_CONTRACT
  -> BASELINE_TEST
  -> READ_EXACT_TARGETS
  -> MODIFY_ALLOWLIST
  -> TARGETED_TEST
  -> FULL_TEST
  -> CONSUMER_SMOKE
  -> WRITE_RESULT
```

## 读取预算

首个修改命令前最多 6 次 read/glob/grep，只允许读取任务卡列出的目标。禁止全仓扫描、重新配对 PDF/MP3、重新查找 SDK/Python/Node 或读取整个 Codex 会话。

## 精确步骤

1. 运行任务卡 `first_command`。
2. 运行：

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File C:\Users\No'mi'l\.codex\skills\dsh-execute\scripts\Test-DshContractRevision.ps1 -TaskCardPath G:\Game\BookPlay书戏\.agent-control\tasks\minecraft-storybook-visual-v1\task.md -ExpectedContractRevision 1 -EnvironmentManifestPath G:\Game\BookPlay书戏\.agent-control\env\bookplay-minecraft-ui\environment.json -ExpectedEnvironmentRevision 1
   ```

3. 修改前基线：

   ```powershell
   python -m pytest prj/tests/test_minecraft_storybook_pipeline.py -q
   node --test prj/engine/storybook-route.test.mjs
   ```

4. 读取 `visual-reference.html/png` 与三个精确目标文件，立即实施。
5. 只改 `storybook.css`、`storybook.js`、`storybook-route.test.mjs`。
6. 运行任务卡全部验证命令。
7. 对 Minecraft 第 2 本做桌面与 375px/320px 消费者检查；确认无横向溢出、无嵌套字幕滚动条、重点词卡和测验状态可见。
8. 写 `result.json`，不作 release/accepted 声明。
