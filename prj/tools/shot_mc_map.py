"""Screenshot the Minecraft series map."""
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:8831/engine/map.html?series=minecraft"
OUT = Path(__file__).resolve().parents[2] / "output" / "shots" / "map"


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        for tag, w, h in (("mc-wide", 1600, 900), ("mc-phone", 844, 390)):
            ctx = browser.new_context(viewport={"width": w, "height": h})
            page = ctx.new_page()
            page.goto(BASE, wait_until="networkidle")
            page.wait_for_timeout(1800)
            page.evaluate("document.getElementById('map-splash')?.classList.add('gone')")
            page.wait_for_timeout(500)
            out = OUT / f"{tag}.png"
            page.screenshot(path=str(out))
            print("wrote", out)
            ctx.close()
        browser.close()


if __name__ == "__main__":
    main()
