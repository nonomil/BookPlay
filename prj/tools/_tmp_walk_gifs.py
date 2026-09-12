from pathlib import Path
from PIL import Image

ROOT = Path(r"G:\Game\BookPlay书戏")
SPR = ROOT / "content" / "assets" / "game-sprites"
TMP = ROOT / "prj" / "_tmp_fx_src"
SIZE = 238
ALPHA_CUT = 16


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
                if a < 96:
                    px[x, y] = (0, 0, 0, 0)
                else:
                    px[x, y] = (r, (r + b) // 2, b, a)
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
        dest,
        save_all=True,
        append_images=paletted[1:],
        duration=140,
        loop=0,
        disposal=2,
        transparency=trans,
        optimize=False,
    )


import json
import subprocess
import sys

KEY = Path(r"G:\AI编程--项目模板\美术和游戏设计\游戏资产开发工具\skills\transparent-image-generator\scripts\chroma_key.py")


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


def report(sprite_id: str, dest: Path) -> None:
    im = Image.open(dest)
    rgba = im.convert("RGBA")
    w, h = rgba.size
    corners = [rgba.getpixel(xy) for xy in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1))]
    opaque = sum(1 for px in rgba.getdata() if px[3] >= ALPHA_CUT)
    print(sprite_id, dest.stat().st_size, "n", im.n_frames, "trans", im.info.get("transparency"), "corners", corners, "opaque", opaque)


jobs = (
    "heaven-soldier",
    "gourd-imp",
    "fire-imp",
    "bone-wraith",
    "temple-novice",
    "mountain-bandit",
    "blackwind-imp",
    "sand-yaksha",
    "court-guard",
    "forest-beast",
    "yellowrobe-imp",
)
for sprite_id in jobs:
    idle = SPR / sprite_id / f"{sprite_id}-south-idle.png"
    left_png = TMP / f"{sprite_id}-left.png"
    right_png = TMP / f"{sprite_id}-right.png"
    if not left_png.exists() or not right_png.exists():
        chroma(TMP / f"{sprite_id}-left.jpg", left_png)
        chroma(TMP / f"{sprite_id}-right.jpg", right_png)
    dest = SPR / sprite_id / f"{sprite_id}-south-walk.gif"
    frames = [Image.open(idle), Image.open(left_png), Image.open(idle), Image.open(right_png)]
    write_gif(frames, dest)
    report(sprite_id, dest)

sp_path = ROOT / "content" / "game" / "sprites.json"
sp = json.loads(sp_path.read_text(encoding="utf-8"))
table = sp["sprites"]
for sprite_id in jobs:
    rel = f"assets/game-sprites/{sprite_id}/{sprite_id}-south-walk.gif"
    table[sprite_id]["walkGifs"] = {d: rel for d in ("south", "west", "east", "north")}
sp_path.write_text(json.dumps(sp, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
print("sprites wired")
