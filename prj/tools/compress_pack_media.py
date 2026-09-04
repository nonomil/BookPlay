# -*- coding: utf-8 -*-
"""Shrink packed images/audio to formats Android WebView and the desktop player already play.

Images  -> WebP (lossy q=78, alpha kept)
Speech  -> MP3 48 kbps / 24 kHz / mono  (same as Edge-TTS clips)
Skip sentence folders that are already 48k mono unless --force.
"""
from __future__ import annotations

import argparse
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import imageio_ffmpeg
from PIL import Image
from paths import ASSETS, ENGINE, STORYBOOKS

FF = Path(imageio_ffmpeg.get_ffmpeg_exe())

IMAGE_ROOTS = (
    ASSETS / "covers" / "journey-west-cover.png",
    ASSETS / "covers" / "series_cover.png",
    ASSETS / "ui" / "player-bg.jpg",
)
CAST_ROOT = ASSETS / "cast"
AUDIO_ROOT = ASSETS / "adv_audio"
SKIP_AUDIO_DIRS = {"sent_en", "sent_zh", "en", "zh"}


def to_webp(src: Path, q: int = 78) -> tuple[int, int]:
    dst = src.with_suffix(".webp")
    im = Image.open(src)
    if src.name == "player-bg.jpg" and im.width > 1280:
        im = im.resize((1280, int(im.height * 1280 / im.width)), Image.Resampling.LANCZOS)
    if im.mode not in ("RGB", "RGBA"):
        im = im.convert("RGBA" if "A" in im.getbands() else "RGB")
    im.save(dst, "WEBP", quality=q, method=6)
    before, after = src.stat().st_size, dst.stat().st_size
    if after < before * 0.98:
        src.unlink()
        return before, after
    dst.unlink(missing_ok=True)
    return before, before


def rewrite_cast_refs() -> None:
    js = ENGINE / "wala.js"
    text = js.read_text(encoding="utf-8")
    text = text.replace('idle.png"', 'idle.webp"').replace('talk.png"', 'talk.webp"')
    js.write_text(text, encoding="utf-8")

    sb = ENGINE / "storybook.js"
    if sb.exists():
        t = sb.read_text(encoding="utf-8")
        t = t.replace(
            'current().scene.sprite.replace("idle.png", on ? "talk.png" : "idle.png")',
            'current().scene.sprite.replace(/idle\\.(png|webp)$/, on ? "talk.$1" : "idle.$1")',
        )
        sb.write_text(t, encoding="utf-8")

    for path in [ENGINE / "wala.css", ENGINE / "home.html", ENGINE / "style.css"]:
        if not path.exists():
            continue
        t = path.read_text(encoding="utf-8")
        t = t.replace("player-bg.jpg", "player-bg.webp")
        t = t.replace("journey-west-cover.png", "journey-west-cover.webp")
        t = t.replace("series_cover.png", "series_cover.webp")
        path.write_text(t, encoding="utf-8")

    for path in STORYBOOKS.glob("*.json"):
        t = path.read_text(encoding="utf-8")
        n = t.replace("assets/cast/", "\x00CAST\x00")
        n = n.replace("/idle.png", "/idle.webp").replace("/talk.png", "/talk.webp")
        n = n.replace("\x00CAST\x00", "assets/cast/")
        if n != t:
            path.write_text(n, encoding="utf-8")


def needs_audio_shrink(path: Path) -> bool:
    r = subprocess.run([str(FF), "-i", str(path)], capture_output=True, text=True, errors="replace")
    err = r.stderr or ""
    if "24000 Hz" in err and "mono" in err and "48 kb/s" in err:
        return False
    return True


def shrink_mp3(src: Path) -> tuple[Path, int, int, bool]:
    before = src.stat().st_size
    if before < 12_000:
        return src, before, before, False
    if not needs_audio_shrink(src):
        return src, before, before, False
    tmp = src.with_name(src.stem + ".tmp.mp3")
    r = subprocess.run(
        [
            str(FF), "-y", "-v", "error", "-i", str(src),
            "-ac", "1", "-ar", "24000", "-c:a", "libmp3lame", "-b:a", "48k",
            "-f", "mp3",
            str(tmp),
        ],
        capture_output=True,
        timeout=60,
    )
    if r.returncode != 0 or not tmp.exists() or tmp.stat().st_size < 800:
        err = (r.stderr or b"").decode("utf-8", "replace")[:200]
        print(f"  ffmpeg fail {src.name}: {r.returncode} {err}", flush=True)
        tmp.unlink(missing_ok=True)
        return src, before, before, False
    after = tmp.stat().st_size
    if after >= before * 0.95:
        tmp.unlink(missing_ok=True)
        return src, before, before, False
    tmp.replace(src)
    return src, before, after, True


def iter_ep_mp3s():
    for p in AUDIO_ROOT.iterdir():
        if not p.is_dir():
            continue
        if p.name in SKIP_AUDIO_DIRS:
            continue
        if not (p.name.startswith("ep") and p.name[2:].isdigit()):
            continue
        yield from p.glob("*.mp3")


def compress_images(sample: bool) -> None:
    files = [p for p in IMAGE_ROOTS if p.exists()]
    files.extend(sorted(CAST_ROOT.rglob("*.png")))
    if sample:
        files = files[:3]
    saved = 0
    before_all = after_all = 0
    for src in files:
        b, a = to_webp(src)
        before_all += b
        after_all += a
        saved += b - a
        print(f"  img {src.name}: {b/1024:.0f}KB -> {a/1024:.0f}KB", flush=True)
    if not sample:
        rewrite_cast_refs()
    print(f"images {before_all/1024/1024:.2f}MB -> {after_all/1024/1024:.2f}MB  saved {saved/1024/1024:.2f}MB", flush=True)


def compress_audio(workers: int, sample: bool) -> None:
    files = list(iter_ep_mp3s())
    if sample:
        files = files[:4]
    print(f"audio candidates {len(files)}", flush=True)
    before_all = after_all = changed = 0
    with ThreadPoolExecutor(max_workers=workers) as ex:
        futs = [ex.submit(shrink_mp3, p) for p in files]
        for i, fut in enumerate(as_completed(futs), 1):
            path, b, a, ok = fut.result()
            before_all += b
            after_all += a
            changed += int(ok)
            if i % 200 == 0 or sample:
                print(f"  audio {i}/{len(files)} changed={changed} {path.name} {b}->{a}", flush=True)
    print(
        f"audio {before_all/1024/1024:.1f}MB -> {after_all/1024/1024:.1f}MB  "
        f"changed {changed}/{len(files)}",
        flush=True,
    )


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--images", action="store_true")
    ap.add_argument("--audio", action="store_true")
    ap.add_argument("--sample", action="store_true")
    ap.add_argument("--workers", type=int, default=6)
    args = ap.parse_args()
    if not FF.exists():
        raise FileNotFoundError(FF)
    do_all = not args.images and not args.audio
    if args.images or do_all:
        compress_images(args.sample)
    if args.audio or do_all:
        compress_audio(args.workers, args.sample)


if __name__ == "__main__":
    main()
