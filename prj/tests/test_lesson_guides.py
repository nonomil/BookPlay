# -*- coding: utf-8 -*-
"""TDD: EP1 lesson.json card pool must satisfy the unified bank contract.

The guide merges the official-quiz bank (5 sentence_choice cards) and the
intensive-reader side vocabulary (word_review cards) into ep001/lesson.json;
every card passes lesson_schema.validate_card and the pool is JSON-clean.
"""
from __future__ import annotations

import json
import os
import sys
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from prj.tools import build_lesson_guide  # noqa: E402  (red: ImportError until implemented)
from prj.tools import lesson_schema  # noqa: E402  (red: ImportError until implemented)

EP001_DIR = os.path.join(ROOT, "content", "lesson_guides", "ep001")
BANK_JSON = os.path.join(ROOT, "content", "lesson_guides", "official-quiz-bank.json")


class LessonSchemaTests(unittest.TestCase):
    def test_valid_card_passes(self):
        card = {
            "card_id": "ep001-official-quiz-001",
            "type": "sentence_choice",
            "stage": "episode_complete",
            "order": 1,
            "difficulty": 2,
            "grade_bands": ["g1_2", "g3_4", "g5_6"],
            "skills": ["story_comprehension"],
            "prompt": {"en": "What did Monkey come out of?", "zh": "猴子从哪里出来？"},
            "payload": {
                "choices": [
                    {"id": "a", "en": "a rock", "zh": "一块岩石"},
                    {"id": "b", "en": "a tree", "zh": "一棵树"},
                    {"id": "c", "en": "a river", "zh": "一条河"},
                ],
                "answer": "a",
                "answer_evidence": [{"node_id": "ep001-n001", "quote": "a rock had sat high on top of a mountain"}],
            },
            "sources": [{"kind": "official_quiz_pdf", "page": 1, "sha256": "0" * 64}],
            "review_status": "machine_verified",
        }
        self.assertEqual(lesson_schema.validate_card(card), [])

    def test_card_without_evidence_fails(self):
        card = {
            "card_id": "ep001-x",
            "type": "sentence_choice",
            "stage": "episode_complete",
            "order": 9,
            "difficulty": 2,
            "grade_bands": ["g1_2"],
            "skills": ["story_comprehension"],
            "prompt": {"en": "q?", "zh": "题？"},
            "payload": {
                "choices": [
                    {"id": "a", "en": "x", "zh": "x"},
                    {"id": "b", "en": "y", "zh": "y"},
                    {"id": "c", "en": "z", "zh": "z"},
                ],
                "answer": "a",
                "answer_evidence": [],
            },
            "sources": [],
            "review_status": "needs_review",
        }
        self.assertNotEqual(lesson_schema.validate_card(card), [])


class LessonGuideBuildTests(unittest.TestCase):
    def _lesson(self) -> dict:
        return build_lesson_guide.build_ep1_lesson()

    def test_lesson_has_five_official_cards_in_order(self):
        lesson = self._lesson()
        official = [c for c in lesson["cards"] if c["type"] == "sentence_choice"]
        self.assertEqual(len(official), 5)
        self.assertEqual([c["order"] for c in official], [1, 2, 3, 4, 5])
        for c in official:
            self.assertEqual(c["stage"], "episode_complete")
            self.assertTrue(c["payload"]["answer_evidence"], f"no evidence on {c['card_id']}")

    def test_card_ids_unique_and_prefixes_stable(self):
        lesson = self._lesson()
        ids = [c["card_id"] for c in lesson["cards"]]
        self.assertEqual(len(ids), len(set(ids)), "card ids must be unique")
        for card_id in ids:
            self.assertTrue(card_id.startswith("ep001-"), card_id)
        for c in lesson["cards"]:
            if c["type"] == "sentence_choice":
                self.assertTrue("ep001-official-quiz-" in c["card_id"], c["card_id"])
            elif c["type"] == "word_review":
                self.assertTrue("ep001-vocab-" in c["card_id"], c["card_id"])

    def test_vocab_cards_with_reader_sources(self):
        lesson = self._lesson()
        vocab = [c for c in lesson["cards"] if c["type"] == "word_review"]
        self.assertGreaterEqual(len(vocab), 50, "side vocab must become word cards")
        with_ipa = sum(1 for c in vocab if (c["payload"].get("ipa") or "").strip())
        self.assertGreaterEqual(with_ipa, int(len(vocab) * 0.9), ">=90% vocab cards carry IPA")
        for c in vocab:
            self.assertTrue(any(s["kind"] == "intensive_reader_pdf" for s in c["sources"]))

    def test_all_cards_pass_schema(self):
        lesson = self._lesson()
        problems = []
        for c in lesson["cards"]:
            errs = lesson_schema.validate_card(c)
            if errs:
                problems.append((c["card_id"], errs))
        self.assertEqual(problems, [])

    def test_lesson_json_roundtrip(self):
        lesson = self._lesson()
        text = json.dumps(lesson, ensure_ascii=False, indent=2)
        loaded = json.loads(text)
        self.assertEqual(loaded["episode"], 1)
        self.assertGreaterEqual(len(loaded["cards"]), 55)


