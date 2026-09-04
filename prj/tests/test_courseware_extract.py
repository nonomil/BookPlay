# -*- coding: utf-8 -*-
"""TDD: EP1 main PPTX must yield 20 order-stable slide records with source relationship.

Extractor does not exist yet; this test is expected to fail (red) until
prj/tools/extract_courseware.py is implemented.
"""
from __future__ import annotations

import json
import os
import sys
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from prj.tools import extract_courseware  # noqa: E402  (red: ImportError until implemented)

MAIN_PPTX = (
    ROOT
    / "data"  # type: ignore[operator]
) if False else os.path.join(
    ROOT,
    "data",
    "西游记课件",
    "3.3西游记  Journey to the West PPT课件",
    "001_Journey to the West 1_The Monkey.pptx",
)

SCREENSHOT_PPTX = os.path.join(
    ROOT,
    "data",
    "西游记课件",
    "西游记-外教课动画截图",
    "Journey to the West 001  The Monkey_20240106162142.pptx",
)


def _build_receipt() -> dict:
    records = extract_courseware.main_slide_records(MAIN_PPTX)
    assets = [
        {
            "slide": r["slide"],
            "output": r["output_name"],
            "media_path": r["source"]["media_path"],
            "relationship": r["source"]["relation_id"],
            "source_sha256": "0" * 64,
            "output_sha256": "0" * 64,
            "width": 1,
            "height": 1,
        }
        for r in records
    ]
    ocr = extract_courseware.ocr_probe()
    return extract_courseware.build_receipt(records, assets, ocr)


class MainSlideExtractTests(unittest.TestCase):
    def test_main_pptx_exists(self):
        self.assertTrue(os.path.isfile(MAIN_PPTX), f"locked main PPTX missing: {MAIN_PPTX}")

    def test_20_ordered_slide_records(self):
        records = extract_courseware.main_slide_records(MAIN_PPTX)
        self.assertEqual(len(records), 20)
        self.assertEqual([r["slide"] for r in records], list(range(1, 21)))

    def test_each_record_has_source_relationship(self):
        records = extract_courseware.main_slide_records(MAIN_PPTX)
        for rec in records:
            self.assertIn("source", rec)
            self.assertIn("relationship", rec["source"])
            self.assertIn("media_path", rec["source"])
            self.assertTrue(rec["source"]["relation_id"])

    def test_output_names_are_slide_001_webp(self):
        records = extract_courseware.main_slide_records(MAIN_PPTX)
        for rec in records:
            expected = f"slide-{rec['slide']:03d}.webp"
            self.assertEqual(rec["output_name"], expected)

    def test_records_are_stable_across_two_calls(self):
        a = extract_courseware.main_slide_records(MAIN_PPTX)
        b = extract_courseware.main_slide_records(MAIN_PPTX)
        self.assertEqual(
            [x["source"]["media_path"] for x in a],
            [x["source"]["media_path"] for x in b],
        )


class ScreenshotsSourceTests(unittest.TestCase):
    def test_receipt_has_screenshots_source(self):
        receipt = _build_receipt()
        self.assertIn("screenshots", receipt["sources"])
        shots = receipt["sources"]["screenshots"]
        self.assertIn("file", shots)
        self.assertIn("sha256", shots)
        self.assertIn("pages", shots)
        self.assertIn("media_count", shots)

    def test_screenshots_file_path_exact(self):
        receipt = _build_receipt()
        shots = receipt["sources"]["screenshots"]
        self.assertEqual(
            shots["file"],
            SCREENSHOT_PPTX,
            "screenshots source must be the locked screenshot PPTX path",
        )

    def test_screenshots_sha256_is_64_hex(self):
        receipt = _build_receipt()
        sha = receipt["sources"]["screenshots"]["sha256"]
        self.assertEqual(len(sha), 64)
        self.assertTrue(all(c in "0123456789abcdef" for c in sha))

    def test_screenshots_pages_and_media_positive(self):
        receipt = _build_receipt()
        shots = receipt["sources"]["screenshots"]
        self.assertGreater(shots["pages"], 0)
        self.assertGreater(shots["media_count"], 0)

    def test_screenshots_ocr_blocked_with_reason(self):
        receipt = _build_receipt()
        shots = receipt["sources"]["screenshots"]
        self.assertIn("ocr", shots)
        self.assertEqual(shots["ocr"]["status"], "blocked")
        self.assertTrue(shots["ocr"]["reason"])


