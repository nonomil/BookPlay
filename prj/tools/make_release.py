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
DEFAULT_HANDHELD = REPO / "release" / "storyhall-handheld-debug.apk"
DEFAULT_FOLLOW_UP = REPO / "release" / "书戏后续数据包-1.0.5.zip"

STARTER_HIGHLIGHTS = [
    "修复知识巩固：进度小人改用包内走路图；未学单词会先进入单词页而不是空测验。",
    "题目/选项点击发音：先播预合成音频，没有片段时用系统离线朗读。",
    "APK 只带三条内容线的第一章，后续集/本用数据包导入。",
    "导入后按实际文件解锁；目录里仍显示第 1 集/本。",
    "掌机按键桥：壳内转发上下左右、ABXY、Start/Select 和左右摇杆。首页有「掌机按键探测」。",
    "同一 mobile 包按屏幕和按键自动判断掌机/触屏，不单独打掌机包。",
]

JTTW_HIGHLIGHTS = [
    "降妖记大地图：4×4 可走世界、镜头跟随、四向移动、小怪追击撞击。",
    "词球捡投：地上中文球走近捡起，对准头顶英文的小怪扔出去；对上爆碎，扔错弹回。",
    "六种西游支援：蟠桃挡伤、芭蕉扇减速、紫金葫芦瞄准、筋斗云加速、紧箍咒提示、金箍棒补盾。",
    "地图 NPC 剧情答题 + 走近 Boss 跳进对战页（血条过渡、最近 3 条战报）。",
    "当前章回用地图主题 GPT 俯视图 6 张（花果山/水帘洞/三星洞/水脏洞/龙宫/幽冥界），第 3、4 集共用三星洞。",
    "开箱玩第 1 集「打怪」。c01 第 1–7 集关卡数据已打进包内；后续章回按同一套方法加主题图和白名单。",
]


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


def _highlights_for(profile: str, highlights: list[str] | None) -> list[str]:
    if highlights:
        return highlights
    return JTTW_HIGHLIGHTS if profile == "jttw" else STARTER_HIGHLIGHTS


def notes_text(
    version: str,
    *,
    mobile: Path,
    tv: Path,
    pack: Path | None,
    version_code: str,
    handheld: Path | None = None,
    profile: str = "starter",
    highlights: list[str] | None = None,
) -> str:
    pack_row = "尚未放入"
    pack_hash_row = ""
    if pack and pack.exists():
        pack_row = f"`datapack/{pack.name}`，约 {_mb(pack) / 1024:.2f} GB"
        pack_hash_row = f"| {pack.name} | `{sha256(pack)}` |\n"
    if profile == "jttw":
        mobile_desc = f"手机 / 平板。西游记降妖记小游戏（开箱第 1 集）。约 {_mb(mobile):.1f} MB"
        tv_desc = f"电视 Leanback 版，玩法与手机版相同。约 {_mb(tv):.1f} MB"
    else:
        mobile_desc = f"手机 / 平板 / 掌机共用。内置西游记第 1 集、我的世界第 1 章、MikeJJ 第 1 章。约 {_mb(mobile):.1f} MB"
        tv_desc = f"电视 Leanback 版，内容与手机版相同。约 {_mb(tv):.1f} MB"
    handheld_row = ""
    handheld_hash = ""
    if handheld and handheld.exists():
        handheld_row = (
            f"| `apk/豆豆龙英语-{version}-handheld.apk` | "
            f"掌机专用壳。约 {_mb(handheld):.1f} MB |\n"
        )
        handheld_hash = f"| 豆豆龙英语-{version}-handheld.apk | `{sha256(handheld)}` |\n"
    bullets = "\n".join(f"- {item}" for item in _highlights_for(profile, highlights))
    return f"""# 豆豆龙英语 {version}

发布日期：{date.today().isoformat()}  
性质：个人学习用本地发布（debug 安装包，未上架）  
versionCode：{version_code}

## 目录

| 路径 | 说明 |
| --- | --- |
| `apk/豆豆龙英语-{version}-mobile.apk` | {mobile_desc} |
| `apk/豆豆龙英语-{version}-tv.apk` | {tv_desc} |
{handheld_row}| `datapack/` | 后续集/本数据包。{pack_row} |
| `安装说明.md` | 安装与导入步骤 |
| `版本说明.md` | 本文件 |

## 这个版本有什么

{bullets}

## 校验值（SHA-256）

| 文件 | SHA-256 |
| --- | --- |
| 豆豆龙英语-{version}-mobile.apk | `{sha256(mobile)}` |
| 豆豆龙英语-{version}-tv.apk | `{sha256(tv)}` |
{handheld_hash}{pack_hash_row}
## 已知限制

- debug 签名，仅供自己安装。
- 大地图真机摇杆 / 电视 D-pad 手感还需实机过一遍。
- 本包素材来自个人学习用途，不要公开发布或转售。
"""


