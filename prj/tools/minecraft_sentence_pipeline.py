#!/usr/bin/env python3
"""Minecraft sentence annotation scaffold/validate/apply helpers.

The existing Minecraft book JSON files are the source of truth for English text,
sentence order, and verified sentence clips.  This tool keeps translations and
word timing in a sidecar annotation file until every record passes validation;
``apply`` is deliberately fail-closed so an incomplete scaffold can never be
mistaken for finished learning data.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any, Iterable, Iterator


REPO = Path(__file__).resolve().parents[2]
DATA_DIR = REPO / "prj" / "data" / "storybooks-minecraft"
BOOK_COUNT = 5
ID_RE = re.compile(r"^mc-b([1-5])-p(\d{2})-s(\d{2})$")
PLACEHOLDER_RE = re.compile(r"(?:TODO|待翻译|待补|placeholder|lorem ipsum)", re.I)

# A small, explicit term map prevents later translators from inventing a new
# spelling for Minecraft proper nouns.  It is metadata only; it is never used
# to synthesize a sentence translation.
OFFICIAL_TERMS = {
    "Emmy": "Emmy",
    "Birch": "Birch",
    "Byte": "Byte",
    "Nether": "下界",
    "Overworld": "主世界",
    "Piglin": "猪灵",
    "Piglins": "猪灵",
    "Enderman": "末影人",
    "Creeper": "苦力怕",
    "obsidian": "黑曜石",
}


def book_path(book: int, data_dir: Path = DATA_DIR) -> Path:
    return Path(data_dir) / f"book{int(book)}.json"


def annotation_path(book: int, data_dir: Path = DATA_DIR) -> Path:
    return Path(data_dir) / f"sentence-annotations-book{int(book)}.json"


def sentence_id(book: int, page_no: int, sentence_no: int) -> str:
    return f"mc-b{int(book)}-p{int(page_no):02d}-s{int(sentence_no):02d}"


def _load_json(path: Path) -> dict[str, Any]:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def iter_book_sentences(payload: dict[str, Any], book: int) -> Iterator[dict[str, Any]]:
    """Yield stable sentence records with their source page position."""
    for page in payload.get("pages") or []:
        page_no = int(page.get("page_no") or 0)
        for sentence_no, sentence in enumerate(page.get("sentences") or [], start=1):
            yield {
                "id": sentence_id(book, page_no, sentence_no),
                "page_no": page_no,
                "sentence_no": sentence_no,
                "text_en": str(sentence.get("text_en") or ""),
                "source": sentence,
            }


def _source_times_ms(sentence: dict[str, Any]) -> tuple[int | None, int | None]:
    start = sentence.get("start_ms")
    end = sentence.get("end_ms")
    if start is None and sentence.get("start_sec") is not None:
        start = round(float(sentence["start_sec"]) * 1000)
    if end is None and sentence.get("end_sec") is not None:
        end = round(float(sentence["end_sec"]) * 1000)
    try:
        return (int(start), int(end)) if start is not None and end is not None else (None, None)
    except (TypeError, ValueError):
        return None, None


def scaffold_book(book: int, *, data_dir: Path = DATA_DIR, output: Path | None = None) -> Path:
    """Create a sidecar annotation scaffold without changing book JSON."""
    payload = _load_json(book_path(book, data_dir))
    records: list[dict[str, Any]] = []
    for item in iter_book_sentences(payload, book):
        source = item["source"]
        start_ms, end_ms = _source_times_ms(source)
        audio = source.get("audio")
        records.append(
            {
                "id": item["id"],
                "text_en": item["text_en"],
                "zh": "",
                "audio": audio if isinstance(audio, str) and audio else None,
                "start_ms": start_ms,
                "end_ms": end_ms,
                "words": [],
                "glossary": list(source.get("glossary") or []),
                "translation_status": "missing",
                "word_timing_status": "missing" if audio else "not_applicable",
            }
        )
    target = Path(output) if output else annotation_path(book, data_dir)
    target.parent.mkdir(parents=True, exist_ok=True)
    document = {
        "schema_version": 1,
        "series": "minecraft",
        "book": int(book),
        "source_book": f"storybooks-minecraft/book{int(book)}.json",
        "status": "scaffold",
        "named_entities": OFFICIAL_TERMS,
        "sentences": records,
    }
    target.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return target


def _annotation_records(payload: dict[str, Any]) -> list[dict[str, Any]]:
    records = payload.get("sentences")
    return records if isinstance(records, list) else []


def validate_annotations(
    book: int,
    *,
    data_dir: Path = DATA_DIR,
    annotations: Path | None = None,
    require_zh: bool = False,
    require_words_when_audio: bool = False,
) -> dict[str, Any]:
    """Validate identity/source fields and return a machine-readable report."""
    book_file = book_path(book, data_dir)
    annotation_file = Path(annotations) if annotations else annotation_path(book, data_dir)
    errors: list[str] = []
    warnings: list[str] = []
    try:
        book_payload = _load_json(book_file)
    except (OSError, json.JSONDecodeError) as exc:
        return {"book": book, "errors": [f"book JSON unreadable: {exc}"], "warnings": []}
    try:
        annotation_payload = _load_json(annotation_file)
    except (OSError, json.JSONDecodeError) as exc:
        return {"book": book, "errors": [f"annotation JSON unreadable: {exc}"], "warnings": []}

    expected = list(iter_book_sentences(book_payload, book))
    expected_by_id = {item["id"]: item for item in expected}
    records = _annotation_records(annotation_payload)
    seen: set[str] = set()
    with_audio = 0
    with_zh = 0
    with_words = 0
    for index, record in enumerate(records):
        rid = str(record.get("id") or "")
        prefix = f"record[{index}]"
        if not ID_RE.fullmatch(rid):
            errors.append(f"{prefix}: invalid id {rid!r}")
        if rid in seen:
            errors.append(f"{prefix}: duplicate id {rid}")
        seen.add(rid)
        source = expected_by_id.get(rid)
        if source is None:
            errors.append(f"{prefix}: id {rid} is not present in book{book}")
            continue
        if record.get("text_en") != source["text_en"]:
            errors.append(f"{rid}: text_en differs from book JSON")
        source_audio = source["source"].get("audio")
        annotation_audio = record.get("audio")
        if annotation_audio != source_audio:
            errors.append(f"{rid}: audio path differs from book JSON")
        expected_start, expected_end = _source_times_ms(source["source"])
        actual_start, actual_end = record.get("start_ms"), record.get("end_ms")
        if expected_start is not None and actual_start != expected_start:
            errors.append(f"{rid}: start_ms differs from book JSON")
        if expected_end is not None and actual_end != expected_end:
            errors.append(f"{rid}: end_ms differs from book JSON")
        if actual_start is not None or actual_end is not None:
            try:
                if int(actual_start) < 0 or int(actual_end) < int(actual_start):
                    errors.append(f"{rid}: invalid source bounds {actual_start}..{actual_end}")
            except (TypeError, ValueError):
                errors.append(f"{rid}: source start_ms/end_ms must be integers")
        if source_audio:
            with_audio += 1
            if require_words_when_audio and not record.get("words"):
                errors.append(f"{rid}: audio sentence has no word timing")
        elif record.get("words"):
            errors.append(f"{rid}: word timing is present without an audio clip")
        words = record.get("words")
        if words is not None and not isinstance(words, list):
            errors.append(f"{rid}: words must be an array")
        elif isinstance(words, list) and words:
            with_words += 1
            last_end = -1
            for wi, word in enumerate(words):
                try:
                    start = int(word["start_ms"])
                    end = int(word["end_ms"])
                except (KeyError, TypeError, ValueError):
                    errors.append(f"{rid}: word[{wi}] lacks integer start_ms/end_ms")
                    continue
                if start < 0 or end < start:
                    errors.append(f"{rid}: word[{wi}] has invalid bounds {start}..{end}")
                if start < last_end:
                    errors.append(f"{rid}: word timing is not monotonic at word[{wi}]")
                last_end = max(last_end, end)
        zh = record.get("zh")
        if isinstance(zh, str) and zh.strip():
            with_zh += 1
            if PLACEHOLDER_RE.search(zh):
                errors.append(f"{rid}: zh contains a placeholder")
        elif require_zh:
            errors.append(f"{rid}: zh is missing")
        else:
            warnings.append(f"{rid}: zh is not filled")

    missing = [item["id"] for item in expected if item["id"] not in seen]
    errors.extend(f"missing annotation id {rid}" for rid in missing)
    report = {
        "book": int(book),
        "annotation_file": str(annotation_file),
        "expected_sentences": len(expected),
        "annotation_sentences": len(records),
        "with_audio": with_audio,
        "with_zh": with_zh,
        "with_words": with_words,
        "missing_ids": missing,
        "errors": errors,
        "warnings": warnings,
    }
    return report


def apply_annotations(
    book: int,
    *,
    data_dir: Path = DATA_DIR,
    annotations: Path | None = None,
    require_words_when_audio: bool = True,
) -> Path:
    """Merge a complete annotation file into a book, failing closed."""
    report = validate_annotations(
        book,
        data_dir=data_dir,
        annotations=annotations,
        require_zh=True,
        require_words_when_audio=require_words_when_audio,
    )
    if report["errors"]:
        raise ValueError("annotation validation failed: " + "; ".join(report["errors"][:8]))
    book_file = book_path(book, data_dir)
    annotation_file = Path(annotations) if annotations else annotation_path(book, data_dir)
    payload = _load_json(book_file)
    records = {record["id"]: record for record in _annotation_records(_load_json(annotation_file))}
    for item in iter_book_sentences(payload, book):
        target = item["source"]
        record = records[item["id"]]
        target["id"] = item["id"]
        target["zh"] = record["zh"].strip()
        target["words"] = list(record.get("words") or [])
        if record.get("glossary"):
            target["glossary"] = list(record["glossary"])
    book_file.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return book_file


def _print_report(report: dict[str, Any], *, as_json: bool = False) -> None:
    if as_json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return
    print(
        "book{book}: {annotation_sentences}/{expected_sentences} records; "
        "audio={with_audio}, zh={with_zh}, words={with_words}".format(**report)
    )
    for warning in report.get("warnings") or []:
        print("warning: " + warning)
    for error in report.get("errors") or []:
        print("error: " + error)


def main(argv: Iterable[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    for name in ("scaffold", "validate", "apply"):
        command = sub.add_parser(name)
        command.add_argument("--book", type=int, choices=range(1, BOOK_COUNT + 1), required=True)
        command.add_argument("--data-dir", type=Path, default=DATA_DIR)
        command.add_argument("--annotations", type=Path)
        command.add_argument("--json", action="store_true", dest="as_json")
    validate = sub.choices["validate"]
    validate.add_argument("--require-zh", action="store_true")
    validate.add_argument("--require-words-when-audio", action="store_true")
    apply = sub.choices["apply"]
    apply.add_argument("--allow-audio-without-words", action="store_true")
    args = parser.parse_args(list(argv) if argv is not None else None)
    if args.command == "scaffold":
        target = scaffold_book(args.book, data_dir=args.data_dir, output=args.annotations)
        print(f"scaffolded book{args.book}: {target}")
        return 0
    if args.command == "validate":
        report = validate_annotations(
            args.book,
            data_dir=args.data_dir,
            annotations=args.annotations,
            require_zh=args.require_zh,
            require_words_when_audio=args.require_words_when_audio,
        )
        _print_report(report, as_json=args.as_json)
        return 1 if report["errors"] else 0
    try:
        target = apply_annotations(
            args.book,
            data_dir=args.data_dir,
            annotations=args.annotations,
            require_words_when_audio=not args.allow_audio_without_words,
        )
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"apply failed: {exc}", file=sys.stderr)
        return 1
    print(f"applied book{args.book}: {target}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
