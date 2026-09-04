#!/usr/bin/env python3
"""Read-only validation for sentence audio annotations.

The validator intentionally never rewrites book data or media.  It checks that
the book and sidecar annotation ids agree, clips resolve, word offsets are
monotonic/in-range, and (optionally) every clip can be decoded by ffmpeg.
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path
from typing import Any, Iterable


ID_RE = re.compile(r"^(?:mc-)?b\d+-p\d{2}-s\d{2}$")
DURATION_RE = re.compile(r"Duration:\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)")


def _read(path: Path) -> Any:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def _book_sentences(book: dict[str, Any]) -> list[tuple[str, dict[str, Any]]]:
    out: list[tuple[str, dict[str, Any]]] = []
    series = str(book.get("series") or "")
    book_no = int(book.get("book") or 0)
    for page in book.get("pages") or []:
        page_no = int(page.get("page_no") or 0)
        for index, sentence in enumerate(page.get("sentences") or [], start=1):
            sid = str(sentence.get("id") or (f"mc-b{book_no}-p{page_no:02d}-s{index:02d}" if series == "minecraft" else f"b{book_no}-p{page_no:02d}-s{index:02d}"))
            out.append((sid, sentence))
    return out


def _resolve_clip(root: Path, book_json: Path, audio: str) -> Path | None:
    raw = Path(audio)
    candidates = []
    if raw.is_absolute():
        candidates.append(raw)
    else:
        candidates.extend((root / raw, root / "prj" / raw, book_json.parent / raw))
    for candidate in candidates:
        if candidate.exists():
            return candidate
    return None


def _probe_duration_ms(path: Path, ffmpeg: str | None) -> tuple[int | None, str | None]:
    if not ffmpeg:
        return None, None
    command = [ffmpeg, "-v", "error", "-i", str(path), "-f", "null", "-"]
    try:
        process = subprocess.run(command, capture_output=True, text=True, encoding="utf-8", errors="replace", check=False)
    except OSError as exc:
        return None, f"ffmpeg unavailable: {exc}"
    if process.returncode != 0:
        return None, (process.stderr or process.stdout or "decode failed").strip()
    # A null ffmpeg run is a decode check.  Probe duration separately using
    # ffmpeg's informational output only when the executable emits it.
    info = subprocess.run([ffmpeg, "-i", str(path)], capture_output=True, text=True, encoding="utf-8", errors="replace", check=False)
    match = DURATION_RE.search((info.stderr or "") + (info.stdout or ""))
    if not match:
        return None, None
    hours, minutes, seconds = match.groups()
    return round((int(hours) * 3600 + int(minutes) * 60 + float(seconds)) * 1000), None


def validate_audio_book(
    *,
    book_json: Path,
    annotations: Path,
    root: Path,
    require_zh: bool = False,
    require_words_when_audio: bool = False,
    ffmpeg: str | None = None,
) -> dict[str, Any]:
    errors: list[str] = []
    warnings: list[str] = []
    try:
        book = _read(book_json)
        annotation_payload = _read(annotations)
    except (OSError, json.JSONDecodeError) as exc:
        return {"errors": [f"JSON unreadable: {exc}"], "warnings": []}
    expected = _book_sentences(book)
    expected_map = dict(expected)
    records = annotation_payload.get("sentences") if isinstance(annotation_payload, dict) else None
    records = records if isinstance(records, list) else []
    seen: set[str] = set()
    clips = 0
    decoded = 0
    with_zh = 0
    with_words = 0
    for index, record in enumerate(records):
        prefix = f"record[{index}]"
        rid = str(record.get("id") or "")
        if not ID_RE.fullmatch(rid):
            errors.append(f"{prefix}: invalid id {rid!r}")
        if rid in seen:
            errors.append(f"{prefix}: duplicate id {rid}")
        seen.add(rid)
        source = expected_map.get(rid)
        if source is None:
            errors.append(f"{prefix}: id {rid} is not in book JSON")
            continue
        audio = record.get("audio")
        source_audio = source.get("audio")
        if audio != source_audio:
            errors.append(f"{rid}: audio path differs from book JSON")
        if audio:
            clips += 1
            clip = _resolve_clip(root, book_json, str(audio))
            if clip is None:
                errors.append(f"{rid}: clip not found: {audio}")
            elif ffmpeg:
                duration_ms, decode_error = _probe_duration_ms(clip, ffmpeg)
                if decode_error:
                    errors.append(f"{rid}: ffmpeg decode failed: {decode_error}")
                else:
                    decoded += 1
                if duration_ms is not None:
                    record["_validated_duration_ms"] = duration_ms
        if record.get("text_en") != source.get("text_en"):
            errors.append(f"{rid}: text_en differs from book JSON")
        source_start = source.get("start_ms")
        source_end = source.get("end_ms")
        if source_start is None and source.get("start_sec") is not None:
            source_start = round(float(source["start_sec"]) * 1000)
        if source_end is None and source.get("end_sec") is not None:
            source_end = round(float(source["end_sec"]) * 1000)
        if source_start is not None and record.get("start_ms") != source_start:
            errors.append(f"{rid}: start_ms differs from book JSON")
        if source_end is not None and record.get("end_ms") != source_end:
            errors.append(f"{rid}: end_ms differs from book JSON")
        zh = record.get("zh")
        if isinstance(zh, str) and zh.strip():
            with_zh += 1
        elif require_zh:
            errors.append(f"{rid}: zh is missing")
        else:
            warnings.append(f"{rid}: zh is not filled")
        words = record.get("words")
        if words is None:
            words = []
        if not isinstance(words, list):
            errors.append(f"{rid}: words must be an array")
            continue
        if audio and require_words_when_audio and not words:
            errors.append(f"{rid}: audio sentence has no word timing")
        if words:
            with_words += 1
        last_end = 0
        for wi, word in enumerate(words):
            try:
                start = int(word["start_ms"])
                end = int(word["end_ms"])
            except (KeyError, TypeError, ValueError):
                errors.append(f"{rid}: word[{wi}] lacks integer start_ms/end_ms")
                continue
            if start < 0 or end < start:
                errors.append(f"{rid}: word[{wi}] bounds {start}..{end} are invalid")
            if wi and start < last_end:
                errors.append(f"{rid}: word timing overlaps at word[{wi}]")
            last_end = max(last_end, end)
        duration_ms = record.get("duration_ms") or record.get("_validated_duration_ms")
        if duration_ms is not None:
            try:
                duration = int(duration_ms)
            except (TypeError, ValueError):
                errors.append(f"{rid}: duration_ms is not an integer")
            else:
                for wi, word in enumerate(words):
                    try:
                        end = int(word["end_ms"])
                    except (KeyError, TypeError, ValueError):
                        continue
                    if end > duration:
                        errors.append(f"{rid}: word[{wi}] end {end} exceeds clip duration {duration}")
    missing = [sid for sid, _ in expected if sid not in seen]
    errors.extend(f"missing annotation id {sid}" for sid in missing)
    return {
        "book_json": str(book_json),
        "annotations": str(annotations),
        "expected_sentences": len(expected),
        "annotation_sentences": len(records),
        "clips": clips,
        "decoded": decoded,
        "with_zh": with_zh,
        "with_words": with_words,
        "missing_ids": missing,
        "errors": errors,
        "warnings": warnings,
    }


def main(argv: Iterable[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--book-json", type=Path, required=True)
    parser.add_argument("--annotations", type=Path, required=True)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--require-zh", action="store_true")
    parser.add_argument("--require-words-when-audio", action="store_true")
    parser.add_argument("--ffmpeg", help="ffmpeg executable used for decode checks")
    parser.add_argument("--json", action="store_true", dest="as_json")
    args = parser.parse_args(list(argv) if argv is not None else None)
    report = validate_audio_book(
        book_json=args.book_json,
        annotations=args.annotations,
        root=args.root,
        require_zh=args.require_zh,
        require_words_when_audio=args.require_words_when_audio,
        ffmpeg=args.ffmpeg,
    )
    if args.as_json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        print(
            "{annotation_sentences}/{expected_sentences} records; clips={clips}; "
            "decoded={decoded}; zh={with_zh}; words={with_words}".format(**report)
        )
        for warning in report.get("warnings") or []:
            print("warning: " + warning)
        for error in report.get("errors") or []:
            print("error: " + error)
    return 1 if report["errors"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
