# -*- coding: utf-8 -*-
from pathlib import Path
from PIL import Image

from paths import REPO

SRC = REPO / "prj" / "engine" / "img" / "doudou-loong-icon.png"
KEEP = REPO / "content" / "assets" / "ui" / "app-icon.png"
RES = REPO / "android" / "app" / "src" / "main" / "res"

LEGACY = {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192,
}
FORE = {
    "mipmap-mdpi": 108,
    "mipmap-hdpi": 162,
    "mipmap-xhdpi": 216,
    "mipmap-xxhdpi": 324,
    "mipmap-xxxhdpi": 432,
}


def fit(im: Image.Image, size: int) -> Image.Image:
    return im.convert("RGBA").resize((size, size), Image.Resampling.LANCZOS)


def main() -> None:
    im = Image.open(SRC).convert("RGBA")
    KEEP.parent.mkdir(parents=True, exist_ok=True)
    im.save(KEEP, "PNG")
    for folder, size in LEGACY.items():
        dest = RES / folder
        dest.mkdir(parents=True, exist_ok=True)
        out = fit(im, size)
        out.save(dest / "ic_launcher.png", "PNG")
        out.save(dest / "ic_launcher_round.png", "PNG")
    for folder, size in FORE.items():
        dest = RES / folder
        dest.mkdir(parents=True, exist_ok=True)
        fit(im, size).save(dest / "ic_launcher_foreground.png", "PNG")
    print("wrote icons from", SRC)


if __name__ == "__main__":
    main()
