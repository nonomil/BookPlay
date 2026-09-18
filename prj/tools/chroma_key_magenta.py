#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Key generated hot-pink backgrounds to true alpha PNG.

Samples each image's own border color (gens rarely hit exact #FF00FF),
then keys by RGB distance and despills magenta from the fringe.
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from PIL import Image


def sample_bg(rgb: np.ndarray) -> np.ndarray:
    h, w, _ = rgb.shape
    band = 8
    parts = [
        rgb[:band, :, :],
        rgb[-band:, :, :],
        rgb[:, :band, :],
        rgb[:, -band:, :],
    ]
    border = np.concatenate([p.reshape(-1, 3) for p in parts], axis=0)
    return np.median(border, axis=0).astype(np.float32)


def key_rgba(src: Image.Image) -> Image.Image:
    im = src.convert("RGBA")
    arr = np.asarray(im).astype(np.float32)
    rgb = arr[:, :, :3]
    bg = sample_bg(rgb)
    dist = np.sqrt(((rgb - bg) ** 2).sum(axis=2))
    t0, t1 = 40.0, 58.0
    alpha = np.clip((dist - t0) / (t1 - t0), 0.0, 1.0)
    # Eat 1px fringe so anti-aliased magenta rims disappear.
    pad = np.pad(alpha, 1, mode="edge")
    neigh = np.stack([
        pad[0:-2, 0:-2], pad[0:-2, 1:-1], pad[0:-2, 2:],
        pad[1:-1, 0:-2], pad[1:-1, 1:-1], pad[1:-1, 2:],
        pad[2:, 0:-2], pad[2:, 1:-1], pad[2:, 2:],
    ])
    alpha = neigh.min(axis=0)
    mag = (rgb[:, :, 0] + rgb[:, :, 2]) * 0.5 - rgb[:, :, 1]
    near = np.clip((90.0 - dist) / 90.0, 0.0, 1.0)
    spill = np.clip(mag / 55.0, 0.0, 1.0) * np.maximum(1.0 - alpha, near * 0.9)
    g = rgb[:, :, 1]
    rgb[:, :, 0] = rgb[:, :, 0] * (1.0 - spill) + g * spill
    rgb[:, :, 2] = rgb[:, :, 2] * (1.0 - spill) + g * spill
    out = np.empty_like(arr)
    out[:, :, :3] = np.clip(rgb, 0, 255)
    out[:, :, 3] = np.clip(alpha * 255.0, 0, 255)
    return Image.fromarray(out.astype(np.uint8), "RGBA")


def key_file(src: Path, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    keyed = key_rgba(Image.open(src))
    keyed.save(dest, "PNG")


def main() -> int:
    src_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("prj/data/assets/generated/jttw-hud-fx-v1")
    dest_dir = Path(sys.argv[2]) if len(sys.argv) > 2 else src_dir
    extra = [Path(p) for p in sys.argv[3:]]
    files = sorted(src_dir.glob("*.jpg")) + extra
    if not files:
        print("no sources", src_dir)
        return 1
    for src in files:
        dest = dest_dir / (src.stem + ".png")
        key_file(src, dest)
        im = Image.open(dest)
        a = np.asarray(im)[:, :, 3]
        print(f"{dest.name}  transparent={(a == 0).mean():.1%}  meanA={a.mean():.0f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
