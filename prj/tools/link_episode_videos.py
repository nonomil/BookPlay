#!/usr/bin/env python3
"""把 108 集 MP4 硬链接到 demo/assets/video/epN.mp4，供冒险页按幕播放。"""
from __future__ import annotations

import argparse
from pathlib import Path

DEMO = Path(__file__).resolve().parent.parent
SRC = DEMO.parent / "data" / "03.外挂英文字幕（无字幕）高清视频"
OUT = DEMO / "assets" / "video"


def src_mp4(n: int) -> Path | None:
    hits = sorted(SRC.glob(f"*】{n:03d} *.mp4")) or sorted(SRC.glob(f"*】{n:03d}*.mp4"))
    return hits[0] if hits else None


def link_one(n: int) -> Path | None:
    src = src_mp4(n)
    if not src:
        return None
    OUT.mkdir(parents=True, exist_ok=True)
    dest = OUT / f"ep{n}.mp4"
    if dest.exists() or dest.is_symlink():
        dest.unlink()
    try:
        dest.hardlink_to(src)
    except OSError:
        dest.symlink_to(src)
    return dest


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--episode", type=int)
    ap.add_argument("--all", action="store_true")
    args = ap.parse_args()
    nums = range(1, 109) if args.all else [args.episode or 1]
    ok = 0
    for n in nums:
        p = link_one(n)
        print(("ok" if p else "miss"), n, p or "")
        ok += int(bool(p))
    print("linked", ok)


if __name__ == "__main__":
    main()
