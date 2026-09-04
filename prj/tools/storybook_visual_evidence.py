"""Collect factual visual evidence for storybook reward art.

The collector is intentionally offline and conservative: it only copies facts
already present in the storybook JSON and optional audio-manifest/video files.
It never estimates dialogue times or invents characters/props.  The resulting
``evidence.json`` is consumed by the prompt writer and asset manifest checker.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
from pathlib import Path
from typing import Any, Iterable


def sha256_file(path: Path) -> str | None:
    if not path.is_file():
        return None
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def normalize_term(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip()).lower()


def project_root() -> Path:
    return Path(__file__).resolve().parents[2]


def data_path(root: Path, value: Any) -> Path | None:
    if not value:
        return None
    raw = str(value).replace("\\", "/")
    candidate = Path(raw)
    if candidate.is_absolute():
        return candidate
    # Runtime asset references are rooted at prj/; source-library paths may
    # live beside the repository and are therefore recorded as unresolved.
    for base in (root, root / "prj"):
        resolved = (base / candidate).resolve()
        if resolved.exists():
            return resolved
    return (root / candidate).resolve()


def storybook_json_path(root: Path, series: str, episode: int) -> Path:
    if series == "minecraft":
        return root / "prj" / "data" / "storybooks-minecraft" / f"book{episode}.json"
    if series == "mikey-jj":
        return root / "prj" / "data" / "storybooks-mikey-jj" / f"book{episode}.json"
    return root / "prj" / "data" / "storybooks" / f"ep{episode}.json"


def sentence_iter(book: dict[str, Any]) -> Iterable[tuple[int, dict[str, Any]]]:
    for page_index, page in enumerate(book.get("pages") or [], start=1):
        page_no = int(page.get("page_no") or page_index)
        sentences = page.get("sentences")
        if not isinstance(sentences, list) or not sentences:
            sentences = [page]
        for sentence in sentences:
            if isinstance(sentence, dict):
                yield page_no, sentence


def collect_evidence(root: Path, series: str, episode: int, book: dict[str, Any] | None = None) -> dict[str, Any]:
    source_path = storybook_json_path(root, series, episode)
    payload = book if book is not None else json.loads(source_path.read_text(encoding="utf-8"))
    pages: list[dict[str, Any]] = []
    page_images: list[str] = []
    for page_index, page in enumerate(payload.get("pages") or [], start=1):
        page_no = int(page.get("page_no") or page_index)
        image_ref = page.get("image")
        image_path = data_path(root, image_ref)
        record = {
            "page_no": page_no,
            "source_page": page.get("source_page"),
            "image": str(image_ref or ""),
            "image_exists": bool(image_path and image_path.is_file()),
            "image_sha256": sha256_file(image_path) if image_path else None,
        }
        pages.append(record)
        if image_ref:
            page_images.append(str(image_ref))

    sentences: list[dict[str, Any]] = []
    target_terms: list[str] = []
    seen_terms: set[str] = set()
    for page_no, sentence in sentence_iter(payload):
        terms = []
        for glossary in sentence.get("glossary") or []:
            if not isinstance(glossary, dict):
                continue
            term = str(glossary.get("term") or "").strip()
            key = normalize_term(term)
            if term and key not in seen_terms:
                target_terms.append(term)
                seen_terms.add(key)
            if term:
                terms.append(term)
        start = sentence.get("start_ms")
        end = sentence.get("end_ms")
        if start is None and sentence.get("start_sec") is not None:
            start = float(sentence["start_sec"]) * 1000
        if end is None and sentence.get("end_sec") is not None:
            end = float(sentence["end_sec"]) * 1000
        audio_ref = sentence.get("audio") or payload.get("audio")
        audio_path = data_path(root, audio_ref)
        sentences.append({
            "id": str(sentence.get("id") or ""),
            "page_no": page_no,
            "text_en": str(sentence.get("text_en") or ""),
            "zh": str(sentence.get("zh") or ""),
            "start_ms": start,
            "end_ms": end,
            "audio": str(audio_ref or ""),
            "audio_exists": bool(audio_path and audio_path.is_file()),
            "audio_sha256": sha256_file(audio_path) if audio_path else None,
            "glossary_terms": terms,
            "speaker": sentence.get("speaker") if isinstance(sentence.get("speaker"), dict) else None,
        })

    sources = payload.get("sources") if isinstance(payload.get("sources"), dict) else {}
    source_video = sources.get("video") or sources.get("mp4")
    if not source_video and series == "mikey-jj":
        source_video = next((value for key, value in sources.items() if "video" in key.lower() or "mp4" in key.lower()), None)
    video_path = data_path(root, source_video)
    video_record: dict[str, Any] = {
        "path": str(source_video or ""),
        "exists": bool(video_path and video_path.is_file()),
        "sha256": sha256_file(video_path) if video_path else None,
        "fallback": "page_image" if not (video_path and video_path.is_file()) else None,
    }

    return {
        "schema_version": 1,
        "series": series,
        "episode": int(episode),
        "storybook_id": payload.get("storybook_id"),
        "storybook_json": str(source_path.relative_to(root)).replace("\\", "/"),
        "storybook_json_sha256": sha256_file(source_path),
        "title": payload.get("title") or {},
        "pages": pages,
        "page_images": page_images,
        "sentences": sentences,
        "target_terms": target_terms,
        "video": video_record,
        "audio": {
            "path": str(payload.get("audio") or ""),
            "duration_sec": payload.get("audio_duration_sec"),
        },
        "facts": {
            "characters": sorted({str(s["speaker"].get("label") or s["speaker"].get("id")) for s in sentences if s.get("speaker")}),
            "locations": [],
            "props": target_terms,
        },
        "generation_policy": {
            "fallback": "page_image",
            "text_free": True,
            "landscape_ratio_min": 1.4,
        },
    }


def extract_representative_frame(video_path: Path, destination: Path, timestamp_sec: float) -> Path | None:
    """Extract one frame with the bundled imageio-ffmpeg binary when present."""
    if not video_path.is_file():
        return None
    try:
        import imageio_ffmpeg

        ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return None
    destination.parent.mkdir(parents=True, exist_ok=True)
    command = [ffmpeg, "-y", "-ss", f"{max(0.0, timestamp_sec):.3f}", "-i", str(video_path), "-frames:v", "1", "-q:v", "3", str(destination)]
    try:
        result = subprocess.run(command, capture_output=True, text=True, timeout=45)
    except (OSError, subprocess.SubprocessError):
        return None
    return destination if result.returncode == 0 and destination.is_file() else None


def write_evidence(root: Path, series: str, episode: int, out_dir: Path | None = None) -> Path:
    destination = out_dir or root / "docs" / "generated" / "storybooks" / series / f"ep{episode:03d}" / "references"
    destination.mkdir(parents=True, exist_ok=True)
    evidence = collect_evidence(root, series, episode)
    if evidence.get("video", {}).get("exists"):
        video_ref = evidence["video"].get("path")
        video_path = data_path(root, video_ref)
        first_sentence = next((item for item in evidence.get("sentences", []) if item.get("start_ms") is not None), None)
        timestamp = float(first_sentence.get("start_ms", 0)) / 1000 if first_sentence else 0.0
        frame_name = f"video-frame-{int(timestamp * 1000):06d}.jpg"
        frame = extract_representative_frame(video_path, destination / frame_name, timestamp) if video_path else None
        if frame:
            evidence["video"]["representative_frame"] = frame.name
            evidence["video"]["representative_frame_sha256"] = sha256_file(frame)
    path = destination / "evidence.json"
    path.write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return path


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--series", required=True, choices=["minecraft", "mikey-jj", "jttw"])
    parser.add_argument("--episode", type=int, default=1)
    parser.add_argument("--root", type=Path, default=project_root())
    parser.add_argument("--out", type=Path)
    args = parser.parse_args()
    path = write_evidence(args.root.resolve(), args.series, args.episode, args.out)
    print(path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
