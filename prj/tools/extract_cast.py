#!/usr/bin/env python3
"""从封面/绘本页切出第 1 集用的透明立绘和头像。"""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

DEMO = Path(__file__).resolve().parent.parent
REPO = DEMO.parent
COVER = REPO / "data" / "Journey to the west_图片" / "封面.png"
PAGES = DEMO / "assets" / "lf_ep1" / "pages"
CAST = DEMO / "assets" / "cast"


def save_pair(im: Image.Image, dest: Path) -> None:
    dest.mkdir(parents=True, exist_ok=True)
    idle = dest / "idle.png"
    im.save(idle)
    talk = dest / "talk.png"
    # 说话帧：略上移，播放器切换时有口型感
    shifted = Image.new("RGBA", im.size, (0, 0, 0, 0))
    shifted.paste(im, (0, -6), im)
    shifted.save(talk)


def key_cyan(im: Image.Image, extra: int = 0) -> Image.Image:
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            cyan = b > 130 + extra and g > 90 and r < 190 and (g + b) > r * 2.05
            yellow_bar = r > 190 and g > 160 and b < 90
            white_burst = r > 210 and g > 220 and b > 230
            if cyan or yellow_bar or white_burst:
                px[x, y] = (0, 0, 0, 0)
    return im


def tight_crop(im: Image.Image, pad: int = 8) -> Image.Image:
    bbox = im.getbbox()
    if not bbox:
        return im
    l, t, r, b = bbox
    l = max(0, l - pad)
    t = max(0, t - pad)
    r = min(im.width, r + pad)
    b = min(im.height, b + pad)
    return im.crop((l, t, r, b))


def circle_mask(im: Image.Image, size: int = 240) -> Image.Image:
    im = im.convert("RGBA").resize((size, size), Image.Resampling.LANCZOS)
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).ellipse((3, 3, size - 4, size - 4), fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(1))
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(im, (0, 0))
    out.putalpha(mask)
    return out


def extract_wukong() -> None:
    cover = Image.open(COVER).convert("RGBA")
    # 黄条之后到标题左侧：悟空+金箍棒
    cut = cover.crop((165, 70, 500, 720))
    cut = key_cyan(cut)
    px = cut.load()
    w, h = cut.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            title = x > w * 0.35 and y < 95 and r > 140 and g > 90
            logo = x < 18
            if title or logo:
                px[x, y] = (0, 0, 0, 0)
    cut = tight_crop(cut, 10)
    save_pair(cut, CAST / "wukong")
    save_pair(circle_mask(cut.crop((0, int(cut.height * 0.12), cut.width, int(cut.height * 0.72)))), CAST / "wukong-face")


def extract_page_portrait(page: str, box: tuple[int, int, int, int], name: str) -> None:
    im = Image.open(PAGES / page).convert("RGBA")
    save_pair(circle_mask(im.crop(box)), CAST / name)


def main() -> int:
    extract_wukong()
    # 绘本上半图区域约 y=40–620
    extract_page_portrait("p03.png", (280, 80, 680, 480), "narrator")
    extract_page_portrait("p04.png", (260, 70, 700, 470), "jade-emperor")
    extract_page_portrait("p07.png", (250, 90, 680, 500), "young-monkey")
    extract_page_portrait("p11.png", (300, 80, 720, 500), "gibbon")
    print(f"ok {CAST}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
