"""Headless screenshots of the collection map for visual review.

Seeds localStorage so every collection is unlocked, otherwise only c01 renders
and the other twelve backgrounds can never be seen.
"""
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:8831/engine/map.html"
OUT = Path(__file__).resolve().parents[2] / "output" / "shots" / "map"

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


def shoot(page, tag, indices):
    page.goto(BASE + "?shot=1", wait_until="networkidle")
    page.wait_for_timeout(1800)
    page.evaluate("document.getElementById('map-splash')?.classList.add('gone')")
    page.wait_for_timeout(400)
    for i in indices:
        page.evaluate(
            "i => { const t = document.getElementById('map-track');"
            "t.scrollTo({ left: t.clientWidth * i, behavior: 'instant' }); }",
            i,
        )
        page.wait_for_timeout(900)
        out = OUT / f"{tag}-c{i + 1:02d}.png"
        page.screenshot(path=str(out))
        print("wrote", out)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    indices = [int(x) - 1 for x in sys.argv[1:]] or list(range(13))
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        for tag, w, h in (("wide", 1600, 900), ("phone", 844, 390)):
            ctx = browser.new_context(viewport={"width": w, "height": h})
            ctx.add_init_script(SEED)
            page = ctx.new_page()
            shoot(page, tag, indices)
            ctx.close()
        browser.close()


if __name__ == "__main__":
    main()
