#!/usr/bin/env python3
"""data/ 西游记 PDF+MP3 → 翻页有声绘本 JSON。

    python tools/pipeline_lf_episode.py --episode 1
    python tools/pipeline_lf_episode.py --all
"""
from __future__ import annotations

import argparse
import json
import shutil
import struct
from pathlib import Path

import pymupdf

from storybook_learning import CHOICES_EP1, GLOSSARY_EP1, QUIZ_EP1, attach_learning
from storybook_text import extract_page_text

DEMO = Path(__file__).resolve().parent.parent
REPO = DEMO.parent
DATA_SRC = REPO / "data"
PDF_DIR = DATA_SRC / "Journey to the West 制作故事书"
MP3_DIR = DATA_SRC / "Journey to the West MP3"


def mp3_duration_sec(path: Path) -> float | None:
    try:
        data = path.read_bytes()
    except OSError:
        return None
    if len(data) < 128:
        return None
    # Xing/Info frame (common CBR/VBR from encoders)
    idx = data.find(b"Xing")
    if idx < 0:
        idx = data.find(b"Info")
    if idx >= 0 and idx + 16 <= len(data):
        flags = struct.unpack(">I", data[idx + 4:idx + 8])[0]
        pos = idx + 8
        frames = None
        if flags & 1:
            frames = struct.unpack(">I", data[pos:pos + 4])[0]
            pos += 4
        # MPEG1 layer3 1152 samples; assume 44100 if we can read header
        if frames:
            hdr_at = data.find(b"\xff\xfb")
            sr = 44100
            if hdr_at >= 0:
                sr_idx = (data[hdr_at + 2] >> 2) & 0x03
                sr = {0: 44100, 1: 48000, 2: 32000}.get(sr_idx, 44100)
            return frames * 1152 / sr
    # fallback: file size / 16000 (~128kbps)
    return max(30.0, path.stat().st_size / 16000)


def assign_page_times(pages: list[dict], duration: float | None) -> list[dict]:
    if not duration or duration <= 0 or not pages:
        return pages
    weights = [max(len((p.get("text_en") or "").strip()), 1) for p in pages]
    total = float(sum(weights))
    t = 0.0
    for page, weight in zip(pages, weights):
        span = duration * weight / total
        page["start_sec"] = round(t, 2)
        t += span
        page["end_sec"] = round(t, 2)
    pages[-1]["end_sec"] = round(float(duration), 2)
    return pages


def title_from_pdf_stem(name: str) -> str:
    stem = Path(name).stem
    parts = [p.strip() for p in stem.split("_") if p.strip()]
    return parts[-1] if parts else stem.strip()


def list_episodes() -> list[int]:
    nums = []
    for p in PDF_DIR.glob("[0-9][0-9][0-9]_*.pdf"):
        nums.append(int(p.name[:3]))
    return sorted(set(nums))


