# -*- coding: utf-8 -*-
"""Episode lesson guide builder (TDD, local-only, episodes 1-108).

Merges the official-quiz bank (5 sentence_choice cards) and the
intensive-reader side vocabulary (word_review cards) into
content/lesson_guides/epNNN/lesson.json with a full episode_complete card
pool, plus per-episode source catalogs and a batch coverage report under
content/lesson_guides/reports/.
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from prj.tools import courseware_sources, lesson_schema

GUIDES_DIR = ROOT / "content" / "lesson_guides"
REPORTS_DIR = GUIDES_DIR / "reports"
BANK_JSON = GUIDES_DIR / "official-quiz-bank.json"
REVIEW_JSON = REPORTS_DIR / "quiz-answer-review.json"
STORY_DIR = ROOT / "content" / "dialogue_stories"

ALL_BANDS = ["g1_2", "g3_4", "g5_6"]


def episode_dir(episode: int) -> Path:
    return GUIDES_DIR / f"ep{episode:03d}"


def _official_cards(bank: dict, episode: int) -> list[dict]:
    cards = []
    for q in bank.get("questions", []):
        if q.get("episode") and q["episode"] != episode:
            continue
        order = int(q["number"])
        choices_zh = q.get("choices_zh") or []
        choices = [
            {
                "id": chr(97 + i),
                "en": c,
                "zh": choices_zh[i] if i < len(choices_zh) else "",
            }
            for i, c in enumerate(q["choices"])
        ]
        answer_id = chr(97 + q["answer"]) if 0 <= q["answer"] <= 2 else ""
        evidence = [{"node_id": ev["node_id"], "quote": ev["quote"]} for ev in q.get("answer_evidence", [])]
        cards.append(
            {
                "card_id": f"ep{episode:03d}-official-quiz-{order:03d}",
                "type": "sentence_choice",
                "stage": "episode_complete",
                "order": order,
                "difficulty": 2,
                "grade_bands": list(ALL_BANDS),
                "skills": ["story_comprehension"],
                "prompt": {"en": q["q"], "zh": q.get("q_zh") or ""},
                "payload": {
                    "choices": choices,
                    "answer": answer_id,
                    "answer_evidence": evidence,
                },
                "sources": [
                    {
                        "kind": "official_quiz_pdf",
                        "file": bank["source"]["file"],
                        "page": q["page"],
                        "sha256": bank["source"]["sha256"],
                    }
                ],
                "review_status": q["review_status"],
            }
        )
    return cards


def _vocab_cards(reader: dict, episode: int) -> list[dict]:
    half_file = {h["half"]: h for h in reader["halves"]}
    cards = []
    for idx, v in enumerate(reader["vocab"], start=1):
        sources = []
        for half in v.get("halves") or [v["half"]]:
            rec = half_file.get(half)
            if not rec:
                continue
            sources.append(
                {
                    "kind": "intensive_reader_pdf",
                    "file": rec["file"],
                    "half": half,
                    "pages": list(v["pages"]),
                    "sha256": rec["sha256"],
                }
            )
        cards.append(
            {
                "card_id": f"ep{episode:03d}-vocab-{idx:03d}",
                "type": "word_review",
                "stage": "episode_complete",
                "order": 100 + idx,
                "difficulty": 1,
                "grade_bands": list(ALL_BANDS),
                "skills": ["vocabulary"],
                "prompt": {"en": v["term"], "zh": (v.get("def") or "").split("]")[-1].strip()[:40]},
                "payload": {
                    "term": v["term"],
                    "ipa": v.get("ipa") or "",
                    "pos": v.get("pos") or "",
                    "def": v.get("def") or "",
                    "halves": v.get("halves") or [v["half"]],
                    "pages": v["pages"],
                },
                "sources": sources,
                "review_status": "machine_verified",
            }
        )
    return cards


def _story_title(episode: int) -> dict:
    story = STORY_DIR / f"ep{episode}.json"
    if story.is_file():
        try:
            data = json.loads(story.read_text(encoding="utf-8"))
            t = data.get("title") or {}
            if (t.get("en") or "").strip() or (t.get("zh") or "").strip():
                return {"en": t.get("en") or "", "zh": t.get("zh") or f"西游记 第{episode}集"}
        except Exception:  # noqa: BLE001 - fall back
            pass
    return {"en": f"Journey to the West {episode}", "zh": f"西游记 第{episode}集"}


def build_episode_lesson(episode: int) -> dict:
    """Build (not write) the episode lesson dict from generated artifacts."""
    if not 1 <= episode <= 108:
        raise SystemExit(f"BLOCKED: episode out of range (got {episode})")
    bank = json.loads(BANK_JSON.read_text(encoding="utf-8"))
    reader_path = episode_dir(episode) / "intensive-reader.json"
    if not reader_path.is_file():
        raise FileNotFoundError(f"reader artifact missing: {reader_path} (run extract_intensive_reader first)")
    reader = json.loads(reader_path.read_text(encoding="utf-8"))
    catalog = courseware_sources.catalog_episode(episode)

    cards = _official_cards(bank, episode) + _vocab_cards(reader, episode)
    if sum(1 for c in cards if c["type"] == "sentence_choice") != 5:
        raise RuntimeError(f"ep{episode}: expected exactly 5 official cards in bank")
    lesson = {
        "schema_version": 1,
        "episode": episode,
        "title": _story_title(episode),
        "sources": [
            {"kind": src["kind"], "file": src["file"], "sha256": src["sha256"], "pages": src["pages"]}
            for src in catalog["sources"].values()
            if src.get("file")
        ],
        "cards": cards,
        "teacher_guide": None,
        "review": {
            "status": "draft",
            "reviewed_at": None,
            "card_stats": {
                "total": len(cards),
                "sentence_choice": sum(1 for c in cards if c["type"] == "sentence_choice"),
                "word_review": sum(1 for c in cards if c["type"] == "word_review"),
                "machine_verified": sum(1 for c in cards if c["review_status"] == "machine_verified"),
                "assistant_reviewed": sum(1 for c in cards if c["review_status"] == "assistant_reviewed"),
                "verified": sum(1 for c in cards if c["review_status"] != "needs_review"),
                "needs_review": sum(1 for c in cards if c["review_status"] == "needs_review"),
            },
        },
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
    errs = lesson_schema.validate_lesson_guide(lesson)
    if errs:
        raise RuntimeError(f"lesson schema violations:\n" + "\n".join(errs))
    return lesson


def write_episode(episode: int) -> tuple[Path, Path, Path]:
    out_dir = episode_dir(episode)
    out_dir.mkdir(parents=True, exist_ok=True)
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)

    lesson = build_episode_lesson(episode)
    lesson_path = out_dir / "lesson.json"
    lesson_path.write_text(json.dumps(lesson, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    catalog = courseware_sources.catalog_episode(episode)
    catalog["generated_at"] = datetime.now(timezone.utc).isoformat()
    catalog_path = REPORTS_DIR / f"source-catalog-ep{episode:03d}.json"
    catalog_path.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    report = {
        "schema_version": 1,
        "episode": episode,
        "lesson": str(lesson_path),
        "card_stats": lesson["review"]["card_stats"],
        "sources": {k: (v.get("pages") if isinstance(v, dict) else None) for k, v in catalog["sources"].items()},
        "generated_at": lesson["generated_at"],
    }
    report_path = REPORTS_DIR / f"lesson-guide-report-ep{episode:03d}.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return lesson_path, catalog_path, report_path


def _review_rows() -> list[dict]:
    if not REVIEW_JSON.is_file():
        return []
    try:
        return json.loads(REVIEW_JSON.read_text(encoding="utf-8")).get("rows", [])
    except Exception:  # noqa: BLE001
        return []


def build_coverage(episodes: list[int]) -> dict:
    rows = []
    bank = json.loads(BANK_JSON.read_text(encoding="utf-8"))
    bank_review = bank.get("review", {}).get("episodes", {})
    review_rows = _review_rows()
    for ep in episodes:
        lesson = build_episode_lesson(ep)
        reader = json.loads((episode_dir(ep) / "intensive-reader.json").read_text(encoding="utf-8"))
        catalog = courseware_sources.catalog_episode(ep)
        ep_review = bank_review.get(str(ep), {})
        ep_question_refs = [
            {"episode": r["episode"], "number": r["number"], "status": r["review_status"]}
            for r in review_rows
            if r.get("episode") == ep
        ]
        rows.append(
            {
                "episode": ep,
                "title": lesson["title"],
                "cards_total": len(lesson["cards"]),
                "official_questions": sum(1 for c in lesson["cards"] if c["type"] == "sentence_choice"),
                "vocab_cards": sum(1 for c in lesson["cards"] if c["type"] == "word_review"),
                "reader_halves": len(reader["halves"]),
                "reader_vocab": reader["vocab_count"],
                "quiz_verified": ep_review.get("verified", 0),
                "quiz_needs_review": ep_review.get("needs_review", 0),
                "quiz_distribution": ep_review.get("distribution", {}),
                "main_pptx": bool(catalog["sources"]["main_pptx"]),
                "teacher_available": bool(catalog["sources"]["teacher_pptx"].get("available")),
                "screenshots_available": bool(catalog["sources"]["screenshots_pptx"].get("available")),
                "question_refs": ep_question_refs,
            }
        )
    totals = {
        "episodes": len(rows),
        "official_questions": sum(r["official_questions"] for r in rows),
        "vocab_cards": sum(r["vocab_cards"] for r in rows),
        "cards_total": sum(r["cards_total"] for r in rows),
        "reader_halves": sum(r["reader_halves"] for r in rows),
        "quiz_verified": sum(r["quiz_verified"] for r in rows),
        "quiz_needs_review": sum(r["quiz_needs_review"] for r in rows),
    }
    return {
        "schema_version": 1,
        "revision": 2,
        "episodes": episodes,
        "rows": rows,
        "totals": totals,
        "claim_ceiling": "EPISODES_1_10_DATA_BATCH_ONLY_NO_UI_NO_FULL_108_COMPLETION",
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


def run_batch(episodes: list[int]) -> tuple[list[Path], Path]:
    written = []
    for ep in episodes:
        lesson_path, catalog_path, report_path = write_episode(ep)
        written.extend([lesson_path, catalog_path, report_path])
    coverage = build_coverage(episodes)
    coverage_path = REPORTS_DIR / "coverage-108.json"
    coverage_path.write_text(json.dumps(coverage, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    aggregate = {
        "schema_version": 1,
        "episodes": episodes,
        "totals": coverage["totals"],
        "generated_at": coverage["generated_at"],
    }
    agg_path = REPORTS_DIR / "lesson-guide-report-1-108.json"
    agg_path.write_text(json.dumps(aggregate, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    # cross-collection card_id uniqueness / stage / schema gate
    lessons = []
    for ep in episodes:
        lessons.append(json.loads((episode_dir(ep) / "lesson.json").read_text(encoding="utf-8")))
    errs = lesson_schema.validate_collection(lessons)
    if errs:
        raise RuntimeError("lesson collection violations:\n" + "\n".join(errs))
    return written, coverage_path


def build_ep1_lesson() -> dict:
    """Backward-compatible alias used by the revision-1 tests."""
    return build_episode_lesson(1)


def parse_episodes_arg(raw: str) -> list[int]:
    """'all' -> 1..108; '11' -> [11]; '1-10' -> [1..10]."""
    raw = raw.strip()
    if raw == "all":
        out = list(range(1, 109))
    elif "-" in raw:
        a, b = raw.split("-", 1)
        out = list(range(int(a), int(b) + 1))
    else:
        out = [int(raw)]
    if any(ep < 1 or ep > 108 for ep in out):
        raise SystemExit(f"BLOCKED: episode out of range ({raw})")
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--episode", type=int, default=None)
    ap.add_argument("--episodes", type=str, default=None)
    ap.add_argument("--all", action="store_true")
    args = ap.parse_args()
    if args.all:
        eps = list(range(1, 109))
    elif args.episodes:
        eps = parse_episodes_arg(args.episodes)
    elif args.episode:
        eps = [args.episode]
    else:
        eps = [1]
    if len(eps) > 1:
        written, coverage_path = run_batch(eps)
        print(f"batch lessons/catalogs/reports -> {len(written)} files")
        print(f"coverage -> {coverage_path}")
    else:
        lesson_path, catalog_path, report_path = write_episode(eps[0])
        print(f"lesson   -> {lesson_path}")
        print(f"catalog  -> {catalog_path}")
        print(f"report   -> {report_path}")


if __name__ == "__main__":
    main()
