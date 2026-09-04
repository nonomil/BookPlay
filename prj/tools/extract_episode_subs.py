#!/usr/bin/env python3
"""用已安装的 faster-whisper 从视频/MP3 抽出带时间戳的英文字幕。

第1步只要字幕时间轴；下一步再把句子对上 dialogue JSON。
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from faster_whisper import WhisperModel

DEMO = Path(__file__).resolve().parent.parent


def src_for(n: int) -> Path:
    video = DEMO / "assets" / "video" / f"ep{n}.mp4"
    audio = DEMO / "assets" / f"lf_ep{n}" / f"audio_ep{n}.mp3"
    if video.exists():
        return video
    if audio.exists():
        return audio
    raise FileNotFoundError(f"找不到 ep{n} 的 mp4/mp3")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--episode", type=int, default=1)
    ap.add_argument("--model", default="small")
    args = ap.parse_args()
    src = src_for(args.episode)
    out_dir = DEMO / "data" / "align" / f"ep{args.episode}"
    out_dir.mkdir(parents=True, exist_ok=True)

    model = WhisperModel(args.model, device="cpu", compute_type="int8")
    segments, info = model.transcribe(
        str(src),
        language="en",
        word_timestamps=True,
        vad_filter=True,
        beam_size=5,
    )
    rows = []
    srt_lines = []
    for i, seg in enumerate(segments, 1):
        words = []
        if seg.words:
            words = [{"w": w.word, "start": round(w.start, 3), "end": round(w.end, 3)} for w in seg.words]
        row = {
            "i": i,
            "start": round(seg.start, 3),
            "end": round(seg.end, 3),
            "text": (seg.text or "").strip(),
            "words": words,
        }
        rows.append(row)
        srt_lines.append(f"{i}\n{_ts(seg.start)} --> {_ts(seg.end)}\n{row['text']}\n")
        print(f"{row['start']:7.2f}-{row['end']:7.2f}  {row['text']}")

    payload = {
        "episode": args.episode,
        "source": str(src.relative_to(DEMO)).replace("\\", "/"),
        "model": args.model,
        "language": info.language,
        "duration": getattr(info, "duration", None),
        "segments": rows,
    }
    (out_dir / "whisper.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    (out_dir / "whisper.srt").write_text("\n".join(srt_lines), encoding="utf-8")
    print("wrote", out_dir, "segments", len(rows))


def _ts(sec: float) -> str:
    ms = int(round(sec * 1000))
    h, rem = divmod(ms, 3600_000)
    m, rem = divmod(rem, 60_000)
    s, ms = divmod(rem, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


if __name__ == "__main__":
    main()
