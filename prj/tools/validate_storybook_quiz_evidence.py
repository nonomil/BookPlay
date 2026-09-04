# -*- coding: utf-8 -*-
"""Validate storybook quiz evidence before a content pack is published.

The storybook player can keep reading legacy quiz objects, but a publishable
question must point to the sentence, scene, or concept that teaches it.  This
module is deliberately local-only: it reads JSON, reports structural issues,
and never guesses a source from question text.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any, Iterable


VALID_TYPES = {"meaning-choice", "listen-choice", "context-fill", "comprehension", "shadow"}
WORD_RE = re.compile(r"[A-Za-z]+(?:[-'][A-Za-z]+)?")


def _text(value: Any) -> str:
    return str(value or "").strip()


def _norm(value: Any) -> str:
    return " ".join(_text(value).lower().split())


def _tokens(value: Any) -> list[str]:
    return [part.lower() for part in WORD_RE.findall(_text(value))]


def _issue(code: str, question: dict[str, Any], index: int, message: str, **extra: Any) -> dict[str, Any]:
    item = {
        "code": code,
        "question_index": index,
        "question_id": _text(question.get("id")) or f"question-{index + 1}",
        "message": message,
    }
    item.update(extra)
    return item


def _sentences(book: dict[str, Any]) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    for page_index, page in enumerate(book.get("pages") or []):
        if not isinstance(page, dict):
            continue
        raw_sentences = page.get("sentences")
        if not isinstance(raw_sentences, list):
            raw_sentences = [page]
        for sentence_index, sentence in enumerate(raw_sentences):
            if not isinstance(sentence, dict):
                continue
            sid = _text(sentence.get("id")) or f"p{page_index + 1}-s{sentence_index + 1}"
            result[sid] = sentence
    return result


def _scenes(book: dict[str, Any]) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    for scene in book.get("scenes") or []:
        if isinstance(scene, dict) and _text(scene.get("id")):
            result[_text(scene["id"])] = scene
    return result


def _source_sentence_ids(question: dict[str, Any]) -> list[str]:
    ids: list[str] = []
    single = _text(question.get("source_sentence_id"))
    if single:
        ids.append(single)
    many = question.get("source_sentence_ids")
    if isinstance(many, list):
        ids.extend(_text(value) for value in many if _text(value))
    return list(dict.fromkeys(ids))


def _term_in_glossary(term: str, sentence: dict[str, Any]) -> bool:
    wanted = _norm(term)
    if not wanted:
        return False
    glossary = sentence.get("glossary")
    if not isinstance(glossary, list):
        return False
    return any(isinstance(entry, dict) and _norm(entry.get("term")) == wanted for entry in glossary)


def _term_in_text_boundary(term: str, text: str) -> bool:
    """Return exact token/phrase membership; never use substring matching."""
    wanted = _tokens(term)
    source = _tokens(text)
    if not wanted or not source or len(wanted) > len(source):
        return False
    width = len(wanted)
    return any(source[i : i + width] == wanted for i in range(len(source) - width + 1))


def _question_type(question: dict[str, Any]) -> str:
    return _norm(question.get("type"))


def validate_book(book: dict[str, Any], path: str | Path | None = None) -> list[dict[str, Any]]:
    """Return structured publish-blocking problems for one storybook JSON."""
    problems: list[dict[str, Any]] = []
    sentence_map = _sentences(book)
    scene_map = _scenes(book)
    seen_ids: set[str] = set()
    quiz = book.get("quiz")
    if not isinstance(quiz, list):
        return [{
            "code": "missing_quiz",
            "question_index": None,
            "question_id": None,
            "message": "book.quiz must be an array",
        }]

    for index, raw_question in enumerate(quiz):
        question = raw_question if isinstance(raw_question, dict) else {}
        qid = _text(question.get("id"))
        if not qid:
            problems.append(_issue("missing_id", question, index, "question id is required"))
        elif qid in seen_ids:
            problems.append(_issue("duplicate_id", question, index, f"duplicate question id: {qid}"))
        else:
            seen_ids.add(qid)

        qtype = _question_type(question)
        if not qtype:
            problems.append(_issue("missing_type", question, index, "question type is required"))
        elif qtype not in VALID_TYPES:
            problems.append(_issue("invalid_type", question, index, f"unsupported question type: {qtype}"))

        source_ids = _source_sentence_ids(question)
        source_id = _text(question.get("source_sentence_id"))
        scene_id = _text(question.get("scene_id"))
        if not source_ids and not scene_id:
            problems.append(_issue("missing_source", question, index, "question needs source_sentence_id(s) or scene_id"))
        if source_id and isinstance(question.get("source_sentence_ids"), list):
            if source_id not in source_ids:
                problems.append(_issue("source_field_conflict", question, index, "source_sentence_id is not included in source_sentence_ids"))
        for sid in source_ids:
            if sid not in sentence_map:
                problems.append(_issue("unknown_source_sentence", question, index, f"source sentence does not exist: {sid}", source_sentence_id=sid))
        if scene_id:
            if scene_id not in scene_map:
                problems.append(_issue("unknown_scene", question, index, f"scene does not exist: {scene_id}", scene_id=scene_id))
            else:
                scene_sentence_ids = {
                    _text(value) for value in scene_map[scene_id].get("sentence_ids", [])
                    if _text(value)
                }
                if source_ids and not set(source_ids).issubset(scene_sentence_ids):
                    problems.append(_issue("source_outside_scene", question, index, "source sentence is not listed by scene", scene_id=scene_id))

        choices = question.get("choices_en") if isinstance(question.get("choices_en"), list) else question.get("choices")
        if not isinstance(choices, list) or not choices:
            problems.append(_issue("missing_choices", question, index, "question needs a non-empty choices or choices_en array"))
        answer = question.get("answer")
        if not isinstance(answer, int) or isinstance(answer, bool) or not isinstance(choices, list) or not 0 <= answer < len(choices):
            problems.append(_issue("invalid_answer", question, index, "answer must be a valid choice index"))

        if qtype == "meaning-choice":
            term = _text(question.get("term"))
            if not term:
                problems.append(_issue("missing_term", question, index, "meaning-choice needs an explicit term"))
            if not source_id:
                problems.append(_issue("vocab_requires_sentence", question, index, "meaning-choice needs source_sentence_id"))
            elif source_id in sentence_map and not _term_in_glossary(term, sentence_map[source_id]):
                problems.append(_issue(
                    "term_not_in_source_sentence",
                    question,
                    index,
                    "term is not an exact entry in the source sentence glossary",
                    term=term,
                    source_sentence_id=source_id,
                ))
        elif qtype == "listen-choice":
            audio = _text(question.get("audio"))
            source_audio = source_id and _text(sentence_map.get(source_id, {}).get("audio"))
            if not audio and not source_audio:
                problems.append(_issue("missing_audio", question, index, "listen-choice needs question audio or source sentence audio"))
        elif qtype == "comprehension":
            concept_id = _text(question.get("concept_id"))
            if not concept_id:
                problems.append(_issue("missing_concept_id", question, index, "comprehension needs concept_id"))

        source_text = _text(question.get("source_text_en"))
        if source_text and source_ids:
            known_texts = {_text(sentence_map[sid].get("text_en")) for sid in source_ids if sid in sentence_map}
            if known_texts and source_text not in known_texts:
                problems.append(_issue("source_text_mismatch", question, index, "source_text_en does not equal any source sentence text"))

    return problems


def _book_paths(roots: Iterable[str | Path]) -> list[Path]:
    paths: list[Path] = []
    seen: set[Path] = set()
    for raw_root in roots:
        root = Path(raw_root)
        if root.is_file() and root.suffix.lower() == ".json":
            candidates = [root]
        elif root.is_dir():
            candidates = sorted(root.glob("book*.json"), key=lambda item: item.name.lower())
        else:
            candidates = []
        for path in candidates:
            resolved = path.resolve()
            if resolved not in seen:
                seen.add(resolved)
                paths.append(path)
    return paths


def validate_roots(roots: Iterable[str | Path]) -> dict[str, Any]:
    books: list[dict[str, Any]] = []
    total_questions = 0
    total_problems = 0
    for path in _book_paths(roots):
        entry: dict[str, Any] = {"path": str(path), "problems": []}
        try:
            book = json.loads(path.read_text(encoding="utf-8-sig"))
            if not isinstance(book, dict):
                raise ValueError("book JSON root must be an object")
            quiz = book.get("quiz") if isinstance(book.get("quiz"), list) else []
            entry.update({
                "series": _text(book.get("series")),
                "book": book.get("book"),
                "question_count": len(quiz),
            })
            entry["problems"] = validate_book(book, path)
            total_questions += len(quiz)
        except (OSError, ValueError, json.JSONDecodeError) as exc:
            entry["problems"] = [{
                "code": "invalid_json",
                "question_index": None,
                "question_id": None,
                "message": str(exc),
            }]
        total_problems += len(entry["problems"])
        entry["valid"] = not entry["problems"]
        books.append(entry)
    return {
        "schema_version": 1,
        "roots": [str(Path(root)) for root in roots],
        "summary": {
            "book_count": len(books),
            "question_count": total_questions,
            "problem_count": total_problems,
            "valid": total_problems == 0,
        },
        "books": books,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Validate storybook quiz evidence")
    parser.add_argument("--root", nargs="+", required=True, help="book JSON file or directory containing book*.json")
    parser.add_argument("--report", help="write a JSON audit report")
    args = parser.parse_args(argv)
    report = validate_roots(args.root)
    if args.report:
        report_path = Path(args.report)
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    summary = report["summary"]
    print(
        f"storybook quiz evidence: {summary['book_count']} books, "
        f"{summary['question_count']} questions, {summary['problem_count']} problems"
    )
    if summary["valid"]:
        print("quiz evidence validation OK")
        return 0
    print("quiz evidence validation FAILED")
    return 3


if __name__ == "__main__":
    sys.exit(main())
