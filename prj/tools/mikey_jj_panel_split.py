# -*- coding: utf-8 -*-
"""Detect the stacked-panel bands on Mikey & JJ comic pages.

Every published page is portrait art with two panels stacked vertically.
The reader can render one panel per screen so the artwork fills the stage
instead of shrinking the whole page into a narrow column. This tool finds
the white gutter between the panels (plus each panel's content bounds) and
writes a normalized ``panel`` array ``[top0, top1, bottom0, bottom1]`` into
each ``bookN.json`` page. Pages without a detectable gutter keep no field
and stay full-page.

Usage:
  python -X utf8 prj/tools/mikey_jj_panel_split.py --dry-run
  python -X utf8 prj/tools/mikey_jj_panel_split.py
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
CONTENT = ROOT / "content"
DATA_ROOT = CONTENT / "storybooks-mikey-jj"

BOOKS = (1, 2, 3, 5, 6, 7, 8, 9, 10, 11)

WHITE_MIN = 190
WHITE_SPREAD = 32
DARK_MAX = 70
GUTTER_MIN_ROWS = 8          # gutter is at least this many white rows
GUTTER_MIN_RATIO = 0.92      # a gutter row is almost entirely white
CONTENT_ROW_RATIO = 0.5      # a content row has fewer white pixels than this
GUTTER_SEARCH = (0.25, 0.75)  # the shared edge lives near the vertical middle


def load_page(page_path: Path):
    data = np.fromfile(str(page_path), dtype=np.uint8)
    img = cv2.imdecode(data, cv2.IMREAD_COLOR)
    if img is None:
        raise FileNotFoundError(f"page image unreadable: {page_path}")
    return img


def row_ratios(img) -> tuple[np.ndarray, np.ndarray]:
    """Per-row fraction of near-white and of uniform-dark pixels."""
    b, g, r = (img[:, :, i].astype(int) for i in (0, 1, 2))
    mx = np.maximum(np.maximum(b, g), r)
    mn = np.minimum(np.minimum(b, g), r)
    white = ((mn >= WHITE_MIN) & (mx - mn <= WHITE_SPREAD)).astype(np.float32)
    dark = (mx < DARK_MAX).astype(np.float32)
    return white.mean(axis=1), dark.mean(axis=1)


def find_gutter(ratios: np.ndarray) -> tuple[int, int] | None:
    return find_uniform_run(ratios)


def find_uniform_run(ratios: np.ndarray) -> tuple[int, int] | None:
    height = len(ratios)
    lo, hi = int(height * GUTTER_SEARCH[0]), int(height * GUTTER_SEARCH[1])
    best = None
    run_start = None
    for y in range(lo, hi + 1):
        if ratios[y] >= GUTTER_MIN_RATIO:
            if run_start is None:
                run_start = y
        else:
            if run_start is not None and y - run_start >= GUTTER_MIN_ROWS:
                center = (run_start + y - 1) / 2
                distance = abs(center - height / 2)
                if best is None or distance < best[0]:
                    best = (distance, run_start, y - 1)
            run_start = None
    if run_start is not None and hi + 1 - run_start >= GUTTER_MIN_ROWS:
        center = (run_start + hi) / 2
        distance = abs(center - height / 2)
        if best is None or distance < best[0]:
            best = (distance, run_start, hi)
    if best is None:
        return None
    return best[1], best[2]


def panel_bands(img) -> list[float] | None:
    """Return [top0, top1, bottom0, bottom1] normalized, or None."""
    height = img.shape[0]
    white, dark = row_ratios(img)
    # Panels sit on white page margins in bright books; night scenes separate
    # them with a solid black divider instead. Either uniform run works.
    gutter = find_gutter(white) or find_gutter(dark)
    if gutter is None:
        return None
    g0, g1 = gutter
    content_rows = np.flatnonzero(np.minimum(white, dark) < CONTENT_ROW_RATIO)
    if len(content_rows) == 0:
        return None
    top0 = int(content_rows[0])
    bottom1 = int(content_rows[-1]) + 1
    # keep each panel at least a quarter of the page tall
    if g0 - top0 < height * 0.25 or bottom1 - g1 < height * 0.25:
        return None
    return [
        round(top0 / height, 3),
        round(g0 / height, 3),
        round(g1 / height, 3),
        round(bottom1 / height, 3),
    ]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="report without writing files")
    args = parser.parse_args()
    split = kept = 0
    for book_no in BOOKS:
        book_path = DATA_ROOT / f"book{book_no}.json"
        book = json.loads(book_path.read_text(encoding="utf-8"))
        changed = False
        for page in book.get("pages", []) or []:
            image_rel = page.get("image")
            if not image_rel:
                continue
            band = panel_bands(load_page(CONTENT / image_rel))
            if band is None:
                kept += 1
                if "panel" in page:
                    del page["panel"]
                    changed = True
                continue
            split += 1
            if page.get("panel") != band:
                page["panel"] = band
                changed = True
        if changed and not args.dry_run:
            book_path.write_text(json.dumps(book, ensure_ascii=False, indent=1), encoding="utf-8")
        summary = " ".join(
            f"p{int(p.get('page_no') or 0)}={p.get('panel') or '-'}"
            for p in book.get("pages", []) or []
        )
        print(f"book{book_no}: {summary}", flush=True)
    print(f"TOTAL split-pages {split}, full-pages {kept}{' (dry run)' if args.dry_run else ''}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
