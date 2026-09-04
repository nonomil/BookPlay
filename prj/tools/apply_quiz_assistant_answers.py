# -*- coding: utf-8 -*-
"""Evidence-gated application of assistant-reviewed official quiz answers.

The command is atomic: every current ``needs_review`` question must have one
legal, quote-backed decision before the bank can be replaced.
"""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
BANK = ROOT / "content" / "lesson_guides" / "official-quiz-bank.json"
STORIES = ROOT / "content" / "dialogue_stories"
REPORTS = ROOT / "content" / "lesson_guides" / "reports"
FINAL_RANGES = (
    "001-009", "010-018", "019-027", "028-036",
    "037-045", "046-054", "055-063", "064-072",
    "073-081", "082-090", "091-099", "100-108",
)
DEFAULT_PACKETS = tuple(REPORTS / f"assistant-final-ep{span}.json" for span in FINAL_RANGES)


def _key(value: dict) -> tuple[int, int]:
    return value.get("episode"), value.get("number")


def _story_nodes(story_dir: Path, episode: int, cache: dict[int, dict]) -> dict:
    if episode not in cache:
        path = story_dir / f"ep{episode}.json"
        if not path.is_file():
            cache[episode] = {}
        else:
            story = json.loads(path.read_text(encoding="utf-8"))
            cache[episode] = {node.get("node_id"): node for node in story.get("nodes", [])}
    return cache[episode]


def validate_packets(bank: dict, packets: list[dict], story_dir: Path) -> tuple[list[str], dict]:
    targets = {_key(q): q for q in bank.get("questions", []) if q.get("review_status") == "needs_review"}
    decisions: dict[tuple[int, int], dict] = {}
    errors: list[str] = []
    story_cache: dict[int, dict] = {}

    for packet in packets:
        reviewer = str(packet.get("reviewer") or "").strip()
        if not reviewer:
            errors.append("packet reviewer is required")
        for answer in packet.get("answers", []):
            key = _key(answer)
            tag = f"ep{key[0]} q{key[1]}"
            if key in decisions:
                errors.append(f"duplicate answer for {tag}")
                continue
            if key not in targets:
                errors.append(f"answer targets non-pending question {tag}")
                continue
            choice_count = len(targets[key].get("choices") or [])
            value = answer.get("answer")
            if isinstance(value, bool) or not isinstance(value, int) or not 0 <= value < choice_count:
                errors.append(f"invalid answer for {tag}: {value!r}")
            expected_letter = chr(65 + value) if isinstance(value, int) and 0 <= value < 26 else None
            if answer.get("answer_letter") != expected_letter:
                errors.append(f"answer letter mismatch for {tag}")
            confidence = answer.get("confidence")
            if isinstance(confidence, bool) or not isinstance(confidence, (int, float)) or not 0 <= confidence <= 1:
                errors.append(f"invalid confidence for {tag}: {confidence!r}")
            if not str(answer.get("rationale") or "").strip():
                errors.append(f"missing rationale for {tag}")
            evidence = answer.get("evidence")
            if not isinstance(evidence, list) or not evidence:
                errors.append(f"missing evidence for {tag}")
            else:
                nodes = _story_nodes(story_dir, key[0], story_cache)
                for item in evidence:
                    node_id = item.get("node_id")
                    quote = str(item.get("quote") or "")
                    if node_id not in nodes:
                        errors.append(f"evidence node missing for {tag}: {node_id!r}")
                    elif not quote or quote not in str(nodes[node_id].get("text_en") or ""):
                        errors.append(f"evidence quote not verbatim for {tag} in {node_id}")
            decisions[key] = {**answer, "reviewer": reviewer}

    for episode, number in sorted(set(targets) - set(decisions)):
        errors.append(f"missing answer for ep{episode} q{number}")
    return errors, decisions


def _rebuild_review(bank: dict) -> None:
    episodes: dict[str, dict] = {}
    total_distribution = {"A": 0, "B": 0, "C": 0, "?": 0}
    for episode in range(1, 109):
        questions = [q for q in bank.get("questions", []) if q.get("episode") == episode]
        distribution = {"A": 0, "B": 0, "C": 0, "?": 0}
        for question in questions:
            answer = question.get("answer")
            letter = chr(65 + answer) if isinstance(answer, int) and 0 <= answer <= 2 else "?"
            distribution[letter] += 1
            total_distribution[letter] += 1
        machine = sum(q.get("review_status") == "machine_verified" for q in questions)
        assistant = sum(q.get("review_status") == "assistant_reviewed" for q in questions)
        pending = sum(q.get("review_status") == "needs_review" for q in questions)
        episodes[str(episode)] = {
            "distribution": distribution,
            "verified": machine + assistant,
            "machine_verified": machine,
            "assistant_reviewed": assistant,
            "needs_review": pending,
        }
    bank["review"] = {
        "episodes": episodes,
        "distribution": total_distribution,
        "note": "machine_verified answers are quote-matched; assistant_reviewed answers are semantic judgments with verbatim story evidence; old_answer is retained only for audit",
    }


def apply_packets(bank: dict, packets: list[dict], story_dir: Path) -> dict:
    errors, decisions = validate_packets(bank, packets, story_dir)
    if errors:
        raise ValueError("; ".join(errors))
    updated = copy.deepcopy(bank)
    for question in updated.get("questions", []):
        key = _key(question)
        if key not in decisions:
            continue
        decision = decisions[key]
        question["answer"] = decision["answer"]
        question["answer_evidence"] = copy.deepcopy(decision["evidence"])
        question["confidence"] = decision["confidence"]
        question["match_kind"] = "assistant_semantic_review"
        question["review_status"] = "assistant_reviewed"
        question["assistant_review"] = {
            "reviewer": decision["reviewer"],
            "rationale": decision["rationale"],
        }
    _rebuild_review(updated)
    return updated


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--bank", type=Path, default=BANK)
    parser.add_argument("--stories", type=Path, default=STORIES)
    parser.add_argument("--packets", type=Path, nargs="+", default=list(DEFAULT_PACKETS))
    parser.add_argument("--apply", action="store_true", help="atomically replace the bank after validation")
    args = parser.parse_args()

    bank = json.loads(args.bank.read_text(encoding="utf-8"))
    packets = [json.loads(path.read_text(encoding="utf-8")) for path in args.packets]
    updated = apply_packets(bank, packets, args.stories)
    count = sum(q.get("review_status") == "assistant_reviewed" for q in updated.get("questions", []))
    if not args.apply:
        print(f"validated {count} assistant answers; bank unchanged")
        return

    before = _sha256(args.bank)
    backup = args.bank.with_name(f"{args.bank.stem}.pre-assistant-review.json")
    if not backup.exists():
        shutil.copy2(args.bank, backup)
    updated.setdefault("review", {})["assistant_review_applied_at"] = datetime.now(timezone.utc).isoformat()
    updated["review"]["pre_assistant_review_sha256"] = before
    temporary = args.bank.with_suffix(args.bank.suffix + ".tmp")
    temporary.write_text(json.dumps(updated, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(args.bank)
    print(f"applied {count} assistant answers -> {args.bank}")
    print(f"backup -> {backup}")


if __name__ == "__main__":
    main()
