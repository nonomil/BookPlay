# -*- coding: utf-8 -*-
"""Fill all 108 episode stories: Chinese sentences + word phrase pairs.

Sources:
  - data/05 词汇书: term + zh + English example
  - existing ep*.json English lines
Chinese sentences: iciba batch translate with on-disk cache (bing fallback).
"""
from __future__ import annotations

import json
import re
import time
import unicodedata
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from docx import Document

DEMO = Path(__file__).resolve().parent.parent
STORIES = DEMO / "data" / "dialogue_stories"
CACHE_PATH = DEMO / "data" / "align" / "zh_cache.json"
VOCAB_DOCX = Path(
    r"G:\Game\BookPlay书戏\data\05.中英文对照词汇（266页可打印修改）"
    r"\Journey to the West 266页词汇中英文对照表.docx"
)

EP_HEAD = re.compile(r"^Journey to the West\s+(\d+)\b", re.I)
MARKER = re.compile(r"<<<(\d+)>>>")
KEEP_ZH = re.compile(r"点词块|完成后点确定|你会怎么做|你会对他说")


def norm(s: str) -> str:
    s = unicodedata.normalize("NFKC", (s or "").replace("\xa0", " "))
    s = s.replace("“", '"').replace("”", '"').replace("‘", "'").replace("’", "'")
    return re.sub(r"[^\S\t]+", " ", s).strip()


def first_sense(zh: str) -> str:
    zh = norm(zh)
    zh = re.sub(r"^\d+\.\s*", "", zh)
    zh = re.split(r"[，,;；(/（]", zh, maxsplit=1)[0]
    return zh.strip(" .。)") or norm(zh)


def short_phrase(term: str, example: str) -> str:
    term = norm(term)
    example = norm(example)
    if not example:
        return term
    low_ex, low_t = example.lower(), term.lower()
    pos = low_ex.find(low_t)
    if pos < 0:
        return term
    # keep a short window around the term, prefer a clause
    start = example.rfind(",", 0, pos)
    start = start + 1 if start >= 0 else 0
    end_cands = [example.find(p, pos + len(term)) for p in ",.;:!?"]
    end_cands = [e for e in end_cands if e >= 0]
    end = min(end_cands) if end_cands else len(example)
    chunk = example[start:end].strip(" \"'")
    words = chunk.split()
    while words and words[-1].lower() in {"the", "a", "an", "and", "or", "to", "of", "in"}:
        words.pop()
    chunk = " ".join(words).strip(" ,")
    words = chunk.split()
    if len(words) > 8:
        # tighten to ~2 words before + term + ~2 after
        wlow = chunk.lower()
        i = wlow.find(low_t)
        left = chunk[:i].split()[-2:]
        right = chunk[i + len(term) :].split()[:2]
        chunk = " ".join(left + [term] + right).strip(" ,")
    words = chunk.split()
    while words and words[-1].lower() in {"the", "a", "an", "and", "or", "to", "of", "in"}:
        words.pop()
    return " ".join(words).strip(" ,") or term


def parse_vocab_book(path: Path) -> dict[int, dict[str, dict]]:
    """ep -> {term_lower: {term, zh, phrase_en}}"""
    paras = [norm(p.text) for p in Document(str(path)).paragraphs]
    # merge wrapped definition tails into previous tab-line
    merged = []
    for t in paras:
        if not t:
            continue
        if merged and "\t" in merged[-1] and "\t" not in t and not EP_HEAD.match(t) and not re.search(r"[A-Za-z]{3,}", t):
            merged[-1] = merged[-1] + t
        else:
            merged.append(t)

    by_ep: dict[int, dict[str, dict]] = {}
    cur = None
    i = 0
    while i < len(merged):
        t = merged[i]
        m = EP_HEAD.match(t)
        if m:
            cur = int(m.group(1))
            by_ep.setdefault(cur, {})
            i += 1
            continue
        if cur is None or "\t" not in t:
            i += 1
            continue
        word, zh = t.split("\t", 1)
        word, zh = word.strip(), first_sense(zh)
        phrase = ""
        if i + 1 < len(merged):
            nxt = merged[i + 1]
            if nxt and "\t" not in nxt and not EP_HEAD.match(nxt) and re.search(r"[A-Za-z]", nxt):
                phrase = nxt
                i += 1
        key = word.lower()
        if word and key not in by_ep[cur]:
            by_ep[cur][key] = {
                "term": word,
                "zh": zh,
                "phrase_en": short_phrase(word, phrase) if phrase else word,
            }
        i += 1
    return by_ep


