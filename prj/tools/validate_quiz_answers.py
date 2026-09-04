# -*- coding: utf-8 -*-
"""Quiz answer validation (TDD, local-only, episodes 1-108).

Re-validates content/lesson_guides/official-quiz-bank.json: every answer
index legal per review_status, every evidence node_id resolves to its own
episode's dialogue story and the quote appears verbatim in that node's
text_en. Exits 0 when everything passes, 3 otherwise.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BANK_JSON = ROOT / "content" / "lesson_guides" / "official-quiz-bank.json"
STORY_DIR = ROOT / "content" / "dialogue_stories"


def validate_bank(episodes: list[int] | None = None) -> list[str]:
    bank = json.loads(BANK_JSON.read_text(encoding="utf-8"))
    problems: list[str] = []
    for q in bank.get("questions", []):
        ep = q.get("episode")
        if episodes is not None and ep not in episodes:
            continue
        if not isinstance(ep, int) or not 1 <= ep <= 108:
            problems.append(f"ep{ep} q{q.get('number')}: bad episode field {ep!r}")
            continue
        story_path = STORY_DIR / f"ep{ep}.json"
        if not story_path.is_file():
            problems.append(f"ep{ep}: dialogue story missing {story_path}")
            continue
        story = json.loads(story_path.read_text(encoding="utf-8"))
        nodes = {n["node_id"]: n for n in story.get("nodes", [])}
        tag = f"ep{ep} q{q.get('number')} ({q.get('q', '')[:48]}...)"
        status = q.get("review_status")
        verified_statuses = ("machine_verified", "human_reviewed", "assistant_reviewed")
        if status not in (*verified_statuses, "needs_review"):
            problems.append(f"{tag}: bad review_status {status!r}")
            continue
        if status in verified_statuses:
            if not isinstance(q.get("answer"), int) or not 0 <= q["answer"] <= 2:
                problems.append(f"{tag}: verified answer index invalid: {q.get('answer')!r}")
            if not q.get("answer_evidence"):
                problems.append(f"{tag}: verified without evidence")
        elif q.get("answer") not in (-1, None):
            problems.append(f"{tag}: needs_review must not carry a scored answer: {q.get('answer')!r}")
        for ev in q.get("answer_evidence", []):
            nid = ev.get("node_id")
            if nid not in nodes:
                problems.append(f"{tag}: evidence node missing: {nid}")
                continue
            quote = ev.get("quote") or ""
            if quote not in (nodes[nid].get("text_en") or ""):
                problems.append(f"{tag}: quote not verbatim in {nid}: {quote[:60]!r}")
    return problems


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--episode", type=int, default=None)
    ap.add_argument("--episodes", type=str, default=None)
    ap.add_argument("--all", action="store_true")
    args = ap.parse_args()
    episodes = None
    if args.all:
        episodes = list(range(1, 109))
    elif args.episodes:
        raw = args.episodes.strip()
        if "-" in raw:
            a, b = raw.split("-", 1)
            episodes = list(range(int(a), int(b) + 1))
        else:
            episodes = [int(raw)]
    elif args.episode:
        episodes = [args.episode]
    problems = validate_bank(episodes)
    for p in problems:
        print("FAIL:", p)
    if problems:
        print(f"{len(problems)} validation problem(s)")
        sys.exit(3)
    scope = f"episodes {episodes}" if episodes else "all bank episodes"
    print(f"quiz-answer validation OK ({scope})")


if __name__ == "__main__":
    main()
