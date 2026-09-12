from pathlib import Path
from PIL import Image
import imageio.v2 as iio
import subprocess
import sys

ROOT = Path(r"G:\Game\BookPlay书戏")
KEY = Path(r"G:\AI编程--项目模板\美术和游戏设计\游戏资产开发工具\skills\transparent-image-generator\scripts\chroma_key.py")
TMP = ROOT / "prj" / "_tmp_fx_src"
SPR = ROOT / "content" / "assets" / "game-sprites"
VIDEOS = Path.home() / ".grok" / "sessions" / r"G%3A%5CGame%5CBookPlay%E4%B9%A6%E6%88%8F" / "01a08433-06d4-7970-bee6-34dd0b036072" / "videos"
SIZE = 238
ALPHA_CUT = 16
PICK = [0, 6, 12, 18, 24, 30, 36, 42]


def chroma(src: Path, dest: Path) -> None:
    im = Image.open(src).convert("RGB")
    w, h = im.size
    samples = [im.getpixel((2, 2)), im.getpixel((w - 3, 2)), im.getpixel((2, h - 3)), im.getpixel((w - 3, h - 3))]
    key = tuple(int(sum(c[i] for c in samples) / len(samples)) for i in range(3))
    dest.parent.mkdir(parents=True, exist_ok=True)
    r = subprocess.run(
        [sys.executable, str(KEY), str(src), str(dest), "--key", f"{key[0]},{key[1]},{key[2]}", "--tolerance", "40", "--feather", "14"],
        capture_output=True, text=True, encoding="utf-8",
    )
    if r.returncode:
        raise SystemExit(f"{dest}: {r.stderr}")


def zero_fringe(im: Image.Image) -> Image.Image:
    im = im.convert("RGBA")
    r, g, b, a = im.split()
    keep = a.point(lambda p: 255 if p >= ALPHA_CUT else 0)
    empty = Image.new("L", im.size, 0)
    return Image.merge("RGBA", (
        Image.composite(r, empty, keep),
        Image.composite(g, empty, keep),
        Image.composite(b, empty, keep),
        a.point(lambda p: 0 if p < ALPHA_CUT else p),
    ))


def despill(im: Image.Image) -> Image.Image:
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            if g > r + 24 and g > b + 24:
                px[x, y] = (0, 0, 0, 0) if a < 96 else (r, (r + b) // 2, b, a)
    return im


def fit(im: Image.Image) -> Image.Image:
    return despill(zero_fringe(im).resize((SIZE, SIZE), Image.Resampling.LANCZOS))


def write_gif(frames: list[Image.Image], dest: Path) -> None:
    sized = [fit(frame) for frame in frames]
    sheet = Image.new("RGB", (SIZE * len(sized), SIZE), (0, 0, 0))
    for i, frame in enumerate(sized):
        rgb = Image.new("RGB", (SIZE, SIZE), (0, 0, 0))
        rgb.paste(frame.convert("RGB"), mask=frame.getchannel("A").point(lambda p: 255 if p >= ALPHA_CUT else 0))
        sheet.paste(rgb, (SIZE * i, 0))
    pal_img = sheet.quantize(colors=255, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    pal = bytearray(pal_img.getpalette() or [])
    pal.extend([0, 0, 0] * max(0, 768 - len(pal)))
    pal[255 * 3 : 255 * 3 + 3] = bytes([0, 0, 0])
    trans = 255
    pal_full = Image.new("P", (1, 1))
    pal_full.putpalette(bytes(pal[:768]))
    paletted = []
    for frame in sized:
        q = frame.convert("RGB").quantize(palette=pal_full, dither=Image.Dither.NONE)
        px = bytearray(q.tobytes())
        alpha = frame.getchannel("A").tobytes()
        for i, av in enumerate(alpha):
            if av < ALPHA_CUT:
                px[i] = trans
        out = Image.frombytes("P", (SIZE, SIZE), bytes(px))
        out.putpalette(bytes(pal[:768]))
        paletted.append(out)
    dest.parent.mkdir(parents=True, exist_ok=True)
    paletted[0].save(
        dest, save_all=True, append_images=paletted[1:], duration=90, loop=0,
        disposal=2, transparency=trans, optimize=False,
    )


def harvest(sprite_id: str, video_name: str) -> None:
    vid = VIDEOS / video_name
    raw = TMP / f"{sprite_id}-walk-raw"
    raw.mkdir(parents=True, exist_ok=True)
    reader = iio.get_reader(vid)
    pngs = []
    for i in PICK:
        fr = Image.fromarray(reader.get_data(i)).convert("RGB")
        jpg = raw / f"f{i:03d}.jpg"
        png = raw / f"f{i:03d}.png"
        fr.save(jpg, quality=95)
        chroma(jpg, png)
        pngs.append(png)
    dest = SPR / sprite_id / f"{sprite_id}-south-walk.gif"
    write_gif([Image.open(p) for p in pngs], dest)
    im = Image.open(dest)
    rgba = im.convert("RGBA")
    w, h = rgba.size
    corners = [rgba.getpixel(xy) for xy in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1))]
    opaque = sum(1 for px in rgba.getdata() if px[3] >= ALPHA_CUT)
    print(sprite_id, dest.stat().st_size, "n", im.n_frames, "corners", corners, "opaque", opaque)


if __name__ == "__main__":
    jobs = list(zip(sys.argv[1::2], sys.argv[2::2]))
    if not jobs:
        raise SystemExit("usage: sprite_id video.mp4 ...")
    for sprite_id, video_name in jobs:
        harvest(sprite_id, video_name)
