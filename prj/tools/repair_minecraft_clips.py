#!/usr/bin/env python3
"""Repair truncated Minecraft sentence clips from the immutable audiobook.

The existing sentence clips are generated outputs and are never overwritten.
For a pending sentence, this tool uses the same local faster-whisper model as
``minecraft_word_alignment.py`` to find the authored words in a slightly wider
window, then cuts a padded replacement under ``sentences-repaired/``.  The
book/sidecar paths are changed only after the replacement decodes and every
word boundary fits inside it.  Without ``--write`` the command is a dry run.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path
from typing import Any, Iterable

try:
    from minecraft_word_alignment import align_tokens, clip_duration_ms, tokenize, transcribe_full_audio
except ImportError:  # pragma: no cover - direct script execution
    from pathlib import Path as _Path
    sys.path.insert(0, str(_Path(__file__).resolve().parent))
    from minecraft_word_alignment import align_tokens, clip_duration_ms, tokenize, transcribe_full_audio


REPO = Path(__file__).resolve().parents[2]
DATA_DIR = REPO / "prj" / "data" / "storybooks-minecraft"
PADDING_BEFORE_MS = 300
PADDING_AFTER_MS = 160
SEARCH_AFTER_MS = 900


def _load(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _ffmpeg_path(explicit: str | None) -> str:
    if explicit:
        return explicit
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception as exc:  # pragma: no cover - environment-specific
        raise RuntimeError("pass --ffmpeg or install imageio-ffmpeg") from exc


def _candidate_words(full_words: list[dict[str, Any]], start_ms: int, end_ms: int) -> list[dict[str, Any]]:
    lower = start_ms - 120
    upper = end_ms + SEARCH_AFTER_MS
    return [
        {
            **word,
            "start_ms": int(word["start_ms"]) - start_ms,
            "end_ms": int(word["end_ms"]) - start_ms,
        }
        for word in full_words
        if lower <= (int(word["start_ms"]) + int(word["end_ms"])) // 2 <= upper
    ]


def _relative_id_parts(record_id: str) -> tuple[int, int]:
    # mc-b2-p03-s08 -> (3, 8)
    page = int(record_id.split("-p", 1)[1].split("-", 1)[0])
    sentence = int(record_id.rsplit("-s", 1)[1])
    return page, sentence


def _repair_one(
    record: dict[str, Any],
    full_words: list[dict[str, Any]],
    *,
    data_dir: Path,
    source_audio: Path,
    source_audio_rel: str,
    ffmpeg: str,
    write: bool,
) -> tuple[bool, str]:
    record_id = str(record.get("id") or "")
    original_audio = str(record.get("audio") or "")
    if not original_audio:
        return False, "no audio"
    start_ms = int(record.get("start_ms") or 0)
    end_ms = int(record.get("end_ms") or 0)
    clip_start = max(0, start_ms - PADDING_BEFORE_MS)
    candidate = _candidate_words(full_words, clip_start, end_ms)
    mapped, reason = align_tokens(tokenize(str(record.get("text_en") or "")), candidate)
    if mapped is None:
        return False, reason or "full-audio alignment failed"
    last_end_abs = clip_start + int(mapped[-1]["end_ms"])
    clip_end = max(end_ms, last_end_abs + PADDING_AFTER_MS)
    duration_ms = clip_end - clip_start
    if not source_path.exists():
        return False, f"source missing: {source_path}"
    clip_parent = Path(original_audio).parent
    repaired_rel = clip_parent.parent / "sentences-repaired" / Path(original_audio).name
    # Keep the original page/sentence filename while routing repaired outputs
    # to a separate directory, so rollback is just a path switch.
    # Runtime URLs resolve ``assets/...`` from ``prj/engine`` to ``prj/assets``.
    # Keep repaired media beside the existing generated asset pack, not under
    # the JSON sidecar directory.
    repaired_path = REPO / "prj" / repaired_rel
    repaired_path.parent.mkdir(parents=True, exist_ok=True)
    if write:
        command = [
            ffmpeg, "-y", "-i", str(source_audio),
            "-ss", f"{clip_start / 1000:.3f}", "-t", f"{duration_ms / 1000:.3f}",
            "-vn", "-c:a", "libmp3lame", "-q:a", "2", str(repaired_path),
        ]
        subprocess.run(command, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        measured = clip_duration_ms(repaired_path)
        if measured is None or measured < int(mapped[-1]["end_ms"]) + 1:
            return False, f"repaired duration {measured}ms is shorter than last word {mapped[-1]['end_ms']}ms"
    new_words = []
    for word in mapped:
        item = dict(word)
        item["timing_source"] = "faster-whisper-base.en-repaired-clip"
        item["repair_clip_start_ms"] = clip_start
        new_words.append(item)
    if write:
        record["audio"] = str(repaired_rel).replace("\\", "/")
        record["words"] = new_words
        record["word_timing_status"] = "reviewed"
        record["word_timing_model"] = "base.en"
        record["word_timing_repair"] = {
            "source_audio": str((Path("prj") / source_audio_rel)).replace("\\", "/"),
            "original_clip": original_audio,
            "clip_start_ms": clip_start,
            "clip_end_ms": clip_end,
            "padding_before_ms": PADDING_BEFORE_MS,
            "padding_after_ms": PADDING_AFTER_MS,
        }
        record.pop("word_timing_error", None)
    return True, f"{record_id}: {len(new_words)} words, clip {clip_start}..{clip_end}ms"


def repair_book(
    book: int,
    *,
    data_dir: Path = DATA_DIR,
    limit: int | None = None,
    write: bool = False,
    ffmpeg: str | None = None,
) -> dict[str, Any]:
    sidecar_path = data_dir / f"sentence-annotations-book{book}.json"
    book_path = data_dir / f"book{book}.json"
    sidecar = _load(sidecar_path)
    book_payload = _load(book_path)
    pending = [record for record in sidecar.get("sentences", []) if record.get("audio") and not record.get("words")]
    if limit is not None:
        pending = pending[:limit]
    source_audio = REPO / "prj" / str(book_payload.get("audio") or "")
    if not source_audio.exists():
        return {"book": book, "processed": len(pending), "repaired": 0, "failed": len(pending), "failures": [f"missing source audio {source_audio}"]}
    try:
        from faster_whisper import WhisperModel
        model = WhisperModel("base.en", device="cpu", compute_type="int8")
        print(f"transcribing source audiobook: {source_audio.name}", flush=True)
        full_words = transcribe_full_audio(model, source_audio)
    except Exception as exc:
        return {"book": book, "processed": len(pending), "repaired": 0, "failed": len(pending), "failures": [str(exc)]}
    ffmpeg_exe = _ffmpeg_path(ffmpeg) if write else (ffmpeg or "")
    repaired = 0
    failures: list[str] = []
    by_id = {str(record.get("id")): record for record in sidecar.get("sentences", [])}
    for record in pending:
        ok, message = _repair_one(
            record,
            full_words,
            data_dir=data_dir,
            source_audio=source_audio,
            source_audio_rel=str(book_payload.get("audio") or ""),
            ffmpeg=ffmpeg_exe,
            write=write,
        )
        if ok:
            repaired += 1
            print(message, flush=True)
        else:
            failures.append(f"{record.get('id')}: {message}")
    if write and repaired:
        # Mirror only repaired audio/word fields into the book JSON.  All
        # translations, glossary, quiz, and page geometry remain untouched.
        for page in book_payload.get("pages") or []:
            for sentence in page.get("sentences") or []:
                sid = str(sentence.get("id") or "")
                update = by_id.get(sid)
                if update and update.get("word_timing_repair"):
                    sentence["audio"] = update["audio"]
                    sentence["words"] = list(update.get("words") or [])
        sidecar["status"] = "enrichment-in-progress"
        sidecar_path.write_text(json.dumps(sidecar, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        book_path.write_text(json.dumps(book_payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return {
        "book": book,
        "processed": len(pending),
        "repaired": repaired,
        "failed": len(failures),
        "failures": failures,
        "written": bool(write and repaired),
    }


def main(argv: Iterable[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--book", type=int, choices=range(1, 6), required=True)
    parser.add_argument("--data-dir", type=Path, default=DATA_DIR)
    parser.add_argument("--limit", type=int)
    parser.add_argument("--write", action="store_true")
    parser.add_argument("--ffmpeg")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args(list(argv) if argv is not None else None)
    report = repair_book(args.book, data_dir=args.data_dir, limit=args.limit, write=args.write, ffmpeg=args.ffmpeg)
    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        print(f"book{args.book}: processed={report['processed']} repaired={report['repaired']} failed={report['failed']} written={report.get('written', False)}")
        for failure in report.get("failures") or []:
            print("failure: " + failure)
    return 0 if report["failed"] == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())
