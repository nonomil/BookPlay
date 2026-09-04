# 环境

- Workspace：`G:\Game\BookPlay书戏`
- Python：`C:\Users\No'mi'l\AppData\Local\Programs\Python\Python311\python.exe`
- Node：`C:\Users\No'mi'l\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe`
- Environment profile：`.agent-control/env/bookplay-jttw-content-v1/`
- Manifest：`.agent-control/env/bookplay-jttw-content-v1/environment.json`
- 状态：`READY_ENV_ONLY`
- Environment revision：`4`
- 指纹：`552bed89ad730adef64f1c39f19c9e5e56365e8c9f505f7548e04ee2d42c3257`
- DSH：`opencode-go/deepseek-v4-flash/workspace-write`
- Owner：`session-bd001018-02b9-463b-bb4d-f20b2181dab7`

环境门：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File G:\Game\BookPlay书戏\.agent-control\env\bookplay-jttw-content-v1\Test-Environment.ps1 -ManifestPath G:\Game\BookPlay书戏\.agent-control\env\bookplay-jttw-content-v1\environment.json -Executor DSH
```

基线：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File G:\Game\BookPlay书戏\.agent-control\env\bookplay-jttw-content-v1\Invoke-Build.ps1 -ManifestPath G:\Game\BookPlay书戏\.agent-control\env\bookplay-jttw-content-v1\environment.json
```