class CoursewareEpisodeGeneralizationTests(unittest.TestCase):
    """Revision 4: episode/episodes/all CLI, EP2 first artifact, and the
    lesson.json byte-unchanged guarantee (the old EP1 extractor wrote an
    empty card pool over lesson.json — that must never happen again)."""

    def test_parse_episodes_arg_all(self):
        self.assertEqual(extract_courseware.parse_episodes_arg("all"), list(range(1, 109)))

    def _lesson_hashes(self) -> dict:
        import hashlib

        hashes = {}
        for ep in range(1, 109):
            p = os.path.join(ROOT, "content", "lesson_guides", f"ep{ep:03d}", "lesson.json")
            with open(p, "rb") as f:
                hashes[ep] = hashlib.sha256(f.read()).hexdigest()
        return hashes

    def test_episode_two_run_keeps_all_lesson_jsons_unchanged(self):
        before = self._lesson_hashes()
        extract_courseware.run_episode(2)
        after = self._lesson_hashes()
        self.assertEqual(before, after, "courseware extractor must never write lesson.json")

    def test_episode_two_source_receipt_assets_and_md(self):
        import hashlib

        extract_courseware.run_episode(2)
        out = os.path.join(ROOT, "content", "lesson_guides", "ep002")
        receipt_path = os.path.join(out, "source-receipt.json")
        md_path = os.path.join(out, "lesson.md")
        self.assertTrue(os.path.isfile(receipt_path), receipt_path)
        self.assertTrue(os.path.isfile(md_path), md_path)
        with open(receipt_path, encoding="utf-8") as f:
            receipt = json.load(f)
        self.assertEqual(receipt["episode"], 2)
        slides = receipt["sources"]["main"]["slides"]
        self.assertGreaterEqual(len(slides), 1)
        for s in slides:
            self.assertRegex(s["source_sha256"], r"^[0-9a-f]{64}$")
            self.assertRegex(s["output_sha256"], r"^[0-9a-f]{64}$")
            self.assertGreater(s["width"], 0)
            self.assertGreater(s["height"], 0)
            self.assertLessEqual(max(s["width"], s["height"]), 1600, "no upscale, longest edge <= 1600")
            webp = os.path.join(out, "assets", s["output"])
            self.assertTrue(os.path.isfile(webp), webp)
            with open(webp, "rb") as f:
                self.assertEqual(hashlib.sha256(f.read()).hexdigest(), s["output_sha256"])

    def test_webp_files_decodable_and_count_matches_slides(self):
        from PIL import Image

        extract_courseware.run_episode(2)
        assets = os.path.join(ROOT, "content", "lesson_guides", "ep002", "assets")
        count = 0
        for name in sorted(os.listdir(assets)):
            if not name.endswith(".webp"):
                continue
            with Image.open(os.path.join(assets, name)) as im:
                self.assertLessEqual(max(im.size), 1600)
                im.load()
            count += 1
        self.assertGreaterEqual(count, 1)
        with open(os.path.join(ROOT, "content", "lesson_guides", "ep002", "source-receipt.json"), encoding="utf-8") as f:
            receipt = json.load(f)
        self.assertEqual(count, len(receipt["sources"]["main"]["slides"]))

    def test_teacher_missing_falls_back_to_unavailable(self):
        receipt = extract_courseware.build_episode_receipt(11)
        self.assertEqual(receipt["episode"], 11)
        teacher = receipt["sources"]["teacher"]
        self.assertEqual(teacher.get("available"), False)
        self.assertTrue(teacher.get("reason"))

    def test_screenshots_are_metadata_only(self):
        meta = extract_courseware.screenshot_meta(extract_courseware.ocr_probe(), episode=2)
        for key in ("file", "sha256", "pages", "media_count", "ocr"):
            self.assertIn(key, meta)
        self.assertGreater(meta["pages"], 0)
        self.assertGreater(meta["media_count"], 0)
        # metadata call must not write any frame files anywhere
        for ep in (2, 11):
            assets = os.path.join(ROOT, "content", "lesson_guides", f"ep{ep:03d}", "assets")
            if os.path.isdir(assets):
                names = os.listdir(assets)
                self.assertFalse(any("frame" in n.lower() or n.lower().startswith("shot") for n in names))


if __name__ == "__main__":
    unittest.main()