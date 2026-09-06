# -*- coding: utf-8 -*-
"""Expand Mikey & JJ book quizzes with generated context-fill / listen-choice
questions.

Every authored book quiz carries 5 meaning-choice questions locked to a real
sentence and glossary term.  This tool derives two extra question types from
the same trusted material -- no fabricated content:

- ``context-fill``: the source sentence with its key term blanked out;
  options are the term plus three other authored terms from the same book.
  The speaker button plays the source sentence clip so the child hears the
  full sentence as a scaffold.
- ``listen-choice``: play a sentence clip; options are the correct sentence
  plus three distractor sentences of similar length from other pages.

Questions are appended in a fixed interleave so the quiz mixes types, and
every generated question keeps ``source_sentence_id`` / ``audio`` evidence so
``validate_storybook_quiz_evidence`` and the wrong-answer replay stay usable.

Usage:
  python -X utf8 prj/tools/mikey_jj_quiz_expand.py --dry-run
  python -X utf8 prj/tools/mikey_jj_quiz_expand.py
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CONTENT = ROOT / "content"
DATA_ROOT = CONTENT / "storybooks-mikey-jj"

BOOKS = (1, 2, 3, 5, 6, 7, 8, 9, 10, 11)
FILL_PER_BOOK = 2
LISTEN_PER_BOOK = 2
MIN_LISTEN_LEN = 30
MAX_LISTEN_LEN = 110


def blank_sentence(text: str, term: str) -> str | None:
    pattern = re.compile(r"\b" + re.escape(term) + r"[a-z]*\b", re.IGNORECASE)
    if not pattern.search(text):
        return None
    return pattern.sub("____", text, count=1)


def rotate(choices: list[str], answer: int, offset: int) -> tuple[list[str], int]:
    """Place the answer at a deterministic slot and return (choices, index)."""
    pos = offset % len(choices)
    ordered = choices[:]
    ordered[pos], ordered[answer] = ordered[answer], ordered[pos]
    return ordered, pos


def make_context_fill(book_no: int, index: int, q: dict, sentence: dict, distract: list[str]) -> dict | None:
    term = str(q.get("term") or "").strip()
    text = str(sentence.get("text_en") or "")
    blanked = blank_sentence(text, term)
    if not blanked:
        return None
    term_zh = ""
    for entry in sentence.get("glossary") or []:
        if str(entry.get("term") or "").strip().lower() == term.lower():
            term_zh = str(entry.get("zh") or "")
            break
    choices = [term] + distract
    ordered, answer = rotate(choices, 0, book_no * 3 + index * 2)
    return {
        "id": f"mikey-b{book_no}-fill{index + 1}",
        "type": "context-fill",
        "term": term,
        "source_sentence_id": sentence.get("id"),
        "source_text_en": text,
        "q": blanked,
        "prompt_en": blanked,
        "prompt_zh": str(sentence.get("zh") or ""),
        "choices": ordered,
        "choices_zh": [],
        "answer": answer,
        "audio": sentence.get("audio"),
        "explanation": f"{term} = {term_zh}" if term_zh else term,
    }


def make_listen_choice(book_no: int, index: int, sentence: dict, distractors: list[dict]) -> dict | None:
    choices = [str(sentence.get("text_en") or "")]
    choices_zh = [str(sentence.get("zh") or "")]
    for other in distractors:
        choices.append(str(other.get("text_en") or ""))
        choices_zh.append(str(other.get("zh") or ""))
    ordered, answer = rotate(choices, 0, book_no * 5 + index * 3)
    ordered_zh, _ = rotate(choices_zh, 0, book_no * 5 + index * 3)
    return {
        "id": f"mikey-b{book_no}-listen{index + 1}",
        "type": "listen-choice",
        "source_sentence_id": sentence.get("id"),
        "source_text_en": sentence.get("text_en"),
        "q": "🔊 Listen. Which sentence do you hear?",
        "prompt_en": "🔊 Listen. Which sentence do you hear?",
        "prompt_zh": "听录音，选出你听到的句子。",
        "choices": ordered,
        "choices_zh": ordered_zh,
        "answer": answer,
        "audio": sentence.get("audio"),
        "explanation": str(sentence.get("zh") or ""),
    }


def expand_book(book_no: int) -> tuple[int, int]:
    path = DATA_ROOT / f"book{book_no}.json"
    book = json.loads(path.read_text(encoding="utf-8"))
    authored = [q for q in (book.get("quiz") or []) if isinstance(q, dict)]
    sentences: dict[str, dict] = {}
    ordered_sentences: list[dict] = []
    for page in book.get("pages") or []:
        for sentence in page.get("sentences") or []:
            if sentence.get("id"):
                sentences[sentence["id"]] = sentence
                ordered_sentences.append(sentence)

    generated: list[dict] = []
    used_sentence_ids: set[str] = set()
    for q in authored:
        sid = str(q.get("source_sentence_id") or "")
        if sid:
            used_sentence_ids.add(sid)

    # context-fill: derive from per-page glossary terms (2-4 terms per page
    # are part of the locked sentence contract), never from fabricated data.
    glossary_pool: list[tuple[dict, str]] = []
    for sentence in ordered_sentences:
        for entry in sentence.get("glossary") or []:
            term = str(entry.get("term") or "").strip()
            if term and (sentence.get("id") or "") not in used_sentence_ids:
                glossary_pool.append((sentence, term))
    all_terms: list[str] = []
    for _sentence, term in glossary_pool:
        if term not in all_terms:
            all_terms.append(term)

    fill_done = 0
    used_terms: set[str] = set()
    step = max(1, len(glossary_pool) // (FILL_PER_BOOK + 1))
    for sentence, term in glossary_pool[::step]:
        if fill_done >= FILL_PER_BOOK:
            break
        if term.lower() in used_terms or (sentence.get("id") or "") in used_sentence_ids:
            continue
        distract = [t for t in all_terms if t.lower() != term.lower() and t.lower() not in used_terms][:3]
        if len(distract) < 3:
            continue
        made = make_context_fill(book_no, fill_done, {"term": term}, sentence, distract)
        if made is None:
            continue
        generated.append(made)
        used_sentence_ids.add(sentence.get("id"))
        used_terms.add(term.lower())
        fill_done += 1

    # listen-choice: spread across the book, avoid reuse, keep sane lengths
    listen_done = 0
    candidates = [
        s for s in ordered_sentences
        if s.get("audio") and MIN_LISTEN_LEN <= len(str(s.get("text_en") or "")) <= MAX_LISTEN_LEN
        and s.get("id") not in used_sentence_ids
    ]
    if candidates:
        picks = [candidates[int(len(candidates) * frac)] for frac in (0.25, 0.7)]
        seen_ids: set[str] = set()
        picks = [s for s in picks if s.get("id") not in seen_ids and not seen_ids.add(s.get("id"))]
        for i, sentence in enumerate(picks):
            if listen_done >= LISTEN_PER_BOOK:
                break
            length = len(str(sentence.get("text_en") or ""))
            distractors = [
                s for s in candidates
                if s.get("id") != sentence.get("id")
                and abs(len(str(s.get("text_en") or "")) - length) <= length * 0.45
            ]
            # prefer distractors from other pages for a genuine listening test
            others = [s for s in distractors if s.get("id") not in used_sentence_ids]
            pool = others or distractors
            if len(pool) < 3:
                continue
            made = make_listen_choice(book_no, listen_done, sentence, pool[:3])
            if made is None:
                continue
            generated.append(made)
            used_sentence_ids.add(sentence.get("id"))
            listen_done += 1

    if generated and not args_dry_run:
        quiz = book.get("quiz") or []
        # interleave: authored first half, fill, authored middle, listen, rest
        half = (len(authored) + 1) // 2
        fills = [g for g in generated if g["type"] == "context-fill"]
        listens = [g for g in generated if g["type"] == "listen-choice"]
        merged = (
            authored[:half]
            + fills[:1]
            + authored[half:half + 2]
            + listens[:1]
            + authored[half + 2:]
            + fills[1:]
            + listens[1:]
        )
        book["quiz"] = merged
        path.write_text(json.dumps(book, ensure_ascii=False, indent=1), encoding="utf-8")
    return len(generated), len(authored)


def main() -> int:
    global args_dry_run
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="report without writing files")
    args = parser.parse_args()
    args_dry_run = args.dry_run
    total = 0
    for book_no in BOOKS_ORDER:
        made, authored = expand_book(book_no)
        total += made
        print(f"book{book_no}: +{made} generated (authored {authored})", flush=True)
    print(f"TOTAL generated {total}{' (dry run)' if args.dry_run else ''}")
    return 0


BOOKS_ORDER = (1, 2, 3, 5, 6, 7, 8, 9, 10, 11)
args_dry_run = False

if __name__ == "__main__":
    sys.exit(main())
