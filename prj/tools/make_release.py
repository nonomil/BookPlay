# -*- coding: utf-8 -*-
"""Assemble release/vX.Y.Z with APK folder, datapack folder, and notes."""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from datetime import date
from pathlib import Path

from paths import REPO

DEFAULT_MOBILE = REPO / "release" / "storyhall-mobile-debug.apk"
DEFAULT_TV = REPO / "release" / "storyhall-tv-debug.apk"
DEFAULT_FOLLOW_UP = REPO / "release" / "书戏后续数据包-1.0.5.zip"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _copy(src: Path, dest: Path) -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists():
        dest.unlink()
    shutil.copy2(src, dest)
    return dest


def _mb(path: Path) -> float:
    return path.stat().st_size / 1024 / 1024


def notes_text(
    version: str,
    *,
    mobile: Path,
    tv: Path,
    pack: Path | None,
    version_code: str,
) -> str:
    pack_row = "尚未放入"
    pack_hash_row = ""
    if pack and pack.exists():
        pack_row = f"`datapack/{pack.name}`，约 {_mb(pack) / 1024:.2f} GB"
        pack_hash_row = f"| {pack.name} | `{sha256(pack)}` |\n"
    return f"""# 豆豆龙英语 {version}

发布日期：{date.today().isoformat()}  
性质：个人学习用本地发布（debug 安装包，未上架）  
versionCode：{version_code}

## 目录

| 路径 | 说明 |
| --- | --- |
| `apk/豆豆龙英语-{version}-mobile.apk` | 手机 / 平板 / 掌机共用。内置西游记第 1 集、我的世界第 1 章、MikeJJ 第 1 章。约 {_mb(mobile):.1f} MB |
| `apk/豆豆龙英语-{version}-tv.apk` | 电视 Leanback 版，内容与手机版相同。约 {_mb(tv):.1f} MB |
| `datapack/` | 后续集/本数据包。{pack_row} |
| `安装说明.md` | 安装与导入步骤 |
| `版本说明.md` | 本文件 |

## 这个版本有什么

- 修复知识巩固：进度小人改用包内走路图；未学单词会先进入单词页而不是空测验。
- 题目/选项点击发音：先播预合成音频，没有片段时用系统离线朗读。
- APK 只带三条内容线的第一章，后续集/本用数据包导入。
- 导入后按实际文件解锁；目录里仍显示第 1 集/本。
- 掌机按键桥：壳内转发上下左右、ABXY、Start/Select 和左右摇杆。首页有「掌机按键探测」。
- 同一 mobile 包按屏幕和按键自动判断掌机/触屏，不单独打掌机包。

## 校验值（SHA-256）

| 文件 | SHA-256 |
| --- | --- |
| 豆豆龙英语-{version}-mobile.apk | `{sha256(mobile)}` |
| 豆豆龙英语-{version}-tv.apk | `{sha256(tv)}` |
{pack_hash_row}
## 已知限制

- debug 签名，仅供自己安装。
- X35S 的真实 keyCode / scanCode 需在探测页记录后再写进映射。
- 本包素材来自个人学习用途，不要公开发布或转售。
"""


def install_text(version: str, pack_name: str) -> str:
    return f"""# 豆豆龙英语 {version} 安装说明

1. **手机 / 平板 / 掌机**安装 `apk/豆豆龙英语-{version}-mobile.apk`。  
   **电视**安装 `apk/豆豆龙英语-{version}-tv.apk`。
2. 打开后即可玩西游记第 1 集、我的世界第 1 章、MikeJJ 第 1 章。
3. 后续集/本：把 `datapack/{pack_name}` 拷到设备，在提示里选这个 ZIP；或先解压，再选含 `dialogue_stories` 和 `assets` 的文件夹。
4. 掌机请先打开首页「掌机按键探测」，依次按上/下/左/右、A/B/X/Y、Start/Select，并推动左右摇杆，记下页面上的数字。

APK 为 debug 签名。数据包不打进安装包，方便以后只换内容。
"""


def make_release(
    version: str,
    *,
    mobile_src: Path,
    tv_src: Path,
    pack_src: Path | None,
    version_code: str,
) -> Path:
    if not mobile_src.is_file():
        raise FileNotFoundError(f"缺少手机 APK: {mobile_src}")
    if not tv_src.is_file():
        raise FileNotFoundError(f"缺少电视 APK: {tv_src}")
    dest = REPO / "release" / f"v{version}"
    apk_dir = dest / "apk"
    pack_dir = dest / "datapack"
    apk_dir.mkdir(parents=True, exist_ok=True)
    pack_dir.mkdir(parents=True, exist_ok=True)

    mobile = _copy(mobile_src, apk_dir / f"豆豆龙英语-{version}-mobile.apk")
    tv = _copy(tv_src, apk_dir / f"豆豆龙英语-{version}-tv.apk")
    pack = None
    if pack_src and pack_src.is_file():
        pack = _copy(pack_src, pack_dir / f"书戏后续数据包-{version}.zip")

    pack_name = pack.name if pack else "书戏后续数据包-{version}.zip".format(version=version)
    (dest / "版本说明.md").write_text(
        notes_text(version, mobile=mobile, tv=tv, pack=pack, version_code=version_code),
        encoding="utf-8-sig",
    )
    (dest / "安装说明.md").write_text(install_text(version, pack_name), encoding="utf-8-sig")
    print(f"release -> {dest}", flush=True)
    print(f"  apk/{mobile.name} ({_mb(mobile):.1f} MB)", flush=True)
    print(f"  apk/{tv.name} ({_mb(tv):.1f} MB)", flush=True)
    if pack:
        print(f"  datapack/{pack.name} ({_mb(pack) / 1024:.2f} GB)", flush=True)
    return dest


def main() -> None:
    props = {}
    version_file = REPO / "android" / "version.properties"
    if version_file.is_file():
        for line in version_file.read_text(encoding="utf-8").splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                key, value = line.split("=", 1)
                props[key.strip()] = value.strip()
    version_name = "{}.{}.{}".format(
        props.get("versionMajor", "1"),
        props.get("versionMinor", "0"),
        props.get("versionPatch", "0"),
    )
    pkg = json.loads((REPO / "package.json").read_text(encoding="utf-8"))
    ap = argparse.ArgumentParser()
    ap.add_argument("--version", default=version_name or str(pkg.get("version") or "0.1.0"))
    ap.add_argument("--version-code", default=props.get("versionCode", "?"))
    ap.add_argument("--mobile", type=Path, default=DEFAULT_MOBILE)
    ap.add_argument("--tv", type=Path, default=DEFAULT_TV)
    ap.add_argument("--datapack", type=Path, default=DEFAULT_FOLLOW_UP)
    ap.add_argument("--no-datapack", action="store_true")
    args = ap.parse_args()
    make_release(
        args.version,
        mobile_src=args.mobile,
        tv_src=args.tv,
        pack_src=None if args.no_datapack else args.datapack,
        version_code=str(args.version_code),
    )


if __name__ == "__main__":
    main()
