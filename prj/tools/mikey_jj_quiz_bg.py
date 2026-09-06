# -*- coding: utf-8 -*-
"""Generate per-book GPT quiz backgrounds for Mikey & JJ storybooks.

Every published book gets its own chapter-quiz background drawn in the same
comic-book language as the bundled ``ui/quiz-bg.png``: cream paper center
left empty for the quiz card, decorative story-themed elements along the
edges.  Images are generated through the Cliprox relay (gpt-image-2), stored
as ``assets/mikey-jj/<slug>/quiz-bg.webp`` and referenced from each book JSON
via ``quiz_bg`` so the pack reference closure picks them up.

Usage:
  python -X utf8 prj/tools/mikey_jj_quiz_bg.py --only 1
  python -X utf8 prj/tools/mikey_jj_quiz_bg.py            # all missing
  python -X utf8 prj/tools/mikey_jj_quiz_bg.py --force    # regenerate all
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "prj" / "tools"))
from gen_image import load_key  # noqa: E402  (keeps key handling in one place)

CONTENT = ROOT / "content"
DATA_ROOT = CONTENT / "storybooks-mikey-jj"
GEN_SIZE = "1536x1024"
WEBP_WIDTH = 1280

STYLE = (
    "Children's picture-book comic style background for a quiz screen. "
    "Warm cream paper texture filling the whole center, completely empty in "
    "the middle for text. Decorative elements only around the edges and "
    "corners: {theme}. Halftone dots, comic action speed lines, bold black "
    "ink outlines, bright cheerful Minecraft-blocky shapes, red and yellow "
    "accent corners like a comic explosion frame. No text, no letters, no "
    "numbers, no watermark, no characters in the center."
)

BOOKS: dict[int, dict[str, str]] = {
    1: {"slug": "zombie-school-adventure", "theme":
        "top-left a blocky school building with broken windows and a red "
        "alarm bell, bottom-right green blocky zombies wandering past "
        "school desks, backpacks and books flying along the borders"},
    2: {"slug": "water-house-adventure", "theme":
        "top corners rain clouds and rain drops, bottom edges a wooden "
        "house on stilts floating on blue blocky water, small boats and "
        "fishing rods, blue water splash accents"},
    3: {"slug": "penguin-adventure", "theme":
        "top-left snowy blocky mountains and an aurora, bottom-right cute "
        "blocky penguins and snow drifts, ice crystals and snowflakes "
        "along the borders, cool ice-blue accents"},
    5: {"slug": "tornado-adventure", "theme":
        "top-left a giant grey blocky tornado twisting into dark clouds, "
        "bottom-right a wooden storm shelter with a lantern, flying leaves "
        "and wind swirls along the borders"},
    6: {"slug": "godzilla-adventure", "theme":
        "top-right a huge blocky monster silhouette behind city towers "
        "with searchlights, bottom-left blocky city buildings and a red "
        "emergency siren, newspaper flash accents"},
    7: {"slug": "piglin-adventure", "theme":
        "top-left a glowing purple nether portal, bottom-right blocky "
        "piglins holding golden swords beside gold blocks, dark red "
        "netherack caves and gold coins along the borders"},
    8: {"slug": "burger-shop-adventure", "theme":
        "top-left a blocky burger shop counter with a striped awning, "
        "bottom-right giant burgers, fries and drink cups, ketchup and "
        "mustard splash accents along the borders"},
    9: {"slug": "scary-cat-adventure", "theme":
        "top-right a black blocky cat with glowing yellow eyes sitting on "
        "a rooftop under a big moon, bottom-left spider webs and wooden "
        "fences, deep night-blue accents"},
    10: {"slug": "cruise-ship-adventure", "theme":
         "top corners seagulls and sun rays, bottom-right a big blocky "
         "cruise ship on stylized waves with a dolphin jumping, life "
         "rings and anchors along the borders"},
    11: {"slug": "noob-to-king-adventure", "theme":
         "top-left a blocky castle with a red flag, bottom-right a golden "
         "crown on a velvet cushion and a wooden throne, cheering villagers "
         "and confetti along the borders"},
}


def generate(prompt: str, out_png: Path) -> None:
    from gen_image import DEFAULT_BASE, TOOLKIT, CLIENT  # noqa: F401
    key = load_key()
    env = dict(__import__("os").environ)
    env["CLIPROX_API_BASE"] = DEFAULT_BASE
    env["CLIPROX_API_KEY"] = key
    out_png.parent.mkdir(parents=True, exist_ok=True)
    proc = subprocess.run(
        [sys.executable, str(CLIENT), "generate",
         "--model", "gpt-image-2", "--size", GEN_SIZE,
         "--prompt", prompt, "--output", str(out_png)],
        env=env, capture_output=True, text=True, encoding="utf-8", timeout=600,
    )
    if proc.returncode != 0 or not out_png.is_file():
        raise RuntimeError(f"image generation failed: {proc.stdout[-400:]} {proc.stderr[-400:]}")


def to_webp(png: Path, webp: Path) -> None:
    img = Image.open(png).convert("RGB")
    if img.width > WEBP_WIDTH:
        img = img.resize((WEBP_WIDTH, round(img.height * WEBP_WIDTH / img.width)), Image.LANCZOS)
    webp.parent.mkdir(parents=True, exist_ok=True)
    img.save(webp, "WEBP", quality=82, method=6)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--only", type=int, help="generate for one book number")
    parser.add_argument("--force", action="store_true", help="regenerate even if the file exists")
    args = parser.parse_args()

    for book_no, meta in BOOKS.items():
        if args.only and book_no != args.only:
            continue
        slug = meta["slug"]
        book_path = DATA_ROOT / f"book{book_no}.json"
        book = json.loads(book_path.read_text(encoding="utf-8"))
        rel = f"assets/mikey-jj/{slug}/quiz-bg.webp"
        webp = CONTENT / rel
        if webp.is_file() and not args.force:
            print(f"book{book_no}: exists, skip ({rel})")
            continue
        prompt = STYLE.format(theme=meta["theme"])
        print(f"book{book_no}: generating {slug} ...", flush=True)
        png = ROOT / "tmp" / "quiz-bg" / f"{slug}.png"
        generate(prompt, png)
        to_webp(png, webp)
        book["quiz_bg"] = rel
        book_path.write_text(json.dumps(book, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"book{book_no}: wrote {rel} ({webp.stat().st_size // 1024} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
