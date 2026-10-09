# v1 资产重跑说明

本目录只保存本批次生图的源提示词、原图、切图、清理图和校验清单。API key 不得写入此目录。

## 运行前

在当前 PowerShell 会话提供：

```powershell
$env:CLIPROX_API_BASE = 'https://rn6.nonom.top/v1'
$env:CLIPROX_API_KEY = '<由本机安全配置注入，不要粘贴到聊天或文件>'
```

## 推荐命令（canonical workflow）

```powershell
$root = 'G:\Game\BookPlay书戏\prj\assets\generated\jttw-story-stickers-v1'
$runner = Join-Path $env:USERPROFILE '.codex\skills\gpt-image-workflow\scripts\bee_image_workflow.py'
python -X utf8 $runner asset-sheet --prompt-file "$root\source\prompt.txt" --out "$root\2d" --prefix 'jttw-story-stickers-v1' --size 1536x1024 --provider cliprox --allow-any-ratio --remove-green --split --min-size 40 --gap-threshold 12
```

## 严格质量门与发布

```powershell
$chroma = Join-Path $env:USERPROFILE '.codex\skills\transparent-image-generator\scripts\chroma_key.py'
$publish = Join-Path $env:USERPROFILE '.codex\skills\gpt-image-pipeline\scripts\publish_transparent_assets.py'
python -X utf8 $chroma "$root\2d\jttw-story-stickers-v1.png" "$root\strict\sheet.png" --key 0,255,0 --tolerance 180 --feather 8 --report "$root\strict\sheet.report.json"
python -X utf8 $publish --input "$root\strict\semantic-v2" --out "$root\transparent" --mode none --max-edge-alpha 0 --webp-quality 92
```

模型可能将 12 个物件排列为 3×4 或 4×3；以自动切图的空间顺序为准，完成语义重命名后再更新奖励目录。不要把 `2d/`、`strict/` 或 `rejected-*` 中的文件接入运行时。

## 安全与质量门

- 只调用 `/v1/images/generations`，模型固定 `gpt-image-2`，请求 `b64_json`。
- 真实图片格式必须先检测；不能仅凭扩展名声称 PNG。
- 四角 alpha 必须为 0，边缘不可见绿色残留；图片内不得有文字、水印或战斗数值。
- 失败时保留现有 `asset` 与 glyph 回退，不阻塞学习流程。
