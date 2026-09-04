# -*- coding: utf-8 -*-
"""Self-check for the cover-card map nodes (jttw-map-node-01).

Prints one KEY VALUE pair per line so a shell can diff it against expectations
without fighting PowerShell quoting rules.
"""
from __future__ import annotations

import io
import sys
from pathlib import Path

ENGINE = Path(__file__).resolve().parents[1] / "engine"


def read(name: str) -> str:
    return io.open(ENGINE / name, encoding="utf-8").read()


def main() -> int:
    js = read("map.js")
    css = read("map.css")
    html = read("map.html")

    checks = {
        "EPMETA": js.count("function epMeta("),
        "EPCARD": js.count("function epCard("),
        "TITLEOF": js.count("titleOf"),
        # .map-page 仍然要自己设 --bg（合辑背景图），只有 splash 改用固定封面
        "MAPPAGE_SETS_BG": js.count('setProperty("--bg"') == 1,
        "SPLASH_SETS_BG": "--bg" in js[js.index("function splash(") : js.index("function splash(") + 700].split("\n}")[0],
        "NODE_COVER_CSS": ".node-cover" in css,
        "NODE_TEXT_CSS": ".node-text" in css,
        "COVER_SPLASH": "journey-west-cover.png" in css,
        "OLD_CIRCLE_84": "width: 84px" in css,
        "NODES_OVERFLOW": "overflow-y: auto" in css,
        "V5_TAGS": html.count("?v=5"),
        "IMG_IN_NODE": js.count("<img src="),
        "UNLOCK_RULES_INTACT": all(
            s in js
            for s in (
                "const epUnlocked  = (n, c) => n === c.from || epDone(n - 1)",
                "const colUnlocked = (c, prev) => c.index === 1",
                "function grandfatherDrills()",
                "invalidateCache",
            )
        ),
    }
    for key, value in checks.items():
        print(key, value)
    return 0


if __name__ == "__main__":
    sys.exit(main())
