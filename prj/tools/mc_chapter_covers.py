# -*- coding: utf-8 -*-
"""Derive chapter cover images for Minecraft readers from their page art.

Each chapter's cover is cropped from the art side of the chapter's first
page (the pages are full-bleed illustrations with the English text block on
the right, so the left ~60% keeps the characters and drops the text).
Covers are written to ``assets/minecraft/<slug>/chapters/ch-<n>.webp`` and
referenced from each chapter entry (``cover`` field) so the route map nodes
can show real story art instead of an empty frame.

Usage:
  python -X utf8 prj/tools/mc_chapter_covers.py            # all books
  python -X utf8 prj/tools/mc_chapter_covers.py --only 1
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
CONTENT = ROOT / "content"
DATA = CONTENT / "storybooks-minecraft"

BOOKS = (1, 2, 3, 4, 5)
CROP_LEFT_FRACTION = 0.54   # page text sits on the right; art is on the left
COVER_RATIO = 4 / 3
COVER_WIDTH = 400


def make_cover(page_path: Path, out_path: Path) -> None:
    img = Image.open(page_path).convert("RGB")
    width, height = img.size
    crop_w = int(width * CROP_LEFT_FRACTION)
    crop_h = int(crop_w / COVER_RATIO)
    if crop_h > height:
        crop_h = height
        crop_w = int(crop_h * COVER_RATIO)
    x0 = 0
    y0 = max(0, (height - crop_h) // 2)
    cover = img.crop((x0, y0, x0 + crop_w, y0 + crop_h))
    cover = cover.resize((COVER_WIDTH, round(COVER_WIDTH * crop_h / crop_w)), Image.LANCZOS)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    cover.save(out_path, "WEBP", quality=82, method=6)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--only", type=int, help="process one book number")
    args = parser.parse_args()
    books = (args.only,) if args.only else BOOKS

    for book_no in books:
        path = DATA / f"book{book_no}.json"
        book = json.loads(path.read_text(encoding="utf-8"))
        pages = {int(p["page_no"]): p for p in book.get("pages") or []}
        # book JSON has no slug field; derive it from the page image paths
        slug = None
        for _p in pages.values():
            rel = str(_p.get("image") or "")
            if "/pages/" in rel:
                slug = rel.split("/pages/")[0].rsplit("/", 1)[-1]
                break
        if not slug:
            print(f"book{book_no}: cannot derive slug, skip")
            continue
        chapters = book.get("chapters") or []
        if not chapters:
            print(f"book{book_no}: no chapters, skip")
            continue
        made = 0
        for ch in chapters:
            first = pages.get(int(ch["from"]))
            if not first or not first.get("image"):
                continue
            page_path = CONTENT / first["image"]
            out_rel = f"assets/minecraft/{slug}/chapters/ch-{int(ch['index']):02d}.webp"
            make_cover(CONTENT / page_path, CONTENT / out_rel)
            ch["cover"] = out_rel
            made += 1
        path.write_text(json.dumps(book, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"book{book_no}: {made} chapter covers -> {slug}/chapters/", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
