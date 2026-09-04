from __future__ import annotations

import importlib.util
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
MODULE_PATH = ROOT / "prj" / "tools" / "mikey_glossary_quality.py"
DATA_DIR = ROOT / "prj" / "data" / "storybooks-mikey-jj"


def load_quality():
    spec = importlib.util.spec_from_file_location("mikey_glossary_quality", MODULE_PATH)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_all_known_mikey_placeholders_have_reviewed_replacements():
    quality = load_quality()
    reports = [quality.audit_file(path) for path in sorted(DATA_DIR.glob("book*.json"))]
    assert sum(len(report["placeholders"]) for report in reports) == 0
    assert all(not report["unknown"] for report in reports)


def test_cleaning_is_idempotent_and_preserves_sentence_structure(tmp_path):
    quality = load_quality()
    source = DATA_DIR / "book10.json"
    target = tmp_path / source.name
    target.write_bytes(source.read_bytes())
    payload = json.loads(target.read_text(encoding="utf-8"))
    seeded = [g for g in quality.iter_glossary(payload) if g.get("term", "").lower() in quality.TERM_MAP][:15]
    assert len(seeded) == 15
    for glossary in seeded:
        glossary["ipa"] = "ˈwɜːd"
        glossary["zh"] = "重点词"
    target.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    first = quality.clean_file(target, write=True)
    second = quality.clean_file(target, write=True)
    assert len(first["changed"]) == 15
    assert second["changed"] == []
    payload = json.loads(target.read_text(encoding="utf-8"))
    sentences = [sentence for page in payload["pages"] for sentence in page["sentences"]]
    assert sentences
    assert all(g.get("zh") not in quality.PLACEHOLDER_ZH for s in sentences for g in s.get("glossary", []))
    assert all(g.get("ipa") not in quality.PLACEHOLDER_IPA for s in sentences for g in s.get("glossary", []))
