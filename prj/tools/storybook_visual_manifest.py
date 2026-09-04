"""Build and validate storybook visual asset manifests.

The manifest is deliberately evidence-first.  A generated PNG cannot be
published unless it has a source page/scene link, a prompt hash, dimensions,
ratio and SHA-256.  Text detected by an OCR adapter is recorded and rejected;
all readable captions remain HTML responsibilities.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


MIN_RATIO = 1.4


def sha256_file(path: Path) -> str | None:
    if not path.is_file():
        return None
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def image_info(path: Path) -> tuple[int, int, float, str | None]:
    try:
        from PIL import Image

        with Image.open(path) as image:
            width, height = image.size
            return width, height, (width / height if height else 0.0), image.format
    except Exception:
        return 0, 0, 0.0, None


def _evidence_pages(evidence: dict[str, Any]) -> set[int]:
    pages = evidence.get("pages") if isinstance(evidence, dict) else []
    return {int(item.get("page_no")) for item in pages or [] if isinstance(item, dict) and str(item.get("page_no", "")).isdigit()}


def validate_manifest(manifest: dict[str, Any], evidence: dict[str, Any] | None = None, asset_root: Path | None = None, prompt_root: Path | None = None) -> list[str]:
    errors: list[str] = []
    if not isinstance(manifest, dict):
        return ["manifest must be an object"]
    if not manifest.get("series"):
        errors.append("missing series")
    if not manifest.get("episode"):
        errors.append("missing episode")
    assets = manifest.get("assets")
    if not isinstance(assets, list) or not assets:
        errors.append("manifest must contain assets")
        return errors
    page_numbers = _evidence_pages(evidence or {})
    for index, asset in enumerate(assets):
        label = str(asset.get("id") or asset.get("file") or f"asset-{index}") if isinstance(asset, dict) else f"asset-{index}"
        if not isinstance(asset, dict):
            errors.append(f"{label}: asset must be an object")
            continue
        file_ref = str(asset.get("file") or "")
        if not file_ref:
            errors.append(f"{label}: missing file")
        file_path = (asset_root / file_ref).resolve() if asset_root and file_ref else None
        if file_path and not file_path.is_file():
            errors.append(f"{label}: file missing: {file_ref}")
        expected_hash = sha256_file(file_path) if file_path else None
        if not asset.get("sha256"):
            errors.append(f"{label}: missing sha256")
        elif expected_hash and expected_hash != asset.get("sha256"):
            errors.append(f"{label}: sha256 mismatch")
        prompt_ref = str(asset.get("prompt") or "")
        prompt_path = (prompt_root / prompt_ref).resolve() if prompt_root and prompt_ref else None
        if not prompt_ref or (prompt_path and not prompt_path.is_file()):
            errors.append(f"{label}: prompt missing")
        prompt_hash = sha256_text(prompt_path.read_text(encoding="utf-8")) if prompt_path and prompt_path.is_file() else None
        if not asset.get("prompt_sha256"):
            errors.append(f"{label}: missing prompt_sha256")
        elif prompt_hash and prompt_hash != asset.get("prompt_sha256"):
            errors.append(f"{label}: prompt_sha256 mismatch")
        width, height, ratio, _format = image_info(file_path) if file_path and file_path.is_file() else (int(asset.get("width") or 0), int(asset.get("height") or 0), float(asset.get("ratio") or 0), None)
        if width <= 0 or height <= 0:
            errors.append(f"{label}: invalid dimensions")
        if ratio < MIN_RATIO:
            errors.append(f"{label}: landscape ratio {ratio:.3f} < {MIN_RATIO}")
        if asset.get("ratio") is None:
            errors.append(f"{label}: missing ratio")
        source = asset.get("source_evidence")
        if not isinstance(source, list) or not source:
            errors.append(f"{label}: missing source evidence")
        else:
            for item in source:
                if not isinstance(item, dict):
                    errors.append(f"{label}: malformed source evidence")
                    continue
                pages = item.get("storybook_pages") or ([item.get("page_no")] if item.get("page_no") is not None else [])
                if pages and page_numbers and any(int(page) not in page_numbers for page in pages if str(page).isdigit()):
                    errors.append(f"{label}: source page not in evidence")
        ocr_text = str(asset.get("ocr_text") or "").strip()
        if ocr_text:
            errors.append(f"{label}: OCR detected readable text: {ocr_text[:80]}")
        if asset.get("validated") is not True:
            errors.append(f"{label}: validated must be true")
    return errors


def build_asset_record(asset_id: str, kind: str, file_path: Path, prompt_path: Path, source_evidence: list[dict[str, Any]], runtime_path: str, ocr_text: str = "") -> dict[str, Any]:
    width, height, ratio, _format = image_info(file_path)
    return {
        "id": asset_id,
        "kind": kind,
        "file": file_path.name,
        "runtime_path": runtime_path,
        "prompt": prompt_path.name,
        "prompt_sha256": sha256_text(prompt_path.read_text(encoding="utf-8")),
        "width": width,
        "height": height,
        "ratio": round(ratio, 6),
        "sha256": sha256_file(file_path),
        "source_evidence": source_evidence,
        "ocr_text": ocr_text,
        "validated": not bool(ocr_text) and ratio >= MIN_RATIO and width > 0 and height > 0,
    }


def build_manifest(series: str, episode: int, evidence: dict[str, Any], asset_dir: Path, prompt_dir: Path, runtime_prefix: str, assets: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    if not isinstance(evidence, dict) or not (evidence.get("pages") or evidence.get("sentences")):
        raise ValueError("cannot build visual manifest without source page or sentence evidence")
    records: list[dict[str, Any]] = []
    for spec in assets or []:
        if not spec.get("source_evidence"):
            raise ValueError(f"asset {spec.get('id', '<unknown>')} has no source evidence")
        file_path = asset_dir / str(spec["file"])
        prompt_path = prompt_dir / str(spec["prompt"])
        records.append(build_asset_record(
            str(spec["id"]), str(spec.get("kind") or spec["id"]), file_path, prompt_path,
            list(spec.get("source_evidence") or []), f"{runtime_prefix.rstrip('/')}/{file_path.name}", str(spec.get("ocr_text") or ""),
        ))
    return {
        "schema_version": 1,
        "series": series,
        "episode": int(episode),
        "evidence": "references/evidence.json",
        "evidence_sha256": sha256_text(json.dumps(evidence, ensure_ascii=False, sort_keys=True)),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "assets": records,
        "fallback": "page_image" if not records else None,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path)
    parser.add_argument("--evidence", type=Path)
    parser.add_argument("--asset-root", type=Path)
    parser.add_argument("--prompt-root", type=Path)
    parser.add_argument("--write", action="store_true", help="write normalized manifest after validation")
    args = parser.parse_args()
    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    evidence = json.loads(args.evidence.read_text(encoding="utf-8")) if args.evidence else None
    errors = validate_manifest(manifest, evidence, args.asset_root, args.prompt_root)
    if errors:
        print(json.dumps({"valid": False, "errors": errors}, ensure_ascii=False, indent=2))
        return 1
    if args.write:
        args.manifest.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"valid": True, "assets": len(manifest.get("assets", []))}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
