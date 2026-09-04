# -*- coding: utf-8 -*-
"""EP1 annotated intensive-reader PDF parser (TDD, local-only, no OCR).

Parses the text layer of each Little Fox annotated intensive-reader PDF
(per episode, halves 上/下) and produces the episode's
`content/lesson_guides/ep001/intensive-reader.json`:

- per-half: file name, sha256, page count, best-effort English dialogue
  reconstruction and the per-page Chinese text block
- side-vocabulary entries: term, IPA, part-of-speech, definition, source
  pages (term line kept per PDF page; def continuation across pages kept
  by an open-entry model)
- halves merged and deduplicated by normalized term, keeping every source
  page and half that contains the term

No PDF is rewritten; only pypdf + stdlib are used.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[2]
READER_DIR = ROOT / "data" / "02-西游记精读版台词本" / "1、带标注版PDF 108集"
STORY_DIR = ROOT / "content" / "dialogue_stories"
GUIDES_DIR = ROOT / "content" / "lesson_guides"

HAS_LATIN = re.compile(r"[A-Za-z]")
HAS_CJK = re.compile(r"[\u4e00-\u9fff]")
# term[IPA] with optional spaces, multi-word terms allowed; IPA may contain spaces
TERM_IPA = re.compile(r"^([A-Za-z][A-Za-z'\- ]*?)\s*\[([^\]]+)\]\s*$")
POS_HEAD = re.compile(r"^(vt?\.|vi\.|v\.|n\.|adj\.|adv\.|num\.|pron\.|prep\.|conj\.|interj\.|art\.)")
IGNORE = re.compile(r"单词数|扫码|英语动画|E0\d+\s*[:：]|西游记英文版台词精读|）[上下]\s*$")
FILE_SPLIT = re.compile(r"^(\d{3})\s+(.+?)\s*([上下])\.pdf$")


def norm_text(s: str) -> str:
    s = unicodedata.normalize("NFKC", (s or "").replace("\xa0", " "))
    return re.sub(r"\s+", " ", s).strip()


def norm_term(s: str) -> str:
    return norm_text((s or "").lower())


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def _is_latin_only(t: str) -> bool:
    return bool(HAS_LATIN.search(t)) and not bool(HAS_CJK.search(t))


def _is_cjk_only(t: str) -> bool:
    return bool(HAS_CJK.search(t)) and not bool(HAS_LATIN.search(t))


def _finalize_entry(e: dict) -> dict:
    def_lines = [norm_text(x) for x in e.get("def_lines", []) if norm_text(x)]
    def_text = " ".join(def_lines)
    pos = ""
    first = def_lines[0] if def_lines else ""
    m = POS_HEAD.match(first)
    if m:
        pos = m.group(1)
    return {
        "term": e["term"],
        "ipa": e["ipa"],
        "pos": pos,
        "def": def_text,
        "pages": sorted(set(e["pages"])),
        "half": e["half"],
    }


def extract_half(pdf_path: Path, half: str) -> dict:
    """Parse one annotated PDF (上/下) into a per-half record."""
    if not pdf_path.is_file():
        raise FileNotFoundError(f"intensive reader PDF missing: {pdf_path}")
    reader = PdfReader(str(pdf_path))
    pages = len(reader.pages)

    normalized = norm_text(pdf_path.stem)
    m = FILE_SPLIT.match(normalized)
    episode = int(m.group(1)) if m else None

    entries: list[dict] = []
    open_entry: dict | None = None
    last_entry: dict | None = None
    unattached_defs: list[dict] = []
    english_parts: list[str] = []
    chinese_parts: list[str] = []
    in_english = False
    section_head = None  # last line that began a section (paragraph/def) on this page

    def flush() -> None:
        nonlocal open_entry, last_entry
        if open_entry is not None:
            entries.append(_finalize_entry(open_entry))
            last_entry = entries[-1]
            open_entry = None

    for pno, page in enumerate(reader.pages, start=1):
        # each page restarts its section flow: chinese paragraph -> vocab -> english
        section_head = None
        in_english = False
        page_lines = [norm_text(l) for l in (page.extract_text() or "").splitlines()]
        page_lines = [l for l in page_lines if l and not IGNORE.search(l)]
        page_lines = _merge_open_brackets(page_lines)
        for li, t in enumerate(page_lines):
            if not in_english:
                tm = TERM_IPA.match(t)
                if tm and not HAS_CJK.search(tm.group(1)):
                    flush()
                    open_entry = {
                        "term": norm_term(tm.group(1)),
                        "ipa": tm.group(2).strip(),
                        "def_lines": [],
                        "pages": [pno],
                        "half": half,
                    }
                    section_head = "term"
                    continue
                if _is_latin_only(t):
                    if POS_HEAD.match(t):
                        # bare POS tag line (e.g. "adj." / "v.") is a
                        # definition continuation, not the English dialogue
                        if open_entry is not None:
                            open_entry["def_lines"].append(t)
                            section_head = "def"
                        elif last_entry is not None and not last_entry["def"]:
                            last_entry["def"] = re.sub(r"\s+", " ", (last_entry["def"] + " " + t)).strip()
                            section_head = "def"
                        else:
                            unattached_defs.append({"page": pno, "text": t})
                            section_head = "def"
                        continue
                    if _lookahead_bracketed(page_lines, li + 1):
                        flush()
                        open_entry = {
                            "term": norm_term(t),
                            "ipa": "",
                            "def_lines": [],
                            "pages": [pno],
                            "half": half,
                        }
                        section_head = "term"
                        continue
                    # English section begins (dialogue with interleaved glosses)
                    in_english = True
                    english_parts.append(t)
                    section_head = "english"
                    continue
                # CJK line: paragraph prose vs definition line
                if section_head == "term" or POS_HEAD.match(t) or (open_entry is not None and not _is_prose(t)):
                    if open_entry is None:
                        # definition continuation after an english flush / page
                        # break belongs to the last entry that still lacks a def
                        if last_entry is not None and not last_entry["def"]:
                            last_entry["def"] = re.sub(r"\s+", " ", (last_entry["def"] + " " + t)).strip()
                            section_head = "def"
                            continue
                        # unanchored fragment: keep it reviewable, never fake a term
                        unattached_defs.append({"page": pno, "text": t})
                        section_head = "def"
                        continue
                    open_entry["def_lines"].append(t)
                    section_head = "def"
                else:
                    chinese_parts.append(t)
                    section_head = "para"
                continue
            # English section: latin chunks and interleaved CJK glosses
            if _is_latin_only(t):
                english_parts.append(t)
            elif _is_cjk_only(t):
                chinese_parts.append(t)
    flush()

    english_text = re.sub(r"\s+", " ", " ".join(english_parts)).strip()
    chinese_text = " ".join(chinese_parts).strip()
    return {
        "half": half,
        "file": pdf_path.name,
        "sha256": sha256_file(pdf_path),
        "episode": episode if episode is not None else 0,
        "pages": pages,
        "english_text": english_text,
        "chinese_text": chinese_text,
        "vocab": entries,
        "vocab_count": len(entries),
        "unattached_defs": unattached_defs,
    }


def _is_prose(t: str) -> bool:
    """Prose paragraph heuristic: long line or ends with sentence punctuation."""
    return len(t) >= 24 or bool(re.search(r"[。？！，；：」』]$", t))


def _lookahead_bracketed(lines: list[str], start: int) -> bool:
    """A bare term line is followed (within 3 lines) by a bracketed term line."""
    for j in range(start, min(start + 3, len(lines))):
        if TERM_IPA.match(lines[j]):
            return True
    return False


def _merge_open_brackets(lines: list[str]) -> list[str]:
    """Join lines whose open bracket is closed on a later line (term[IPA] spans)."""
    out: list[str] = []
    pending: str | None = None
    for t in lines:
        if pending is None:
            if t.count("[") > t.count("]"):
                pending = t
            else:
                out.append(t)
            continue
        pending = pending + " " + t
        if pending.count("]") >= pending.count("["):
            out.append(re.sub(r"\s+", " ", pending))
            pending = None
    if pending is not None:
        out.append(pending)
    return out


def merge_halves(*half_records: dict) -> list[dict]:
    """Merge per-half vocab by normalized term; keep every source page/half."""
    merged: dict[str, dict] = {}
    for rec in half_records:
        for v in rec["vocab"]:
            key = v["term"]
            if key not in merged:
                out = {
                    "term": v["term"],
                    "ipa": v["ipa"],
                    "pos": v["pos"],
                    "def": v["def"],
                    "pages": list(v["pages"]),
                    "half": v["half"],
                    "halves": [v["half"]],
                }
                merged[key] = out
            else:
                m = merged[key]
                m["pages"] = sorted(set(m["pages"]) | set(v["pages"]))
                if v["half"] not in m["halves"]:
                    m["halves"].append(v["half"])
                if not m["ipa"] and v["ipa"]:
                    m["ipa"] = v["ipa"]
                if not m["def"] and v["def"]:
                    m["def"] = v["def"]
                if not m["pos"] and v["pos"]:
                    m["pos"] = v["pos"]
    return list(merged.values())


def episode_files(episode: int) -> list[Path]:
    """Reader PDF pair for one episode, locked by leading 3 digits."""
    if not 1 <= episode <= 108:
        raise SystemExit(f"BLOCKED: episode out of range (got {episode})")
    found = sorted(Path(READER_DIR).glob(f"{episode:03d}*.pdf"))
    if len(found) != 2:
        raise FileNotFoundError(f"reader pair ep{episode}: expected exactly 2 PDFs, found {len(found)} in {READER_DIR}")
    return found


def episode_title(episode: int, pdf_names: list[str]) -> dict:
    """zh title from the PDF filename chunk; en title from the dialogue story."""
    zh = ""
    for name in pdf_names:
        m = re.match(r"^\d{3}\s+(.*?)\s*[上下]\.pdf$", name)
        if m and not zh:
            zh = m.group(1).strip()
            break
    en = ""
    story = STORY_DIR / f"ep{episode}.json"
    if story.is_file():
        try:
            data = json.loads(story.read_text(encoding="utf-8"))
            en = ((data.get("title") or {}).get("en") or "").strip()
            zh = zh or ((data.get("title") or {}).get("zh") or "").strip()
        except Exception:  # noqa: BLE001 - fall back to filename title
            pass
    return {"en": en, "zh": zh}


def build_episode_intensive_reader(episode: int, reader_dir: str | Path | None = None) -> dict:
    """Parse one episode's 上/下 reader pair into the intensive-reader dict."""
    if not 1 <= episode <= 108:
        raise SystemExit(f"BLOCKED: episode out of range (got {episode})")
    base = Path(reader_dir) if reader_dir else READER_DIR
    pdfs = sorted(base.glob(f"{episode:03d}*.pdf"))
    if len(pdfs) != 2:
        raise FileNotFoundError(f"reader pair ep{episode}: expected exactly 2 PDFs, found {len(pdfs)} in {base}")
    halves = []
    for p in pdfs:
        m = re.search(r"([上下])\.pdf$", p.name)
        half = "up" if (m and m.group(1) == "上") else "down"
        halves.append(extract_half(p, half))
    halves.sort(key=lambda h: 0 if h["half"] == "up" else 1)
    vocab = merge_halves(*halves)
    title = episode_title(episode, [h["file"] for h in halves])
    return {
        "schema_version": 1,
        "episode": episode,
        "title": title,
        "halves": [
            {
                "half": h["half"],
                "file": h["file"],
                "sha256": h["sha256"],
                "pages": h["pages"],
                "english_text": h["english_text"],
                "chinese_text": h["chinese_text"],
            }
            for h in halves
        ],
        "vocab": vocab,
        "vocab_count": len(vocab),
        "source": {
            "kind": "intensive_reader_pdf_text_layer",
            "directory": str(base),
            "parser": "intensive-reader-v1",
        },
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


def write_reader(episode: int, reader_dir: str | Path | None = None) -> Path:
    data = build_episode_intensive_reader(episode, reader_dir)
    out_dir = GUIDES_DIR / f"ep{episode:03d}"
    out_dir.mkdir(parents=True, exist_ok=True)
    dest = out_dir / "intensive-reader.json"
    dest.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return dest


def parse_episodes_arg(raw: str) -> list[int]:
    """'all' -> 1..108; '11' -> [11]; '1-10' -> [1..10]."""
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
        dest = write_reader(ep)
        print(f"intensive reader ep{ep:03d} -> {dest}")


if __name__ == "__main__":
    main()


if __name__ == "__main__":
    main()