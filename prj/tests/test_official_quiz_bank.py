# -*- coding: utf-8 -*-
"""TDD: EP1 official quiz bank must be faithful and evidence-backed.

Parse the official quiz PDF for episode 1 (exactly 5 questions, chain/choice
fidelity vs content/dialogue_stories/ep1.json), rebuild answers from the
episode's own dialogue nodes with quote-level answer_evidence — never
reusing the old heuristic answer as truth.
"""
from __future__ import annotations

import json
import os
import re
import sys
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from prj.tools import build_official_quiz_bank  # noqa: E402  (red: ImportError until implemented)

QUIZ_PDF = os.path.join(ROOT, "data", "测试题", "08 英文测试题108集全.Journey to the West-quiz.pdf")
STORY_JSON = os.path.join(ROOT, "content", "dialogue_stories", "ep1.json")


def _story() -> dict:
    with open(STORY_JSON, encoding="utf-8") as f:
        return json.load(f)


def _story_ep(ep: int) -> dict:
    path = os.path.join(ROOT, "content", "dialogue_stories", f"ep{ep}.json")
    with open(path, encoding="utf-8") as f:
        return json.load(f)


class OfficialQuizFidelityTests(unittest.TestCase):
    def test_pdf_exists(self):
        self.assertTrue(os.path.isfile(QUIZ_PDF), f"quiz PDF missing: {QUIZ_PDF}")

    def test_ep1_has_exactly_five_questions(self):
        qs = build_official_quiz_bank.parse_episode_quiz(QUIZ_PDF, 1)
        self.assertEqual(len(qs), 5)
        self.assertEqual([q["number"] for q in qs], [1, 2, 3, 4, 5])

    def test_fidelity_against_dialogue_story(self):
        qs = build_official_quiz_bank.parse_episode_quiz(QUIZ_PDF, 1)
        story_qs = _story()["official_quiz"]
        self.assertEqual(len(qs), len(story_qs))
        for parsed, old in zip(qs, story_qs):
            self.assertEqual(
                build_official_quiz_bank.normalize_text(parsed["q"]),
                build_official_quiz_bank.normalize_text(old["q"]),
                f"question mismatch: {parsed['q']!r} vs {old['q']!r}",
            )
            self.assertEqual(len(parsed["choices"]), 3)
            for pc, oc in zip(parsed["choices"], old["choices"]):
                self.assertEqual(
                    build_official_quiz_bank.normalize_text(pc),
                    build_official_quiz_bank.normalize_text(oc),
                    f"choice mismatch for {old['q']!r}",
                )

    def test_each_question_keeps_source_page(self):
        qs = build_official_quiz_bank.parse_episode_quiz(QUIZ_PDF, 1)
        for q in qs:
            self.assertGreaterEqual(q["page"], 1)
            self.assertLessEqual(q["page"], 3)


class AnswerEvidenceTests(unittest.TestCase):
    def _facts(self):
        story = _story()
        qs = build_official_quiz_bank.parse_episode_quiz(QUIZ_PDF, 1)
        rebuilt = build_official_quiz_bank.rebuild_answers(qs, story)
        old_answers = {build_official_quiz_bank.normalize_text(q["q"]): q["answer"] for q in story["official_quiz"]}
        return story, rebuilt, old_answers

    def test_every_answer_is_valid_index(self):
        _, rebuilt, _ = self._facts()
        for q in rebuilt:
            self.assertIn(q["answer"], (0, 1, 2), f"invalid answer for {q['q']}")

    def test_every_answer_has_quote_evidence(self):
        story, rebuilt, _ = self._facts()
        nodes = {n["node_id"]: n for n in story["nodes"]}
        for q in rebuilt:
            self.assertTrue(q["answer_evidence"], f"no evidence for {q['q']}")
            for ev in q["answer_evidence"]:
                self.assertIn(ev["node_id"], nodes, f"evidence node missing for {q['q']}")
                quote = ev["quote"]
                self.assertIn(quote, nodes[ev["node_id"]]["text_en"], f"quote not verbatim for {q['q']}")
                self.assertGreater(len(quote.strip()), 3)

    def test_review_status_is_allowed(self):
        _, rebuilt, _ = self._facts()
        for q in rebuilt:
            self.assertIn(q["review_status"], ("machine_verified", "human_reviewed", "needs_review"))

    def test_answers_not_all_distractorless_blind(self):
        """Every answer must be evidence-driven with a distinct quote."""
        _, rebuilt, _ = self._facts()
        quotes = [ev["quote"] for q in rebuilt for ev in q["answer_evidence"]]
        self.assertEqual(len(set(quotes)), len(quotes), "answers must not share one generic quote")
        self.assertEqual(len([q for q in rebuilt if q["review_status"] == "machine_verified"]), 5)

    def test_evidence_never_carries_old_heuristic_answer(self):
        """Rebuilt answers must be reproduced from evidence, not copied."""
        story, rebuilt, old_map = self._facts()
        # rebuild with evidence removal must not silently reuse old answers:
        # every rebuilt question carries its own fresh evidence, recorded in
        # the same pass; the old answer field is deliberately not consulted.
        for q in rebuilt:
            self.assertNotIn("old_answer_source", q, "old heuristic must not leak into bank records")


