# -*- coding: utf-8 -*-
"""Episode courseware extractor (TDD, local-only, episodes 1-108).

Extracts each episode's locked main PPTX slide images in relationship order
into WebP under content/lesson_guides/epNNN/assets/ (never upscaled, longest
edge <= 1600), records teacher-courseware text/notes per page when the
teacher PPTX exists (explicit `unavailable` otherwise), and keeps the
screenshot/animation PPTX as metadata only — no frame export.  Writes
source-receipt.json and an image-embedded lesson.md.  NEVER writes
lesson.json (the lesson card pools are owned by build_lesson_guide).

Source discovery reuses prj.tools.courseware_sources including the locked
42/61/97 main-PPTX hashes; the G092 copy is never selected.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
import re
import sys
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from prj.tools import courseware_sources  # noqa: E402

NS_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
NS_PKG = "http://schemas.openxmlformats.org/package/2006/relationships"
NS_PRES = "http://schemas.openxmlformats.org/presentationml/2006/main"
NS_A = "http://schemas.openxmlformats.org/drawingml/2006/main"

DATA = ROOT / "data" / "西游记课件"
MAIN_PPTX = DATA / "3.3西游记  Journey to the West PPT课件" / "001_Journey to the West 1_The Monkey.pptx"
TEACHER_PPTX = DATA / "西游记外教培训11集课件" / "西游记外教E001.pptx"
SCREENSHOT_PPTX = DATA / "西游记-外教课动画截图" / "Journey to the West 001  The Monkey_20240106162142.pptx"
GUIDES_DIR = ROOT / "content" / "lesson_guides"


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def _q(tag: str, ns: str) -> str:
    return f"{{{ns}}}{tag}"


def ep_dir(episode: int) -> Path:
    return GUIDES_DIR / f"ep{episode:03d}"


def slide_files_in_order(zf: zipfile.ZipFile) -> list[str]:
    """Return ordered ppt/slides/slideN.xml names from presentation.xml sldIdLst."""
    pres_xml = ET.fromstring(zf.read("ppt/presentation.xml"))
    pres_rels_raw = zf.read("ppt/_rels/presentation.xml.rels")
    rels = ET.fromstring(pres_rels_raw)
    rid_to_target = {}
    for rel in rels:
        rid = rel.attrib.get("Id")
        target = rel.attrib.get("Target", "")
        if rid:
            rid_to_target[rid] = target.lstrip("/")
    order = []
    for sld in pres_xml.iter(_q("sldId", NS_PRES)):
        rid = sld.attrib.get(f"{{{NS_PKG}}}id") or sld.attrib.get("id")
        if not rid:
            continue
        target = rid_to_target.get(rid, "")
        if target.startswith("slides/") and target.endswith(".xml"):
            order.append("ppt/" + target)
    if order:
        return order
    # fallback: filename sort
    names = [n for n in zf.namelist() if re.fullmatch(r"ppt/slides/slide\d+\.xml", n)]
    return sorted(names, key=lambda n: int(re.search(r"(\d+)", n).group(1)))


def slide_image_media(zf: zipfile.ZipFile, slide_xml: str) -> dict | None:
    """First image relationship of one slide -> {relation_id, media_path}."""
    m = re.search(r"slides/(slide\d+)\.xml$", slide_xml)
    if not m:
        return None
    stem = m.group(1)
    rels_path = f"ppt/slides/_rels/{stem}.xml.rels"
    if rels_path not in zf.namelist():
        return None
    rels = ET.fromstring(zf.read(rels_path))
    images = []
    for rel in rels:
        typ = rel.attrib.get("Type", "")
        target = rel.attrib.get("Target", "")
        if "image" in typ.lower() and target:
            rid = rel.attrib.get("Id", "")
            if target.startswith("/"):
                target = target.lstrip("/")
            else:
                target = os.path.normpath(os.path.join("ppt/slides", target)).replace("\\", "/")
            images.append({"relation_id": rid, "media_path": target})
    if not images:
        return None
    images.sort(key=lambda r: r["relation_id"])
    return images[0]


def _to_webp_bytes(data: bytes, max_edge: int = 1600, quality: int = 82) -> tuple[bytes, int, int]:
    """Decode via Pillow, never upscale, encode WebP (no crop)."""
    from PIL import Image

    im = Image.open(io.BytesIO(data))
    if im.mode not in ("RGB", "RGBA"):
        im = im.convert("RGB")
    if im.mode == "RGBA":
        bg = Image.new("RGB", im.size, (255, 255, 255))
        bg.paste(im, mask=im.getchannel("A"))
        im = bg
    w, h = im.size
    longest = max(w, h)
    if longest > max_edge:
        scale = max_edge / longest
        im = im.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.LANCZOS)
    out = io.BytesIO()
    im.save(out, "WEBP", quality=quality, method=6)
    return out.getvalue(), im.size[0], im.size[1]


def main_slide_records(pptx_path: str | os.PathLike) -> list[dict]:
    """Order-stable records: {slide, output_name, source{...}}."""
    path = Path(pptx_path)
    records = []
    with zipfile.ZipFile(path) as zf:
        slides = slide_files_in_order(zf)
        media_index = set(zf.namelist())
        for idx, slide_xml in enumerate(slides, start=1):
            src = slide_image_media(zf, slide_xml)
            if src is None:
                continue
            if src["media_path"] not in media_index:
                continue
            records.append(
                {
                    "slide": idx,
                    "output_name": f"slide-{idx:03d}.webp",
                    "source": {
                        "relationship": src["relation_id"],
                        "media_path": src["media_path"],
                        "relation_id": src["relation_id"],
                    },
                }
            )
    return records


def _teacher_text_pages(zf: zipfile.ZipFile) -> list[dict]:
    pages = []
    slides = sorted(
        (n for n in zf.namelist() if re.fullmatch(r"ppt/slides/slide\d+\.xml", n)),
        key=lambda n: int(re.search(r"(\d+)", n).group(1)),
    )
    for slide in slides:
        m = re.search(r"slide(\d+)\.xml$", slide)
        page_no = int(m.group(1))
        texts: list[str] = []
        root = ET.fromstring(zf.read(slide))
        for t in root.iter(_q("t", NS_A)):
            if t.text:
                texts.append(t.text)
        notes: list[str] = []
        notes_path = f"ppt/notesSlides/notesSlide{page_no}.xml"
        if notes_path in zf.namelist():
            nroot = ET.fromstring(zf.read(notes_path))
            for t in nroot.iter(_q("t", NS_A)):
                if t.text:
                    notes.append(t.text)
        pages.append(
            {
                "page": page_no,
                "text_chars": sum(len(x) for x in texts),
                "text_preview": " ".join(texts)[:200],
                "notes_preview": " ".join(notes)[:200],
                "notes_available": bool(notes),
            }
        )
    return pages


def ocr_probe() -> dict:
    try:
        import pytesseract  # noqa: F401

        return {"status": "available", "provider": "pytesseract"}
    except Exception as exc:  # noqa: BLE001
        return {
            "status": "blocked",
            "provider": None,
            "reason": f"no local OCR provider importable (pytesseract missing): {exc}",
        }


def build_assets(records: list[dict], pptx_path: str | os.PathLike | None = None) -> list[dict]:
    """Render each record's media to WebP under target asset dir; returns records."""
    pptx_path = Path(pptx_path) if pptx_path else MAIN_PPTX
    out: list[dict] = []
    with zipfile.ZipFile(pptx_path) as zf:
        for rec in records:
            data = zf.read(rec["source"]["media_path"])
            webp, w, h = _to_webp_bytes(data)
            out.append(
                {
                    "slide": rec["slide"],
                    "output": rec["output_name"],
                    "media_path": rec["source"]["media_path"],
                    "relationship": rec["source"]["relation_id"],
                    "source_sha256": sha256_bytes(data),
                    "output_sha256": sha256_bytes(webp),
                    "width": w,
                    "height": h,
                    "_webp": webp,
                }
            )
    return out


