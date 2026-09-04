# -*- coding: utf-8 -*-
"""Attach each narration node the right-column words from its annotated PDF page."""
from __future__ import annotations

import json
import re
from pathlib import Path

from import_intensive_scripts import (
    SCRIPT_SIZE,
    near,
    page_spans,
    parse_lexicon,
)

import pymupdf

DEMO = Path(__file__).resolve().parent.parent
STORIES = DEMO / "data" / "dialogue_stories"
ANN_DIR = Path(r"G:\Game\BookPlay书戏\data\生词\1、带标注版PDF 108集")
FALLBACK = Path(r"G:\Game\BookPlay书戏\data\02-西游记精读版台词本\1、带标注版PDF 108集")
EP_RE = re.compile(r"^(\d{3})")
WORD_RE = re.compile(r"[A-Za-z][A-Za-z'’\-]*")


def list_pdfs() -> dict[int, list[Path]]:
    root = ANN_DIR if ANN_DIR.exists() else FALLBACK
    out: dict[int, list[Path]] = {}
    for p in root.glob("*.pdf"):
        m = EP_RE.match(p.name)
        if not m:
            continue
        out.setdefault(int(m.group(1)), []).append(p)
    for n in out:
        out[n].sort(key=lambda x: (0 if "上" in x.name else 1, x.name))
    return out


def tokens(s: str) -> set[str]:
    return {w.lower() for w in WORD_RE.findall(s or "") if len(w) > 2}


def page_english(spans: list[dict]) -> str:
    parts = [s["t"] for s in spans if s["x0"] < 400 and near(s["size"], SCRIPT_SIZE)]
    return " ".join(parts)


def extract_pages(pdfs: list[Path]) -> list[dict]:
    pages = []
    for pdf in pdfs:
        doc = pymupdf.open(pdf)
        for page in doc:
            spans = page_spans(page)
            words = []
            seen = set()
            for it in parse_lexicon(spans):
                key = it["term"].lower()
                if key in seen:
                    continue
                seen.add(key)
                words.append({
                    "term": it["term"],
                    "ipa": it.get("ipa") or "",
                    "def": it.get("def") or "",
                    "zh": it.get("zh") or "",
                })
            pages.append({"en": page_english(spans), "words": words})
    return pages


def overlap(a: set[str], b: set[str]) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / len(a)


def attach(n: int, pages: list[dict]) -> dict:
    path = STORIES / f"ep{n}.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    ptoks = [tokens(p["en"]) for p in pages]
    used = 0
    for node in data.get("nodes") or []:
        text = node.get("text_en") or ""
        if node.get("type") != "narration" or not text:
            node.pop("page_words", None)
            continue
        nt = tokens(text)
        best_i, best_s = -1, 0.0
        for i, pt in enumerate(ptoks):
            s = overlap(nt, pt)
            if s > best_s:
                best_s, best_i = s, i
        if best_i >= 0 and best_s >= 0.25 and pages[best_i]["words"]:
            node["page_words"] = pages[best_i]["words"]
            used += 1
        else:
            node.pop("page_words", None)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    lens = [len(n.get("page_words") or []) for n in data["nodes"] if n.get("page_words")]
    return {
        "ep": n,
        "pages": len(pages),
        "nodes": used,
        "avg_words": round(sum(lens) / len(lens), 1) if lens else 0,
        "max_words": max(lens) if lens else 0,
    }


def main() -> None:
    grouped = list_pdfs()
    print("pdf episodes", len(grouped), flush=True)
    rows = []
    for n in range(1, 109):
        pdfs = grouped.get(n) or []
        if not pdfs:
            print("missing", n, flush=True)
            continue
        row = attach(n, extract_pages(pdfs))
        rows.append(row)
        if n in (1, 2, 50, 108) or n % 20 == 0:
            print(row, flush=True)
    print(
        "done",
        "nodes", sum(r["nodes"] for r in rows),
        "avg", round(sum(r["avg_words"] for r in rows) / max(1, len(rows)), 1),
        flush=True,
    )


if __name__ == "__main__":
    main()
