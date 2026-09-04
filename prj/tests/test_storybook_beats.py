import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
from storybook_beats import attach_ep1_scenes, flatten_beats

EP1 = Path(__file__).resolve().parents[1] / "data" / "storybooks" / "ep1.json"


def test_ep1_scenes_have_six_modes_and_timed_beats():
    book = json.loads(EP1.read_text(encoding="utf-8"))
    scenes = attach_ep1_scenes(book["pages"])
    assert [s["id"] for s in scenes] == ["s01", "s02", "s03", "s04", "s05", "s06"]
    assert [s["mode"] for s in scenes] == ["clip", "clip", "clip", "clip", "hybrid", "sprite"]
    beats = flatten_beats(scenes)
    assert len(beats) >= 20
    assert beats[0]["start_sec"] == 0
    assert beats[0]["text_en"].startswith("From the beginning")
    assert "king" in beats[-1]["text_en"].lower()
    assert scenes[4]["choice"]["options"]
    assert scenes[5]["choice"]["options"]
    assert scenes[5]["sprite"] == "assets/cast/wukong/idle.png"