def build_episode(n: int, force: bool = False) -> dict:
    pdfs = sorted(PDF_DIR.glob(f"{n:03d}_*.pdf"))
    mp3s = sorted(MP3_DIR.glob(f"{n:03d}. *.mp3")) or sorted(MP3_DIR.glob(f"{n:03d}*"))
    if not pdfs:
        raise FileNotFoundError(f"找不到第{n}集 PDF")
    pdf_path = pdfs[0]
    mp3_path = mp3s[0] if mp3s else None

    ep_dir = DEMO / "assets" / f"lf_ep{n}"
    pages_dir = ep_dir / "pages"
    pages_dir.mkdir(parents=True, exist_ok=True)

    doc = pymupdf.open(pdf_path)
    body_pages = []
    for i in range(len(doc)):
        t = extract_page_text(doc[i])
        if len(t) > 80 and "Copyright" not in t and "Level" not in t[:20]:
            body_pages.append((i + 1, t))
    if not body_pages:
        raise RuntimeError(f"第{n}集未探测到正文页")

    pages_json = []
    for page_no, text in body_pages:
        img_path = pages_dir / f"p{page_no:02d}.png"
        if force or not img_path.exists():
            pix = doc[page_no - 1].get_pixmap(matrix=pymupdf.Matrix(2.0, 2.0))
            pix.save(img_path)
        pages_json.append({
            "page_no": page_no,
            "image": f"assets/lf_ep{n}/pages/p{page_no:02d}.png",
            "text_en": text,
            "glossary": [],
        })

    audio_rel = None
    duration = None
    if mp3_path:
        audio_rel = f"assets/lf_ep{n}/audio_ep{n}.mp3"
        dst = DEMO / audio_rel
        if force or not dst.exists():
            shutil.copy(mp3_path, dst)
        duration = mp3_duration_sec(dst if dst.exists() else mp3_path)
        assign_page_times(pages_json, duration)

    title_en = title_from_pdf_stem(pdf_path.name)
    if not title_en:
        for i in range(min(2, len(doc))):
            t = doc[i].get_text().strip()
            if t:
                title_en = t.splitlines()[0].strip()
                break

    manual_map = GLOSSARY_EP1 if n == 1 else None
    manual_quiz = QUIZ_EP1 if n == 1 else None
    choice_map = CHOICES_EP1 if n == 1 else None
    pages_json, quiz = attach_learning(pages_json, manual_map, manual_quiz, choice_map)

    storybook = {
        "schema_version": 1,
        "storybook_id": f"lf_jttw_ep{n}",
        "episode": n,
        "title": {"en": title_en or f"Journey to the West {n}", "zh": f"西游记 第{n}集"},
        "source_note": "素材来自 data/ 西游记成套文件。个人使用。",
        "audio": audio_rel,
        "audio_duration_sec": duration,
        "pages": pages_json,
        "quiz": quiz,
    }
    out = DEMO / "data" / "storybooks" / f"ep{n}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(storybook, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    doc.close()
    return storybook


def repair_existing() -> int:
    nums = list_episodes()
    changed = 0
    for n in nums:
        pdfs = sorted(PDF_DIR.glob(f"{n:03d}_*.pdf"))
        path = DEMO / "data" / "storybooks" / f"ep{n}.json"
        if not pdfs or not path.exists():
            continue
        data = json.loads(path.read_text(encoding="utf-8"))
        data["title"] = {
            "en": title_from_pdf_stem(pdfs[0].name) or data.get("title", {}).get("en") or f"Journey to the West {n}",
            "zh": f"西游记 第{n}集",
        }
        manual_map = GLOSSARY_EP1 if n == 1 else None
        manual_quiz = QUIZ_EP1 if n == 1 else None
        choice_map = CHOICES_EP1 if n == 1 else None
        data["pages"], data["quiz"] = attach_learning(data.get("pages") or [], manual_map, manual_quiz, choice_map)
        assign_page_times(data["pages"], data.get("audio_duration_sec"))
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        changed += 1
    cat = write_catalog(nums)
    print(f"repaired {changed} storybooks; catalog {cat}")
    return 0


def write_catalog(episodes: list[int]) -> Path:
    items = []
    for n in episodes:
        path = DEMO / "data" / "storybooks" / f"ep{n}.json"
        if not path.exists():
            continue
        data = json.loads(path.read_text(encoding="utf-8"))
        # 封面优先用视频标题卡（assets/covers/epNNN.jpg），回退书页图
        cover = f"assets/covers/ep{n:03d}.jpg"
        if not (DEMO / cover).exists():
            cover = data["pages"][0]["image"] if data.get("pages") else None
        items.append({
            "episode": n,
            "title": data["title"],
            "pages": len(data.get("pages") or []),
            "has_audio": bool(data.get("audio")),
            "cover": cover,
            "data": f"data/storybooks/ep{n}.json",
        })
    catalog = {"schema_version": 1, "story": "Journey to the West", "count": len(items), "episodes": items}
    out = DEMO / "data" / "storybooks" / "catalog.json"
    out.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--episode", type=int)
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--repair", action="store_true", help="只改标题并重算生词/测验，不重渲页面")
    args = ap.parse_args()
    if args.repair:
        return repair_existing()
    if args.all:
        nums = list_episodes()
        for n in nums:
            build_episode(n, force=args.force)
            print(f"ok ep{n}")
        cat = write_catalog(nums)
        print(f"catalog {cat} ({len(nums)} eps)")
        return 0
    n = args.episode or 1
    book = build_episode(n, force=args.force)
    write_catalog(list_episodes())
    print(f"第{n}集完成: {len(book['pages'])} 页  audio={book['audio']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
