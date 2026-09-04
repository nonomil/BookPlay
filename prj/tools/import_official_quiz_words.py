# -*- coding: utf-8 -*-
"""Import official Little Fox 生词 + 测试题 into ep*.json."""
from __future__ import annotations

import json
import re
import unicodedata
from pathlib import Path

import pymupdf

DEMO = Path(__file__).resolve().parent.parent
STORIES = DEMO / "data" / "dialogue_stories"
WORDS_PDF = next(Path(r"G:\Game\BookPlay书戏\data\生词").glob("*.pdf"))
QUIZ_PDF = next(Path(r"G:\Game\BookPlay书戏\data\测试题").glob("*.pdf"))

EP_HEAD = re.compile(r"Journey to the West\s+(\d+)\s*:", re.I)
PAGE_NO = re.compile(r"^\s*\d+\s*/\s*\d+\s*$")
WORD_NO = re.compile(r"^(\d+)\.\s+(.+)$")
Q_NO = re.compile(r"^(\d+)\.\s+(.+)$")
OPT = re.compile(r"^([ABC])\.\s+(.+)$", re.I)
HAS_LATIN = re.compile(r"[A-Za-z]")
HAS_CJK = re.compile(r"[\u4e00-\u9fff]")


def norm(s: str) -> str:
    s = unicodedata.normalize("NFKC", (s or "").replace("\xa0", " "))
    s = s.replace("“", '"').replace("”", '"').replace("‘", "'").replace("’", "'")
    return re.sub(r"\s+", " ", s).strip()


def pdf_lines(path: Path) -> list[str]:
    doc = pymupdf.open(path)
    lines: list[str] = []
    for page in doc:
        for raw in page.get_text("text").splitlines():
            t = norm(raw)
            if not t or PAGE_NO.match(t):
                continue
            if t.lower().startswith("journey to the west") and ":" not in t:
                continue
            lines.append(t)
    return lines


def parse_words(lines: list[str]) -> dict[int, list[dict]]:
    out: dict[int, list[dict]] = {}
    ep = 0
    cur = None
    for line in lines:
        hm = EP_HEAD.search(line)
        if hm and (line.lower().startswith("journey") or ":" in line[:28]):
            ep = int(hm.group(1))
            out.setdefault(ep, [])
            cur = None
            continue
        if not ep:
            continue
        wm = WORD_NO.match(line)
        if wm and not line.lower().startswith("journey"):
            term = norm(wm.group(2))
            if HAS_LATIN.search(term) and not HAS_CJK.search(term):
                cur = {"term": term, "zh": "", "example": ""}
                out[ep].append(cur)
                continue
        if not cur:
            continue
        if HAS_CJK.search(line) and not OPT.match(line):
            cur["zh"] = (cur["zh"] + line).replace("  ", " ").strip()
        elif HAS_LATIN.search(line) and not WORD_NO.match(line):
            if cur["example"]:
                cur["example"] += " " + line
            else:
                cur["example"] = line
            # multi-word term split across lines: "crash" + "down"
            if not cur["example"] and HAS_LATIN.search(line) and not HAS_CJK.search(line) and len(line.split()) <= 3:
                if len(cur["term"].split()) == 1 and line.islower():
                    cur["term"] = f"{cur['term']} {line}"
                    continue
    return out


def parse_quiz(lines: list[str]) -> dict[int, list[dict]]:
    out: dict[int, list[dict]] = {}
    ep = 0
    cur = None
    for line in lines:
        hm = EP_HEAD.search(line)
        if hm and line.lower().startswith("journey"):
            ep = int(hm.group(1))
            out.setdefault(ep, [])
            cur = None
            continue
        if not ep:
            continue
        qm = Q_NO.match(line)
        om = OPT.match(line)
        if qm and not om and HAS_LATIN.search(qm.group(2)):
            cur = {"q": qm.group(2).strip(), "choices": ["", "", ""]}
            out[ep].append(cur)
            continue
        if om and cur:
            idx = "ABC".index(om.group(1).upper())
            cur["choices"][idx] = om.group(2).strip()
            continue
        if cur:
            if cur["choices"][0] == "" and not om:
                cur["q"] += " " + line
            else:
                for i in range(2, -1, -1):
                    if cur["choices"][i]:
                        cur["choices"][i] += " " + line
                        break
    for ep, qs in out.items():
        cleaned = []
        for q in qs:
            q["q"] = norm(q["q"])
            q["choices"] = [norm(c) for c in q["choices"] if norm(c)]
            if q["q"] and len(q["choices"]) >= 2:
                cleaned.append(q)
        out[ep] = cleaned
    return out


def tokens(s: str) -> set[str]:
    return {w for w in re.findall(r"[a-z0-9']+", (s or "").lower()) if len(w) > 2}


def overlap(a: str, b: str) -> float:
    ta, tb = tokens(a), tokens(b)
    if not ta or not tb:
        return 0.0
    return len(ta & tb) / len(ta)


def option_hit(choice: str, texts: list[str]) -> int:
    blob = " ".join(texts).lower()
    cl = (choice or "").lower().strip(" .")
    if cl and cl in blob:
        return 2
    ctok = list(tokens(choice))
    if not ctok:
        return 0
    present = sum(1 for w in ctok if w in blob)
    if present == len(ctok):
        return 2
    if ctok[-1] in blob and present >= 1:
        return 1
    return 0


