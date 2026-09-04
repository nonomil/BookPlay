# -*- coding: utf-8 -*-
"""Import Little Fox intensive-reading PDF glosses + lexicon into ep*.json."""
from __future__ import annotations

import json
import re
from collections import Counter
from pathlib import Path

import pymupdf

DEMO = Path(__file__).resolve().parent.parent
STORIES = DEMO / "data" / "dialogue_stories"
ANN_DIR = Path(r"G:\Game\BookPlay书戏\data\02-西游记精读版台词本\1、带标注版PDF 108集")

SCRIPT_SIZE = 16.5
GLOSS_SIZE = 9.75
WORD_SIZE = 11.25
DEF_SIZE = 9.0
SIDE_X = 400
SIZE_TOL = 0.4

WORD_RE = re.compile(r"^[A-Za-z][A-Za-z'’\-]*$")
IPA_RE = re.compile(r"^\[[^\]]+\]$")
ZH_RE = re.compile(r"[\u4e00-\u9fff]+")
EP_RE = re.compile(r"^(\d{3})")


def near(a: float, b: float) -> bool:
    return abs(a - b) <= SIZE_TOL


def clean(s: str) -> str:
    return (s or "").replace("\xa0", " ").replace("\u3000", " ").strip()


def first_zh(text: str) -> str:
    m = ZH_RE.search(text or "")
    return m.group(0) if m else ""


def list_pdfs() -> dict[int, list[Path]]:
    out: dict[int, list[Path]] = {}
    for p in ANN_DIR.glob("*.pdf"):
        m = EP_RE.match(p.name)
        if not m:
            continue
        out.setdefault(int(m.group(1)), []).append(p)
    for n in out:
        out[n].sort(key=lambda x: (0 if "上" in x.name else 1, x.name))
    return out


def page_spans(page) -> list[dict]:
    d = page.get_text("dict")
    spans = []
    for b in d.get("blocks", []):
        if b.get("type") != 0:
            continue
        for line in b.get("lines", []):
            for s in line.get("spans", []):
                t = clean(s.get("text", ""))
                if not t:
                    continue
                x0, y0, x1, y1 = s["bbox"]
                spans.append({
                    "t": t,
                    "size": s["size"],
                    "x0": x0, "y0": y0, "x1": x1, "y1": y1,
                    "xc": (x0 + x1) / 2,
                })
    return spans


def parse_lexicon(spans: list[dict]) -> list[dict]:
    side = [s for s in spans if s["x0"] >= SIDE_X]
    side.sort(key=lambda s: (round(s["y0"], 1), s["x0"]))
    items: list[dict] = []
    cur = None
    for s in side:
        t = s["t"]
        if near(s["size"], WORD_SIZE) and WORD_RE.match(t):
            cur = {"term": t.lower(), "ipa": "", "def": "", "zh": ""}
            items.append(cur)
        elif cur and near(s["size"], WORD_SIZE) and IPA_RE.match(t.replace(" ", "")):
            cur["ipa"] = t.replace(" ", "")
        elif cur and near(s["size"], WORD_SIZE) and t.startswith("[") and t.endswith("]"):
            cur["ipa"] = t.replace(" ", "")
        elif cur and near(s["size"], DEF_SIZE):
            cur["def"] = (cur["def"] + t).replace("  ", " ")
    for it in items:
        it["zh"] = first_zh(it["def"]) or it["term"]
        it["ipa"] = it["ipa"].strip("[]")
        it["pos"] = ""
        m = re.match(r"^(v\.link\.|v\.|vt\.|vi\.|n\.|adj\.|adv\.|prep\.|conj\.|pron\.|num\.|art\.)", it["def"])
        if m:
            it["pos"] = m.group(1)
    return items


def words_in_span(span: dict) -> list[dict]:
    text = span["t"]
    width = max(1.0, span["x1"] - span["x0"])
    n = max(1, len(text))
    out = []
    for m in re.finditer(r"[A-Za-z][A-Za-z'’\-]*", text):
        out.append({
            "word": m.group().lower().replace("’", "'"),
            "x0": span["x0"] + width * m.start() / n,
            "x1": span["x0"] + width * m.end() / n,
            "y0": span["y0"],
            "y1": span["y1"],
        })
    return out


