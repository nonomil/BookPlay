# -*- coding: utf-8 -*-
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
from pack_android import available_for_profile  # noqa: E402


def test_starter_available_includes_three_first_titles() -> None:
    available = available_for_profile("starter")
    assert available["jttw"]["episodes"] == [1]
    assert available["minecraft"]["books"] == [1]
    assert available["mikey-jj"]["books"] == [1]


def test_jttw_only_does_not_claim_storybooks() -> None:
    assert available_for_profile("jttw-only") == {
        "jttw": {"episodes": [1], "collections": ["c01"]},
    }
