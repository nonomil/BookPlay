# -*- coding: utf-8 -*-
"""Generate map backgrounds for the Mikey & JJ / Minecraft route maps.

Each route map collection gets its own illustrated background through the
same Cliprox (gpt-image-2) pipeline as the quiz backgrounds.  Images land in
``content/assets/generated/map-backgrounds/`` as webp and are referenced
from the series ``collections.json`` files.

Usage:
  python -X utf8 prj/tools/map_bg_generate.py            # generate missing
  python -X utf8 prj/tools/map_bg_generate.py --only mikey-map-1
  python -X utf8 prj/tools/map_bg_generate.py --force
"""
from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "prj" / "tools"))
from gen_image import DEFAULT_BASE  # noqa: E402
from gen_image import CLIENT, TOOLKIT, load_key  # noqa: E402

OUT = ROOT / "content" / "assets" / "generated" / "map-backgrounds"
GEN_SIZE = "1536x1024"
WEBP_WIDTH = 1440

MAPS: dict[str, dict[str, str]] = {
    # Mikey & JJ comic adventure maps (3 maps for 10 books)
    "mikey-map-1": {
        "style": "Children's picture-book comic style adventure route map",
        "theme": "a cheerful blocky countryside: a school town with red roofs "
                 "on the left, a lake house on stilts in the middle, and a "
                 "snowy penguin hill on the right; a winding dashed path "
                 "connects them",
    },
    "mikey-map-2": {
        "style": "Children's picture-book comic style adventure route map",
        "theme": "stormy plains with a twisting grey tornado on the left, a "
                 "blocky city with helicopters in the middle, and a calm "
                 "harbor on the right; a winding dashed path connects them",
    },
    "mikey-map-3": {
        "style": "Children's picture-book comic style adventure route map",
        "theme": "a burger shop street on the left, a moonlit rooftop with a "
                 "black cat in the middle, and a cruise ship sailing toward "
                 "a castle with a golden crown on the right; a winding "
                 "dashed path connects them",
    },
    # Minecraft chapter maps (one per book, 3 chapter nodes each)
    "mc-map-1": {
        "style": "Blocky voxel game world map, Minecraft-style cubic terrain seen "
                 "from a slightly elevated angle",
        "theme": "a crimson nether landscape: red netherack caves, lava "
                 "lakes, a purple portal on one side, a glowstone-lit "
                 "fortress on the other, and a faint dashed trail across "
                 "the terrain",
    },
    "mc-map-2": {
        "style": "Blocky voxel game world map, Minecraft-style cubic terrain seen "
                 "from a slightly elevated angle",
        "theme": "a green overworld: plains with a village, a bee-filled "
                 "flower forest, a mountain cave entrance, an ocean with "
                 "dolphins, and a snowy peak, with a faint dashed trail "
                 "linking them",
    },
    "mc-map-3": {
        "style": "Blocky voxel game world map, Minecraft-style cubic terrain seen "
                 "from a slightly elevated angle",
        "theme": "an underground cross-section: cobblestone tunnels, a "
                 "witch hut with bubbling cauldrons, glowing redstone ore "
                 "veins, and a hidden diamond block room, with a faint "
                 "dashed trail",
    },
    "mc-map-4": {
        "style": "Blocky voxel game world map, Minecraft-style cubic terrain seen "
                 "from a slightly elevated angle",
        "theme": "a dark oak forest leading to a huge creepy mansion with "
                 "balconies, secret rooms glowing behind the walls, and a "
                 "jail cell with a friendly blue allay, with a faint "
                 "dashed trail",
    },
    "mc-map-5": {
        "style": "Blocky voxel game world map, Minecraft-style cubic terrain seen "
                 "from a slightly elevated angle",
        "theme": "a survival journey from a sunny morning base with a "
                 "crafting table, up a stone mountain past skeletons and "
                 "zombies, to a peak overlooking a desert and savanna at "
                 "sunrise, with a faint dashed trail",
    },
}


def generate(prompt: str, png: Path) -> None:
    key = load_key()
    import os
    env = dict(os.environ)
    env["CLIPROX_API_BASE"] = DEFAULT_BASE
    env["CLIPROX_API_KEY"] = key
    png.parent.mkdir(parents=True, exist_ok=True)
    proc = subprocess.run(
        [sys.executable, str(CLIENT), "generate",
         "--model", "gpt-image-2", "--size", GEN_SIZE,
         "--prompt", prompt, "--output", str(png)],
        env=env, capture_output=True, text=True, encoding="utf-8", timeout=600,
    )
    if proc.returncode != 0 or not png.is_file():
        raise RuntimeError(f"image generation failed: {proc.stdout[-300:]} {proc.stderr[-300:]}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--only", help="generate one map id (e.g. mikey-map-1)")
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    for map_id, meta in MAPS.items():
        if args.only and map_id != args.only:
            continue
        webp = OUT / f"{map_id}.webp"
        if webp.is_file() and not args.force:
            print(f"{map_id}: exists, skip")
            continue
        prompt = (f"{meta['style']}. {meta['theme']}. Soft warm lighting so "
                  "white text cards stay readable on top, no text, no "
                  "letters, no numbers, no watermark, landscape.")
        print(f"{map_id}: generating ...", flush=True)
        png = ROOT / "tmp" / "map-bg" / f"{map_id}.png"
        generate(prompt, png)
        img = Image.open(png).convert("RGB")
        if img.width > WEBP_WIDTH:
            img = img.resize((WEBP_WIDTH, round(img.height * WEBP_WIDTH / img.width)), Image.LANCZOS)
        OUT.mkdir(parents=True, exist_ok=True)
        img.save(webp, "WEBP", quality=82, method=6)
        print(f"{map_id}: wrote {webp.relative_to(ROOT)} ({webp.stat().st_size // 1024} KB)", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
