#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Verify the APK URL contract against serve.py --data-root."""
from __future__ import annotations

import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))
from paths import CONTENT, ENGINE  # noqa: E402


def check(base: str) -> int:
    fails = 0

    def get(path: str, headers: dict | None = None) -> urllib.response.addinfourl:
        req = urllib.request.Request(base + path, headers=headers or {})
        return urllib.request.urlopen(req, timeout=8)

    tests = [
        ("/engine/home.html", 200, None),
        ("/engine/wala.html", 200, None),
        ("/data/dialogue_stories/ep1.json", 200, None),
        ("/assets/video/ep1.mp4", 206, {"Range": "bytes=0-16"}),
        ("/assets/covers/journey-west-cover.png", 200, None),
    ]
    for path, want, headers in tests:
        try:
            with get(path, headers) as r:
                ok = r.status == want
                extra = ""
                if path.endswith(".mp4"):
                    extra = f" range={r.headers.get('Content-Range')}"
                    ok = ok and (r.headers.get("Content-Range") or "").startswith("bytes")
                print(("OK " if ok else "FAIL"), r.status, path, extra)
                if not ok:
                    fails += 1
        except Exception as exc:
            print("FAIL", path, exc)
            fails += 1
    print("engine", ENGINE)
    print("data", CONTENT)
    return fails


if __name__ == "__main__":
    base = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8820"
    raise SystemExit(check(base))
