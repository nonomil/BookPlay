# -*- coding: utf-8 -*-
"""Crop Little Fox video frames into circular-ready bust portraits."""
from pathlib import Path
import subprocess

import imageio_ffmpeg
from PIL import Image

DEMO = Path(__file__).resolve().parent.parent
FF = imageio_ffmpeg.get_ffmpeg_exe()
SRC = DEMO / "assets" / "video" / "ep1.mp4"
CAST = DEMO / "assets" / "cast"

# time, crop box (left, top, right, bottom) on 1280x720
SHOTS = {
    "captain": {
        "idle": (83.8, (390, 10, 990, 610)),
        "talk": (85.0, (360, 0, 980, 620)),
    },
    "jade-emperor": {
        "idle": (61.2, (500, 10, 820, 400)),
        "talk": (61.2, (500, 10, 820, 400)),
    },
}


def grab(t: float, dst: Path) -> None:
    subprocess.run(
        [FF, "-y", "-ss", f"{t:.2f}", "-i", str(SRC), "-frames:v", "1", str(dst)],
        check=True, capture_output=True,
    )


def square_bust(im: Image.Image, box: tuple[int, int, int, int]) -> Image.Image:
    crop = im.crop(box)
    side = max(crop.size)
    canvas = Image.new("RGB", (side, side), (16, 12, 9))
    x = (side - crop.size[0]) // 2
    y = (side - crop.size[1]) // 2
    canvas.paste(crop, (x, y))
    return canvas.resize((512, 512), Image.Resampling.LANCZOS)


def main() -> None:
    tmp = DEMO / "data" / "align" / "cast_probe"
    tmp.mkdir(parents=True, exist_ok=True)
    for role, poses in SHOTS.items():
        out_dir = CAST / role
        out_dir.mkdir(parents=True, exist_ok=True)
        for pose, (t, box) in poses.items():
            raw = tmp / f"{role}_{pose}_raw.png"
            grab(t, raw)
            bust = square_bust(Image.open(raw), box)
            dst = out_dir / f"{pose}.png"
            bust.save(dst)
            print(role, pose, dst.stat().st_size)


if __name__ == "__main__":
    main()