def screenshot_meta(ocr: dict, episode: int = 1) -> dict:
    """ZIP metadata only for the episode screenshot PPTX; no frame export."""
    shots = courseware_sources.discover_screenshots_pptx(episode)
    if shots is None:
        return {
            "available": False,
            "file": None,
            "reason": "screenshot source unavailable for this episode",
        }
    with zipfile.ZipFile(shots) as zf:
        slide_names = [n for n in zf.namelist() if re.fullmatch(r"ppt/slides/slide\d+\.xml", n)]
        media_names = [n for n in zf.namelist() if n.startswith("ppt/media/")]
    return {
        "available": True,
        "file": str(shots),
        "sha256": sha256_file(shots),
        "pages": len(slide_names),
        "media_count": len(media_names),
        "ocr": ocr,
    }


def build_receipt(records: list[dict], assets: list[dict], ocr: dict, episode: int = 1) -> dict:
    cat = courseware_sources.catalog_episode(episode)
    main_src = cat["sources"]["main_pptx"]
    teacher_src = cat["sources"]["teacher_pptx"]

    if teacher_src.get("available"):
        with zipfile.ZipFile(teacher_src["file"]) as tzf:
            teacher_pages = _teacher_text_pages(tzf)
        teacher = {
            "file": teacher_src["file"],
            "sha256": teacher_src["sha256"],
            "pages": len(teacher_pages),
            "available": True,
            "text_available": True,
            "notes_available": any(p["notes_available"] for p in teacher_pages),
            "page_text": teacher_pages,
        }
    else:
        teacher = {
            "file": None,
            "available": False,
            "reason": teacher_src.get("reason", "teacher source unavailable for this episode"),
        }

    return {
        "schema_version": 1,
        "episode": episode,
        "extractor": "courseware-v1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "ocr": ocr,
        "sources": {
            "main": {
                "file": main_src["file"],
                "sha256": main_src["sha256"],
                "pages": main_src["pages"],
                "media_count": main_src.get("media_count", 0),
                "slides": assets,
            },
            "teacher": teacher,
            "screenshots": screenshot_meta(ocr, episode=episode),
        },
    }


