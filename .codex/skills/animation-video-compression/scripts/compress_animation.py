#!/usr/bin/env python3
"""Safely compress flat 2D animation videos and verify the result."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import struct
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import Any

try:
    import av
except ImportError as exc:  # pragma: no cover - environment error
    raise SystemExit("PyAV is required: install/import module 'av' before running this script") from exc


EPISODE_RE = re.compile(r"^ep(\d+)\.mp4$", re.IGNORECASE)
DEFAULT_CQ = 29
MIN_BITRATE_KBPS = 350
SOURCE_BITRATE_RATIO = 0.72
CPU_CRF = 30


class CompressionError(RuntimeError):
    pass


def ffmpeg_executable() -> str:
    found = shutil.which("ffmpeg")
    if found:
        return found
    try:
        import imageio_ffmpeg

        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception as exc:  # pragma: no cover - environment error
        raise CompressionError("ffmpeg was not found on PATH or through imageio_ffmpeg") from exc


def has_nvenc(ffmpeg: str) -> bool:
    result = subprocess.run(
        [ffmpeg, "-hide_banner", "-encoders"],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )
    return result.returncode == 0 and "h264_nvenc" in result.stdout


def top_level_atoms(path: Path) -> list[str]:
    atoms: list[str] = []
    total = path.stat().st_size
    position = 0
    with path.open("rb") as handle:
        while position + 8 <= total and len(atoms) < 32:
            handle.seek(position)
            header = handle.read(16)
            size = struct.unpack(">I", header[:4])[0]
            atom_type = header[4:8].decode("latin1")
            header_size = 8
            if size == 1:
                size = struct.unpack(">Q", header[8:16])[0]
                header_size = 16
            elif size == 0:
                size = total - position
            if size < header_size:
                break
            atoms.append(atom_type)
            position += size
    return atoms


def probe(path: Path) -> dict[str, Any]:
    container = av.open(str(path))
    try:
        video = next((stream for stream in container.streams if stream.type == "video"), None)
        audio = next((stream for stream in container.streams if stream.type == "audio"), None)
        if video is None:
            raise CompressionError(f"no video stream: {path}")

        audio_hash = hashlib.sha256()
        audio_packets = 0
        key_times: list[float] = []
        for packet in container.demux():
            if packet.stream.type == "audio" and packet.size:
                audio_hash.update(bytes(packet))
                audio_packets += 1
            elif packet.stream.type == "video" and packet.is_keyframe and packet.pts is not None:
                key_times.append(float(packet.pts * packet.time_base))

        gaps = [right - left for left, right in zip(key_times, key_times[1:])]
        atoms = top_level_atoms(path)
        fast_start = "moov" in atoms and "mdat" in atoms and atoms.index("moov") < atoms.index("mdat")
        fps = float(video.average_rate) if video.average_rate else 0.0
        duration = float(container.duration / av.time_base) if container.duration else 0.0
        return {
            "path": str(path),
            "bytes": path.stat().st_size,
            "duration": duration,
            "video_codec": video.codec_context.name,
            "video_profile": video.codec_context.profile,
            "width": video.codec_context.width,
            "height": video.codec_context.height,
            "fps": fps,
            "video_bitrate": video.bit_rate or 0,
            "audio_codec": audio.codec_context.name if audio else None,
            "audio_bitrate": (audio.bit_rate or 0) if audio else 0,
            "audio_rate": audio.codec_context.sample_rate if audio else None,
            "audio_channels": audio.codec_context.channels if audio else None,
            "audio_packets": audio_packets,
            "audio_sha256": audio_hash.hexdigest() if audio else None,
            "keyframes": len(key_times),
            "key_gap_max": max(gaps) if gaps else 0.0,
            "fast_start": fast_start,
            "atoms": atoms,
        }
    finally:
        container.close()


def choose_encoder(requested: str, ffmpeg: str) -> str:
    available = has_nvenc(ffmpeg)
    if requested == "nvenc":
        if not available:
            raise CompressionError("--encoder nvenc was requested, but h264_nvenc is unavailable")
        return "nvenc"
    if requested == "cpu":
        return "cpu"
    return "nvenc" if available else "cpu"


def nvenc_rate_settings(source_info: dict[str, Any]) -> tuple[str, str, str]:
    """Use the accepted preset as a cap and avoid inflating low-bitrate sources."""
    source_kbps = max(1, round(source_info["video_bitrate"] / 1000))
    target_kbps = min(750, max(MIN_BITRATE_KBPS, round(source_kbps * SOURCE_BITRATE_RATIO)))
    maxrate_kbps = min(1100, max(target_kbps + 150, round(target_kbps * 1.45)))
    return f"{target_kbps}k", f"{maxrate_kbps}k", f"{maxrate_kbps * 2}k"


def dimensions_for_height(source_width: int, source_height: int, target_height: int) -> tuple[int, int]:
    if source_width <= 0 or source_height <= 0:
        raise CompressionError("source dimensions must be positive")
    if target_height <= 0 or target_height % 2:
        raise CompressionError("target height must be a positive even number")
    if target_height > source_height:
        raise CompressionError("target height must not upscale the source")
    scaled_width = max(2, round((source_width * target_height / source_height) / 2) * 2)
    return scaled_width, target_height


def build_command(
    ffmpeg: str,
    source: Path,
    temporary: Path,
    source_info: dict[str, Any],
    encoder: str,
    target_height: int | None = None,
) -> list[str]:
    fps = source_info["fps"]
    if fps <= 0:
        raise CompressionError(f"invalid source frame rate: {fps}")
    gop = max(1, round(fps * 2))
    min_gop = max(1, round(fps))

    command = [ffmpeg, "-hide_banner", "-loglevel", "warning", "-stats"]
    if encoder == "nvenc":
        command += ["-hwaccel", "cuda", "-hwaccel_output_format", "cuda"]
    command += ["-i", str(source), "-map", "0:v:0", "-map", "0:a:0"]

    if target_height is not None:
        target_width, target_height = dimensions_for_height(
            source_info["width"], source_info["height"], target_height
        )
        if encoder == "nvenc":
            command += ["-vf", f"scale_cuda={target_width}:{target_height}:interp_algo=lanczos"]
        else:
            command += ["-vf", f"scale={target_width}:{target_height}:flags=lanczos"]

    if encoder == "nvenc":
        bitrate, maxrate, bufsize = nvenc_rate_settings(source_info)
        command += [
            "-c:v", "h264_nvenc",
            "-preset", "p7",
            "-tune", "hq",
            "-rc", "vbr",
            "-cq", str(DEFAULT_CQ),
            "-b:v", bitrate,
            "-maxrate", maxrate,
            "-bufsize", bufsize,
            "-profile:v", "high",
            "-g", str(gop),
            "-bf", "3",
            "-b_ref_mode", "middle",
            "-spatial-aq", "1",
            "-temporal-aq", "1",
            "-rc-lookahead", str(gop),
            "-multipass", "fullres",
        ]
    else:
        command += [
            "-c:v", "libx264",
            "-preset", "slow",
            "-tune", "animation",
            "-crf", str(CPU_CRF),
            "-profile:v", "high",
            "-pix_fmt", "yuv420p",
            "-g", str(gop),
            "-keyint_min", str(min_gop),
            "-sc_threshold", "40",
        ]
    command += ["-c:a", "copy", "-movflags", "+faststart", "-y", str(temporary)]
    return command


def validate(
    source_info: dict[str, Any],
    output_info: dict[str, Any],
    target_height: int | None = None,
) -> list[str]:
    errors: list[str] = []
    frame_time = 1.0 / source_info["fps"] if source_info["fps"] > 0 else 0.05
    duration_tolerance = max(0.05, frame_time)

    if output_info["bytes"] >= source_info["bytes"]:
        errors.append("output is not smaller than input")
    if abs(output_info["duration"] - source_info["duration"]) > duration_tolerance:
        errors.append("duration changed beyond tolerance")
    expected_dimensions = (
        dimensions_for_height(source_info["width"], source_info["height"], target_height)
        if target_height is not None
        else (source_info["width"], source_info["height"])
    )
    if (output_info["width"], output_info["height"]) != expected_dimensions:
        errors.append(f"resolution is not {expected_dimensions[0]}x{expected_dimensions[1]}")
    if abs(output_info["fps"] - source_info["fps"]) > 0.01:
        errors.append("frame rate changed")
    if output_info["video_codec"] != "h264":
        errors.append("output video codec is not H.264")
    if output_info["audio_packets"] != source_info["audio_packets"]:
        errors.append("audio packet count changed")
    if output_info["audio_sha256"] != source_info["audio_sha256"]:
        errors.append("audio packet payload changed")
    if not output_info["fast_start"]:
        errors.append("MP4 is not fast-start")
    if output_info["key_gap_max"] > 2.2:
        errors.append(f"maximum keyframe gap is too large: {output_info['key_gap_max']:.3f}s")
    return errors


def compress_one(
    source: Path,
    output: Path,
    requested_encoder: str,
    overwrite: bool,
    target_height: int | None = None,
) -> dict[str, Any]:
    source = source.resolve()
    output = output.resolve()
    if not source.is_file():
        raise CompressionError(f"input does not exist: {source}")
    if source == output:
        raise CompressionError("input and output paths must differ")
    if output.exists() and not overwrite:
        raise CompressionError(f"output already exists; pass --overwrite only with authorization: {output}")

    output.parent.mkdir(parents=True, exist_ok=True)
    ffmpeg = ffmpeg_executable()
    encoder = choose_encoder(requested_encoder, ffmpeg)
    source_info = probe(source)

    handle = tempfile.NamedTemporaryFile(
        prefix=f".{output.stem}.", suffix=".partial.mp4", dir=output.parent, delete=False
    )
    temporary = Path(handle.name)
    handle.close()
    started = time.perf_counter()
    try:
        command = build_command(
            ffmpeg, source, temporary, source_info, encoder, target_height=target_height
        )
        result = subprocess.run(command, check=False)
        if result.returncode != 0:
            raise CompressionError(f"ffmpeg exited with code {result.returncode}")

        output_info = probe(temporary)
        errors = validate(source_info, output_info, target_height=target_height)
        if errors:
            raise CompressionError("; ".join(errors))

        os.replace(temporary, output)
        elapsed = time.perf_counter() - started
        return {
            "status": "ok",
            "input": str(source),
            "output": str(output),
            "encoder": encoder,
            "seconds": round(elapsed, 3),
            "source_bytes": source_info["bytes"],
            "output_bytes": output_info["bytes"],
            "saving_percent": round((1 - output_info["bytes"] / source_info["bytes"]) * 100, 2),
            "duration": round(output_info["duration"], 6),
            "fps": output_info["fps"],
            "resolution": f"{output_info['width']}x{output_info['height']}",
            "source_video_kbps": round(source_info["video_bitrate"] / 1000),
            "output_video_kbps": round(output_info["video_bitrate"] / 1000),
            "audio_sha256": output_info["audio_sha256"],
            "audio_unchanged": True,
            "fast_start": output_info["fast_start"],
            "key_gap_max": round(output_info["key_gap_max"], 3),
        }
    finally:
        if temporary.exists():
            temporary.unlink()


def write_report(path: Path | None, report: dict[str, Any]) -> None:
    rendered = json.dumps(report, ensure_ascii=False, indent=2)
    if path is not None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(rendered + "\n", encoding="utf-8")
    print(rendered)


def command_file(args: argparse.Namespace) -> int:
    result = compress_one(
        Path(args.input), Path(args.output), args.encoder, args.overwrite, target_height=args.height
    )
    write_report(Path(args.report) if args.report else None, result)
    return 0


def episode_sort_key(path: Path) -> int:
    match = EPISODE_RE.fullmatch(path.name)
    return int(match.group(1)) if match else sys.maxsize


def command_batch(args: argparse.Namespace) -> int:
    source_dir = Path(args.input_dir).resolve()
    output_dir = Path(args.output_dir).resolve()
    if not source_dir.is_dir():
        raise CompressionError(f"input directory does not exist: {source_dir}")
    if source_dir == output_dir:
        raise CompressionError("input and output directories must differ")

    sources = sorted(
        (path for path in source_dir.iterdir() if path.is_file() and EPISODE_RE.fullmatch(path.name)),
        key=episode_sort_key,
    )
    if not sources:
        raise CompressionError(f"no canonical ep<digits>.mp4 files found in {source_dir}")

    rows: list[dict[str, Any]] = []
    for source in sources:
        output = output_dir / source.name
        if output.exists() and args.skip_existing:
            source_info = probe(source)
            output_info = probe(output)
            errors = validate(source_info, output_info, target_height=args.height)
            if errors:
                rows.append({
                    "status": "error",
                    "input": str(source),
                    "output": str(output),
                    "error": "existing output failed validation: " + "; ".join(errors),
                })
                if not args.continue_on_error:
                    break
                continue
            rows.append({
                "status": "skipped",
                "verified": True,
                "input": str(source),
                "output": str(output),
                "source_bytes": source_info["bytes"],
                "output_bytes": output_info["bytes"],
                "saving_percent": round((1 - output_info["bytes"] / source_info["bytes"]) * 100, 2),
            })
            continue
        try:
            rows.append(
                compress_one(
                    source,
                    output,
                    args.encoder,
                    args.overwrite,
                    target_height=args.height,
                )
            )
        except Exception as exc:
            rows.append({"status": "error", "input": str(source), "output": str(output), "error": str(exc)})
            if not args.continue_on_error:
                break

    ok = [row for row in rows if row["status"] == "ok"]
    skipped = [row for row in rows if row["status"] == "skipped"]
    errors = [row for row in rows if row["status"] == "error"]
    report = {
        "status": "ok" if not errors and len(ok) + len(skipped) == len(sources) else "incomplete",
        "input_dir": str(source_dir),
        "output_dir": str(output_dir),
        "canonical_episode_count": len(sources),
        "converted": len(ok),
        "skipped": len(skipped),
        "errors": len(errors),
        "source_bytes": sum(row.get("source_bytes", 0) for row in ok + skipped),
        "output_bytes": sum(row.get("output_bytes", 0) for row in ok + skipped),
        "items": rows,
    }
    if report["source_bytes"]:
        report["saving_percent"] = round(
            (1 - report["output_bytes"] / report["source_bytes"]) * 100, 2
        )
    write_report(Path(args.report) if args.report else output_dir / "compression-report.json", report)
    return 1 if errors else 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    one = subparsers.add_parser("file", help="compress and verify one video")
    one.add_argument("--input", required=True)
    one.add_argument("--output", required=True)
    one.add_argument("--encoder", choices=("auto", "nvenc", "cpu"), default="auto")
    one.add_argument("--height", type=int, help="downscale to this even pixel height")
    one.add_argument("--overwrite", action="store_true")
    one.add_argument("--report")
    one.set_defaults(func=command_file)

    batch = subparsers.add_parser("batch", help="compress canonical ep<digits>.mp4 files")
    batch.add_argument("--input-dir", required=True)
    batch.add_argument("--output-dir", required=True)
    batch.add_argument("--encoder", choices=("auto", "nvenc", "cpu"), default="auto")
    batch.add_argument("--height", type=int, help="downscale to this even pixel height")
    batch.add_argument("--overwrite", action="store_true")
    batch.add_argument("--skip-existing", action="store_true")
    batch.add_argument("--continue-on-error", action="store_true")
    batch.add_argument("--report")
    batch.set_defaults(func=command_batch)
    return parser


def main() -> int:
    args = build_parser().parse_args()
    try:
        return args.func(args)
    except CompressionError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