def infer_answer(q: dict, texts: list[str]) -> int:
    invert = bool(re.search(r"\bnot\b|\bexcept\b|\bfalse\b", q["q"], re.I))
    hits = [option_hit(c, texts) for c in q["choices"]]
    if invert:
        best = min(range(len(hits)), key=lambda i: (hits[i], -i))
    elif hits and hits[0] > 0:
        best = 0
    else:
        best = max(range(len(hits)), key=lambda i: (hits[i], -i)) if hits else 0
    q["answer"] = best
    q["answer_score"] = hits[best] if hits else 0
    q["invert"] = invert
    return best


def attach_words(nodes: list[dict], words: list[dict]) -> int:
    narr = [(i, n) for i, n in enumerate(nodes) if n.get("type") == "narration" and n.get("text_en")]
    hit = 0
    used: dict[int, int] = {}
    for w in words:
        ex = w.get("example") or ""
        if not ex:
            continue
        best_i, best_s = None, 0.0
        for i, n in narr:
            t = n.get("text_en") or ""
            s = 1.0 if norm(ex).lower() in t.lower() or t.lower() in norm(ex).lower() else overlap(ex, t)
            if w["term"].lower() in t.lower():
                s = max(s, 0.35)
            if s > best_s:
                best_s, best_i = s, i
        if best_i is None or best_s < 0.34:
            continue
        if used.get(best_i, 0) >= 2:
            continue
        node = nodes[best_i]
        vocab = node.setdefault("vocab", [])
        key = w["term"].lower()
        card = next((c for c in vocab if str(c.get("term", "")).lower() == key), None)
        if not card:
            card = {"term": w["term"], "zh": w["zh"], "mode": "learn"}
            vocab.insert(0, card)
        card["zh"] = w["zh"] or card.get("zh") or ""
        card["phrase_en"] = ex
        if w["zh"] and not card.get("phrase_zh"):
            card["phrase_zh"] = w["zh"].split("，")[0].split("(")[0].strip()
        card["source"] = "official_words"
        used[best_i] = used.get(best_i, 0) + 1
        hit += 1
    return hit


def attach_quiz(nodes: list[dict], questions: list[dict]) -> list[dict]:
    narr = [(i, n) for i, n in enumerate(nodes) if n.get("type") == "narration" and n.get("text_en")]
    placed = []
    leftover = []
    taken = set()
    for q in questions:
        ans = q["choices"][q["answer"]] if q.get("choices") else ""
        ans_tok = list(tokens(ans))
        head = ans_tok[-1] if ans_tok else ""
        best_i, best_s = None, 0.0
        for i, n in narr:
            if i in taken:
                continue
            t = n.get("text_en") or ""
            tl = t.lower()
            s = overlap(q["q"], t) + overlap(ans, t)
            if head and head in tl:
                s += 3
            if ans and ans.lower() in tl:
                s += 2
            if tokens(q["q"]) & tokens(t) and tokens(ans) & tokens(t):
                s += 3
            if s > best_s:
                best_s, best_i = s, i
        if best_i is not None and best_s >= 1.4:
            nodes[best_i]["quiz_after"] = {
                "q": q["q"],
                "choices": q["choices"],
                "answer": q["answer"],
            }
            taken.add(best_i)
            placed.append(q)
        else:
            leftover.append({k: q[k] for k in ("q", "choices", "answer") if k in q})
    return leftover


def patch(n: int, words: list[dict], quiz: list[dict]) -> dict:
    path = STORIES / f"ep{n}.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    texts = [x.get("text_en") or "" for x in data.get("nodes") or []]
    for q in quiz:
        infer_answer(q, texts)
        q.pop("answer_score", None)
        q.pop("invert", None)
    for node in data.get("nodes") or []:
        node.pop("quiz_after", None)
    data["official_words"] = [{"term": w["term"], "zh": w["zh"], "example": w["example"]} for w in words]
    word_hit = attach_words(data.get("nodes") or [], words)
    leftover = attach_quiz(data.get("nodes") or [], quiz)
    data["quiz"] = leftover
    data["official_quiz"] = [{"q": q["q"], "choices": q["choices"], "answer": q["answer"]} for q in quiz]
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    placed = sum(1 for node in data["nodes"] if node.get("quiz_after"))
    return {
        "ep": n,
        "words": len(words),
        "word_hit": word_hit,
        "quiz": len(quiz),
        "placed": placed,
        "end_quiz": len(leftover),
    }


def main() -> None:
    words = parse_words(pdf_lines(WORDS_PDF))
    quiz = parse_quiz(pdf_lines(QUIZ_PDF))
    print("word eps", len(words), "items", sum(len(v) for v in words.values()))
    print("quiz eps", len(quiz), "items", sum(len(v) for v in quiz.values()))
    print("ep1 words", len(words.get(1) or []), "quiz", json.dumps(quiz.get(1), ensure_ascii=False)[:400])
    rows = []
    for n in range(1, 109):
        row = patch(n, words.get(n) or [], quiz.get(n) or [])
        rows.append(row)
        if n in (1, 2, 18, 50, 108) or n % 25 == 0:
            print(row)
    print(
        "done",
        "word_hit", sum(r["word_hit"] for r in rows),
        "placed", sum(r["placed"] for r in rows),
        "end_quiz", sum(r["end_quiz"] for r in rows),
        "quiz_total", sum(r["quiz"] for r in rows),
    )


if __name__ == "__main__":
    main()
