# -*- coding: utf-8 -*-
"""Restore Chinese that was wrongly written into English player fields."""
from __future__ import annotations

import json
import re
from pathlib import Path

from paths import CONTENT, STORIES

CJK = re.compile(r"[\u4e00-\u9fff]")
EN_KEYS = {
    "text_en",
    "phrase_en",
    "pattern",
    "example",
    "sentence",
    "term",
    "prompt",
    "question",
    "choice",
    "choices",
    "answer",
    "words",
}
# title.en is the on-screen episode name (第 N 集 · 菩提祖师). Leave it.
SKIP_PARENTS = {"title"}

# Name-fix + the "soon" -> 很快就 pass ate surrounding spaces.
RESTORES = (
    ("很快就", " soon "),
    ("菩提祖师", "Subodhi"),
    ("红孩儿", "Red Boy"),
    ("猪八戒", "Bajie"),
    ("金角", "Golden Horn"),
    ("二郎", "Erlang"),
    ("梅山", "Plum Mountain"),
)
SPACEY = re.compile(r" {2,}")


def restore_en(s: str) -> str:
    out = s
    for old, new in RESTORES:
        if old in out:
            out = out.replace(old, new)
    out = SPACEY.sub(" ", out)
    out = out.replace("As soon as", "As soon as")
    return out


def walk_en(obj, parent: str | None = None, grand: str | None = None) -> tuple[object, int, list[str]]:
    hits = 0
    leftover: list[str] = []
    if isinstance(obj, str):
        if parent in EN_KEYS and grand not in SKIP_PARENTS and CJK.search(obj):
            nxt = restore_en(obj)
            if CJK.search(nxt):
                leftover.append(f"{parent}: {nxt}")
            return nxt, int(nxt != obj), leftover
        return obj, 0, leftover
    if isinstance(obj, list):
        out = []
        for item in obj:
            nxt, n, left = walk_en(item, parent, grand)
            out.append(nxt)
            hits += n
            leftover.extend(left)
        return out, hits, leftover
    if isinstance(obj, dict):
        out = {}
        for k, v in obj.items():
            nxt, n, left = walk_en(v, k if isinstance(k, str) else parent, parent)
            out[k] = nxt
            hits += n
            leftover.extend(left)
        return out, hits, leftover
    return obj, 0, leftover


def restore_cache_keys(path: Path) -> tuple[int, list[str]]:
    data = json.loads(path.read_text(encoding="utf-8-sig"))
    if not isinstance(data, dict):
        return 0, []
    nxt = {}
    changed = 0
    leftover = []
    for k, v in data.items():
        nk = restore_en(k) if isinstance(k, str) and CJK.search(k) and re.search(r"[A-Za-z]", k) else k
        if nk != k:
            changed += 1
        if isinstance(nk, str) and CJK.search(nk) and re.search(r"[A-Za-z]", nk):
            leftover.append(nk)
        if nk in nxt and nk != k:
            continue
        nxt[nk] = v
    if changed:
        path.write_text(json.dumps(nxt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return changed, leftover


FUNCTION_GLOSS = {
    "a", "an", "the", "to", "of", "and", "for", "in", "on",
    "is", "was", "are", "were", "be", "been", "being",
    "it", "he", "she", "they", "we", "you", "i", "me",
    "my", "your", "our", "his", "her", "their", "them", "him",
    "at", "as", "or", "by", "with", "from", "that", "this", "these", "those",
    "not", "no", "but", "so", "if", "then", "than",
    "do", "did", "does", "done", "have", "has", "had",
    "will", "would", "can", "could", "should", "may", "might", "must",
}


def clean_function_gloss(data: dict) -> int:
    gloss = data.get("script_gloss")
    if not isinstance(gloss, dict):
        return 0
    n = 0
    for k in list(gloss):
        if str(k).lower() in FUNCTION_GLOSS:
            gloss.pop(k, None)
            n += 1
    return n


def main() -> None:
    files = hits = 0
    leftovers: list[str] = []
    for path in sorted(STORIES.glob("ep*.json")):
        data = json.loads(path.read_text(encoding="utf-8-sig"))
        nxt, n, left = walk_en(data)
        g = clean_function_gloss(nxt if isinstance(nxt, dict) else data)
        leftovers.extend(f"{path.name} {x}" for x in left)
        if n or g:
            path.write_text(json.dumps(nxt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            files += 1
            hits += n + g
            print(f"{n:5d}+{g:<3d}  {path.name}")
    cache = CONTENT / "align" / "zh_cache.json"
    if cache.exists():
        n, left = restore_cache_keys(cache)
        leftovers.extend(f"zh_cache {x}" for x in left)
        if n:
            files += 1
            hits += n
            print(f"{n:5d}  align/zh_cache.json keys")
    print(f"done files={files} fields={hits} leftover={len(leftovers)}")
    for row in leftovers[:80]:
        print("LEFTOVER", row)


if __name__ == "__main__":
    main()