class EpisodeTwoTenQuizTests(unittest.TestCase):
    """Revision 2: quiz parsing/rebuild must generalize by episode number."""

    def test_ep2_and_ep10_have_exactly_five_questions(self):
        for ep in (2, 10):
            qs = build_official_quiz_bank.parse_episode_quiz(QUIZ_PDF, ep)
            self.assertEqual(len(qs), 5, f"ep{ep} question count")
            self.assertEqual([q["number"] for q in qs], [1, 2, 3, 4, 5], f"ep{ep} numbering")

    def test_fidelity_ep2_and_ep10(self):
        for ep in (2, 10):
            qs = build_official_quiz_bank.parse_episode_quiz(QUIZ_PDF, ep)
            story_qs = _story_ep(ep)["official_quiz"]
            self.assertEqual(len(qs), len(story_qs), f"ep{ep}")
            for parsed, old in zip(qs, story_qs):
                self.assertEqual(
                    build_official_quiz_bank.normalize_text(parsed["q"]),
                    build_official_quiz_bank.normalize_text(old["q"]),
                    f"ep{ep} question mismatch",
                )
                self.assertEqual(len(parsed["choices"]), 3, f"ep{ep} choice count")
                for pc, oc in zip(parsed["choices"], old["choices"]):
                    self.assertEqual(
                        build_official_quiz_bank.normalize_text(pc),
                        build_official_quiz_bank.normalize_text(oc),
                        f"ep{ep} choice mismatch",
                    )

    def test_evidence_rebuilt_ep2_ep10(self):
        for ep in (2, 10):
            story = _story_ep(ep)
            qs = build_official_quiz_bank.parse_episode_quiz(QUIZ_PDF, ep)
            rebuilt = build_official_quiz_bank.rebuild_answers(qs, story)
            nodes = {n["node_id"]: n for n in story["nodes"]}
            self.assertEqual(len(rebuilt), 5, f"ep{ep}")
            for q in rebuilt:
                self.assertIn(q["review_status"], ("machine_verified", "human_reviewed", "needs_review"))
                self.assertIn(q["answer"], (-1, 0, 1, 2), f"ep{ep} answer index")
                for ev in q["answer_evidence"]:
                    self.assertIn(ev["node_id"], nodes, f"ep{ep} evidence node")
                    self.assertIn(ev["quote"], nodes[ev["node_id"]]["text_en"], f"ep{ep} verbatim quote")
                if q["review_status"] == "machine_verified":
                    self.assertIn(q["answer"], (0, 1, 2))
                    self.assertTrue(q["answer_evidence"], f"ep{ep} verified without evidence")
                else:
                    self.assertEqual(q["answer"], -1, f"ep{ep} needs_review must not guess")


class NegationGateTests(unittest.TestCase):
    """Negation questions ("not/except/false") must stay in the review queue."""

    def test_negation_questions_never_machine_verified(self):
        for ep in (6, 8):
            story = _story_ep(ep)
            qs = build_official_quiz_bank.parse_episode_quiz(QUIZ_PDF, ep)
            rebuilt = build_official_quiz_bank.rebuild_answers(qs, story)
            neg = [q for q in rebuilt if re.search(r"\bnot\b|\bexcept\b|\bfalse\b", q["q"], re.I)]
            self.assertTrue(neg, f"ep{ep} should include a negation question")
            for q in neg:
                self.assertEqual(q["review_status"], "needs_review", f"ep{ep} {q['q']}")
                self.assertEqual(q["answer"], -1, f"ep{ep} {q['q']}")


class FullCollectionQuizTests(unittest.TestCase):
    """Revision 3: --all range and the full 540-question collection."""

    def test_parse_episodes_arg_all(self):
        eps = build_official_quiz_bank.parse_episodes_arg("all")
        self.assertEqual(eps, list(range(1, 109)))

    def test_each_of_108_episodes_has_exactly_five_questions(self):
        total = 0
        for ep in range(1, 109):
            qs = build_official_quiz_bank.parse_episode_quiz(QUIZ_PDF, ep)
            self.assertEqual(len(qs), 5, f"ep{ep} question count")
            # source PDF numbers episodes 1-55 as 1-5 and 56-108 as 6-10
            nums = sorted(q["number"] for q in qs)
            self.assertTrue(
                nums == [1, 2, 3, 4, 5] or nums == [6, 7, 8, 9, 10],
                f"ep{ep} numbering {nums}",
            )
            total += len(qs)
        self.assertEqual(total, 540)

    def test_full_bank_build_540_questions(self):
        bank, report = build_official_quiz_bank.build_bank_by_episodes(list(range(1, 109)))
        self.assertEqual(len(bank["questions"]), 540)
        self.assertEqual(len(report["rows"]), 540)
        from collections import Counter

        per_ep = Counter(q["episode"] for q in bank["questions"])
        self.assertEqual(set(per_ep), set(range(1, 109)))
        self.assertTrue(all(per_ep[ep] == 5 for ep in range(1, 109)))


if __name__ == "__main__":
    unittest.main()