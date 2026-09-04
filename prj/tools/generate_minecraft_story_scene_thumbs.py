"""Build story-bound Minecraft reward thumbnails from the original page art.

The source pages are the visual ground truth.  Each crop is declared with a
normalized box so a later asset review can explain exactly which page region
was used; no generative model is involved in this safety-first pass.
"""
from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageOps


CROPS = {
    "book001.jpg": ("escape-from-the-nether", 14, (0.42, 0.36, 1.0, 1.0)),
    "book002.jpg": ("mobs-in-the-overworld", 15, (0.0, 0.0, 0.54, 1.0)),
    "b1-gold-helmet.jpg": ("escape-from-the-nether", 1, (0.0, 0.05, 0.56, 1.0)),
    "b1-wolf-tag.jpg": ("escape-from-the-nether", 2, (0.0, 0.42, 0.56, 1.0)),
    "b1-portal-shard.jpg": ("escape-from-the-nether", 3, (0.48, 0.53, 1.0, 1.0)),
    "b2-bee-nest.jpg": ("mobs-in-the-overworld", 4, (0.0, 0.0, 0.53, 0.56)),
    "b2-panda-sneeze.jpg": ("mobs-in-the-overworld", 8, (0.0, 0.0, 0.54, 0.58)),
    "b2-ink-saddle.jpg": ("mobs-in-the-overworld", 15, (0.0, 0.0, 0.56, 1.0)),
}


def crop(source: Path, destination: Path, box: tuple[float, float, float, float], size: int) -> None:
    with Image.open(source) as original:
        image = original.convert("RGB")
        width, height = image.size
        left, top, right, bottom = box
        panel = image.crop((round(width * left), round(height * top), round(width * right), round(height * bottom)))
        panel = ImageOps.fit(panel, (size, round(size * 0.75)), method=Image.Resampling.LANCZOS, centering=(0.5, 0.5))
        destination.parent.mkdir(parents=True, exist_ok=True)
        panel.save(destination, format="JPEG", quality=90, optimize=True, progressive=True)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--content-root", type=Path, default=Path("content"))
    parser.add_argument("--out", type=Path, default=Path("content/assets/generated/storybooks/minecraft-story-scenes-v1"))
    parser.add_argument("--size", type=int, default=768)
    args = parser.parse_args()
    missing: list[str] = []
    for filename, (slug, page, box) in CROPS.items():
        source = args.content_root / "assets" / "minecraft" / slug / "pages" / f"p{page:02d}.webp"
        if not source.is_file():
            missing.append(str(source))
            continue
        crop(source, args.out / filename, box, args.size)
    if missing:
        raise SystemExit("missing source pages:\n" + "\n".join(missing))
    print(f"generated {len(CROPS)} Minecraft story thumbnails in {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
