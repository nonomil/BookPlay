#!/usr/bin/env python3
"""《我的世界》扫描 PDF + MP3 -> BookPlay 翻页绘本资产。"""
from __future__ import annotations

import argparse
import json
import re
import shutil
import struct
import sys
from pathlib import Path
from typing import NamedTuple, Sequence

from PIL import Image


REPO = Path(__file__).resolve().parents[2]
CONTENT = REPO / "content"
ASSETS = CONTENT / "assets"
OUTPUT_DIR = CONTENT / "storybooks-minecraft"
SOURCE_DIR = REPO / "书籍资料库" / "《我的世界》分级读物" / "我的世界分级--pdf--mp3"
MP3_DIR = SOURCE_DIR / "Minecraft Young Readers Level 2我的世界分级阅读5册 -- mp3"
TOOLS_DIR = Path(__file__).resolve().parent
if str(TOOLS_DIR) not in sys.path:
    sys.path.insert(0, str(TOOLS_DIR))


class BookSpec(NamedTuple):
    slug: str
    title_en: str
    title_zh: str
    pdf_terms: tuple[str, ...]
    audio_terms: tuple[str, ...]


class SourceBook(NamedTuple):
    index: int
    slug: str
    title_en: str
    title_zh: str
    pdf_path: Path
    audio_path: Path | None


BOOK_SPECS = (
    BookSpec("escape-from-the-nether", "Escape from the Nether!", "逃出下界", ("escape", "nether"), ("escape", "nether")),
    BookSpec("mobs-in-the-overworld", "Mobs in the Overworld!", "主世界的生物", ("mobs", "overworld"), ("mobs", "overworld")),
    BookSpec("trouble-brewing", "Trouble Brewing!", "麻烦酿成", ("trouble", "brewing"), ("trouble", "brewing")),
    BookSpec("mobs-in-the-mansion", "Mobs in the Mansion", "林地府邸的生物", ("mobs", "mansion"), ("mobs", "mansion")),
    BookSpec("survival-mode", "Survival Mode", "生存模式", ("survival", "mode"), ("survival", "mode")),
)


def _name_tokens(path: Path) -> set[str]:
    return set(re.findall(r"[a-z0-9]+", path.stem.lower()))


def _find_by_terms(paths: Sequence[Path], terms: Sequence[str]) -> Path | None:
    required = set(terms)
    return next((path for path in paths if required <= _name_tokens(path)), None)


def body_source_pages(page_count: int) -> list[int]:
    """These scans repeat each spread twice; page 6 is the first story spread."""
    return list(range(6, min(page_count, 35), 2))


def pair_sources(
    pdf_paths: Sequence[Path],
    audio_paths: Sequence[Path],
) -> tuple[list[SourceBook], list[Path]]:
    pdfs = [Path(path) for path in pdf_paths]
    audios = [Path(path) for path in audio_paths]
    paired: list[SourceBook] = []
    used_audio: set[Path] = set()
    for index, spec in enumerate(BOOK_SPECS, start=1):
        pdf_path = _find_by_terms(pdfs, spec.pdf_terms)
        if pdf_path is None:
            continue
        audio_path = _find_by_terms(audios, spec.audio_terms)
        if audio_path is not None:
            used_audio.add(audio_path)
        paired.append(SourceBook(index, spec.slug, spec.title_en, spec.title_zh, pdf_path, audio_path))
    return paired, [path for path in audios if path not in used_audio]


