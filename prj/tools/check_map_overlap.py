"""Report overlapping / clipped map nodes for every collection at several viewports.

Eyeballing screenshots misses 2-4px collisions, and the ring layout only fails
on a couple of node pairs per collection, so measure the real boxes.
"""
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:8831/engine/map.html"
VIEWPORTS = [("wide", 1600, 900), ("laptop", 1280, 720), ("phone", 844, 390)]

SEED = """
(() => {
  const prog = {};
  for (let n = 1; n <= 108; n++) prog[n] = { node: 7, total: 7, done: true };
  localStorage.setItem("bookplay_adv_progress", JSON.stringify(prog));
  const drill = {};
  for (let i = 1; i <= 13; i++) drill["c" + String(i).padStart(2, "0")] = { done: true };
  localStorage.setItem("bookplay_drill", JSON.stringify(drill));
  localStorage.setItem("bookplay_drill_migrated", "1");
  localStorage.setItem("bookplay_sp", "1280");
})();
"""

# Pages sit side by side in a scroll track, so off-screen pages have negative
# viewport x. Convert everything to page-local coordinates.
MEASURE = """
() => {
  const out = [];
  document.querySelectorAll(".map-page").forEach((page) => {
    const route = page.querySelector(".route");
    if (!route) return;
    const pb = page.getBoundingClientRect();
    const rb = route.getBoundingClientRect();
    const boxes = [...route.querySelectorAll(".node")].map((el) => {
      const b = el.getBoundingClientRect();
      const label = el.querySelector(".node-num");
      return {
        id: label ? label.textContent : "drill",
        x: b.x - pb.x, y: b.y - pb.y, w: b.width, h: b.height,
      };
    });
    out.push({
      col: page.dataset.col,
      page: { w: pb.width, h: pb.height },
      route: { y: rb.y - pb.y, h: rb.height },
      boxes,
    });
  });
  return out;
}
"""


def overlap(a, b):
    ox = min(a["x"] + a["w"], b["x"] + b["w"]) - max(a["x"], b["x"])
    oy = min(a["y"] + a["h"], b["y"] + b["h"]) - max(a["y"], b["y"])
    return (ox, oy) if ox > 0 and oy > 0 else None


def main():
    bad = 0
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        for tag, w, h in VIEWPORTS:
            ctx = browser.new_context(viewport={"width": w, "height": h})
            ctx.add_init_script(SEED)
            page = ctx.new_page()
            page.goto(BASE, wait_until="networkidle")
            page.wait_for_timeout(1500)
            for entry in page.evaluate(MEASURE):
                col, pb, rb, boxes = entry["col"], entry["page"], entry["route"], entry["boxes"]
                for i, a in enumerate(boxes):
                    if a["x"] < -1 or a["x"] + a["w"] > pb["w"] + 1:
                        print(f"CLIP-X  {tag} {col} node {a['id']} x={a['x']:.0f} w={a['w']:.0f}")
                        bad += 1
                    if a["y"] < rb["y"] - 1 or a["y"] + a["h"] > rb["y"] + rb["h"] + 1:
                        print(f"CLIP-Y  {tag} {col} node {a['id']} y={a['y']:.0f} h={a['h']:.0f}")
                        bad += 1
                    for b in boxes[i + 1:]:
                        hit = overlap(a, b)
                        if hit:
                            print(f"OVERLAP {tag} {col} {a['id']}x{b['id']} "
                                  f"by {hit[0]:.0f}x{hit[1]:.0f}px")
                            bad += 1
            ctx.close()
        browser.close()
    print(f"\n{'FAIL' if bad else 'PASS'}: {bad} issue(s)")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
