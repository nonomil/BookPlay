# -*- coding: utf-8 -*-
"""Remux episode MP4s so moov is at the start (HTML5 seek)."""
from __future__ import annotations

import argparse
import subprocess
from pathlib import Path

import imageio_ffmpeg

DEMO = Path(__file__).resolve().parent.parent
VIDEO = DEMO / "assets" / "video"
FF = imageio_ffmpeg.get_ffmpeg_exe()


def remux_one(n: int, force: bool = False) -> str:
    src = VIDEO / f"ep{n}.mp4"
    if not src.exists():
        return "missing"
    tmp = VIDEO / f"ep{n}.faststart.tmp.mp4"
    # already faststarted: skip unless force (heuristic: not a hardlink-only check)
    if not force and src.stat().st_size > 0:
        # cheap: if a sidecar mark exists
        mark = VIDEO / f"ep{n}.faststart"
        if mark.exists():
            return "skip"
    tmp.unlink(missing_ok=True)
    r = subprocess.run(
        [FF, "-y", "-i", str(src), "-c", "copy", "-movflags", "+faststart", str(tmp)],
        capture_output=True, text=True, errors="replace",
    )
    if r.returncode != 0 or not tmp.exists() or tmp.stat().st_size < 1000:
        tmp.unlink(missing_ok=True)
        return f"fail {r.returncode}"
    src.unlink()
    tmp.rename(src)
    (VIDEO / f"ep{n}.faststart").write_text("1\n", encoding="utf-8")
    return "ok"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--episodes", default="1-108")
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()
    eps = []
    for part in args.episodes.split(","):
        part = part.strip()
        if "-" in part:
            a, b = part.split("-", 1)
            eps.extend(range(int(a), int(b) + 1))
        else:
            eps.append(int(part))
    ok = skip = fail = 0
    for n in eps:
        st = remux_one(n, force=args.force)
        print(f"ep{n} {st}", flush=True)
        if st == "ok":
            ok += 1
        elif st == "skip":
            skip += 1
        else:
            fail += 1
    print("ok", ok, "skip", skip, "fail", fail)


if __name__ == "__main__":
    main()