def order_ocr_lines(
    texts: Sequence[str],
    scores: Sequence[float],
    boxes: Sequence[Sequence[float]],
    *,
    image_width: int,
    keep_halves: Sequence[str] = ("left", "right"),
) -> tuple[str, float]:
    halves: dict[str, list[tuple[float, float, float, float, str, float]]] = {"left": [], "right": []}
    for raw_text, raw_score, raw_box in zip(texts, scores, boxes):
        text = " ".join(str(raw_text).split()).strip()
        score = float(raw_score)
        if not text or score < 0.5 or re.fullmatch(r"\d{1,3}", text):
            continue
        x0, y0, x1, y1 = (float(value) for value in raw_box)
        half = "left" if (x0 + x1) / 2 < image_width / 2 else "right"
        halves[half].append((x0, y0, x1, y1, text, score))

    paragraphs: list[str] = []
    kept_scores: list[float] = []
    for half in keep_halves:
        fragments = sorted(halves.get(half, []), key=lambda item: ((item[1] + item[3]) / 2, item[0]))
        rows: list[dict] = []
        for fragment in fragments:
            center_y = (fragment[1] + fragment[3]) / 2
            height = max(fragment[3] - fragment[1], 1.0)
            if rows:
                row = rows[-1]
                tolerance = max(8.0, min(row["height"], height) * 0.58)
                if abs(center_y - row["center_y"]) <= tolerance:
                    row["items"].append(fragment)
                    count = len(row["items"])
                    row["center_y"] = ((row["center_y"] * (count - 1)) + center_y) / count
                    row["height"] = max(row["height"], height)
                    continue
            rows.append({"center_y": center_y, "height": height, "items": [fragment]})
        if rows:
            row_texts = []
            for row in rows:
                row_items = sorted(row["items"], key=lambda item: item[0])
                row_texts.append(" ".join(item[4] for item in row_items))
                kept_scores.extend(item[5] for item in row_items)
            paragraphs.append(" ".join(row_texts))
    confidence = round(sum(kept_scores) / len(kept_scores), 3) if kept_scores else 0.0
    return "\n".join(paragraphs), confidence


def crop_cover_to_content(image: Image.Image) -> Image.Image:
    import numpy as np

    def largest_run(indices):
        runs = np.split(indices, np.flatnonzero(np.diff(indices) > 1) + 1)
        return max(runs, key=len)

    rgb = image.convert("RGB")
    pixels = np.asarray(rgb, dtype=np.int16)
    nonwhite = np.max(255 - pixels, axis=2) > 24
    content_columns = np.flatnonzero(nonwhite.mean(axis=0) > 0.08)
    content_rows = np.flatnonzero(nonwhite.mean(axis=1) > 0.08)
    if not len(content_columns) or not len(content_rows):
        return rgb
    content_columns = largest_run(content_columns)
    content_rows = largest_run(content_rows)
    bbox = (
        int(content_columns[0]),
        int(content_rows[0]),
        int(content_columns[-1]) + 1,
        int(content_rows[-1]) + 1,
    )
    return rgb.crop(bbox)


def _assign_page_times(pages: list[dict], duration: float | None) -> None:
    if not duration or duration <= 0 or not pages:
        return
    weights = [max(len((page.get("text_en") or "").strip()), 1) for page in pages]
    total = float(sum(weights))
    elapsed = 0.0
    for page, weight in zip(pages, weights):
        page["start_sec"] = round(elapsed, 2)
        elapsed += duration * weight / total
        page["end_sec"] = round(elapsed, 2)
    pages[-1]["end_sec"] = round(duration, 2)


def _relative_source(path: Path) -> str:
    try:
        relative = path.resolve().relative_to(REPO.resolve())
    except ValueError:
        return str(path)
    return relative.as_posix()


def build_storybook_payload(
    source: SourceBook,
    pages: list[dict],
    *,
    audio_rel: str | None,
    duration: float | None,
) -> dict:
    from storybook_learning import attach_learning

    page_records = [dict(page) for page in pages]
    page_records, quiz = attach_learning(page_records)
    _assign_page_times(page_records, duration)
    return {
        "schema_version": 1,
        "storybook_id": f"minecraft_{source.slug}",
        "series": "minecraft",
        "book": source.index,
        "series_count": len(BOOK_SPECS),
        "layout": "spread_with_right_caption",
        "title": {"en": source.title_en, "zh": source.title_zh},
        "source_note": "原始 PDF 为重复跨页扫描；已去重并 OCR 提取英文字幕。素材仅供本机个人学习使用。",
        "sources": {
            "pdf": _relative_source(source.pdf_path),
            "mp3": _relative_source(source.audio_path) if source.audio_path else None,
        },
        "audio": audio_rel,
        "audio_duration_sec": duration,
        "pages": page_records,
        "quiz": quiz,
    }


