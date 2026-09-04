#!/usr/bin/env python3
"""Export/import the human-reviewed Minecraft sentence translation queue.

The queue is deliberately boring: stable sentence IDs, immutable English,
page context, glossary terms, and an explicit review status.  Import refuses
missing IDs, changed source text, placeholders, or empty translations, so a
machine-generated draft cannot accidentally become production learning data.
"""
from __future__ import annotations

import argparse
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable


REPO = Path(__file__).resolve().parents[2]
DATA_DIR = REPO / "prj" / "data" / "storybooks-minecraft"
PLACEHOLDER_RE = re.compile(r"(?:TODO|待翻译|待补|重点词|placeholder|lorem ipsum)", re.I)


def _load(path: Path) -> dict[str, Any]:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def _sidecar(book: int, data_dir: Path) -> Path:
    return Path(data_dir) / f"sentence-annotations-book{book}.json"


def _records(path: Path) -> list[dict[str, Any]]:
    payload = _load(path)
    return payload.get("sentences") if isinstance(payload.get("sentences"), list) else []


def export_queue(book: int, *, data_dir: Path = DATA_DIR, output: Path | None = None) -> Path:
    source = _sidecar(book, data_dir)
    records = _records(source)
    queue = {
        "schema_version": 1,
        "series": "minecraft",
        "book": int(book),
        "source_annotation": str(source.relative_to(REPO)) if source.is_relative_to(REPO) else str(source),
        "status": "needs-review" if any(not str(r.get("zh") or "").strip() for r in records) else "reviewed",
        "instructions": [
            "只填写 zh/reviewer/status，不改 id、text_en、audio 或词表。",
            "每页至少复核一句；专名使用 named_entities 中的固定译名。",
            "不得填写 TODO、待翻译、重点词或 HTML。",
        ],
        "sentences": [
            {
                "id": record.get("id"),
                "page_no": int(str(record.get("id", "")).split("-p")[-1].split("-")[0] or 0),
                "text_en": record.get("text_en", ""),
                "glossary_terms": [g.get("term") for g in record.get("glossary") or [] if g.get("term")],
                "zh": record.get("zh", ""),
                "status": record.get("translation_status", "missing"),
                "reviewer_note": record.get("reviewer_note", ""),
            }
            for record in records
        ],
    }
    target = Path(output) if output else REPO / "docs" / "generated" / "minecraft" / "translation-review" / f"book{book}.json"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(queue, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return target


def validate_queue(book: int, queue: dict[str, Any], *, data_dir: Path = DATA_DIR, require_zh: bool = True) -> list[str]:
    errors: list[str] = []
    expected = {record["id"]: record for record in _records(_sidecar(book, data_dir))}
    actual = queue.get("sentences") if isinstance(queue.get("sentences"), list) else []
    seen: set[str] = set()
    for index, record in enumerate(actual):
        rid = str(record.get("id") or "")
        if rid in seen:
            errors.append(f"record[{index}]: duplicate id {rid}")
        seen.add(rid)
        source = expected.get(rid)
        if source is None:
            errors.append(f"record[{index}]: unknown id {rid}")
            continue
        if record.get("text_en") != source.get("text_en"):
            errors.append(f"{rid}: text_en changed")
        zh = str(record.get("zh") or "").strip()
        if require_zh and not zh:
            errors.append(f"{rid}: zh is missing")
        if zh and PLACEHOLDER_RE.search(zh):
            errors.append(f"{rid}: zh contains a placeholder")
        status = str(record.get("status") or "")
        if zh and status not in {"reviewed", "approved"}:
            errors.append(f"{rid}: translated record must be status=reviewed/approved")
    for rid in expected:
        if rid not in seen:
            errors.append(f"missing id {rid}")
    return errors


def import_queue(book: int, queue_path: Path, *, data_dir: Path = DATA_DIR) -> Path:
    queue = _load(queue_path)
    errors = validate_queue(book, queue, data_dir=data_dir, require_zh=True)
    if errors:
        raise ValueError("translation queue validation failed: " + "; ".join(errors[:8]))
    sidecar_path = _sidecar(book, data_dir)
    payload = _load(sidecar_path)
    updates = {record["id"]: record for record in queue["sentences"]}
    now = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    for record in payload["sentences"]:
        update = updates[record["id"]]
        record["zh"] = str(update["zh"]).strip()
        record["translation_status"] = str(update.get("status") or "reviewed")
        record["reviewed_at"] = update.get("reviewed_at") or now
        if update.get("reviewer_note"):
            record["reviewer_note"] = str(update["reviewer_note"]).strip()
    payload["status"] = "enrichment-in-progress"
    sidecar_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return sidecar_path


def main(argv: Iterable[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    export = sub.add_parser("export")
    export.add_argument("--book", type=int, choices=range(1, 6), required=True)
    export.add_argument("--data-dir", type=Path, default=DATA_DIR)
    export.add_argument("--out", type=Path)
    validate = sub.add_parser("validate")
    validate.add_argument("--book", type=int, choices=range(1, 6), required=True)
    validate.add_argument("--data-dir", type=Path, default=DATA_DIR)
    validate.add_argument("--queue", type=Path, required=True)
    import_cmd = sub.add_parser("import")
    import_cmd.add_argument("--book", type=int, choices=range(1, 6), required=True)
    import_cmd.add_argument("--data-dir", type=Path, default=DATA_DIR)
    import_cmd.add_argument("--queue", type=Path, required=True)
    args = parser.parse_args(list(argv) if argv is not None else None)
    if args.command == "export":
        print(export_queue(args.book, data_dir=args.data_dir, output=args.out))
        return 0
    if args.command == "validate":
        errors = validate_queue(args.book, _load(args.queue), data_dir=args.data_dir)
        for error in errors:
            print("error: " + error)
        print(f"book{args.book}: {'valid' if not errors else 'invalid'}")
        return 1 if errors else 0
    try:
        print(import_queue(args.book, args.queue, data_dir=args.data_dir))
        return 0
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"import failed: {exc}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
