# -*- coding: utf-8 -*-
"""Add Chinese q_zh / choices_zh to official quizzes in ep*.json."""
from __future__ import annotations

import json
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

STORIES = Path(__file__).resolve().parent.parent / "data" / "dialogue_stories"
CACHE = Path(__file__).resolve().parent.parent / "data" / "quiz_zh_cache.json"


def load_cache() -> dict:
    if CACHE.exists():
        return json.loads(CACHE.read_text(encoding="utf-8"))
    return {}


def save_cache(cache: dict) -> None:
    CACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


def collect_texts(only_ep: int | None = None) -> list[str]:
    out: set[str] = set()
    nums = [only_ep] if only_ep else list(range(1, 109))
    for n in nums:
        data = json.loads((STORIES / f"ep{n}.json").read_text(encoding="utf-8"))
        qs = []
        for node in data.get("nodes") or []:
            if node.get("quiz_after"):
                qs.append(node["quiz_after"])
        qs.extend(data.get("quiz") or [])
        qs.extend(data.get("official_quiz") or [])
        for q in qs:
            if q.get("q"):
                out.add(q["q"].strip())
            for c in q.get("choices") or []:
                if c:
                    out.add(c.strip())
    return sorted(out)


def translate_one(text: str) -> tuple[str, str]:
    import translators as ts
    last = ""
    for attempt in range(3):
        try:
            zh = ts.translate_text(text, translator="bing", from_language="en", to_language="zh")
            zh = (zh or "").strip()
            if zh:
                return text, zh
        except Exception as exc:  # noqa: BLE001
            last = str(exc)[:80]
            time.sleep(0.5 * (attempt + 1))
    print("fail", text[:50], last, file=sys.stderr)
    return text, ""


def apply_cache(only_ep: int | None = None) -> None:
    cache = load_cache()
    nums = [only_ep] if only_ep else list(range(1, 109))
    for n in nums:
        path = STORIES / f"ep{n}.json"
        data = json.loads(path.read_text(encoding="utf-8"))
        changed = False

        def fill(q: dict) -> None:
            nonlocal changed
            qtxt = (q.get("q") or "").strip()
            if qtxt and not q.get("q_zh") and cache.get(qtxt):
                q["q_zh"] = cache[qtxt]
                changed = True
            choices = q.get("choices") or []
            czh = list(q.get("choices_zh") or [])
            while len(czh) < len(choices):
                czh.append("")
            for i, c in enumerate(choices):
                key = (c or "").strip()
                if key and not czh[i] and cache.get(key):
                    czh[i] = cache[key]
                    changed = True
            if any(czh):
                q["choices_zh"] = czh[: len(choices)]

        for node in data.get("nodes") or []:
            if node.get("quiz_after"):
                fill(node["quiz_after"])
        for q in data.get("quiz") or []:
            fill(q)
        for q in data.get("official_quiz") or []:
            fill(q)
        if changed:
            path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    only = int(sys.argv[1]) if len(sys.argv) > 1 else None
    cache = load_cache()
    texts = [t for t in collect_texts(only) if t not in cache]
    print("need", len(texts), "cached", len(cache), flush=True)
    if texts:
        done = 0
        with ThreadPoolExecutor(max_workers=6) as pool:
            futs = [pool.submit(translate_one, t) for t in texts]
            for fut in as_completed(futs):
                src, zh = fut.result()
                if zh:
                    cache[src] = zh
                done += 1
                if done % 20 == 0 or done == len(texts):
                    save_cache(cache)
                    print(f"  {done}/{len(texts)} cache {len(cache)}", flush=True)
        save_cache(cache)
    apply_cache(only)
    print("patched", "ep" + str(only) if only else "all", flush=True)


if __name__ == "__main__":
    main()