def build_lesson_md(assets: list[dict], ocr: dict, episode: int = 1, main_file: str = "", main_pages: int = 0) -> str:
    lines = [
        f"# 豆豆龙英语 · 第 {episode} 集课件（EP{episode:03d} 草稿）\n",
        f"- 来源：`{Path(main_file).name or '主课件'}`（主课件，{main_pages} 页）",
        f"- OCR：`{ocr['status']}`"
        + (f"（{ocr['reason']}）" if ocr["status"] == "blocked" else ""),
        "- 分类：待人工审核（unknown）",
        "- 审核状态：`unreviewed`\n",
    ]
    for a in assets:
        lines += [
            f"## Slide {a['slide']:03d}",
            "",
            f"![slide-{a['slide']:03d}](assets/{a['output']})",
            "",
            f"- 来源：`{a['media_path']}`（relationship `{a['relationship']}`）",
            f"- 尺寸：{a['width']}×{a['height']}",
            f"- 源 SHA-256：`{a['source_sha256']}`",
            f"- 输出 SHA-256：`{a['output_sha256']}`",
            f"- 分类：unknown ｜ OCR：{ocr['status']} ｜ 审核：unreviewed",
            "",
        ]
    return "\n".join(lines)


def build_episode_receipt(episode: int, ocr: dict | None = None) -> dict:
    """Build (do not write) the receipt for one episode (no lesson.json touch)."""
    main = courseware_sources.discover_main_pptx(episode)
    records = main_slide_records(main)
    assets = build_assets(records, main)
    ocr = ocr if ocr is not None else ocr_probe()
    return build_receipt(records, assets, ocr, episode=episode)


def run_episode(episode: int) -> Path:
    """Generate assets + source-receipt.json + lesson.md for one episode."""
    if not 1 <= episode <= 108:
        raise SystemExit(f"BLOCKED: episode out of range (got {episode})")
    main = courseware_sources.discover_main_pptx(episode)
    out_dir = ep_dir(episode)
    assets_dir = out_dir / "assets"
    assets_dir.mkdir(parents=True, exist_ok=True)

    records = main_slide_records(main)
    print(f"ep{episode:03d} main slides: {len(records)}", flush=True)
    built = build_assets(records, main)
    assets_meta = []
    for a in built:
        webp = a.pop("_webp")
        dest = assets_dir / a["output"]
        dest.write_bytes(webp)
        assets_meta.append(a)

    ocr = ocr_probe()
    receipt = build_receipt(records, assets_meta, ocr, episode=episode)
    receipt_path = out_dir / "source-receipt.json"
    receipt_path.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    md = build_lesson_md(
        assets_meta,
        ocr,
        episode=episode,
        main_file=receipt["sources"]["main"]["file"],
        main_pages=receipt["sources"]["main"]["pages"],
    )
    (out_dir / "lesson.md").write_text(md, encoding="utf-8")
    return receipt_path


def run_ep1() -> Path:
    """Backward-compatible alias; never touches lesson.json."""
    return run_episode(1)


def parse_episodes_arg(raw: str) -> list[int]:
    """'all' -> 1..108; '2' -> [2]; '1-10' -> [1..10]."""
    raw = raw.strip()
    if raw == "all":
        out = list(range(1, 109))
    elif "-" in raw:
        a, b = raw.split("-", 1)
        out = list(range(int(a), int(b) + 1))
    else:
        out = [int(raw)]
    if any(ep < 1 or ep > 108 for ep in out):
        raise SystemExit(f"BLOCKED: episode out of range ({raw})")
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--episode", type=int, default=None)
    ap.add_argument("--episodes", type=str, default=None)
    ap.add_argument("--all", action="store_true")
    args = ap.parse_args()
    if args.all:
        eps = list(range(1, 109))
    elif args.episodes:
        eps = parse_episodes_arg(args.episodes)
    elif args.episode:
        eps = [args.episode]
    else:
        eps = [1]
    for ep in eps:
        dest = run_episode(ep)
        print(f"ep{ep:03d} receipt -> {dest}\n", flush=True)


if __name__ == "__main__":
    main()