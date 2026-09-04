"""Generate storybook reward/quiz art through the canonical GPT image workflow.

This is the networked companion to ``prepare_storybook_visual_assets.py``.
The latter intentionally creates a local, text-free fallback.  This command
only runs when an API key is already present in the process environment and
never reads credentials from files.  Generated files are staged under
``raw/cliprox`` and are copied to the existing ``final`` and runtime paths
only after every requested image passes the local manifest gate.

Example::

    python -X utf8 prj/tools/generate_storybook_visual_assets.py \
      --series minecraft --episode 1 --provider cliprox

The command deliberately does not use the local 10808 proxy.  The canonical
workflow pins the Cliprox CA and keeps hostname verification enabled.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from tempfile import TemporaryDirectory

from PIL import Image

try:  # Works both as ``python prj/tools/...`` and as a package in tests.
    from prepare_storybook_visual_assets import SPECS
    from storybook_visual_evidence import project_root
    from storybook_visual_manifest import MIN_RATIO, build_manifest, validate_manifest
except ModuleNotFoundError:  # pragma: no cover - import-mode compatibility
    from prj.tools.prepare_storybook_visual_assets import SPECS
    from prj.tools.storybook_visual_evidence import project_root
    from prj.tools.storybook_visual_manifest import MIN_RATIO, build_manifest, validate_manifest


WORKFLOW = Path.home() / ".codex" / "skills" / "gpt-image-workflow" / "scripts" / "bee_image_workflow.py"


def _workflow_path() -> Path:
    """Resolve the canonical workflow without assuming a specific profile."""
    candidates = (
        WORKFLOW,
        Path(os.environ.get("CODEX_HOME", "")) / "skills" / "gpt-image-workflow" / "scripts" / "bee_image_workflow.py",
        Path(r"C:\Users\No'mi'l\.codex\skills\gpt-image-workflow\scripts\bee_image_workflow.py"),
    )
    for candidate in candidates:
        if candidate.is_file():
            return candidate
    raise SystemExit("canonical gpt-image-workflow script not found")


def _require_key(provider: str) -> None:
    if provider == "cliprox" and not (os.environ.get("CLIPROX_API_KEY") or "").strip():
        raise SystemExit(
            "CLIPROX_API_KEY missing; set it in the current process and rerun. "
            "The generator does not read keys from markdown or auth files."
        )
    if provider == "auto" and not (
        (os.environ.get("CLIPROX_API_KEY") or "").strip()
        or (os.environ.get("BEE_API_KEY") or "").strip()
    ):
        raise SystemExit(
            "No image API key; set CLIPROX_API_KEY (preferred) or BEE_API_KEY in the current process."
        )


def _image_output(directory: Path, prefix: str) -> Path:
    for suffix in (".png", ".jpg", ".jpeg", ".webp"):
        candidate = directory / f"{prefix}{suffix}"
        if candidate.is_file():
            return candidate
    raise RuntimeError(f"workflow produced no image for {prefix}")


def _stage_as_png(source: Path, destination: Path) -> None:
    """Normalize provider output to a deterministic PNG without partial writes."""
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix(destination.suffix + ".tmp")
    with Image.open(source) as image:
        image.convert("RGBA").save(temporary, format="PNG", optimize=True)
    temporary.replace(destination)


def _check_image(path: Path) -> tuple[int, int, float]:
    with Image.open(path) as image:
        width, height = image.size
    ratio = width / height if height else 0.0
    if width <= 0 or height <= 0:
        raise RuntimeError(f"{path.name}: invalid dimensions {width}x{height}")
    if ratio < MIN_RATIO:
        raise RuntimeError(f"{path.name}: landscape ratio {ratio:.3f} < {MIN_RATIO}")
    return width, height, ratio


def _run_one(
    root: Path,
    prompt: Path,
    raw_dir: Path,
    prefix: str,
    size: str,
    provider: str,
    retries: int,
    timeout: int,
) -> tuple[Path, str]:
    raw_dir.mkdir(parents=True, exist_ok=True)
    command = [
        sys.executable,
        "-X",
        "utf8",
        str(_workflow_path()),
        "generate",
        "--prompt-file",
        str(prompt),
        "--out",
        str(raw_dir),
        "--prefix",
        prefix,
        "--size",
        size,
        "--provider",
        provider,
        "--retries",
        str(retries),
        "--timeout",
        str(timeout),
    ]
    completed = subprocess.run(
        command,
        cwd=str(root),
        env=dict(os.environ),
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )
    if completed.returncode != 0:
        # The canonical runner redacts credentials.  Keep only a bounded
        # diagnostic so an API response can never flood the terminal/log.
        detail = (completed.stderr or completed.stdout or "generation failed").strip()
        raise RuntimeError(f"{prefix}: workflow failed: {detail[-1200:]}")
    image = _image_output(raw_dir, prefix)
    actual_provider = provider
    run_manifest = raw_dir / "manifest.json"
    if run_manifest.is_file():
        try:
            runs = json.loads(run_manifest.read_text(encoding="utf-8")).get("runs") or []
            if runs and isinstance(runs[-1], dict) and runs[-1].get("provider"):
                actual_provider = str(runs[-1]["provider"])
        except (OSError, json.JSONDecodeError):
            pass
    return image, actual_provider


def _existing_provider(manifest_path: Path) -> str:
    if not manifest_path.is_file():
        return ""
    try:
        payload = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return ""
    return str(payload.get("generation_provider") or "")


def generate(
    root: Path,
    series: str,
    episode: int,
    provider: str,
    force: bool,
    size: str,
    retries: int,
    timeout: int,
    raw_run: Path | None = None,
) -> Path:
    if episode != 1 or series not in SPECS:
        raise SystemExit("network generation currently supports Minecraft/Mikey & JJ EP1")
    _require_key(provider)

    doc_dir = root / "docs" / "generated" / "storybooks" / series / f"ep{episode:03d}"
    doc_dir.mkdir(parents=True, exist_ok=True)
    prompt_dir = doc_dir / "prompts"
    final_dir = doc_dir / "final"
    runtime_dir = root / "prj" / "assets" / "generated" / "storybooks" / series / f"ep{episode:03d}"
    evidence_path = doc_dir / "references" / "evidence.json"
    if not evidence_path.is_file():
        raise SystemExit(f"source evidence missing: {evidence_path}")
    evidence = json.loads(evidence_path.read_text(encoding="utf-8"))

    runtime_manifest = runtime_dir / "manifest.json"
    if not force and _existing_provider(runtime_manifest) not in {"", "fallback-local-awaiting-cliprox-key"}:
        raise SystemExit(
            f"formal assets already exist ({_existing_provider(runtime_manifest)}); pass --force to replace them"
        )

    specs = []
    # Keep provider responses and raw images for audit/retry.  Only the
    # normalized final/runtime trees are transactional.
    if raw_run is None:
        run_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + f"-{os.getpid()}"
        raw_root = doc_dir / "raw" / "cliprox" / run_id
    else:
        raw_root = raw_run if raw_run.is_absolute() else (root / raw_run)
    raw_root.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory(prefix=f"storybook-{series}-ep{episode:03d}-", dir=str(doc_dir)) as temp:
        staged_dir = Path(temp) / "final"
        staged: list[tuple[str, Path]] = []
        actual_providers: set[str] = set()
        for kind, file_name, prompt_name, pages, sentence_ids in SPECS[series]:
            prompt_path = prompt_dir / prompt_name
            if not prompt_path.is_file():
                raise RuntimeError(f"prompt missing: {prompt_path}")
            asset_raw_dir = raw_root / kind
            try:
                # ``--raw-run`` enables a safe resume after an interrupted
                # batch.  The explicit run directory prevents accidentally
                # reusing an image from another attempt.
                source = _image_output(asset_raw_dir, kind) if raw_run is not None else None
            except RuntimeError:
                source = None
            if source is None:
                source, actual_provider = _run_one(root, prompt_path, asset_raw_dir, kind, size, provider, retries, timeout)
            else:
                actual_provider = provider
                run_manifest = asset_raw_dir / "manifest.json"
                if run_manifest.is_file():
                    try:
                        runs = json.loads(run_manifest.read_text(encoding="utf-8")).get("runs") or []
                        if runs and isinstance(runs[-1], dict) and runs[-1].get("provider"):
                            actual_provider = str(runs[-1]["provider"])
                    except (OSError, json.JSONDecodeError):
                        pass
            actual_providers.add(actual_provider)
            # Validate the provider output before touching the published tree.
            # OCR remains a separate gate in the manifest checker; this
            # command records an empty result rather than inventing a pass
            # when no OCR adapter is installed.
            _check_image(source)
            target = staged_dir / file_name
            _stage_as_png(source, target)
            staged.append((file_name, target))
            specs.append({
                "id": kind,
                "kind": kind,
                "file": file_name,
                "prompt": prompt_name,
                "source_evidence": [{"storybook_pages": pages, "sentence_ids": sentence_ids}],
                "ocr_text": "",
            })

        # Build and validate against the staged set.  A failed run leaves the
        # prior fallback/formal assets and manifest untouched.
        manifest = build_manifest(
            series,
            episode,
            evidence,
            staged_dir,
            prompt_dir,
            f"assets/generated/storybooks/{series}/ep{episode:03d}",
            specs,
        )
        manifest["generation_provider"] = next(iter(actual_providers)) if len(actual_providers) == 1 else "mixed"
        manifest["generation_model"] = "gpt-image-2"
        manifest["fallback"] = None
        errors = validate_manifest(manifest, evidence, staged_dir, prompt_dir)
        if errors:
            raise RuntimeError("manifest quality gate failed: " + "; ".join(errors))

        final_dir.mkdir(parents=True, exist_ok=True)
        runtime_dir.mkdir(parents=True, exist_ok=True)
        for file_name, source in staged:
            # Copy through temporary names so a process interruption cannot
            # leave a half-written PNG at a runtime path.
            for directory in (final_dir, runtime_dir):
                temporary = directory / f".{file_name}.tmp"
                shutil.copy2(source, temporary)
                temporary.replace(directory / file_name)
        encoded = json.dumps(manifest, ensure_ascii=False, indent=2) + "\n"
        runtime_manifest.write_text(encoded, encoding="utf-8")
        (final_dir / "manifest.json").write_text(encoded, encoding="utf-8")
    return runtime_manifest


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--series", required=True, choices=sorted(SPECS))
    parser.add_argument("--episode", type=int, default=1)
    parser.add_argument("--provider", choices=("cliprox", "auto"), default="cliprox")
    parser.add_argument("--size", default="1536x1024")
    parser.add_argument("--retries", type=int, default=3)
    parser.add_argument("--timeout", type=int, default=300)
    parser.add_argument("--force", action="store_true", help="replace an existing formal manifest")
    parser.add_argument(
        "--raw-run",
        type=Path,
        help="resume from an existing docs/.../raw/cliprox/<run-id> directory; only missing assets call the API",
    )
    parser.add_argument("--root", type=Path, default=project_root())
    args = parser.parse_args()
    path = generate(
        args.root.resolve(), args.series, args.episode, args.provider, args.force,
        args.size, args.retries, args.timeout, args.raw_run,
    )
    print(path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
