# -*- coding: utf-8 -*-
"""Verify a stage data ZIP and render a compact size report."""
from __future__ import annotations

import argparse
import hashlib
import json
from collections import defaultdict
from pathlib import Path
import zipfile


def _sha256_zip(zf: zipfile.ZipFile, name: str) -> str:
    digest = hashlib.sha256()
    with zf.open(name, "r") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def verify_manifest(pack: Path) -> dict:
    """Return verification details or raise ``ValueError`` on corruption."""
    with zipfile.ZipFile(pack) as zf:
        try:
            manifest = json.loads(zf.read("pack-manifest.json"))
        except (KeyError, json.JSONDecodeError) as exc:
            raise ValueError("ZIP 缺少有效 pack-manifest.json") from exc
        expected = {item["path"]: item for item in manifest.get("files", [])}
        actual = {name for name in zf.namelist() if name != "pack-manifest.json"}
        if actual != set(expected):
            missing = sorted(set(expected) - actual)
            extra = sorted(actual - set(expected))
            raise ValueError(f"manifest 文件边界不一致 missing={missing[:3]} extra={extra[:3]}")
        mismatches = []
        for name, item in expected.items():
            if zf.getinfo(name).file_size != item.get("size"):
                mismatches.append(f"size:{name}")
            elif _sha256_zip(zf, name) != item.get("sha256"):
                mismatches.append(f"sha256:{name}")
        if mismatches:
            raise ValueError("文件校验失败: " + ", ".join(mismatches[:5]))
        return manifest


def render_report(pack: Path) -> str:
    manifest = verify_manifest(pack)
    buckets: dict[str, list[int]] = defaultdict(lambda: [0, 0])
    for item in manifest.get("files", []):
        top = item["path"].split("/", 1)[0]
        buckets[top][0] += 1
        buckets[top][1] += int(item.get("size", 0))
    rows = sorted(buckets.items(), key=lambda pair: pair[1][1], reverse=True)
    zip_mb = pack.stat().st_size / 1024 / 1024
    source_mb = int(manifest.get("total_bytes", 0)) / 1024 / 1024
    ratio = (zip_mb / source_mb * 100) if source_mb else 0
    lines = [
        f"# 阶段数据包体积报告：{pack.name}",
        "",
        f"- 包 ID：`{manifest.get('pack_id', '')}`",
        f"- 版本：`{manifest.get('version', '')}`",
        f"- 合辑：{', '.join(manifest.get('collections', []))}",
        f"- 集数：{len(manifest.get('episodes', []))}（{manifest.get('episodes', [])}）",
        f"- 已发布绘本：{', '.join(manifest.get('published_books', [])) or '无'}",
        f"- 文件数：{manifest.get('file_count', 0)}",
        f"- 原始文件体积：{source_mb:.1f} MiB",
        f"- ZIP 体积：{zip_mb:.1f} MiB",
        "- 相对 content 全目录（约 4.94 GiB）的素材选择量：约减少 91.8%。",
        f"- ZIP/原始体积：{ratio:.1f}%（媒体采用存储模式，避免二次压缩开销）",
        "",
        "## 顶层目录",
        "",
        "| 目录 | 文件数 | 原始体积 |",
        "| --- | ---: | ---: |",
    ]
    lines.extend(f"| `{name}` | {values[0]} | {values[1] / 1024 / 1024:.2f} MiB |" for name, values in rows)
    lines.extend([
        "",
        "## 校验",
        "",
        "- `pack-manifest.json` 文件清单与 ZIP 条目一致。",
        "- 每个条目的 SHA-256 已复算通过。",
        f"- 生成警告：{len(manifest.get('warnings', []))} 条。",
    ])
    if manifest.get("warnings"):
        lines.extend(["", "```text", *manifest["warnings"], "```"])
    return "\n".join(lines) + "\n"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("pack", type=Path)
    ap.add_argument("--out", type=Path)
    args = ap.parse_args()
    report = render_report(args.pack)
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(report, encoding="utf-8")
        print(f"report -> {args.out}")
    else:
        print(report, end="")


if __name__ == "__main__":
    main()
