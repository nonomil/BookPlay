# -*- coding: utf-8 -*-
"""Audit lesson-guide data without mutating story content.

The runtime can safely skip a card, but a pack build should still make noisy
or incomplete lesson data visible.  This module is intentionally dependency
free so it can run in CI and from ``pack_datapack.py``.
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any

MAX_GLOSS_CHARS = 35
POLLUTION_MARKERS = ("。”", "！”", "召集天兵", "找一份工作", "给我把孙悟空抓来")


def _text(value: Any) -> str:
    return str(value or "").replace("\n", " ").strip()


def _load(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
        return value if isinstance(value, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


def _word_issues(card: dict[str, Any], episode: int) -> list[dict[str, Any]]:
    payload = card.get("payload") if isinstance(card.get("payload"), dict) else card
    prompt = card.get("prompt") if isinstance(card.get("prompt"), dict) else {}
    term = _text(payload.get("term") or prompt.get("en"))
    gloss = _text(payload.get("gloss") or payload.get("meaning") or prompt.get("zh") or payload.get("def"))
    definition = _text(payload.get("def") or prompt.get("zh"))
    issues: list[dict[str, Any]] = []
    if not term:
        issues.append({"episode": episode, "card_id": card.get("card_id"), "kind": "missing_term"})
    if not gloss:
        issues.append({"episode": episode, "card_id": card.get("card_id"), "kind": "missing_gloss", "term": term})
    if len(gloss) > MAX_GLOSS_CHARS or len(definition) > MAX_GLOSS_CHARS * 3:
        issues.append({"episode": episode, "card_id": card.get("card_id"), "kind": "long_gloss", "term": term, "chars": len(gloss), "value": gloss})
    if any(marker in gloss or marker in definition for marker in POLLUTION_MARKERS) or re.search(r"[“\"]{1}.{0,80}[”\"]", gloss):
        issues.append({"episode": episode, "card_id": card.get("card_id"), "kind": "dialogue_pollution", "term": term, "value": gloss})
    return issues


def audit_root(root: Path) -> dict[str, Any]:
    root = root.resolve()
    guides = root / "lesson_guides" if (root / "lesson_guides").is_dir() else root
    episodes: list[dict[str, Any]] = []
    issues: list[dict[str, Any]] = []
    totals = {"lessons": 0, "cards": 0, "word_cards": 0, "sentence_cards": 0, "draft": 0, "needs_review": 0, "usable_puzzles": 0}
    for path in sorted(guides.glob("ep*/lesson.json")):
        lesson = _load(path)
        episode = int(lesson.get("episode") or int(path.parent.name.removeprefix("ep")) or 0)
        cards = lesson.get("cards") if isinstance(lesson.get("cards"), list) else []
        puzzles_path = root / "dialogue_stories" / f"ep{episode}.json"
        story = _load(puzzles_path) if puzzles_path.exists() else {}
        puzzles = story.get("puzzles") if isinstance(story.get("puzzles"), list) else []
        usable = sum(1 for item in puzzles if isinstance(item, dict) and len(_text(item.get("sentence") or item.get("text_en")).split()) >= 2)
        status = str(lesson.get("status") or "draft")
        totals["lessons"] += 1
        totals["cards"] += len(cards)
        totals["draft"] += int(status == "draft")
        totals["usable_puzzles"] += usable
        if not usable:
            issues.append({"episode": episode, "kind": "no_usable_puzzle"})
        word_count = 0
        sentence_count = 0
        for card in cards:
            if not isinstance(card, dict):
                issues.append({"episode": episode, "kind": "invalid_card"})
                continue
            if card.get("type") == "word_review":
                word_count += 1
                totals["word_cards"] += 1
                issues.extend(_word_issues(card, episode))
            elif card.get("type") == "sentence_choice":
                sentence_count += 1
                totals["sentence_cards"] += 1
            if card.get("review_status") == "needs_review":
                totals["needs_review"] += 1
        episodes.append({"episode": episode, "status": status, "cards": len(cards), "word_cards": word_count, "sentence_cards": sentence_count, "usable_puzzles": usable})
    by_kind: dict[str, int] = {}
    for issue in issues:
        by_kind[str(issue.get("kind"))] = by_kind.get(str(issue.get("kind")), 0) + 1
    return {"schema_version": 1, "root": str(root), "totals": totals, "issue_counts": by_kind, "issues": issues, "episodes": episodes}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", default=".", help="content root containing lesson_guides")
    parser.add_argument("--report", help="write JSON report")
    parser.add_argument("--strict", action="store_true", help="exit non-zero when blocking issues exist")
    args = parser.parse_args()
    result = audit_root(Path(args.root))
    output = json.dumps(result, ensure_ascii=False, indent=2)
    if args.report:
        target = Path(args.report)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(output + "\n", encoding="utf-8")
    else:
        print(output)
    blocking = {"missing_term", "missing_gloss", "dialogue_pollution", "no_usable_puzzle", "invalid_card"}
    return 1 if args.strict and any(kind in blocking for kind in result["issue_counts"]) else 0


if __name__ == "__main__":
    raise SystemExit(main())