def _mp3_duration_sec(path: Path) -> float | None:
    try:
        data = path.read_bytes()
    except OSError:
        return None
    index = data.find(b"Xing")
    if index < 0:
        index = data.find(b"Info")
    if index >= 0 and index + 16 <= len(data):
        flags = struct.unpack(">I", data[index + 4:index + 8])[0]
        position = index + 8
        if flags & 1:
            frames = struct.unpack(">I", data[position:position + 4])[0]
            if frames:
                return frames * 1152 / 44100
    return max(30.0, path.stat().st_size / 16000) if path.exists() else None


def _render_full_spread(doc, source_page: int, max_width: int = 1800) -> Image.Image:
    import pymupdf

    page = doc[source_page - 1]
    # Some optimized scans have CropBox coordinates a fraction outside MediaBox.
    # The document is opened read-only and discarded, so keep the in-memory page
    # on MediaBox instead of restoring an invalid source CropBox after rendering.
    page.set_cropbox(page.mediabox)
    scale = min(1.0, max_width / max(page.rect.width, 1))
    pixmap = page.get_pixmap(matrix=pymupdf.Matrix(scale, scale), alpha=False)
    return Image.frombytes("RGB", (pixmap.width, pixmap.height), pixmap.samples)


def _create_ocr():
    from paddleocr import PaddleOCR

    return PaddleOCR(
        lang="en",
        use_doc_orientation_classify=False,
        use_doc_unwarping=False,
        use_textline_orientation=False,
    )


def _ocr_spread(ocr, image: Image.Image, *, final_spread: bool) -> tuple[str, float]:
    import numpy as np

    results = ocr.predict(input=np.array(image.convert("RGB")))
    if not results:
        return "", 0.0
    record = results[0].json.get("res", {})
    return order_ocr_lines(
        record.get("rec_texts") or [],
        record.get("rec_scores") or [],
        record.get("rec_boxes") or [],
        image_width=image.width,
        keep_halves=("left",) if final_spread else ("left", "right"),
    )


