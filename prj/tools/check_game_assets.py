#!/usr/bin/env python3
"""Check game asset/data integrity for the 降妖记 minigame.

Validates that every path referenced by content/game/sprites.json and
content/game/dex.json exists, and that game data files are covered by the
pack whitelist (COMMON_FILES in pack_datapack.py, DATA_DIRS in pack_android.py).
Exit 1 on any missing reference or coverage gap — prevents silent asset loss.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CONTENT = ROOT / "content"
FAILURES: list[str] = []


def fail(msg: str) -> None:
    FAILURES.append(msg)
    print(f"[fail] {msg}")


def load(path: Path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        fail(f"读取失败 {path}: {exc}")
        return None


def check_file(rel: str, base: Path = CONTENT) -> None:
    if not (base / rel).exists():
        fail(f"引用缺失: {rel}")


def collect_refs(obj, out: list) -> None:
    if isinstance(obj, str):
        if re.search(r"\.(png|gif|jpg|jpeg|webp|mp3|json)$", obj, re.I):
            out.append(obj)
    elif isinstance(obj, dict):
        for v in obj.values():
            collect_refs(v, out)
    elif isinstance(obj, list):
        for v in obj:
            collect_refs(v, out)


def whitelist_from_pack_datapack() -> set:
    src = (ROOT / "prj" / "tools" / "pack_datapack.py").read_text(encoding="utf-8")
    block = re.search(r"COMMON_FILES = \(([\s\S]*?)\n\)", src)
    if not block:
        fail("pack_datapack.py 未找到 COMMON_FILES")
        return set()
    return set(re.findall(r'"([^"]+)"', block.group(1)))


def datadirs_from_pack_android() -> set:
    src = (ROOT / "prj" / "tools" / "pack_android.py").read_text(encoding="utf-8")
    block = re.search(r"DATA_DIRS = \[([\s\S]*?)\n\]", src)
    if not block:
        fail("pack_android.py 未找到 DATA_DIRS")
        return set()
    entries = set(re.findall(r'\("([^"]+)"', block.group(1)))
    return {e.rstrip("/") for e in entries}


def covered_by(rel: str, common: set, datadirs: set) -> bool:
    if rel in common:
        return True
    for d in datadirs:
        if rel == d or rel.startswith(d + "/"):
            return True
    for c in common:
        if c.endswith("/" + rel) or c == rel:
            return True
    return False


def main() -> int:
    sprites = load(CONTENT / "game" / "sprites.json")
    dex = load(CONTENT / "game" / "dex.json")

    refs: list[str] = []
    collect_refs(sprites, refs)
    collect_refs(dex, refs)
    for rel in sorted(set(refs)):
        check_file(rel)

    common = whitelist_from_pack_datapack()
    datadirs = datadirs_from_pack_android()

    required = sorted(set(refs) | {
        "game/cast.json", "game/taunts.json", "game/maps.json",
        "game/sprites.json", "game/dex.json",
    })
    for rel in required:
        if not covered_by(rel, common, datadirs):
            fail(f"打包白名单未覆盖: {rel}")

    # dex 元素引用一致性
    if dex and isinstance(sprites, dict):
        for entry in dex.get("dex", []):
            sprite = entry.get("sprite")
            if sprite and sprite not in sprites.get("sprites", {}):
                fail(f"dex {entry['id']} 的 sprite 未注册: {sprite}")

    levels = sorted((CONTENT / "game" / "levels").glob("ep*.json")) if (CONTENT / "game" / "levels").exists() else []
    print(f"统计：sprites 引用 {len(set(refs))} 项 / dex 条目 {len((dex or {}).get('dex', []))} / 关卡 {len(levels)} 个")
    if FAILURES:
        print(f"结果：{len(FAILURES)} 项失败")
        return 1
    print("结果：全部通过")
    return 0


if __name__ == "__main__":
    sys.exit(main())
