# -*- coding: utf-8 -*-
"""Assemble release/vX.Y.Z with APK, version notes, and optional datapack zip."""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from datetime import date
from pathlib import Path

from pack_datapack import write_datapack_zip
from paths import CONTENT, REPO

APK_SRC = REPO / "android" / "app" / "build" / "outputs" / "apk" / "debug" / "app-debug.apk"


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def notes_text(version: str, apk: Path, pack: Path | None) -> str:
    apk_mb = apk.stat().st_size / 1024 / 1024
    pack_line = "尚未放入（打包中或未生成）"
    if pack and pack.exists():
        pack_line = f"{pack.name}（{pack.stat().st_size / 1024 / 1024 / 1024:.2f} GB）"
    return f"""# 豆豆龙英语 {version}

发布日期：{date.today().isoformat()}  
性质：个人学习用本地发布（debug 安装包，未上架）

## 本目录文件

| 文件 | 说明 |
| --- | --- |
| 豆豆龙英语-{version}.apk | 播放器安装包，约 {apk_mb:.1f} MB，不含视频和音频 |
| 豆豆龙数据包-{version}.zip | {pack_line} |
| 版本说明.md | 本文件 |

APK SHA-256：`{sha256(apk)}`

## 安装

1. 把 APK 拷到手机，允许「安装未知应用」，点安装。
2. 把数据包 zip 拷到手机下载目录或任意文件夹（约 5 GB，请用数据线；不要只拷 APK）。
3. 打开「豆豆龙英语」→ **选择数据包文件** → 选 `豆豆龙数据包-{version}.zip`。
4. 也可以先解压 zip，再点 **选择文件夹**，选解压出的目录（里面要有 `dialogue_stories` 和 `assets`）。

手机请预留约 6 GB 空间（zip 本身 + 系统缓存）。应用不会把视频打进安装包。

## 桌面

双击仓库根目录 `启动服务.bat`，浏览器打开：

`http://127.0.0.1:8810/engine/home.html`

不要用 `python -m http.server`，视频拖进度需要 HTTP Range。

## 这个版本有什么

- 精学 / 剧情双模式；精学含词卡、复习、剧情测验
- 对白只播原片；语速 0.75 / 1 / 1.25
- 英文例句与测验英文已预合成（Jenny）；中文例句与测验中文已预合成（晓晓）
- 缺的音频桌面端可由 8810 用 Edge-TTS 现合成并缓存；手机端只读数据包里的现成 mp3
- 小安装包 + 外置数据包（文件夹或 zip）

## 已知限制

- 未收录绘本大图 `lf_ep*`（约 1 GB）和仓库 `data/` 里的 PDF
- 本包素材来自 Little Fox《西游记》个人学习用途，不要公开发布或转售
- debug 签名，仅供自己安装

## 重新打包

```
npm run android:build
python -X utf8 -u prj/tools/make_release.py --version {version} --pack
```
"""


def make_release(version: str, do_pack: bool) -> Path:
    dest = REPO / "release" / f"v{version}"
    dest.mkdir(parents=True, exist_ok=True)
    if not APK_SRC.exists():
        raise FileNotFoundError(f"missing APK: {APK_SRC}")
    apk = dest / f"豆豆龙英语-{version}.apk"
    shutil.copy2(APK_SRC, apk)
    pack = dest / f"豆豆龙数据包-{version}.zip"
    notes = dest / "版本说明.md"
    notes.write_text(notes_text(version, apk, pack if pack.exists() else None), encoding="utf-8-sig")
    print(f"apk -> {apk} ({apk.stat().st_size} bytes)", flush=True)
    print(f"notes -> {notes}", flush=True)
    if do_pack:
        write_datapack_zip(CONTENT, pack)
        notes.write_text(notes_text(version, apk, pack), encoding="utf-8-sig")
        print(f"pack -> {pack}", flush=True)
    return dest


def main() -> None:
    pkg = json.loads((REPO / "package.json").read_text(encoding="utf-8"))
    ap = argparse.ArgumentParser()
    ap.add_argument("--version", default=str(pkg.get("version") or "0.1.0"))
    ap.add_argument("--pack", action="store_true", help="also write the ~5GB datapack zip")
    args = ap.parse_args()
    make_release(args.version, args.pack)


if __name__ == "__main__":
    main()
