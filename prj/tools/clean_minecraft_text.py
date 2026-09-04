#!/usr/bin/env python3
"""Apply the small, explicitly reviewed OCR repairs in Minecraft books.

The PDF OCR occasionally left scan marks in the page text (for example
``7277`` and ``JQ``).  These are not translations and must not be silently
"fixed" by a fuzzy pass.  This utility only replaces the exact reviewed
strings below in both page-level and sentence-level text, then keeps the
annotation sidecars in lock-step with their source books.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


REPO = Path(__file__).resolve().parents[2]
DATA_DIR = REPO / "prj" / "data" / "storybooks-minecraft"

# Exact OCR artefacts reviewed against the source page images.  Do not add a
# broad regex here: a text change must be attributable to one visible token.
REPLACEMENTS = {
    "RA On the other side of the portal, they could see Byte.":
        "On the other side of the portal, they could see Byte.",
    "But there were other mobs living in the dark- I—hostile mobs!":
        "But there were other mobs living in the dark—hostile mobs!",
    "7277 Birch went to get some wood from a nearby tree.":
        "Birch went to get some wood from a nearby tree.",
    "Our heroes fell to the bottom I of a deep ravine.":
        "Our heroes fell to the bottom of a deep ravine.",
    "JQ Combining those with two golden carrots, Emmy brewed two potions of Night Vision!":
        "Combining those with two golden carrots, Emmy brewed two potions of Night Vision!",
    "Now they could finish their j journey.":
        "Now they could finish their journey.",
    "H \"We made it,\" said Emmy.":
        "\"We made it,\" said Emmy.",
    "H\n\"We made it,\" said Emmy.":
        "\"We made it,\" said Emmy.",
}


def _replace(value: Any) -> tuple[Any, int]:
    if not isinstance(value, str):
        return value, 0
    total = 0
    result = value
    for old, new in REPLACEMENTS.items():
        count = result.count(old)
        if count:
            result = result.replace(old, new)
            total += count
    return result, total


def _walk(node: Any) -> int:
    changed = 0
    if isinstance(node, dict):
        for key, value in list(node.items()):
            if key == "text_en":
                replacement, count = _replace(value)
                if count:
                    node[key] = replacement
                    changed += count
            else:
                changed += _walk(value)
    elif isinstance(node, list):
        for value in node:
            changed += _walk(value)
    return changed


def clean_book(book: int, *, data_dir: Path = DATA_DIR, write: bool = False) -> int:
    book_path = Path(data_dir) / f"book{book}.json"
    ann_path = Path(data_dir) / f"sentence-annotations-book{book}.json"
    total = 0
    for path in (book_path, ann_path):
        payload = json.loads(path.read_text(encoding="utf-8"))
        changed = _walk(payload)
        total += changed
        if write and changed:
            path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"{path.name}: {changed} reviewed OCR replacements" + (" (written)" if write and changed else ""))
    return total


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--book", type=int, choices=range(1, 6), action="append")
    parser.add_argument("--data-dir", type=Path, default=DATA_DIR)
    parser.add_argument("--write", action="store_true", help="write the reviewed replacements")
    args = parser.parse_args()
    books = args.book or list(range(1, 6))
    total = sum(clean_book(book, data_dir=args.data_dir, write=args.write) for book in books)
    print(f"total reviewed OCR replacements: {total}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
