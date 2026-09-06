# -*- coding: utf-8 -*-
"""Snap Mikey & JJ speech-bubble annotations onto the actual comic bubbles.

The hand/OCR-derived ``bubble`` boxes in ``bookN.json`` (mirrored in the
speaking-annotation sidecars) drift away from the real white speech bubbles
drawn on the page art, so the reader's locator frame lands on empty artwork.
This tool re-detects each page's white bubbles (near-white mask + targeted
morphological closing + connected components) and snaps every sentence bubble
to the component that best contains its original box. Speaker, tail and
variant metadata are preserved; only x/y/w/h change.

Usage:
  python -X utf8 prj/tools/mikey_jj_bubble_refine.py --dry-run --qa
  python -X utf8 prj/tools/mikey_jj_bubble_refine.py
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import cv2
import numpy as np
from math import log2

ROOT = Path(__file__).resolve().parents[2]
CONTENT = ROOT / "content"
ASSET_ROOT = CONTENT / "assets" / "mikey-jj"
DATA_ROOT = CONTENT / "storybooks-mikey-jj"

BOOKS: tuple[dict[str, object], ...] = (
    {"book": 1, "slug": "zombie-school-adventure", "annotations": "speaking-annotations-book1.json"},
    {"book": 2, "slug": "water-house-adventure", "annotations": "speaking-annotations.json"},
    {"book": 3, "slug": "penguin-adventure", "annotations": "speaking-annotations-book3.json"},
    {"book": 5, "slug": "tornado-adventure", "annotations": "speaking-annotations-book5.json"},
    {"book": 6, "slug": "godzilla-adventure", "annotations": "speaking-annotations-book6.json"},
    {"book": 7, "slug": "piglin-adventure", "annotations": "speaking-annotations-book7.json"},
    {"book": 8, "slug": "burger-shop-adventure", "annotations": "speaking-annotations-book8.json"},
    {"book": 9, "slug": "scary-cat-adventure", "annotations": "speaking-annotations-book9.json"},
    {"book": 10, "slug": "cruise-ship-adventure", "annotations": "speaking-annotations-book10.json"},
    {"book": 11, "slug": "noob-to-king-adventure", "annotations": "speaking-annotations-book11.json"},
)

WHITE_MIN = 190
WHITE_SPREAD = 32
CLOSE_KERNEL = (19, 7)
MIN_AREA_FRACTION = 0.0015
MAX_AREA_FRACTION = 0.14
MIN_FILL = 0.30
MIN_SCORE = 0.15
PAD_FRACTION = 0.004
EXPAND_FRACTION = 1.0
LOOKAHEAD = 2
AREA_RATIO_RANGE = (0.45, 12.0)
TEXT_DARK_MIN = 110
TEXT_RATIO_RANGE = (0.02, 0.45)


def detect_bubble_components(page_path: Path) -> tuple[list[tuple[int, int, int, int]], object]:
    """Return (candidate bubble bboxes, decoded BGR image)."""
    # cv2.imread cannot open non-ASCII Windows paths; decode the bytes instead.
    data = np.fromfile(str(page_path), dtype=np.uint8)
    img = cv2.imdecode(data, cv2.IMREAD_COLOR)
    if img is None:
        raise FileNotFoundError(f"page image unreadable: {page_path}")
    height, width = img.shape[:2]
    b, g, r = (img[:, :, i].astype(int) for i in (0, 1, 2))
    mx = np.maximum(np.maximum(b, g), r)
    mn = np.minimum(np.minimum(b, g), r)
    mask = ((mn >= WHITE_MIN) & (mx - mn <= WHITE_SPREAD)).astype(np.uint8) * 255
    # Remove the white page margin before closing: bright scenes let the
    # closing operation bridge bubbles across the panel border into the
    # margin, which turns everything into one huge component.
    raw_count, raw_labels, raw_stats, _ = cv2.connectedComponentsWithStats(mask, 8)
    for i in range(1, raw_count):
        x, y, w, h, area = (int(v) for v in raw_stats[i])
        touches_border = x == 0 or y == 0 or x + w >= width or y + h >= height
        if touches_border and area > 0.02 * width * height:
            mask[raw_labels == i] = 0
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, CLOSE_KERNEL)
    closed = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=1)
    count, _labels, stats, _centroids = cv2.connectedComponentsWithStats(closed, 8)
    boxes: list[tuple[int, int, int, int]] = []
    for i in range(1, count):
        x, y, w, h, area = (int(v) for v in stats[i])
        area_fraction = area / (width * height)
        if area_fraction < MIN_AREA_FRACTION or area_fraction > MAX_AREA_FRACTION:
            continue
        if w > 0.9 * width or h > 0.9 * height:
            continue  # page margin / panel-spanning merge
        if area / (w * h) < MIN_FILL:
            continue
        boxes.append((x, y, w, h))
    return boxes, img


def expand_box(
    ann: dict[str, float], fraction: float
) -> tuple[float, float, float, float]:
    grow_x = ann["w"] * fraction
    grow_y = ann["h"] * fraction
    return (
        ann["x"] - grow_x,
        ann["y"] - grow_y,
        ann["x"] + ann["w"] + grow_x,
        ann["y"] + ann["h"] + grow_y,
    )


def reading_order(boxes: list[tuple[int, int, int, int]]) -> list[tuple[int, int, int, int]]:
    """Sort bubble boxes the way comics are read: top-to-bottom rows, left-to-right
    within a row. Rows are clustered by vertical centre so near-equal y values
    on the same line keep their left-to-right order."""
    if not boxes:
        return []
    ordered = sorted(boxes, key=lambda b: (b[1] + b[3] / 2, b[0]))
    rows: list[list[tuple[int, int, int, int]]] = [[ordered[0]]]
    for box in ordered[1:]:
        prev = rows[-1][-1]
        same_row = abs((box[1] + box[3] / 2) - (prev[1] + prev[3] / 2)) < max(box[3], prev[3]) * 0.6
        if same_row:
            rows[-1].append(box)
        else:
            rows.append([box])
    result: list[tuple[int, int, int, int]] = []
    for row in rows:
        result.extend(sorted(row, key=lambda b: b[0]))
    return result


def expanded_coverage(
    ann: dict[str, float], box: tuple[int, int, int, int], width: int, height: int
) -> float:
    """Fraction of the candidate bubble covered by the expanded annotation box."""
    ex0, ey0, ex1, ey1 = expand_box(ann, EXPAND_FRACTION)
    x, y, w, h = box
    ix0 = max(ex0, x / width)
    iy0 = max(ey0, y / height)
    ix1 = min(ex1, (x + w) / width)
    iy1 = min(ey1, (y + h) / height)
    inter = max(0.0, ix1 - ix0) * max(0.0, iy1 - iy0)
    return inter / max(1e-6, (w / width) * (h / height))


def has_text(img, box: tuple[int, int, int, int]) -> bool:
    """A real speech bubble contains dark glyph strokes; plain white props
    (shirts, couches, crates, TV frames) do not. Halftone shading dots are
    small isolated specks, so an opening pass removes them before counting."""
    x, y, w, h = box
    height, width = img.shape[:2]
    x0, y0 = max(0, x), max(0, y)
    x1, y1 = min(width, x + w), min(height, y + h)
    if x1 <= x0 or y1 <= y0:
        return False
    crop = img[y0:y1, x0:x1]
    dark = (crop.min(axis=2) < TEXT_DARK_MIN).astype(np.uint8)
    # Glyph strokes show up as many small dark blobs; prop outlines are a
    # handful of long thin blobs, and halftone dots are far below the size
    # window, so counting mid-size blobs separates bubbles from props.
    count, labels, stats, _ = cv2.connectedComponentsWithStats(dark, 8)
    glyph_blobs = 0
    for i in range(1, count):
        area = int(stats[i, cv2.CC_STAT_AREA])
        if 30 <= area <= 3000:
            glyph_blobs += 1
    return glyph_blobs >= 6


def snap_box(
    ann: dict[str, float], components: list[tuple[int, int, int, int]], width: int, height: int
) -> tuple[dict[str, float] | None, float]:
    ex0, ey0, ex1, ey1 = expand_box(ann, EXPAND_FRACTION)
    earea = max(1.0, (ex1 - ex0) * (ey1 - ey0))
    best = None
    best_score = 0.0
    for x, y, w, h in components:
        ix0, iy0 = max(ex0, x / width), max(ey0, y / height)
        ix1, iy1 = min(ex1, (x + w) / width), min(ey1, (y + h) / height)
        inter = max(0.0, ix1 - ix0) * max(0.0, iy1 - iy0)
        if inter <= 0:
            continue
        # Fraction of the candidate bubble covered by the expanded annotation:
        # robust both for tight hand-tuned boxes and for the coarse templated
        # grids in the later books.
        coverage = inter / max(1e-6, (w / width) * (h / height))
        if coverage > best_score:
            best_score = coverage
            best = (x, y, w, h)
    if best is None or best_score < MIN_SCORE:
        return None, best_score
    pad_x = width * PAD_FRACTION
    pad_y = height * PAD_FRACTION
    nx0 = max(0.0, (best[0] - pad_x) / width)
    ny0 = max(0.0, (best[1] - pad_y) / height)
    nx1 = min(1.0, (best[0] + best[2] + pad_x) / width)
    ny1 = min(1.0, (best[1] + best[3] + pad_y) / height)
    refined = {
        "x": round(float(nx0), 3),
        "y": round(float(ny0), 3),
        "w": round(float(nx1 - nx0), 3),
        "h": round(float(ny1 - ny0), 3),
    }
    return refined, best_score


def refine_book(item: dict[str, object], *, dry_run: bool, qa: bool) -> tuple[int, int, list[str]]:
    book_no = int(item["book"])
    slug = str(item["slug"])
    book_path = DATA_ROOT / f"book{book_no}.json"
    ann_path = DATA_ROOT / str(item["annotations"])
    book = json.loads(book_path.read_text(encoding="utf-8"))
    annotations = json.loads(ann_path.read_text(encoding="utf-8"))

    ann_by_id: dict[str, dict] = dict(annotations.get("annotations") or {})

    qa_dir = ROOT / "tmp" / "bubble-qa"
    if qa:
        qa_dir.mkdir(parents=True, exist_ok=True)

    matched = 0
    total = 0
    unmatched: list[str] = []
    for page in book.get("pages", []) or []:
        page_no = int(page.get("page_no") or 0)
        image_rel = page.get("image")
        if not image_rel:
            continue
        page_path = CONTENT / image_rel
        all_components, page_img = detect_bubble_components(page_path)
        height, width = page_img.shape[:2]
        components = [c for c in all_components if has_text(page_img, c)]
        ordered_components = reading_order(components)

        qa_image = None
        qa_draw = None
        if qa:
            from PIL import Image, ImageDraw

            qa_image = Image.open(page_path).convert("RGB")
            qa_draw = ImageDraw.Draw(qa_image)
            for x, y, w, h in components:
                qa_draw.rectangle([x, y, x + w, y + h], outline=(190, 190, 190), width=3)

        # Dialogue follows reading order, and template annotations only encode
        # the sentence index, so bubbles are assigned with a monotonic
        # sequence alignment: sentences in order, bubbles in reading order.
        # A bubble may host several sentences or stay unused (detection
        # misses), but the assignment never moves backwards. Cost combines
        # bubble-size expectation (total bubble area split by text length)
        # with the position overlap of the expanded annotation box.
        sentences = [s for s in (page.get("sentences") or []) if s.get("bubble")]
        if not sentences or not ordered_components:
            for sentence in sentences:
                unmatched.append(sentence.get("id") or f"p{page_no}-s?")
                total += 1
            continue

        areas = [(c[2] / width) * (c[3] / height) for c in ordered_components]
        lens = [max(4.0, len(s.get("text_en") or "")) for s in sentences]
        total_area = sum(areas) or 1e-6
        expected = [total_area * n / sum(lens) for n in lens]
        n, m = len(sentences), len(ordered_components)
        INF = float("inf")
        SKIP_BUBBLE = 0.4
        REUSE = 0.2
        dp = [[INF] * (m + 1) for _ in range(n + 1)]
        back = [[None] * (m + 1) for _ in range(n + 1)]
        for j in range(m + 1):
            dp[0][j] = 0.0
        for i in range(1, n + 1):
            ann = sentences[i - 1]["bubble"]
            for j in range(1, m + 1):
                box = ordered_components[j - 1]
                area = areas[j - 1]
                size_cost = abs(log2(max(1e-6, area) / expected[i - 1]))
                pos_cost = 2.5 * (1.0 - expanded_coverage(ann, box, width, height))
                match = size_cost + pos_cost
                best, step = dp[i - 1][j - 1] + match, "fresh"
                if dp[i - 1][j] + match + REUSE < best:
                    best, step = dp[i - 1][j] + match + REUSE, "reuse"
                if dp[i][j - 1] + SKIP_BUBBLE < best:
                    best, step = dp[i][j - 1] + SKIP_BUBBLE, "skip"
                dp[i][j] = best
                back[i][j] = step
        # Backtrack the assignment: sentence index -> bubble index.
        assign: dict[int, int] = {}
        i, j = n, m
        while i > 0:
            step = back[i][j]
            if step == "skip":
                j -= 1
                continue
            assign[i - 1] = j - 1
            i -= 1
            if step == "fresh":
                j -= 1

        for i, sentence in enumerate(sentences):
            total += 1
            ann = sentence["bubble"]
            if i not in assign:
                unmatched.append(sentence.get("id") or f"p{page_no}-s?")
                continue
            box = ordered_components[assign[i]]
            cov = expanded_coverage(ann, box, width, height)
            area = (box[2] / width) * (box[3] / height)
            if cov < 0.02 and abs(log2(max(1e-6, area) / expected[i])) > 2.0:
                unmatched.append(sentence.get("id") or f"p{page_no}-s?")
                continue
            x, y, w, h = box
            pad_x = width * PAD_FRACTION
            pad_y = height * PAD_FRACTION
            refined = {
                "x": round(max(0.0, (x - pad_x) / width), 3),
                "y": round(max(0.0, (y - pad_y) / height), 3),
                "w": round(min(1.0, (x + w + pad_x) / width) - max(0.0, (x - pad_x) / width), 3),
                "h": round(min(1.0, (y + h + pad_y) / height) - max(0.0, (y - pad_y) / height), 3),
            }
            matched += 1
            for key in ("x", "y", "w", "h"):
                ann[key] = refined[key]
            sidecar = ann_by_id.get(sentence.get("id") or "")
            if sidecar and sidecar.get("bubble"):
                for key in ("x", "y", "w", "h"):
                    sidecar["bubble"][key] = refined[key]
            if qa_draw is not None:
                qa_draw.rectangle(
                    [refined["x"] * width, refined["y"] * height,
                     (refined["x"] + refined["w"]) * width, (refined["y"] + refined["h"]) * height],
                    outline=(255, 0, 0), width=5,
                )

        if qa_image is not None:
            qa_image.save(qa_dir / f"{slug}-p{page_no:02d}.png")

    if not dry_run:
        book_path.write_text(json.dumps(book, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        ann_path.write_text(json.dumps(annotations, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return matched, total, unmatched


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="report without writing files")
    parser.add_argument("--qa", action="store_true", help="render tmp/bubble-qa/*.png overlays")
    args = parser.parse_args()
    grand_matched = grand_total = 0
    for item in BOOKS:
        matched, total, unmatched = refine_book(item, dry_run=args.dry_run, qa=args.qa)
        grand_matched += matched
        grand_total += total
        slug = str(item["slug"])
        status = "snapped" if not unmatched else f"kept-original {unmatched}"
        print(f"book{item['book']:>2} {slug}: {matched}/{total} {status}", flush=True)
    print(f"TOTAL snapped {grand_matched}/{grand_total}")
    if args.dry_run:
        print("DRY RUN - nothing written")
    return 0


if __name__ == "__main__":
    sys.exit(main())
