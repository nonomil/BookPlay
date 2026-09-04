# -*- coding: utf-8 -*-
"""Static self-check for the current map route contract.

The map was intentionally redesigned from the old closed ring into an open,
three-row S-shaped dotted route. This check mirrors the runtime contract in
``map-ui.test.mjs`` so a release audit cannot silently re-introduce the retired
ring geometry or tiny episode pips.
"""
from __future__ import annotations

import io
import re
import sys
from pathlib import Path

ENGINE = Path(__file__).resolve().parents[1] / "engine"


def read(name: str) -> str:
    return io.open(ENGINE / name, encoding="utf-8").read()


def css_block(css: str, selector: str) -> str:
    """Return the first top-level selector block for a simple static check."""
    match = re.search(r"^" + re.escape(selector) + r"\s*\{", css, re.M)
    if not match:
        return ""
    end = css.find("}", match.start())
    return css[match.start() : end + 1] if end > 0 else ""


def main() -> int:
    js = read("map.js")
    css = read("map.css")
    html = read("map.html")
    checks: list[tuple[str, bool, str]] = []

    def want(name: str, ok: bool, detail: str = "") -> None:
        checks.append((name, bool(ok), detail))

    # --- Route geometry: open S-shaped polyline, never the retired ring ---
    want("zigzag_points", "function zigzagPoints" in js)
    want("zigzag_path", "function zigzagPath" in js)
    want("no_ring_geometry", not any(f"function {name}" in js for name in ("ringGeom", "ringPoint", "ringPath")))
    want("no_closed_path", not re.search(r"function\s+zigzagPath[\s\S]{0,260}\bZ\b", js))
    want("three_row_cap", re.search(r"n <= 3 \? 1 : n <= 6 \? 2 : 3", js) is not None)
    want("s_lane_reverse", "laneFor(count, c, !ltr)" in js)
    want("interleaved_lanes", "const laneCount = Math.max(2, maxCount * 2)" in js)
    want("pixel_layout", "route.clientWidth" in js and "el.style.left" in js)
    want("height_aware_rows", "const nodeHeight = nodes.reduce" in js and "const targetSpanY = Math.max(requestedSpanY, minSpanY)" in js)
    want("width_aware_rows", "const denseRows = nodeWidth > 0 && requiredSpanX > spanX" in js)
    want("route_svg_path", '<path class="rl-out"' in js and '<path class="rl-in"' in js and 'setAttribute("d"' in js)
    want("dotted_route", "stroke-dasharray: 1.2 15" in css and "stroke-dasharray: 0.2 16" in css)
    want("round_route_caps", "stroke-linecap: round" in css)

    # --- Card contract: large image, floating bilingual title, no grey lock ---
    node = css_block(css, ".node")
    want("large_card_width", re.search(r"w \* 0\.175", js) is not None)
    want("standalone_cover", "overflow: visible" in node and "background: transparent" in node and "border: 0" in node)
    want("cover_ratio", "aspect-ratio: 16 / 9" in css)
    want("title_three_lines", all(token in js for token in ('class="episode-title"', 'class="episode-number"', 'class="episode-name"', 'class="episode-en"')))
    want("title_pronunciation", 'class="node-speak"' in js and "朗读中英双语标题" in js)
    want("colorful_locked_art", "grayscale(" not in css and "saturate(0.95)" in css and "brightness(0.92)" in css)
    want("route_vertical_scroll", "overflow-y: auto" in css and ".route { min-height: 620px; }" in css)
    want("no_legacy_pips", "stripHTML" not in js and 'class="pip"' not in js)

    # --- Companion: generated atlas, four directions, line-aligned movement ---
    want("companion_marker", 'className = "route-companion"' in js and 'aria-label", "当前进度伙伴"' in js)
    want("companion_progress_index", 'el.classList.contains("current")' in js and 'el.classList.contains("done")' in js)
    want("companion_hover", all(token in js for token in ("function bindCompanionHover", "pointerenter", "pointerleave", "data-hovering")))
    want("companion_line_priority", "const linePriority = candidate.line && selfOverlap <= 0.5 ? -1e7 : 0" in js)
    want("companion_line_offset", re.search(r"Math\.max\(Number\(lineAnchor\.y\), coverBottom\) \+ LINE_COMPANION_FOOT_OFFSET \+ mh \* 0\.1", js) is not None)
    want("jttw_atlas", "wukong-walk-atlas.png" in js)
    want("mikey_atlas", "mikey-jj-route-companion/transparent/mikey-walk-atlas.png" in js)
    want("four_direction_rows", "background-size: 800% 400%" in css and all(f'background-position-y: {value}' in css for value in ("33.333%", "66.667%", "100%")))
    want("slow_walk_cycle", "route-companion-walk 1.8s steps(7, end)" in css)
    want("fixed_portrait_ratio", re.search(r"aspect-ratio:\s*3\s*/\s*4", css) is not None)
    want("sprite_transparent", re.search(r"\.route-companion\s*\{[\s\S]*?background:\s*transparent[\s\S]*?filter:\s*drop-shadow", css) is not None)
    want("reduced_motion_contract", "prefers-reduced-motion: reduce" in css and "route-companion-sprite.route-motion-enabled" in css)

    # --- Series/data safety and cache wiring ---
    want("mikey_series_data", 'SERIES_ID === "mikey-jj"' in js and "storybooks-mikey-jj/collections.json" in js)
    want("minecraft_series_data", 'SERIES_ID === "minecraft"' in js and "bookplay_story_progress" in js)
    versions = re.findall(r"(?:map\.css|map\.js)\?v=(\d+)", html)
    want("matching_cache_versions", len(versions) == 2 and versions[0] == versions[1] and int(versions[0]) > 0)
    want("resize_observer", "ResizeObserver" in js and "_ro.observe(route)" in js)
    want("atlas_probe_fallback", "routeCompanionSpriteReady" in js and "companionMarkup()" in js)

    failed = 0
    for name, ok, detail in checks:
        if ok:
            print(f"OK   {name}")
        else:
            failed += 1
            suffix = f": {detail}" if detail else ""
            print(f"FAIL {name}{suffix}")
    print(f"\n{len(checks) - failed}/{len(checks)} passed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
