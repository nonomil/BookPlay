#!/usr/bin/env python3
"""Read-only validator for sentence-aligned storybook audio data.

It checks the data consumed by the reader; it never edits JSON, audio, or
source media.  Use it for a new episode before opening the browser.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path
from typing import Any


ID_RE = re.compile(r"^b\d+-p\d{2}-s\d{2}$")
SPEAKERS = {"mikey", "jj", "narrator", "system"}
COMPOUND_RE = re.compile(r"[.!?]+(?=\s+[A-Z]|$)")


def load_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        value = json.load(handle)
    if not isinstance(value, dict):
        raise ValueError(f"expected JSON object: {path}")
    return value


def parse_page_counts(raw: str | None) -> list[int] | None:
    if not raw:
        return None
    try:
        values = [int(part.strip()) for part in raw.split(",") if part.strip()]
    except ValueError as exc:
        raise ValueError(f"invalid --expect-pages value: {raw}") from exc
    if any(value < 0 for value in values):
        raise ValueError("--expect-pages cannot contain negative values")
    return values


def project_audio_path(project_root: Path, raw_audio: str) -> Path:
    relative = Path(raw_audio.replace("/", os.sep))
    if relative.is_absolute():
        raise ValueError(f"audio path must be project-relative: {raw_audio}")
    # `prj/assets` and `prj/data` are junctions in this repository. Validate
    # traversal lexically, then retain the junction path so Windows resolves it
    # to the real consumer tree without being mistaken for an escape.
    if ".." in relative.parts:
        raise ValueError(f"audio path escapes project root: {raw_audio}")
    return project_root / relative


def compare_annotation(sentence: dict[str, Any], annotation: dict[str, Any], key: str, failures: list[str]) -> None:
    for field in ("text_en", "zh", "speaker", "bubble", "start_ms", "end_ms"):
        if sentence.get(field) != annotation.get(field):
            failures.append(f"{key} annotation mismatch: {field}")


def decode_audio(ffmpeg: Path, audio: Path) -> tuple[bool, str]:
    null_target = "NUL" if os.name == "nt" else "/dev/null"
    result = subprocess.run(
        [str(ffmpeg), "-v", "error", "-i", str(audio), "-f", "null", null_target],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    return result.returncode == 0, result.stderr.strip()


def validate(args: argparse.Namespace) -> tuple[int, dict[str, Any]]:
    book_path = Path(args.book_json).resolve()
    project_root = Path(args.project_root).resolve()
    data = load_json(book_path)
    pages = data.get("pages")
    if not isinstance(pages, list):
        raise ValueError("book JSON must contain a pages array")

    annotations: dict[str, Any] = {}
    if args.annotations:
        annotation_doc = load_json(Path(args.annotations).resolve())
        raw_annotations = annotation_doc.get("annotations")
        if not isinstance(raw_annotations, dict):
            raise ValueError("annotation JSON must contain an annotations object")
        annotations = raw_annotations

    expected_pages = parse_page_counts(args.expect_pages)
    failures: list[str] = []
    seen: set[str] = set()
    page_counts: list[int] = []
    glossary_counts: list[int] = []
    audio_paths: list[Path] = []
    geometry_violations: list[str] = []
    word_violations: list[str] = []
    decode_failures: list[str] = []
    previous_end_by_page: dict[int, int] = {}

    for page_index, page in enumerate(pages, start=1):
        if not isinstance(page, dict):
            failures.append(f"page {page_index} is not an object")
            continue
        page_no = page.get("page_no", page_index)
        sentences = page.get("sentences")
        if not isinstance(sentences, list):
            failures.append(f"page {page_no} missing sentences array")
            continue
        page_counts.append(len(sentences))
        page_terms: set[str] = set()
        for sentence in sentences:
            if not isinstance(sentence, dict):
                failures.append(f"page {page_no} sentence is not an object")
                continue
            key = sentence.get("id")
            if not isinstance(key, str) or not ID_RE.fullmatch(key):
                failures.append(f"page {page_no} bad id: {key}")
                key = f"page-{page_no}-unknown-{len(seen)}"
            elif key in seen:
                failures.append(f"duplicate id {key}")
            seen.add(key)
            if key in annotations:
                compare_annotation(sentence, annotations[key], key, failures)
            elif annotations:
                failures.append(f"{key} missing from annotations")

            text = sentence.get("text_en")
            if not isinstance(text, str) or not text.strip():
                failures.append(f"{key} missing text_en")
            elif key not in args.exempt_compound_ids and len(COMPOUND_RE.findall(text)) > 1:
                failures.append(f"{key} compound text: {text}")

            speaker = sentence.get("speaker") or {}
            if not isinstance(speaker, dict) or speaker.get("id") not in SPEAKERS or not speaker.get("label"):
                failures.append(f"{key} invalid speaker")
            bubble = sentence.get("bubble") or {}
            if not isinstance(bubble, dict):
                failures.append(f"{key} missing bubble")
                bubble = {}
            for field in ("x", "y", "w", "h"):
                value = bubble.get(field)
                if not isinstance(value, (int, float)) or not 0 <= value <= 1:
                    failures.append(f"{key} bubble.{field} out of range")
            if isinstance(bubble.get("w"), (int, float)) and bubble["w"] <= 0:
                failures.append(f"{key} bubble width is not positive")
            if isinstance(bubble.get("h"), (int, float)) and bubble["h"] <= 0:
                failures.append(f"{key} bubble height is not positive")

            start = sentence.get("start_ms")
            end = sentence.get("end_ms")
            if not isinstance(start, int) or not isinstance(end, int) or not 0 <= start < end:
                failures.append(f"{key} invalid start/end")
                duration = 0
            else:
                duration = end - start
                if isinstance(page_no, int) and page_no in previous_end_by_page and start < previous_end_by_page[page_no]:
                    failures.append(f"{key} overlaps previous sentence on page {page_no}")
                if isinstance(page_no, int):
                    previous_end_by_page[page_no] = end

            words = sentence.get("words")
            if not isinstance(words, list) or not words:
                failures.append(f"{key} missing words")
                words = []
            previous_word_end = 0
            for word in words:
                if not isinstance(word, dict):
                    word_violations.append(f"{key}: word is not an object")
                    continue
                word_start = word.get("start_ms")
                word_end = word.get("end_ms")
                if (
                    not isinstance(word_start, int)
                    or not isinstance(word_end, int)
                    or word_start < previous_word_end
                    or word_start < 0
                    or word_end < word_start
                    or word_end > duration
                ):
                    word_violations.append(f"{key}:{word.get('text')} [{word_start},{word_end}] duration={duration}")
                if isinstance(word_end, int):
                    previous_word_end = word_end

            for glossary in sentence.get("glossary") or []:
                if isinstance(glossary, dict) and glossary.get("term"):
                    page_terms.add(str(glossary["term"]).casefold())

            raw_audio = sentence.get("audio")
            if not isinstance(raw_audio, str) or not raw_audio:
                failures.append(f"{key} missing audio")
            else:
                try:
                    audio_path = project_audio_path(project_root, raw_audio)
                except ValueError as exc:
                    failures.append(f"{key} {exc}")
                else:
                    if not audio_path.is_file() or audio_path.stat().st_size == 0:
                        failures.append(f"{key} missing/empty audio: {raw_audio}")
                    else:
                        audio_paths.append(audio_path)
                        if args.decode_audio:
                            ok, stderr = decode_audio(Path(args.ffmpeg).resolve(), audio_path)
                            if not ok:
                                decode_failures.append(f"{key}: {stderr or 'ffmpeg failed'}")

            if all(isinstance(bubble.get(field), (int, float)) for field in ("x", "w")):
                rendered_width = min(
                    max(min(bubble["w"] * args.image_width, args.image_width * 0.48), args.min_bubble_width),
                    args.image_width - 8,
                )
                right = bubble["x"] * args.image_width + rendered_width
                if right > args.image_width + args.geometry_tolerance:
                    geometry_violations.append(f"{key}: right={right:.2f} > {args.image_width + args.geometry_tolerance:.2f}")

        glossary_counts.append(len(page_terms))
        if not 2 <= len(page_terms) <= 4:
            failures.append(f"page {page_no} glossary terms={len(page_terms)} (expected 2-4)")

    total = sum(page_counts)
    if args.expect_total is not None and total != args.expect_total:
        failures.append(f"total={total}, expected={args.expect_total}")
    if expected_pages is not None and page_counts != expected_pages:
        failures.append(f"page_counts={page_counts}, expected={expected_pages}")
    if annotations and set(annotations) != seen:
        missing = sorted(seen - set(annotations))
        extra = sorted(set(annotations) - seen)
        if missing:
            failures.append(f"annotations missing ids: {','.join(missing)}")
        if extra:
            failures.append(f"annotations extra ids: {','.join(extra)}")
    failures.extend(word_violations)
    failures.extend(geometry_violations)
    failures.extend(decode_failures)

    result = {
        "status": "VALIDATION_OK" if not failures else "VALIDATION_FAILED",
        "book_json": str(book_path),
        "annotations": str(Path(args.annotations).resolve()) if args.annotations else None,
        "pages": len(pages),
        "page_counts": page_counts,
        "sentences": total,
        "audio_files": len(audio_paths),
        "glossary_term_counts": glossary_counts,
        "word_violations": len(word_violations),
        "geometry_violations": len(geometry_violations),
        "decode_failures": len(decode_failures),
        "failures": failures,
    }
    return (0 if not failures else 3), result


def main() -> int:
    parser = argparse.ArgumentParser(description="Read-only validator for sentence-aligned storybook audio data")
    parser.add_argument("--book-json", required=True)
    parser.add_argument("--project-root", required=True)
    parser.add_argument("--annotations")
    parser.add_argument("--expect-total", type=int)
    parser.add_argument("--expect-pages")
    parser.add_argument("--image-width", type=float, default=366.0)
    parser.add_argument("--min-bubble-width", type=float, default=136.0)
    parser.add_argument("--geometry-tolerance", type=float, default=2.0)
    parser.add_argument("--exempt-compound-id", dest="exempt_compound_ids", action="append", default=[])
    parser.add_argument("--ffmpeg", default="ffmpeg")
    parser.add_argument("--decode-audio", action="store_true")
    args = parser.parse_args()
    try:
        code, result = validate(args)
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(json.dumps({"status": "VALIDATION_FAILED", "failures": [str(exc)]}, ensure_ascii=False))
        return 3
    print(json.dumps(result, ensure_ascii=False, separators=(",", ":")))
    return code


if __name__ == "__main__":
    sys.exit(main())
