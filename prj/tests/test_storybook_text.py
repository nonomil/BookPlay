import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
from pipeline_lf_episode import assign_page_times, title_from_pdf_stem
from storybook_text import clean_story_text


def test_assign_page_times_weights_by_text_length():
    pages = [{"text_en": "aa"}, {"text_en": "aaaa"}]
    assign_page_times(pages, 30.0)
    assert pages[0]["start_sec"] == 0.0
    assert pages[0]["end_sec"] == 10.0
    assert pages[1]["start_sec"] == 10.0
    assert pages[1]["end_sec"] == 30.0


def test_title_from_pdf_stem_uses_last_segment():
    assert title_from_pdf_stem("007_Journey to the West 7_The Land of Darkness") == "The Land of Darkness"
    assert title_from_pdf_stem("017_Journey to the West 17_The Dragon in the River.pdf") == "The Dragon in the River"


def test_drop_cap_appended_after_body_is_prepended():
    spans = [
        (100, 40, 12, "rom the beginning of time, a rock had sat "),
        (120, 40, 12, "high on top of a mountain."),
        (400, 40, 36, "F"),
        (420, 200, 10, "1"),
    ]
    assert clean_story_text(spans).startswith("From the beginning")
    assert not clean_story_text(spans).endswith("1")


def test_sentence_gap_after_period():
    spans = [(10, 10, 12, "Inside was a monkey.The monkey stood up.")]
    text = clean_story_text(spans)
    assert "monkey. The monkey" in text
