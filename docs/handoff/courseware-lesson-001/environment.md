# 环境收据

- Workspace：`G:\Game\BookPlay书戏`
- Executor 可见根：`G:\Game\BookPlay书戏`
- Profile：`courseware-lesson-001`
- Manifest：`G:\Game\BookPlay书戏\.agent-control\env\courseware-lesson-001\environment.json`
- Codex receipt：`G:\Game\BookPlay书戏\.agent-control\env\courseware-lesson-001\receipt-codex.json`
- Preparation receipt：`G:\Game\BookPlay书戏\.agent-control\env\courseware-lesson-001\environment-preparation-receipt.json`
- 状态：`READY_ENV_ONLY`
- 指纹算法：`DSH-ENV-SHA256-V1`
- 指纹：`8cd7dc921cc801ce82474195946d3c6a9031f25d28ca9c02377797feae9fe442`

派发后的固定前两条命令：

```powershell
& 'G:\Game\BookPlay书戏\.agent-control\env\courseware-lesson-001\Test-Environment.ps1' -ManifestPath 'G:\Game\BookPlay书戏\.agent-control\env\courseware-lesson-001\environment.json' -Executor DSH -ReceiptPath 'G:\Game\BookPlay书戏\.agent-control\env\courseware-lesson-001\receipt-dsh.json'
& 'G:\Game\BookPlay书戏\.agent-control\env\courseware-lesson-001\Invoke-Build.ps1' -ManifestPath 'G:\Game\BookPlay书戏\.agent-control\env\courseware-lesson-001\environment.json' -ReceiptPath 'G:\Game\BookPlay书戏\.agent-control\env\courseware-lesson-001\baseline-build-receipt.json'
```

不得搜索替代 Node、SDK、盘符或旧构建目录。若指纹失效，返回 `BLOCKED_ENV_STALE`。