class EpisodeTwoTenLessonTests(unittest.TestCase):
    """Revision 2: guiding must generalize by episode; batch 1-10 must hold."""

    def test_ep2_lesson_structure(self):
        lesson = build_lesson_guide.build_episode_lesson(2)
        self.assertEqual(lesson["episode"], 2)
        official = [c for c in lesson["cards"] if c["type"] == "sentence_choice"]
        self.assertEqual(len(official), 5)
        self.assertEqual([c["order"] for c in official], [1, 2, 3, 4, 5])
        ids = [c["card_id"] for c in lesson["cards"]]
        self.assertEqual(len(ids), len(set(ids)), "ep002 card ids must be unique")
        for c in lesson["cards"]:
            self.assertEqual(c["stage"], "episode_complete")
            self.assertTrue(c["card_id"].startswith("ep002-"), c["card_id"])
        problems = [errs for c in lesson["cards"] for errs in lesson_schema.validate_card(c)]
        self.assertEqual(problems, [])

    def test_ep10_lesson_structure(self):
        lesson = build_lesson_guide.build_episode_lesson(10)
        self.assertEqual(lesson["episode"], 10)
        official = [c for c in lesson["cards"] if c["type"] == "sentence_choice"]
        self.assertEqual(len(official), 5)
        ids = [c["card_id"] for c in lesson["cards"]]
        self.assertEqual(len(ids), len(set(ids)), "ep010 card ids must be unique")
        for c in lesson["cards"]:
            self.assertEqual(c["stage"], "episode_complete")
            self.assertTrue(c["card_id"].startswith("ep010-"), c["card_id"])

    def test_batch_episodes_1_10(self):
        for ep in range(1, 11):
            lesson = build_lesson_guide.build_episode_lesson(ep)
            official = [c for c in lesson["cards"] if c["type"] == "sentence_choice"]
            self.assertEqual(len(official), 5, f"ep{ep} official count")
            self.assertTrue(all(c["stage"] == "episode_complete" for c in lesson["cards"]), f"ep{ep} stage")
            ids = [c["card_id"] for c in lesson["cards"]]
            self.assertEqual(len(ids), len(set(ids)), f"ep{ep} unique ids")
            prefix = f"ep{ep:03d}-"
            self.assertTrue(all(c["card_id"].startswith(prefix) for c in lesson["cards"]), f"ep{ep} prefix")
            problems = [errs for c in lesson["cards"] for errs in lesson_schema.validate_card(c)]
            self.assertEqual(problems, [], f"ep{ep} schema")


class FullCollectionLessonTests(unittest.TestCase):
    """Revision 3: --all range, 108 lessons, globally unique card ids."""

    def test_parse_episodes_arg_all(self):
        eps = build_lesson_guide.parse_episodes_arg("all")
        self.assertEqual(eps, list(range(1, 109)))

    def test_all_108_lessons_exist_with_global_unique_ids(self):
        ids = []
        prefixes = set()
        for ep in range(1, 109):
            path = os.path.join(ROOT, "content", "lesson_guides", f"ep{ep:03d}", "lesson.json")
            self.assertTrue(os.path.isfile(path), f"missing lesson: {path}")
            with open(path, encoding="utf-8") as f:
                lesson = json.load(f)
            for c in lesson["cards"]:
                ids.append(c["card_id"])
                prefixes.add(c["card_id"].split("-")[0])
            self.assertEqual(lesson["episode"], ep)
            self.assertTrue(all(c["stage"] == "episode_complete" for c in lesson["cards"]), f"ep{ep}")
            problems = [errs for c in lesson["cards"] for errs in lesson_schema.validate_card(c)]
            self.assertEqual(problems, [], f"ep{ep} schema")
        self.assertEqual(len(ids), len(set(ids)), "card ids must be globally unique across all 108 lessons")
        self.assertEqual(len(prefixes), 108, "each episode must have its own epNNN- prefix family")

    def test_lesson_schema_global_id_validator(self):
        lessons = []
        for ep in range(1, 109):
            path = os.path.join(ROOT, "content", "lesson_guides", f"ep{ep:03d}", "lesson.json")
            with open(path, encoding="utf-8") as f:
                lessons.append(json.load(f))
        errs = lesson_schema.validate_collection(lessons)
        self.assertEqual(errs, [])


if __name__ == "__main__":
    unittest.main()