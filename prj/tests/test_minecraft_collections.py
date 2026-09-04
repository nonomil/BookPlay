# -*- coding: utf-8 -*-
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
COLLECTIONS_PATH = ROOT / "content" / "storybooks-minecraft" / "collections.json"
CATALOG_PATH = ROOT / "content" / "storybooks-minecraft" / "catalog.json"
ASSETS = ROOT / "content" / "assets"


def test_minecraft_map_covers_five_books() -> None:
    cols = json.loads(COLLECTIONS_PATH.read_text(encoding="utf-8"))
    catalog = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    assert cols["count"] == 1
    c = cols["collections"][0]
    assert c["id"] == "mc01"
    assert c["from"] == 1 and c["to"] == 5
    assert c.get("has_drill") is False
    books = {ep["book"] for ep in catalog["episodes"]}
    assert books == set(range(1, 6))
    for ep in catalog["episodes"]:
        cover = ASSETS / Path(ep["cover"]).relative_to("assets")
        assert cover.exists(), f"missing cover {cover}"


if __name__ == "__main__":
    test_minecraft_map_covers_five_books()
    print("ok: minecraft map covers 5 books")
