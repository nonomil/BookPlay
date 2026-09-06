#!/usr/bin/env python3
"""Extract one video frame per subtitle node from JTTW episode videos.

Each dialogue_stories node carries audio_start/audio_end (subtitle timing in the
episode video). Taking the midpoint frame yields an image that visually matches
the sentence, which whole-page illustrations (adv_frames) cannot guarantee.

Output: assets/adv_video_frames/ep{N}/{node_id}.jpg  (served as /assets/...)
Frames already on disk are skipped, so the batch is resumable.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "prj" / "data" / "dialogue_stories"
VIDEO = ROOT / "prj" / "assets" / "video"
DEFAULT_OUT = ROOT / "prj" / "assets" / "adv_video_frames"


def parse_episodes(value: str) -> list[int]:
    episodes: list[int] = []
    for part in str(value).split(","):
        part = part.strip()
        if not part:
            continue
        if "-" in part:
            lo, hi = part.split("-", 1)
            episodes.extend(range(int(lo), int(hi) + 1))
        else:
            episodes.append(int(part))
    return sorted(set(episodes))


def default_ffmpeg() -> str:
    try:
        import imageio_ffmpeg

        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return "ffmpeg"


def safe_name(node_id: str) -> str:
    return re.sub(r"[^A-Za-z0-9_-]", "_", str(node_id))


def extract_episode(ep: int, ffmpeg: str, out_root: Path, width: int, quality: int) -> tuple[int, int]:
    book_path = DATA / f"ep{ep}.json"
    video = VIDEO / f"ep{ep}.mp4"
    if not book_path.is_file():
        print(f"[ep{ep}] 缺书数据 {book_path.name}，跳过")
        return (0, 0)
    if not video.is_file():
        print(f"[ep{ep}] 缺视频 {video.name}，跳过")
        return (0, 0)
    book = json.loads(book_path.read_text(encoding="utf-8"))
    out_dir = out_root / f"ep{ep}"
    out_dir.mkdir(parents=True, exist_ok=True)

    done = missed = 0
    for node in book.get("nodes", []):
        node_id = str(node.get("node_id") or "")
        start = node.get("audio_start")
        end = node.get("audio_end")
        if not node_id or start is None or end is None:
            continue
        start, end = float(start), float(end)
        if end <= start:
            continue
        out = out_dir / f"{safe_name(node_id)}.jpg"
        if out.is_file() and out.stat().st_size > 0:
            done += 1
            continue
        mid = max(0.05, (start + end) / 2)
        cmd = [
            ffmpeg, "-hide_banner", "-loglevel", "error",
            "-ss", f"{mid:.3f}", "-i", str(video),
            "-frames:v", "1",
            "-vf", f"scale={width}:-2",
            "-q:v", str(quality),
            "-y", str(out),
        ]
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode == 0 and out.is_file() and out.stat().st_size > 0:
            done += 1
        else:
            missed += 1
            print(f"[ep{ep}] {node_id} 截帧失败: {result.stderr.strip()[:120]}")
    return (done, missed)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ep", default="1-3", help="集号，如 1-3 或 1,5,9")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT, help="输出根目录")
    parser.add_argument("--width", type=int, default=640, help="帧宽（高按比例）")
    parser.add_argument("--quality", type=int, default=4, help="JPEG 质量（2 最优，5 较小）")
    parser.add_argument("--ffmpeg", default="", help="ffmpeg 路径，默认用 imageio_ffmpeg 自带")
    args = parser.parse_args()

    ffmpeg = args.ffmpeg or default_ffmpeg()
    episodes = parse_episodes(args.ep)
    total_done = total_missed = 0
    for ep in episodes:
        done, missed = extract_episode(ep, ffmpeg, args.out, args.width, args.quality)
        total_done += done
        total_missed += missed
        print(f"[ep{ep}] 完成 {done} 帧，失败 {missed}")
    print(f"合计：{total_done} 帧，失败 {total_missed}；输出目录 {args.out}")
    return 0 if total_missed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
