# -*- coding: utf-8 -*-
"""TDD: EP1 annotated intensive-reader PDFs (up/down) must parse.

Expected: every half yields its page count, side-vocabulary entries with
term/ipa/def and source pages, plus best-effort English/Chinese text from
the PDF text layer (no OCR, no rewriting of the PDF).
"""
from __future__ import annotations

import json
import os
import re
import sys
import unittest
import unicodedata

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from prj.tools import extract_intensive_reader  # noqa: E402  (red: ImportError until implemented)

READER_DIR = os.path.join(
    ROOT,
    "data",
    "02-西游记精读版台词本",
    "1、带标注版PDF 108集",
)
UP_PDF = os.path.join(READER_DIR, "001 石猴出世 上.pdf")
DOWN_PDF = os.path.join(READER_DIR, "001 石猴出世 下.pdf")


def norm_term(s: str) -> str:
    return re.sub(r"\s+", " ", unicodedata.normalize("NFKC", (s or "").lower())).strip()


class IntensiveReaderPairTests(unittest.TestCase):
    def test_up_down_pair_files_exist(self):
        self.assertTrue(os.path.isfile(UP_PDF), f"EP1 up PDF missing: {UP_PDF}")
        self.assertTrue(os.path.isfile(DOWN_PDF), f"EP1 down PDF missing: {DOWN_PDF}")

    def test_build_returns_episode_and_pair(self):
        data = extract_intensive_reader.build_episode_intensive_reader(1, READER_DIR)
        self.assertEqual(data["episode"], 1)
        halves = {h["half"] for h in data["halves"]}
        self.assertEqual(halves, {"up", "down"})

    def test_up_four_pages_down_three_pages(self):
        data = extract_intensive_reader.build_episode_intensive_reader(1, READER_DIR)
        pages = {h["half"]: h["pages"] for h in data["halves"]}
        self.assertEqual(pages["up"], 4)
        self.assertEqual(pages["down"], 3)

    def test_halves_carry_sha256_and_file(self):
        data = extract_intensive_reader.build_episode_intensive_reader(1, READER_DIR)
        for half in data["halves"]:
            self.assertTrue(half["file"], "half file name must be recorded")
            self.assertRegex(half["sha256"], r"^[0-9a-f]{64}$")
            self.assertGreaterEqual(half["pages"], 1)

    def test_english_and_chinese_text_extracted_per_half(self):
        data = extract_intensive_reader.build_episode_intensive_reader(1, READER_DIR)
        for half in data["halves"]:
            en = half.get("english_text") or ""
            zh = half.get("chinese_text") or ""
            self.assertGreater(len(en), 120, f"{half['half']} english text too short")
            self.assertGreater(len(zh), 30, f"{half['half']} chinese text too short")
            self.assertTrue(re.search(r"[A-Za-z]", en))
            self.assertTrue(re.search(r"[\u4e00-\u9fff]", zh))

    def test_vocab_entries_present_with_ipa_and_def(self):
        data = extract_intensive_reader.build_episode_intensive_reader(1, READER_DIR)
        vocab = data["vocab"]
        self.assertGreaterEqual(len(vocab), 50, "EP1 side vocab should be dense")
        with_ipa = sum(1 for v in vocab if (v.get("ipa") or "").strip())
        self.assertGreaterEqual(with_ipa, int(len(vocab) * 0.9), ">=90% entries must carry IPA")
        for v in vocab:
            self.assertTrue((v.get("term") or "").strip(), "every entry needs a term")
            self.assertTrue((v.get("def") or "").strip(), "every entry needs a definition")
            self.assertTrue(v.get("pages"), "every entry needs source pages")
            self.assertIn(v["half"], ("up", "down"))

    def test_vocab_deduplicated_by_normalized_term(self):
        data = extract_intensive_reader.build_episode_intensive_reader(1, READER_DIR)
        seen: dict[str, int] = {}
        for v in data["vocab"]:
            key = norm_term(v["term"])
            seen[key] = seen.get(key, 0) + 1
        self.assertEqual(max(seen.values()), 1, "normalized term must be unique after merge")

    def test_export_json_roundtrip(self):
        data = extract_intensive_reader.build_episode_intensive_reader(1, READER_DIR)
        # the on-disk artifact is this dict serialized
        text = json.dumps(data, ensure_ascii=False, indent=2)
        loaded = json.loads(text)
        self.assertEqual(loaded["episode"], 1)
        self.assertGreaterEqual(len(loaded["vocab"]), 50)


class EpisodeTwoTenReaderTests(unittest.TestCase):
    """Revision 2: reader parsing must generalize by episode number."""

    def test_ep2_pair_parses(self):
        data = extract_intensive_reader.build_episode_intensive_reader(2, READER_DIR)
        self.assertEqual(data["episode"], 2)
        self.assertEqual({h["half"] for h in data["halves"]}, {"up", "down"})
        for h in data["halves"]:
            self.assertGreaterEqual(h["pages"], 1)
            self.assertGreater(len(h["english_text"]), 40, f"{h['half']} dialogue too short")

    def test_ep10_pair_parses(self):
        data = extract_intensive_reader.build_episode_intensive_reader(10, READER_DIR)
        self.assertEqual(data["episode"], 10)
        self.assertEqual({h["half"] for h in data["halves"]}, {"up", "down"})
        self.assertGreaterEqual(data["vocab_count"], 20)

    def test_episodes_1_10_all_parse(self):
        for ep in range(1, 11):
            data = extract_intensive_reader.build_episode_intensive_reader(ep, READER_DIR)
            self.assertEqual(data["episode"], ep)
            self.assertEqual({h["half"] for h in data["halves"]}, {"up", "down"}, f"ep{ep} halves")
            self.assertGreaterEqual(data["vocab_count"], 20, f"ep{ep} vocab")

    def test_episodes_1_108_all_parse_216_halves(self):
        total = 0
        for ep in range(1, 109):
            data = extract_intensive_reader.build_episode_intensive_reader(ep, READER_DIR)
            self.assertEqual(data["episode"], ep)
            halves = {h["half"] for h in data["halves"]}
            self.assertEqual(halves, {"up", "down"}, f"ep{ep} halves")
            for h in data["halves"]:
                self.assertGreaterEqual(h["pages"], 1, f"ep{ep} {h['half']}")
            total += len(data["halves"])
        self.assertEqual(total, 216)


if __name__ == "__main__":
    unittest.main()