def install_text(
    version: str,
    pack_name: str,
    *,
    profile: str = "starter",
    has_handheld: bool = False,
) -> str:
    handheld_line = ""
    if has_handheld:
        handheld_line = f"   **掌机专用壳**也可装 `apk/豆豆龙英语-{version}-handheld.apk`。\n"
    if profile == "jttw":
        play = "打开西游记，进第 1 集，点「打怪」即可玩大地图捡投。"
        pack_hint = (
            f"后续集/本：若需要故事与全量资源，把 `datapack/{pack_name}` "
            "或仓库 `release/` 下的西游记数据包拷到设备，在设置页导入。"
        )
    else:
        play = "打开后即可玩西游记第 1 集、我的世界第 1 章、MikeJJ 第 1 章。"
        pack_hint = (
            f"后续集/本：把 `datapack/{pack_name}` 拷到设备，在提示里选这个 ZIP；"
            "或先解压，再选含 `dialogue_stories` 和 `assets` 的文件夹。"
        )
    return f"""# 豆豆龙英语 {version} 安装说明

1. **手机 / 平板**安装 `apk/豆豆龙英语-{version}-mobile.apk`。  
   **电视**安装 `apk/豆豆龙英语-{version}-tv.apk`。
{handheld_line}2. {play}
3. {pack_hint}
4. 掌机请先打开首页「掌机按键探测」，依次按上/下/左/右、A/B/X/Y、Start/Select，并推动左右摇杆，记下页面上的数字。

APK 为 debug 签名。版本目录是 `release/v{version}/`，不要只拷根目录里的 storyhall-*-debug.apk。
"""


def make_release(
    version: str,
    *,
    mobile_src: Path,
    tv_src: Path,
    pack_src: Path | None,
    version_code: str,
    handheld_src: Path | None = None,
    profile: str = "starter",
    highlights: list[str] | None = None,
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
    handheld = None
    if handheld_src and handheld_src.is_file():
        handheld = _copy(handheld_src, apk_dir / f"豆豆龙英语-{version}-handheld.apk")
    pack = None
    if pack_src and pack_src.is_file():
        pack_name_out = (
            f"西游记数据包-{version}-c01.zip" if profile == "jttw" else f"书戏后续数据包-{version}.zip"
        )
        pack = _copy(pack_src, pack_dir / pack_name_out)

    pack_name = pack.name if pack else (
        f"西游记数据包-{version}-c01.zip" if profile == "jttw" else f"书戏后续数据包-{version}.zip"
    )
    (dest / "版本说明.md").write_text(
        notes_text(
            version,
            mobile=mobile,
            tv=tv,
            pack=pack,
            version_code=version_code,
            handheld=handheld,
            profile=profile,
            highlights=highlights,
        ),
        encoding="utf-8-sig",
    )
    (dest / "安装说明.md").write_text(
        install_text(version, pack_name, profile=profile, has_handheld=handheld is not None),
        encoding="utf-8-sig",
    )
    print(f"release -> {dest}", flush=True)
    print(f"  apk/{mobile.name} ({_mb(mobile):.1f} MB)", flush=True)
    print(f"  apk/{tv.name} ({_mb(tv):.1f} MB)", flush=True)
    if handheld:
        print(f"  apk/{handheld.name} ({_mb(handheld):.1f} MB)", flush=True)
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
    ap.add_argument("--handheld", type=Path, default=None)
    ap.add_argument("--datapack", type=Path, default=DEFAULT_FOLLOW_UP)
    ap.add_argument("--no-datapack", action="store_true")
    ap.add_argument("--profile", choices=("starter", "jttw"), default="starter")
    args = ap.parse_args()
    handheld = args.handheld
    if handheld is None and args.profile == "jttw":
        candidate = REPO / "release" / "storyhall-jttw-handheld-debug.apk"
        handheld = candidate if candidate.is_file() else None
    make_release(
        args.version,
        mobile_src=args.mobile,
        tv_src=args.tv,
        pack_src=None if args.no_datapack else args.datapack,
        version_code=str(args.version_code),
        handheld_src=handheld,
        profile=args.profile,
    )


if __name__ == "__main__":
    main()