def load_cache() -> dict[str, str]:
    if CACHE_PATH.exists():
        return json.loads(CACHE_PATH.read_text(encoding="utf-8"))
    return {}


def save_cache(cache: dict[str, str]) -> None:
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp = CACHE_PATH.with_suffix(".tmp")
    tmp.write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(CACHE_PATH)


def parse_marked(raw: str, n: int) -> dict[int, str] | None:
    found = {}
    parts = MARKER.split(raw)
    # split keeps capture groups: [pre, id, text, id, text, ...]
    if len(parts) < 3:
        return None
    it = iter(parts[1:])
    for num, text in zip(it, it):
        found[int(num)] = norm(text)
    if len(found) != n:
        return None
    return found


def translate_batch(lines: list[str], engine: str) -> list[str] | None:
    src = "\n".join(f"<<<{i}>>> {s}" for i, s in enumerate(lines, 1))
    import translators as ts

    raw = ts.translate_text(src, translator=engine, from_language="en", to_language="zh")
    parsed = parse_marked(raw, len(lines))
    if not parsed:
        return None
    return [parsed[i] for i in range(1, len(lines) + 1)]


def translate_one(text: str, engine: str) -> str:
    import translators as ts

    return norm(ts.translate_text(text, translator=engine, from_language="en", to_language="zh"))


def fill_cache(texts: list[str], cache: dict[str, str], batch_size: int = 10) -> dict[str, str]:
    pending = [t for t in texts if t and t not in cache]
    if not pending:
        print("cache already complete", len(cache))
        return cache
    print("to_translate", len(pending), "cached", len(cache) - (len(texts) - len(pending)))
    batches = [pending[i : i + batch_size] for i in range(0, len(pending), batch_size)]

    def work(batch: list[str]) -> list[tuple[str, str]]:
        for engine in ("iciba", "bing"):
            try:
                out = translate_batch(batch, engine)
                if out:
                    return list(zip(batch, out))
            except Exception:
                time.sleep(0.4)
        pairs = []
        for s in batch:
            zh = ""
            for engine in ("iciba", "bing"):
                try:
                    zh = translate_one(s, engine)
                    if zh:
                        break
                except Exception:
                    continue
            pairs.append((s, zh))
        return pairs

    done = 0
    with ThreadPoolExecutor(max_workers=3) as pool:
        futs = [pool.submit(work, b) for b in batches]
        for fut in as_completed(futs):
            pairs = fut.result()
            for en, zh in pairs:
                if zh:
                    cache[en] = zh
            done += 1
            if done % 8 == 0 or done == len(batches):
                save_cache(cache)
                print(f"batches {done}/{len(batches)} cache={len(cache)}")
    save_cache(cache)
    return cache


def phrase_for(term: str, card_zh: str, node_en: str, book: dict[str, dict], cache: dict[str, str]) -> tuple[str, str]:
    key = norm(term).lower()
    info = book.get(key)
    if info:
        en = info["phrase_en"] or term
        zh = cache.get(en) or info["zh"] or first_sense(card_zh)
        return en, zh
    en = short_phrase(term, node_en)
    zh = cache.get(en) or first_sense(card_zh) or cache.get(term) or term
    return en, zh


def should_fill_sentence(n: dict) -> bool:
    if n.get("type") != "narration":
        return False
    en = norm(n.get("text_en") or "")
    zh = (n.get("text_zh") or "").strip()
    if not en:
        return False
    if zh and not KEEP_ZH.search(zh) and "西游记 第" not in zh:
        return False
    # keep chapter titles that already have 西游记 第N集 if English is Chapter...
    if zh.startswith("西游记 第") and en.lower().startswith("chapter"):
        return False
    return True


NAME_FIX = (
    ("巴解", "八戒"),
    ("巴杰", "八戒"),
    ("巴捷", "八戒"),
    ("班吉", "八戒"),
    ("百劫", "八戒"),
    ("红发男孩", "红孩儿"),
    ("红男孩", "红孩儿"),
    ("红童", "红孩儿"),
    ("无 Jing", "悟净"),
    ("无Jing", "悟净"),
    ("吴京", "悟净"),
    ("吴静", "悟净"),
    ("铁不朽者", "铁扇公主"),
    ("铁不朽", "铁扇公主"),
    ("钢铁不朽者", "铁扇公主"),
    ("林吉", "灵吉"),
    ("维纳斯", "太白金星"),
    ("觉醒如来", "观音"),
    ("苏波底", "菩提祖师"),
    ("苏博迪", "菩提祖师"),
    ("唐代僧侣", "唐僧"),
    ("唐代僧人", "唐僧"),
    ("雷击寺", "雷音寺"),
    ("雷霆寺", "雷音寺"),
    ("《 Monkey King 》", "美猴王"),
    ("《 Monkey King》", "美猴王"),
    ("Monkey King", "美猴王"),
)
CJK_RE = re.compile(r"[\u4e00-\u9fff]")


