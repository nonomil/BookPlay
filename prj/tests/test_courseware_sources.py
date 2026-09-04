# -*- coding: utf-8 -*-
"""TDD: EP1 three-source catalog must resolve every locked source.

main PPTX + teacher PPTX + screenshot PPTX (courseware), the official quiz
PDF (data/测试题) and the annotated intensive-reader 上/下 PDF pair each
resolve to {file, sha256, pages, media_count}; the reader pair is exactly
2 files for episode 1.
"""
from __future__ import annotations

import os
import sys
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from prj.tools import courseware_sources  # noqa: E402  (red: ImportError until implemented)


class EpisodeOneSourceCatalogTests(unittest.TestCase):
    def test_catalog_episode_one_returns_all_kinds(self):
        cat = courseware_sources.catalog_episode(1)
        self.assertEqual(cat["episode"], 1)
        for kind in ("main_pptx", "teacher_pptx", "screenshots_pptx", "quiz_pdf", "reader_up", "reader_down"):
            self.assertIn(kind, cat["sources"], f"missing source kind {kind}")

    def test_every_source_has_file_sha_and_positive_pages(self):
        cat = courseware_sources.catalog_episode(1)
        for kind, src in cat["sources"].items():
            self.assertTrue(src["file"], f"{kind} file missing")
            self.assertRegex(src["sha256"], r"^[0-9a-f]{64}$", f"{kind} sha256")
            self.assertGreaterEqual(src["pages"], 1, f"{kind} pages")

    def test_main_pptx_is_20_pages(self):
        cat = courseware_sources.catalog_episode(1)
        self.assertEqual(cat["sources"]["main_pptx"]["pages"], 20)
        self.assertGreaterEqual(cat["sources"]["main_pptx"]["media_count"], 20)

    def test_teacher_and_screenshots_have_media(self):
        cat = courseware_sources.catalog_episode(1)
        self.assertGreaterEqual(cat["sources"]["teacher_pptx"]["pages"], 1)
        self.assertGreater(cat["sources"]["screenshots_pptx"]["media_count"], 0)

    def test_quiz_pdf_is_131_pages(self):
        cat = courseware_sources.catalog_episode(1)
        self.assertEqual(cat["sources"]["quiz_pdf"]["pages"], 131)

    def test_reader_pair_is_up_and_down(self):
        cat = courseware_sources.catalog_episode(1)
        halves = {
            cat["sources"]["reader_up"]["half"],
            cat["sources"]["reader_down"]["half"],
        }
        self.assertEqual(halves, {"up", "down"})
        self.assertEqual(cat["sources"]["reader_up"]["pages"], 4)
        self.assertEqual(cat["sources"]["reader_down"]["pages"], 3)

    def test_reader_pair_discovery_is_exactly_two(self):
        pair = courseware_sources.discover_reader_pair(1)
        self.assertEqual(len(pair), 2)


