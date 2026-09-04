from __future__ import annotations

import importlib.util
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
MODULE_PATH = ROOT / "prj" / "tools" / "pipeline_minecraft_storybooks.py"


def load_pipeline():
    assert MODULE_PATH.exists(), "Minecraft 绘本流水线尚未实现"
    spec = importlib.util.spec_from_file_location("pipeline_minecraft_storybooks", MODULE_PATH)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_body_source_pages_skip_duplicate_scans_and_front_matter():
    pipeline = load_pipeline()
    assert pipeline.body_source_pages(36) == list(range(6, 35, 2))


def test_source_pairing_does_not_attach_sky_audio_to_trouble_brewing(tmp_path):
    pipeline = load_pipeline()
    pdfs = [
        tmp_path / "Minecraft：Trouble_Brewing!(已优化).pdf",
        tmp_path / "survival mode(已优化).pdf",
    ]
    mp3s = [
        tmp_path / "Minecraft Young Readers Level 2 Survival Mode.mp3",
        tmp_path / "Minecraft Young Readers Level 2 The Sky’s the Limit.mp3",
    ]

    paired, unmatched_audio = pipeline.pair_sources(pdfs, mp3s)

    by_slug = {item.slug: item for item in paired}
    assert by_slug["trouble-brewing"].audio_path is None
    assert by_slug["survival-mode"].audio_path == mp3s[0]
    assert unmatched_audio == [mp3s[1]]


def test_ocr_lines_are_read_left_page_then_right_page():
    pipeline = load_pipeline()
    texts = ["Right first", "Left second", "Left first", "12"]
    scores = [0.99, 0.99, 0.99, 0.99]
    boxes = [
        [1200, 90, 1500, 130],
        [100, 180, 400, 220],
        [100, 90, 400, 130],
        [100, 260, 130, 290],
    ]

    text, confidence = pipeline.order_ocr_lines(
        texts,
        scores,
        boxes,
        image_width=1800,
    )

    assert text == "Left first Left second\nRight first"
    assert confidence == 0.99


def test_ocr_fragments_on_the_same_line_are_sorted_by_x_not_tiny_y_offsets():
    pipeline = load_pipeline()
    text, _ = pipeline.order_ocr_lines(
        ["Emmy", "galloped home.", "Birch", "and", "Byte ran."],
        [0.99] * 5,
        [
            [135, 115, 251, 161],
            [249, 113, 731, 162],
            [137, 187, 229, 224],
            [236, 189, 301, 224],
            [301, 185, 720, 232],
        ],
        image_width=1800,
        keep_halves=("left",),
    )
    assert text == "Emmy galloped home. Birch and Byte ran."


def test_final_spread_can_keep_only_the_story_half():
    pipeline = load_pipeline()
    text, _ = pipeline.order_ocr_lines(
        ["The story ends.", "JOURNEY INTO THE WORLD OF MINECRAFT"],
        [0.98, 0.99],
        [[100, 90, 500, 130], [1100, 90, 1700, 140]],
        image_width=1800,
        keep_halves=("left",),
    )
    assert text == "The story ends."


def test_storybook_payload_requests_right_caption_layout(tmp_path):
    pipeline = load_pipeline()
    source = pipeline.SourceBook(
        1,
        "escape-from-the-nether",
        "Escape from the Nether!",
        "逃出下界",
        tmp_path / "book.pdf",
        tmp_path / "book.mp3",
    )
    pages = [{"page_no": 1, "source_page": 6, "image": "assets/minecraft/escape/p01.webp", "text_en": "Run!"}]

    payload = pipeline.build_storybook_payload(
        source,
        pages,
        audio_rel="assets/minecraft/escape/audio.mp3",
        duration=42.5,
    )

    assert payload["storybook_id"] == "minecraft_escape-from-the-nether"
    assert payload["layout"] == "spread_with_right_caption"
    assert payload["series"] == "minecraft"
    assert payload["series_count"] == 5
    assert payload["audio_duration_sec"] == 42.5


def test_cover_crop_removes_white_scan_margins():
    pipeline = load_pipeline()
    image = Image.new("RGB", (200, 100), "white")
    for x in range(60, 140):
        for y in range(10, 90):
            image.putpixel((x, y), (20, 80, 140))

    cropped = pipeline.crop_cover_to_content(image)

    assert cropped.size == (80, 80)


def test_cover_crop_ignores_sparse_compression_speckles_in_white_margins():
    pipeline = load_pipeline()
    image = Image.new("RGB", (200, 100), "white")
    for x in range(60, 140):
        for y in range(10, 90):
            image.putpixel((x, y), (20, 80, 140))
    for x, y in ((2, 2), (20, 50), (180, 20), (198, 98)):
        image.putpixel((x, y), (220, 220, 220))

    cropped = pipeline.crop_cover_to_content(image)

    assert cropped.size == (80, 80)


def test_cover_crop_uses_largest_content_run_instead_of_edge_artifact():
    pipeline = load_pipeline()
    image = Image.new("RGB", (200, 100), "white")
    for x in range(60, 140):
        for y in range(10, 90):
            image.putpixel((x, y), (20, 80, 140))
    for y in range(100):
        image.putpixel((199, y), (80, 80, 80))

    cropped = pipeline.crop_cover_to_content(image)

    assert cropped.size == (80, 80)


def test_render_does_not_restore_an_invalid_source_cropbox():
    pipeline = load_pipeline()

    class Rect:
        width = 2

    class Pixmap:
        width = 2
        height = 1
        samples = b"\x00\x00\x00" * 2

    class Page:
        cropbox = "source-crop-overflows-media-by-a-fraction"
        mediabox = "full-media"
        rect = Rect()

        def __init__(self):
            self.set_calls = []

        def set_cropbox(self, value):
            self.set_calls.append(value)
            if value == self.cropbox:
                raise ValueError("CropBox not in MediaBox")

        def get_pixmap(self, **_kwargs):
            return Pixmap()

    page = Page()
    image = pipeline._render_full_spread([page], 1)

    assert image.size == (2, 1)
    assert page.set_calls == ["full-media"]