def polish_zh(en: str, zh: str) -> str:
    zh = zh or ""
    for a, b in NAME_FIX:
        zh = zh.replace(a, b)
    if re.search(r"\bWukong\b", en or "", re.I) and "玄奘" in zh:
        zh = zh.replace("玄奘", "悟空")
    return zh


def patch_episode(path: Path, vocab: dict[str, dict], cache: dict[str, str]) -> tuple[int, int]:
    data = json.loads(path.read_text(encoding="utf-8"))
    s_n = c_n = 0
    for n in data.get("nodes", []):
        en = norm(n.get("text_en") or "")
        if should_fill_sentence(n) and en in cache:
            n["text_zh"] = cache[en]
            s_n += 1
        if n.get("text_zh"):
            n["text_zh"] = polish_zh(en, n["text_zh"])
        keep_hand = data.get("episode") == 1
        for card in n.get("vocab") or []:
            if keep_hand and card.get("phrase_en") and card.get("phrase_zh"):
                card["phrase_zh"] = polish_zh(card.get("phrase_en") or "", card["phrase_zh"])
                card.pop("example", None)
                continue
            pe, pz = phrase_for(card.get("term") or "", card.get("zh") or "", en, vocab, cache)
            pz = polish_zh(pe, pz)
            if not CJK_RE.search(pz):
                pz = first_sense(card.get("zh") or "") or pz
            card["phrase_en"] = pe
            card["phrase_zh"] = pz
            card.pop("example", None)
            c_n += 1
    data["source_note"] = (
        "台词英文本来自 data/08 原文台词本与外挂英文字幕；"
        "词汇短语来自 data/05 中英对照词汇；中文句译按英文逐句对照。个人使用。"
    )
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return s_n, c_n


def collect_texts(vocab_all: dict[int, dict[str, dict]]) -> list[str]:
    texts = []
    for f in sorted(STORIES.glob("ep*.json"), key=lambda p: int(p.stem[2:])):
        data = json.loads(f.read_text(encoding="utf-8"))
        for n in data.get("nodes", []):
            en = norm(n.get("text_en") or "")
            if should_fill_sentence(n):
                texts.append(en)
            ep = data.get("episode") or int(f.stem[2:])
            book = vocab_all.get(ep, {})
            for card in n.get("vocab") or []:
                if ep == 1 and card.get("phrase_en") and card.get("phrase_zh"):
                    continue
                pe, _ = phrase_for(card.get("term") or "", card.get("zh") or "", en, book, {})
                if pe:
                    texts.append(norm(pe))
    for book in vocab_all.values():
        for info in book.values():
            pe = norm(info.get("phrase_en") or "")
            if pe:
                texts.append(pe)
    # unique, keep order
    seen = set()
    out = []
    for t in texts:
        if t and t not in seen:
            seen.add(t)
            out.append(t)
    return out


def main() -> None:
    print("parse vocab book...")
    vocab_all = parse_vocab_book(VOCAB_DOCX)
    print("vocab episodes", len(vocab_all), "entries", sum(len(v) for v in vocab_all.values()))
    cache = load_cache()
    texts = collect_texts(vocab_all)
    print("unique texts", len(texts))
    cache = fill_cache(texts, cache)
    sent_total = card_total = 0
    missing = []
    for f in sorted(STORIES.glob("ep*.json"), key=lambda p: int(p.stem[2:])):
        ep = int(f.stem[2:])
        s, c = patch_episode(f, vocab_all.get(ep, {}), cache)
        sent_total += s
        card_total += c
        data = json.loads(f.read_text(encoding="utf-8"))
        empty = sum(
            1
            for n in data["nodes"]
            if n.get("type") == "narration" and norm(n.get("text_en") or "") and not (n.get("text_zh") or "").strip()
        )
        if empty:
            missing.append((ep, empty))
    print("patched_sentences", sent_total, "patched_cards", card_total)
    print("eps_still_empty", missing[:12], "count", len(missing))


if __name__ == "__main__":
    main()
