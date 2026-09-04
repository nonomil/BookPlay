#!/usr/bin/env python3
"""校验 storybooks JSON 与页图/音频是否存在。"""
from __future__ import annotations

import json
import sys
from pathlib import Path

DEMO = Path(__file__).resolve().parent.parent
errors: list[str] = []


def check_book(path: Path) -> None:
    data = json.loads(path.read_text(encoding="utf-8"))
    if not data.get("pages"):
        errors.append(f"{path.name}: 无 pages")
        return
    for page in data["pages"]:
        img = DEMO / page["image"]
        if not img.exists():
            errors.append(f"{path.name}: 缺图 {page['image']}")
        if not page.get("text_en"):
            errors.append(f"{path.name}: 空文本 p{page.get('page_no')}")
    audio = data.get("audio")
    if audio and not (DEMO / audio).exists():
        errors.append(f"{path.name}: 缺音频 {audio}")


def main() -> int:
    root = DEMO / "data" / "storybooks"
    books = sorted(root.glob("ep*.json"))
    if not books:
        print("没有 ep*.json")
        return 1
    for p in books:
        check_book(p)
    cat = root / "catalog.json"
    if cat.exists():
        catalog = json.loads(cat.read_text(encoding="utf-8"))
        if catalog.get("count") != len(catalog.get("episodes") or []):
            errors.append("catalog count 与 episodes 不一致")
    if errors:
        print("\n".join(errors))
        return 1
    print(f"ok {len(books)} storybooks")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
