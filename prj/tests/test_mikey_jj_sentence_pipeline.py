import importlib.util
import json
from pathlib import Path


PIPELINE = Path(__file__).parents[1] / "tools" / "mikey_jj_sentence_pipeline.py"
SPEC = importlib.util.spec_from_file_location("mikey_jj_sentence_pipeline", PIPELINE)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def test_sentence_pipeline_accepts_two_digit_book_ids(tmp_path: Path) -> None:
    payload = {
        "schema_version": 1,
        "book": 10,
        "annotations": {
            "b10-p01-s01": {
                "text_en": "Hello!",
                "zh": "你好！",
                "speaker": {"id": "narrator", "label": "旁白"},
                "bubble": {"x": 0.1, "y": 0.1, "w": 0.2, "h": 0.1, "tail": "none"},
                "start_ms": 0,
                "end_ms": 500,
            }
        },
    }
    path = tmp_path / "annotations.json"
    path.write_text(json.dumps(payload), encoding="utf-8")

    MODULE.validate_annotations(str(path))
