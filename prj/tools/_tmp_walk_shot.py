from pathlib import Path
from playwright.sync_api import sync_playwright

OUT = Path(__file__).resolve().parents[2] / "output" / "shots" / "minion-families"


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as pw:
        page = pw.chromium.launch().new_page(viewport={"width": 1280, "height": 720})
        for ep, name in (
            (8, "walk-ep8-heaven-soldier.png"),
            (12, "walk-ep12-temple-novice.png"),
            (14, "walk-ep14-mountain-bandit.png"),
            (20, "walk-ep20-blackwind-imp.png"),
            (24, "walk-ep24-sand-yaksha.png"),
            (27, "walk-ep27-forest-beast.png"),
            (34, "walk-ep34-yellowrobe-imp.png"),
            (35, "walk-ep35-court-guard.png"),
            (38, "walk-ep38-gourd-imp.png"),
            (48, "walk-ep48-fire-imp.png"),
        ):
            page.goto(f"http://127.0.0.1:8799/engine/game.html?ep={ep}", wait_until="domcontentloaded")
            page.wait_for_function("() => window.BookPlayGameDebug && window.BookPlayGameDebug.monsters && window.BookPlayGameDebug.monsters.length")
            info = page.evaluate(
                """() => {
                  ['game-dialogue','game-toast','game-banner','game-gate'].forEach((id) => {
                    const el = document.getElementById(id);
                    if (el) el.hidden = true;
                  });
                  const st = window.BookPlayGameDebug || {};
                  (st.monsters || []).forEach((m) => {
                    m.moving = true;
                    m.idleUntil = 0;
                    if (m.img && m.img.src) {
                      m.img.src = m.img.src.replace('-south-idle.png', '-south-walk.gif');
                    }
                    if (m.el) m.el.classList.add('is-walking');
                  });
                  const srcs = [...new Set((st.monsters || []).map((m) => (m.img && m.img.src) || ''))];
                  return {srcs, n: (st.monsters || []).length, poses: (st.monsters || []).slice(0, 4).map((m) => m.pose || '')};
                }"""
            )
            page.wait_for_timeout(700)
            shot = OUT / name
            page.screenshot(path=str(shot), full_page=False)
            print(info, shot)


if __name__ == "__main__":
    main()