def parse_glosses(spans: list[dict]) -> dict[str, str]:
    body = [s for s in spans if s["x0"] < SIDE_X]
    ens: list[dict] = []
    for s in body:
        if near(s["size"], SCRIPT_SIZE):
            ens.extend(words_in_span(s))
    gls = [s for s in body if near(s["size"], GLOSS_SIZE) and ZH_RE.search(s["t"])]
    glosses: dict[str, str] = {}
    for g in gls:
        gxc = g["xc"]
        best = None
        best_score = 1e9
        for e in ens:
            if e["y1"] > g["y0"] + 2:
                continue
            dy = g["y0"] - e["y1"]
            if dy < -2 or dy > 30:
                continue
            exc = (e["x0"] + e["x1"]) / 2
            score = abs(exc - gxc) + dy * 0.15
            if score < best_score:
                best_score = score
                best = e
        if not best or best_score > 36:
            continue
        zh = first_zh(g["t"])
        if best["word"] and zh:
            glosses[best["word"]] = zh
    return glosses


def inflate(lemma: str) -> set[str]:
    w = lemma.lower()
    out = {w}
    extras = [w + "s", w + "es", w + "ed", w + "ing", w + "'s"]
    if w.endswith("e"):
        extras += [w[:-1] + "ing", w + "d"]
    if w.endswith("y") and len(w) > 2 and w[-2] not in "aeiou":
        extras += [w[:-1] + "ies", w[:-1] + "ied"]
    if w.endswith("f"):
        extras.append(w[:-1] + "ves")
    if len(w) >= 3 and w[-1] not in "aeiouxyw" and w[-2] in "aeiou":
        extras += [w + w[-1] + "ed", w + w[-1] + "ing"]
    out.update(extras)
    return out


def lex_lookup(term: str, index: dict[str, dict]) -> dict | None:
    key = re.sub(r"^[^A-Za-z]+|[^A-Za-z]+$", "", (term or "").lower())
    if key in index:
        return index[key]
    for part in key.split():
        if part in index:
            return index[part]
    return None


def extract_episode(pdfs: list[Path]) -> tuple[dict[str, dict], dict[str, str]]:
    lex_list: list[dict] = []
    glosses: dict[str, str] = {}
    for pdf in pdfs:
        doc = pymupdf.open(pdf)
        for page in doc:
            spans = page_spans(page)
            lex_list.extend(parse_lexicon(spans))
            glosses.update(parse_glosses(spans))
    lexicon: dict[str, dict] = {}
    for it in lex_list:
        if it["term"] not in lexicon:
            lexicon[it["term"]] = {
                "ipa": it["ipa"],
                "pos": it["pos"],
                "def": it["def"],
                "zh": it["zh"],
            }
    return lexicon, glosses


def build_index(lexicon: dict[str, dict]) -> dict[str, dict]:
    idx = {}
    for lemma, info in lexicon.items():
        for form in inflate(lemma):
            idx.setdefault(form, info)
        idx[lemma] = info
    return idx


def patch_story(n: int, lexicon: dict, glosses: dict) -> dict:
    path = STORIES / f"ep{n}.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    data["script_lexicon"] = lexicon
    data["script_gloss"] = glosses
    index = build_index(lexicon)
    hit = 0
    cards = 0
    for node in data.get("nodes") or []:
        for card in node.get("vocab") or []:
            cards += 1
            info = lex_lookup(card.get("term", ""), index)
            gzh = ""
            for part in re.findall(r"[A-Za-z][A-Za-z'’\-]*", card.get("term") or ""):
                gzh = glosses.get(part.lower()) or gzh
            if not info and not gzh:
                continue
            hit += 1
            if info:
                card["ipa"] = info.get("ipa") or card.get("ipa") or ""
                card["pos"] = info.get("pos") or card.get("pos") or ""
                card["def"] = info.get("def") or card.get("def") or ""
            if gzh and not card.get("gloss"):
                card["gloss"] = gzh
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return {"ep": n, "lex": len(lexicon), "gloss": len(glosses), "cards": cards, "card_hit": hit}


def main() -> None:
    grouped = list_pdfs()
    print(f"pdf episodes {len(grouped)}")
    rows = []
    for n in range(1, 109):
        pdfs = grouped.get(n) or []
        if not pdfs:
            print(f"missing pdfs ep{n}")
            continue
        lexicon, glosses = extract_episode(pdfs)
        row = patch_story(n, lexicon, glosses)
        rows.append(row)
        if n in (1, 2, 50, 108) or n % 20 == 0:
            print(row)
    print(
        "done",
        "eps", len(rows),
        "lex", sum(r["lex"] for r in rows),
        "gloss", sum(r["gloss"] for r in rows),
        "card_hit", sum(r["card_hit"] for r in rows),
        "/", sum(r["cards"] for r in rows),
    )
    if rows:
        print("ep1 sample gloss", json.dumps(
            dict(list(json.loads((STORIES / "ep1.json").read_text(encoding="utf-8"))["script_gloss"].items())[:12]),
            ensure_ascii=False,
        ))


if __name__ == "__main__":
    main()
