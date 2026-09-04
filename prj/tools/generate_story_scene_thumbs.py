"""Create small, text-free story scene thumbnails for the sticker book.

The source storybook pages are the provenance anchor for every reward.  The
page layout is intentionally consistent: the illustration occupies the upper
half and the English paragraph begins below it.  This utility crops that
illustration panel and writes a compact JPEG used by the sticker cards.  It is
not a generative step; it prevents a failed or semantically loose AI asset
from replacing the actual story beat.
"""
from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageOps


def crop_panel(source: Path, destination: Path, size: int = 512) -> None:
    with Image.open(source) as image:
        image = image.convert("RGB")
        width, height = image.size
        # All 108 books use the same page template.  Keep a small white frame
        # around the illustration so the snapshot feels like a page, while
        # excluding the paragraph that starts around 55% of page height.
        left = round(width * 0.105)
        right = round(width * 0.895)
        top = round(height * 0.065)
        bottom = round(height * 0.535)
        panel = image.crop((left, top, right, bottom))
        # A 4:3 card reads better than a tall page crop and keeps faces and
        # props legible at the 116–155px sticker size.
        panel = ImageOps.fit(panel, (size, round(size * 0.78)), method=Image.Resampling.LANCZOS, centering=(0.5, 0.55))
        destination.parent.mkdir(parents=True, exist_ok=True)
        panel.save(destination, format="JPEG", quality=88, optimize=True, progressive=True)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--content-root", type=Path, default=Path("content"))
    parser.add_argument("--out", type=Path, default=Path("content/assets/generated/jttw-story-scenes-v1"))
    parser.add_argument("--size", type=int, default=512)
    args = parser.parse_args()

    missing: list[int] = []
    for episode in range(1, 109):
        source = args.content_root / "assets" / f"lf_ep{episode}" / "pages" / "p03.png"
        destination = args.out / f"ep{episode:03d}.jpg"
        if not source.is_file():
            missing.append(episode)
            continue
        crop_panel(source, destination, args.size)
    if missing:
        raise SystemExit(f"missing p03 pages: {missing}")
    print(f"generated 108 story thumbnails in {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
