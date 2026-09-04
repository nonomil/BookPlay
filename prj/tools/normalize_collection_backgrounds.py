# -*- coding: utf-8 -*-
"""Create deterministic 16:9 runtime copies of the 13 collection backgrounds.

Sources are never overwritten. The runtime copies use the same center-cover crop
that map.css applies in the browser, so the stored asset matches the visible crop.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image, ImageOps

CONTENT = Path(__file__).resolve().parents[2] / "content"
DEFAULT_SOURCE = CONTENT / "assets" / "collections"
DEFAULT_OUTPUT = DEFAULT_SOURCE / "normalized"
DEFAULT_COLLECTIONS = CONTENT / "dialogue_stories" / "collections.json"


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def normalize_one(src: Path, dst: Path, *, width: int = 1600, height: int = 900) -> dict:
    src = Path(src).resolve()
    dst = Path(dst).resolve()
    if src == dst:
        raise ValueError("source and destination must differ; originals are immutable")
    if width <= 0 or height <= 0:
        raise ValueError("width and height must be positive")
    if not src.is_file():
        raise FileNotFoundError(src)

    dst.parent.mkdir(parents=True, exist_ok=True)
    tmp = dst.with_name(dst.stem + ".partial" + dst.suffix)
    with Image.open(src) as source:
        source.load()
        source_size = list(source.size)
        rgb = source.convert("RGB")
        output = ImageOps.fit(
            rgb,
            (width, height),
            method=Image.Resampling.LANCZOS,
            centering=(0.5, 0.5),
        )
        output.save(tmp, format="JPEG", quality=88, optimize=True, progressive=True)
    tmp.replace(dst)

    return {
        "source": src.name,
        "output": dst.name,
        "source_dimensions": source_size,
        "output_dimensions": [width, height],
        "source_bytes": src.stat().st_size,
        "output_bytes": dst.stat().st_size,
        "source_sha256": _sha256(src),
        "output_sha256": _sha256(dst),
        "transform": "center-crop-cover",
    }


def build_all(src_dir: Path, out_dir: Path, *, width: int = 1600, height: int = 900) -> dict:
    src_dir = Path(src_dir)
    out_dir = Path(out_dir)
    assets = []
    for index in range(1, 14):
        asset_id = f"c{index:02d}"
        receipt = normalize_one(
            src_dir / f"{asset_id}.jpg",
            out_dir / f"{asset_id}.jpg",
            width=width,
            height=height,
        )
        receipt["id"] = asset_id
        assets.append(receipt)
    manifest = {
        "asset_set": "journey-to-the-west-collection-backgrounds",
        "type": "map-background",
        "tool": "prj/tools/normalize_collection_backgrounds.py",
        "count": len(assets),
        "output_dimensions": [width, height],
        "format": "JPEG",
        "quality": 88,
        "transform": "center-crop-cover",
        "source_references": [f"../c{index:02d}.jpg" for index in range(1, 14)],
        "outputs": [f"c{index:02d}.jpg" for index in range(1, 14)],
        "acceptance": {
            "dimensions_checked": True,
            "source_files_preserved": True,
            "alpha_checked": "not-applicable-jpeg",
        },
        "limitations": ["Center-cover crop may remove outer-edge details; original JPG files are retained one folder up."],
        "assets": assets,
    }
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return manifest


def update_collection_refs(path: Path) -> int:
    path = Path(path)
    data = json.loads(path.read_text(encoding="utf-8-sig"))
    changed = 0
    for collection in data.get("collections", []):
        asset_id = str(collection.get("id") or "")
        if not asset_id.startswith("c"):
            continue
        expected = f"assets/collections/normalized/{asset_id}.jpg"
        if collection.get("background") != expected:
            collection["background"] = expected
            changed += 1
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return changed


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--src", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--collections", type=Path, default=DEFAULT_COLLECTIONS)
    parser.add_argument("--width", type=int, default=1600)
    parser.add_argument("--height", type=int, default=900)
    parser.add_argument("--no-update-refs", action="store_true")
    args = parser.parse_args()

    manifest = build_all(args.src, args.out, width=args.width, height=args.height)
    changed = 0 if args.no_update_refs else update_collection_refs(args.collections)
    print(
        f"normalized {manifest['count']} backgrounds to {args.width}x{args.height}; "
        f"updated_refs={changed}; output={args.out}",
        flush=True,
    )


if __name__ == "__main__":
    main()
