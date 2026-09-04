# -*- coding: utf-8 -*-
"""Build a quote-backed review packet for official quiz items still needs_review.

This tool never chooses an answer and never mutates the quiz bank. It gathers
the strongest story quotes for every option so a human reviewer can make an
evidence-backed decision without searching an entire episode by hand.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
BANK = ROOT / "content" / "lesson_guides" / "official-quiz-bank.json"
STORIES = ROOT / "content" / "dialogue_stories"
DEFAULT_OUTPUT = ROOT / "content" / "lesson_guides" / "reports" / "quiz-human-review.md"

STOP = {
    "a", "an", "the", "and", "or", "to", "of", "in", "on", "at", "for", "from",
    "with", "what", "who", "why", "where", "when", "how", "which", "did", "does",
    "was", "were", "is", "are", "be", "been", "he", "she", "it", "they", "his",
    "her", "their", "not", "true", "false", "about", "into", "after", "before",
}


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _tokens(text: str) -> set[str]:
    return {
        word for word in re.findall(r"[a-z0-9']+", str(text or "").lower())
        if len(word) > 1 and word not in STOP
    }


def _quote_candidates(question: str, option: str, nodes: list[dict], limit: int = 3) -> list[dict]:
    option_tokens = _tokens(option)
    question_tokens = _tokens(question)
    ranked = []
    for index, node in enumerate(nodes):
        quote = node.get("text_en") or ""
        quote_tokens = _tokens(quote)
        option_hits = len(option_tokens & quote_tokens)
        question_hits = len(question_tokens & quote_tokens)
        phrase = str(option or "").lower().strip(" .?!\"")
        phrase_hit = bool(phrase and phrase in quote.lower())
        if not option_hits and not phrase_hit:
            continue
        score = option_hits * 4 + question_hits + (8 if phrase_hit else 0)
        ranked.append((score, index, node.get("node_id") or f"node-{index + 1}", quote))
    ranked.sort(key=lambda item: (-item[0], item[1]))
    return [
        {"node_id": node_id, "quote": quote, "score": score}
        for score, _, node_id, quote in ranked[:limit]
    ]


def build_rows(episodes: set[int] | None = None) -> tuple[dict, list[dict]]:
    bank = json.loads(BANK.read_text(encoding="utf-8"))
    rows = []
    story_cache: dict[int, tuple[Path, dict]] = {}
    for question in bank.get("questions", []):
        if question.get("review_status") != "needs_review":
            continue
        episode = question["episode"]
        if episodes is not None and episode not in episodes:
            continue
        if episode not in story_cache:
            path = STORIES / f"ep{episode}.json"
            story_cache[episode] = (path, json.loads(path.read_text(encoding="utf-8")))
        story_path, story = story_cache[episode]
        rows.append({
            "episode": episode,
            "number": question["number"],
            "question": question["q"],
            "choices": question["choices"],
            "page": question.get("page"),
            "negation": bool(re.search(r"\bnot\b|\bexcept\b|\bfalse\b", question["q"], re.I)),
            "source": {
                "bank_sha256": _sha256(BANK),
                "story_file": str(story_path),
                "story_sha256": _sha256(story_path),
            },
            "candidates": [
                _quote_candidates(question["q"], choice, story.get("nodes", []))
                for choice in question["choices"]
            ],
        })
    return bank, rows


def render_markdown(bank: dict, rows: list[dict]) -> str:
    lines = [
        "# 官方测试题人工审核包",
        "",
        f"- 题库：`{BANK}`",
        f"- 题库 SHA-256：`{_sha256(BANK)}`",
        f"- 待审核：{len(rows)} 道",
        "- 规则：候选引文只用于定位；审核人必须根据题意确认，不能按候选分数自动判答案。",
        "- 填写：在每题 `审核答案` 后写 A/B/C，并保留至少一条能支持该答案的引文。",
        "",
    ]
    for row in rows:
        lines += [
            f"## EP{row['episode']:03d} · Q{row['number']}",
            "",
            f"**题目：** {row['question']}",
            "",
            f"**来源页：** {row.get('page')}  "
            f"**否定题：** {'是' if row['negation'] else '否'}",
            "",
        ]
        for index, choice in enumerate(row["choices"]):
            letter = chr(65 + index)
            lines.append(f"- **{letter}. {choice}**")
            quotes = row["candidates"][index]
            if not quotes:
                lines.append("  - 未定位到含该选项关键词的原文；这不表示该选项错误。")
            else:
                for quote in quotes:
                    lines.append(f"  - `{quote['node_id']}`：{quote['quote']}")
        lines += ["", "**审核答案：** 未填写", "", "**审核依据：** 未填写", ""]
    return "\n".join(lines)


def _episodes(raw: str | None) -> set[int] | None:
    if not raw or raw == "all":
        return None
    result: set[int] = set()
    for part in raw.split(","):
        if "-" in part:
            first, last = part.split("-", 1)
            result.update(range(int(first), int(last) + 1))
        else:
            result.add(int(part))
    if any(episode < 1 or episode > 108 for episode in result):
        raise SystemExit("episode must be within 1..108")
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--episodes", default="all")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    bank, rows = build_rows(_episodes(args.episodes))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(render_markdown(bank, rows), encoding="utf-8")
    print(f"review packet -> {args.output} ({len(rows)} questions)")


if __name__ == "__main__":
    main()