class EpisodeTwoTenSourceCatalogTests(unittest.TestCase):
    """Revision 2: the catalog must generalize beyond EP1 by episode number."""

    def test_catalog_episode_two_resolves_all_kinds(self):
        cat = courseware_sources.catalog_episode(2)
        self.assertEqual(cat["episode"], 2)
        for kind in ("quiz_pdf", "reader_up", "reader_down", "main_pptx"):
            self.assertIn(kind, cat["sources"], f"missing source kind {kind}")
            src = cat["sources"][kind]
            self.assertTrue(src["file"], f"{kind} file missing")
            self.assertRegex(src["sha256"], r"^[0-9a-f]{64}$", f"{kind} sha256")
            self.assertGreaterEqual(src["pages"], 1, f"{kind} pages")

    def test_catalog_episode_ten_resolves_all_kinds(self):
        cat = courseware_sources.catalog_episode(10)
        self.assertEqual(cat["episode"], 10)
        for kind in ("quiz_pdf", "reader_up", "reader_down", "main_pptx"):
            self.assertIn(kind, cat["sources"], f"missing source kind {kind}")

    def test_reader_pair_discovery_by_episode(self):
        for ep in (2, 10):
            pair = courseware_sources.discover_reader_pair(ep)
            self.assertEqual(len(pair), 2, f"ep{ep} reader pair")
            names = " ".join(p.name for p in pair)
            self.assertTrue("上" in names and "下" in names, names)

    def test_episodes_1_10_catalog_batch(self):
        for ep in range(1, 11):
            cat = courseware_sources.catalog_episode(ep)
            self.assertEqual(cat["episode"], ep)
            halves = {
                cat["sources"]["reader_up"]["half"],
                cat["sources"]["reader_down"]["half"],
            }
            self.assertEqual(halves, {"up", "down"}, f"ep{ep} reader pair")
            self.assertRegex(cat["sources"]["main_pptx"]["sha256"], r"^[0-9a-f]{64}$")

    def test_teacher_and_screenshots_optional_but_recorded(self):
        for ep in (2, 10):
            cat = courseware_sources.catalog_episode(ep)
            for kind in ("teacher_pptx", "screenshots_pptx"):
                self.assertIn(kind, cat["sources"], f"{kind} must be recorded for ep{ep}")
                src = cat["sources"][kind]
                self.assertIn("available", src)
                if src["available"]:
                    self.assertRegex(src["sha256"], r"^[0-9a-f]{64}$")


class FullCollectionSourceTests(unittest.TestCase):
    """Revision 3: 108-episode integrity and the locked main-PPTX hashes."""

    LOCKED = {
        42: "9E3075146E640675AE6AB15EBAB1C68A694EDA40012E6043B132CD0145FA7E6F",
        61: "C06C3469F69CB790D3D7D305E7C4B736051E2CFF66EC4E0F1D62FBC5E85FE7CE",
        97: "6012F2E2DC8F6CA99810CDB14EF98E1F350E1F5DD7067DE2C1C01DC83542A804",
    }

    def test_episodes_1_108_catalog_batch(self):
        for ep in range(1, 109):
            cat = courseware_sources.catalog_episode(ep)
            self.assertEqual(cat["episode"], ep)
            halves = {
                cat["sources"]["reader_up"]["half"],
                cat["sources"]["reader_down"]["half"],
            }
            self.assertEqual(halves, {"up", "down"}, f"ep{ep} reader pair")
            self.assertRegex(cat["sources"]["main_pptx"]["sha256"], r"^[0-9a-f]{64}$", f"ep{ep} main")

    def test_all_108_reader_pairs_discoverable(self):
        total = 0
        for ep in range(1, 109):
            pair = courseware_sources.discover_reader_pair(ep)
            self.assertEqual(len(pair), 2, f"ep{ep}")
            total += len(pair)
        self.assertEqual(total, 216)

    def test_locked_main_pptx_hashes_module_constant(self):
        self.assertEqual(
            courseware_sources.LOCKED_MAIN_HASHES,
            {42: "9E3075146E640675AE6AB15EBAB1C68A694EDA40012E6043B132CD0145FA7E6F".lower(),
             61: "C06C3469F69CB790D3D7D305E7C4B736051E2CFF66EC4E0F1D62FBC5E85FE7CE".lower(),
             97: "6012F2E2DC8F6CA99810CDB14EF98E1F350E1F5DD7067DE2C1C01DC83542A804".lower()},
        )

    def test_locked_main_pptx_hashes_match_task_pins(self):
        for ep, pin in self.LOCKED.items():
            path = courseware_sources.discover_main_pptx(ep)
            self.assertIn("3.3西游记", str(path), f"ep{ep} must come from the locked main dir, not G092")
            self.assertEqual(courseware_sources.sha256_file(path).upper(), pin, f"ep{ep} hash lock")
            self.assertNotIn("G092", str(path))

    def test_main_pptx_lock_rejects_wrong_hash(self):
        with self.assertRaises(Exception):
            courseware_sources.discover_main_pptx(-1)


if __name__ == "__main__":
    unittest.main()