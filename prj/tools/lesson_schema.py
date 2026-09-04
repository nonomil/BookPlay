# -*- coding: utf-8 -*-
"""Unified lesson card pool contract (TDD).

Every card in content/lesson_guides/ep001/lesson.json must satisfy this
schema: stable card_id, episode-complete stage, difficulty 1-5, grade bands,
skills, bilingual prompt, typed payload with legal answer + answer_evidence
(unless needs_review), and auditable sources.
"""
from __future__ import annotations

CARD_TYPES = {"sentence_choice", "word_review", "image_choice", "sequence", "grammar", "expression", "free_talk"}
STAGES = {"episode_complete"}
GRADE_BANDS = {"g1_2", "g3_4", "g5_6"}
STATUSES = {"machine_verified", "human_reviewed", "assistant_reviewed", "needs_review"}
ANSWER_IDS = {"a", "b", "c", "d", "e"}

REQUIRED_CARD_FIELDS = ("card_id", "type", "stage", "order", "difficulty", "grade_bands", "skills", "prompt", "payload", "sources", "review_status")


def validate_card(card: dict) -> list[str]:
    """Return a list of human-readable schema violations ([] == valid)."""
    errs: list[str] = []
    for field in REQUIRED_CARD_FIELDS:
        if field not in card:
            errs.append(f"missing field: {field}")
            continue
        if card[field] in (None, "", []):
            errs.append(f"empty field: {field}")
    if "card_id" in card and not isinstance(card["card_id"], str):
        errs.append("card_id must be a string")
    if "type" in card and card["type"] not in CARD_TYPES:
        errs.append(f"unknown card type: {card.get('type')!r}")
    if "stage" in card and card["stage"] not in STAGES:
        errs.append(f"unknown stage: {card.get('stage')!r}")
    if "order" in card and (not isinstance(card["order"], int) or card["order"] < 1):
        errs.append("order must be a positive integer")
    if "difficulty" in card and (not isinstance(card["difficulty"], int) or not 1 <= card["difficulty"] <= 5):
        errs.append("difficulty must be an integer 1..5")
    if "grade_bands" in card:
        bands = set(card["grade_bands"])
        if not bands:
            errs.append("grade_bands must not be empty")
        unknown = bands - GRADE_BANDS
        if unknown:
            errs.append(f"unknown grade bands: {sorted(unknown)}")
    if "skills" in card and not isinstance(card["skills"], list):
        errs.append("skills must be a list")
    prompt = card.get("prompt") or {}
    if isinstance(prompt, dict):
        if not (prompt.get("en") or "").strip():
            errs.append("prompt.en must be non-empty")
        if not (prompt.get("zh") or "").strip():
            errs.append("prompt.zh must be non-empty")
    else:
        errs.append("prompt must be an object with en/zh")
    payload = card.get("payload") or {}
    if not isinstance(payload, dict):
        errs.append("payload must be an object")
    if "review_status" in card and card["review_status"] not in STATUSES:
        errs.append(f"unknown review_status: {card.get('review_status')!r}")
    if card.get("type") == "sentence_choice":
        choices = payload.get("choices") or []
        if len(choices) < 2:
            errs.append("sentence_choice needs >= 2 choices")
        ids = []
        for c in choices:
            if not isinstance(c, dict) or "id" not in c or not (c.get("en") or "").strip():
                errs.append("each choice needs id and en")
                continue
            ids.append(c["id"])
            if not (c.get("zh") or "").strip():
                errs.append(f"choice {c['id']} needs zh")
        answer = payload.get("answer")
        if card.get("review_status") == "needs_review":
            # needs_review cards carry no scored answer; they stay in the
            # full pool and review reports but never enter the default pool
            if answer not in ("", None):
                errs.append(f"needs_review answer must be empty, got {answer!r}")
        elif answer not in ANSWER_IDS or (ids and answer not in ids):
            errs.append(f"answer {answer!r} must reference a choice id")
        if card.get("review_status") != "needs_review" and not payload.get("answer_evidence"):
            errs.append("objective card needs non-empty answer_evidence unless needs_review")
    sources = card.get("sources") or []
    if not isinstance(sources, list) or not sources:
        errs.append("sources must be a non-empty list")
    for i, s in enumerate(sources):
        if not isinstance(s, dict) or not s.get("kind"):
            errs.append(f"source[{i}] needs a kind")
        elif s["kind"] in ("official_quiz_pdf", "intensive_reader_pdf") and not s.get("sha256"):
            errs.append(f"source[{i}] needs sha256")
    return errs


def validate_lesson_guide(lesson: dict) -> list[str]:
    """Check one lesson guide (episodes 1-108 in this slice)."""
    errs: list[str] = []
    ep = lesson.get("episode")
    if not isinstance(ep, int) or not 1 <= ep <= 108:
        errs.append(f"lesson guide episode must be an integer 1..108, got {ep!r}")
    cards = lesson.get("cards") or []
    if not isinstance(cards, list) or not cards:
        errs.append("lesson cards must be a non-empty list")
    ids = [c.get("card_id") for c in cards if isinstance(c, dict)]
    if len(ids) != len(set(ids)):
        errs.append("card ids must be unique")
    if isinstance(ep, int) and 1 <= ep <= 108:
        prefix = f"ep{ep:03d}-"
        bad = [str(i) for i in ids if not str(i).startswith(prefix)]
        if bad:
            errs.append(f"card ids must use the {prefix} prefix (got e.g. {bad[:3]})")
    for c in cards:
        errs.extend(f"{c.get('card_id')}: {e}" for e in validate_card(c))
    return errs


def validate_collection(lessons: list[dict]) -> list[str]:
    """Cross-collection checks over every episode's lesson guide."""
    errs: list[str] = []
    if not lessons:
        return ["empty lesson collection"]
    seen_ids: dict[str, int] = {}
    for lesson in lessons:
        errs.extend(validate_lesson_guide(lesson))
        for c in lesson.get("cards", []):
            cid = c.get("card_id")
            if cid in seen_ids:
                errs.append(f"card_id not globally unique: {cid} (ep{seen_ids[cid]} and ep{lesson.get('episode')})")
            seen_ids[cid] = lesson.get("episode")
    return errs


if __name__ == "__main__":
    import sys

    lesson = json_load = None
    try:
        import json

        lesson = json.load(open(sys.argv[1], encoding="utf-8"))
        errs = validate_lesson_guide(lesson)
        print("OK" if not errs else "\n".join(errs))
        sys.exit(0 if not errs else 3)
    except IndexError:
        print("usage: python lesson_schema.py path/to/lesson.json")
        sys.exit(2)
