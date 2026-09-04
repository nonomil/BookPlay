# -*- coding: utf-8 -*-
"""Render the complete official quiz answer key with review provenance."""
from __future__ import annotations

import argparse
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
BANK = ROOT / "content" / "lesson_guides" / "official-quiz-bank.json"
OUTPUT = ROOT / "content" / "lesson_guides" / "reports" / "quiz-answer-key.md"


def _cell(question: dict | None) -> str:
    if not question or not isinstance(question.get("answer"), int):
        return "—"
    letter = chr(65 + question["answer"])
    provenance = "机" if question.get("review_status") == "machine_verified" else "AI"
    return f"{letter}·{provenance}"


def _safe(value: object) -> str:
    return str(value or "").replace("|", "\\|").replace("\n", " ")


def render_markdown(bank: dict) -> str:
    questions = bank.get("questions", [])
    machine = sum(q.get("review_status") == "machine_verified" for q in questions)
    assistant = sum(q.get("review_status") == "assistant_reviewed" for q in questions)
    pending = sum(q.get("review_status") == "needs_review" for q in questions)
    lines = [
        "# 《西游记》108 集官方测试题答案表",
        "",
        "> 本表不是官方 Answer Key。`机` 表示故事原文逐字机器验证；`AI` 表示逐题语义审核并保留逐字故事证据。",
        "",
        f"- 总题数：{len(questions)}",
        f"- 机器验证：{machine}",
        f"- AI 语义审核：{assistant}",
        f"- 待审核：{pending}",
        "",
        "| 集数 | Q1 | Q2 | Q3 | Q4 | Q5 |",
        "|---:|:---:|:---:|:---:|:---:|:---:|",
    ]
    episodes = sorted({q.get("episode") for q in questions if isinstance(q.get("episode"), int)})
    for episode in episodes:
        by_number = {q.get("number"): q for q in questions if q.get("episode") == episode}
        cells = " | ".join(_cell(by_number.get(number)) for number in range(1, 6))
        lines.append(f"| EP{episode:03d} | {cells} |")

    low = [
        q for q in questions
        if q.get("review_status") == "assistant_reviewed"
        and isinstance(q.get("confidence"), (int, float))
        and q["confidence"] < 0.9
    ]
    lines += ["", "## 低置信或题意歧义", ""]
    if not low:
        lines.append("无。")
    else:
        for question in sorted(low, key=lambda q: (q["episode"], q["number"])):
            rationale = (question.get("assistant_review") or {}).get("rationale") or ""
            lines += [
                f"### EP{question['episode']:03d} Q{question['number']} · {chr(65 + question['answer'])}",
                "",
                f"- 置信度：{question['confidence']:.2f}",
                f"- 题目：{_safe(question.get('q'))}",
                f"- 说明：{_safe(rationale)}",
                "",
            ]
    return "\n".join(lines).rstrip() + "\n"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--bank", type=Path, default=BANK)
    parser.add_argument("--output", type=Path, default=OUTPUT)
    args = parser.parse_args()
    bank = json.loads(args.bank.read_text(encoding="utf-8"))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(render_markdown(bank), encoding="utf-8")
    print(f"answer key -> {args.output} ({len(bank.get('questions', []))} questions)")


if __name__ == "__main__":
    main()