def _cached_pages(output_path: Path) -> dict[int, dict]:
    if not output_path.exists():
        return {}
    try:
        payload = json.loads(output_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return {int(page["source_page"]): page for page in payload.get("pages") or [] if page.get("source_page")}


def _write_webp(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, "WEBP", quality=90, method=6)


def build_book(
    source: SourceBook,
    *,
    force_images: bool = False,
    force_ocr: bool = False,
    ocr_holder: list | None = None,
) -> dict:
    import pymupdf

    output_path = OUTPUT_DIR / f"book{source.index}.json"
    previous = {} if force_ocr else _cached_pages(output_path)
    asset_dir = ASSETS / "minecraft" / source.slug
    pages_dir = asset_dir / "pages"
    pages_dir.mkdir(parents=True, exist_ok=True)
    doc = pymupdf.open(source.pdf_path)
    try:
        cover_path = asset_dir / "cover.webp"
        if force_images or not cover_path.exists():
            _write_webp(crop_cover_to_content(_render_full_spread(doc, 1)), cover_path)

        pages: list[dict] = []
        source_pages = body_source_pages(len(doc))
        for position, source_page in enumerate(source_pages, start=1):
            image_path = pages_dir / f"p{position:02d}.webp"
            if force_images or not image_path.exists():
                spread = _render_full_spread(doc, source_page)
                _write_webp(spread, image_path)
            else:
                spread = Image.open(image_path).convert("RGB")

            cached = previous.get(source_page) or {}
            text_en = cached.get("text_en") if not force_ocr else None
            confidence = cached.get("ocr_confidence") if not force_ocr else None
            if not text_en:
                if ocr_holder is None:
                    ocr_holder = []
                if not ocr_holder:
                    ocr_holder.append(_create_ocr())
                text_en, confidence = _ocr_spread(
                    ocr_holder[0],
                    spread,
                    final_spread=position == len(source_pages),
                )
            if not text_en:
                raise RuntimeError(f"{source.title_en} source page {source_page}: OCR 未提取到正文")
            pages.append({
                "page_no": position,
                "source_page": source_page,
                "image": f"assets/minecraft/{source.slug}/pages/p{position:02d}.webp",
                "text_en": text_en,
                "ocr_confidence": confidence,
                "glossary": [],
            })
    finally:
        doc.close()

    audio_rel = None
    duration = None
    if source.audio_path:
        audio_path = asset_dir / "audio.mp3"
        if force_images or not audio_path.exists():
            shutil.copy2(source.audio_path, audio_path)
        audio_rel = f"assets/minecraft/{source.slug}/audio.mp3"
        duration = _mp3_duration_sec(audio_path)

    payload = build_storybook_payload(source, pages, audio_rel=audio_rel, duration=duration)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return payload


def write_catalog(books: Sequence[tuple[SourceBook, dict]]) -> Path:
    items = []
    for source, payload in books:
        items.append({
            "book": source.index,
            "episode": source.index,
            "title": payload["title"],
            "pages": len(payload.get("pages") or []),
            "has_audio": bool(payload.get("audio")),
            "cover": f"assets/minecraft/{source.slug}/cover.webp",
            "data": f"storybooks-minecraft/book{source.index}.json",
            "reader": "storybook",
        })
    catalog = {
        "schema_version": 1,
        "series": "minecraft",
        "story": "Minecraft Young Readers",
        "title": {"en": "Minecraft Young Readers", "zh": "《我的世界》分级读物"},
        "count": len(items),
        "unit_label": "本",
        "reader": "storybook",
        "episodes": items,
    }
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    path = OUTPUT_DIR / "catalog.json"
    path.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return path


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--book", type=int, choices=range(1, len(BOOK_SPECS) + 1))
    parser.add_argument("--force-images", action="store_true")
    parser.add_argument("--force-ocr", action="store_true")
    args = parser.parse_args()

    pdfs = sorted(SOURCE_DIR.glob("*.pdf"))
    audios = sorted(MP3_DIR.glob("*.mp3"))
    sources, unmatched_audio = pair_sources(pdfs, audios)
    if args.book:
        sources = [source for source in sources if source.index == args.book]
    if not sources:
        raise FileNotFoundError(f"没有在 {SOURCE_DIR} 找到可转换的 PDF")

    ocr_holder: list = []
    built: list[tuple[SourceBook, dict]] = []
    for source in sources:
        payload = build_book(
            source,
            force_images=args.force_images,
            force_ocr=args.force_ocr,
            ocr_holder=ocr_holder,
        )
        built.append((source, payload))
        print(f"ok book{source.index}: {source.title_en} ({len(payload['pages'])} spreads, audio={bool(payload['audio'])})")

    if args.book:
        all_sources, _ = pair_sources(pdfs, audios)
        all_built = []
        for source in all_sources:
            path = OUTPUT_DIR / f"book{source.index}.json"
            if path.exists():
                all_built.append((source, json.loads(path.read_text(encoding="utf-8"))))
        catalog_path = write_catalog(all_built)
    else:
        catalog_path = write_catalog(built)
    if unmatched_audio:
        print("unmatched audio: " + ", ".join(path.name for path in unmatched_audio))
    print(f"catalog {catalog_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
