"""Mikey & JJ speaking-bubble sentence pipeline (first delivery slice).

Validate annotation contracts and slice atomic sentence MP3s from the locked
source audio using the locked imageio-ffmpeg build. Never touches source media.

Usage:
  python -X utf8 mikey_jj_sentence_pipeline.py validate --annotations prj/data/storybooks-mikey-jj/speaking-annotations.json
  python -X utf8 mikey_jj_sentence_pipeline.py slice --annotations prj/data/storybooks-mikey-jj/speaking-annotations.json \
      --audio "书籍资料库\\Mikey & JJ 英文冒险\\audio\\Water House Adventure.mp3" \
      --out prj/assets/mikey-jj/water-house-adventure/sentences
"""
import argparse
import json
import os
import re
import subprocess
import sys

FFMPEG = r"C:\Users\No'mi'l\AppData\Local\Programs\Python\Python311\Lib\site-packages\imageio_ffmpeg\binaries\ffmpeg-win-x86_64-v7.1.exe"
SPEAKERS = {"mikey", "jj", "narrator", "system"}
# Book ids are not limited to a single digit: the Mikey & JJ source catalog
# already contains books 10 and 11. Keep page/sentence widths stable while
# allowing future books to pass the same sentence-slicing contract.
ID_RE = re.compile(r"^b(\d+)-p(\d{2})-s(\d{2})$")

EXIT_CONTRACT = 3


def load_annotations(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def collect(annotations):
    records = []
    for key, ann in annotations["annotations"].items():
        m = ID_RE.match(key)
        if not m:
            raise SystemExit(f"{EXIT_CONTRACT}) bad annotation id: {key}")
        records.append((key, int(m.group(1)), int(m.group(2)), int(m.group(3)), ann))
    return records


def validate_annotations(path, exempt_compound=()):
    doc = load_annotations(path)
    records = collect(doc)
    if not records:
        raise SystemExit(f"{EXIT_CONTRACT}) no annotations found")
    seen = set()
    prev = {}
    failures = []

    def fail(msg):
        failures.append(msg)

    for key, book, page, seq, ann in records:
        if key in seen:
            fail(f"duplicate id {key}")
        seen.add(key)
        if not ann.get("text_en"):
            fail(f"{key} missing text_en")
        speaker = ann.get("speaker") or {}
        if speaker.get("id") not in SPEAKERS or not speaker.get("label"):
            fail(f"{key} empty/invalid speaker")
        b = ann.get("bubble") or {}
        for k in ("x", "y", "w", "h"):
            v = b.get(k)
            if not (isinstance(v, (int, float)) and 0 <= v <= 1):
                fail(f"{key} bubble.{k} out of range")
        if b.get("w", 0) <= 0 or b.get("h", 0) <= 0:
            fail(f"{key} bubble size invalid")
        start, end = ann.get("start_ms"), ann.get("end_ms")
        if not (isinstance(start, int) and isinstance(end, int) and 0 <= start < end):
            fail(f"{key} start/end invalid")
        if len(ann["text_en"].replace("...", "").rstrip(".!?") or "") == 0:
            pass
        tail = b.get("tail")
        if tail != "none" and not isinstance(tail, str):
            fail(f"{key} bad tail")
        # compound-sentence guard: one terminal clause per unit
        # (REPAIR r8: --exempt-compound allows the locked single short bubble)
        if key not in exempt_compound:
            terms = re.findall(r"[.!?]+(?=\s+[A-Z]|$)", ann["text_en"])
            if len(terms) > 1:
                fail(f"{key} compound multi-sentence text: {ann['text_en']}")
        prev_key = (book, page)
        if prev_key in prev and start < prev[prev_key]:
            fail(f"{key} overlaps/reverses after {prev_key}: start {start} < {prev[prev_key]}")
        prev[prev_key] = end

    if failures:
        print("VALIDATION_FAILED")
        for f in failures:
            print(" -", f)
        raise SystemExit(EXIT_CONTRACT)
    print(f"VALIDATION_OK records={len(records)}")


def slice_sentences(annotations_path, audio_path, out_dir, keep_old=False):
    doc = load_annotations(annotations_path)
    records = collect(doc)
    if not os.path.isfile(FFMPEG):
        raise SystemExit(f"{EXIT_CONTRACT}) locked ffmpeg missing: {FFMPEG}")
    if not os.path.isfile(audio_path):
        raise SystemExit(f"{EXIT_CONTRACT}) source audio missing: {audio_path}")
    os.makedirs(out_dir, exist_ok=True)
    fails = []
    for key, book, page, seq, ann in records:
        name = f"page-{page:02d}-sentence-{seq:02d}.mp3"
        out = os.path.join(out_dir, name)
        start = ann["start_ms"] / 1000.0
        end = ann["end_ms"] / 1000.0
        r = subprocess.run(
            [FFMPEG, "-y", "-loglevel", "error", "-i", audio_path,
             "-ss", f"{start:.3f}", "-to", f"{end:.3f}",
             "-af", f"afade=t=in:st=0:d=0.05,afade=t=out:st={end - start - 0.06:.3f}:d=0.05",
             "-c:a", "libmp3lame", "-q:a", "4", out],
            capture_output=True, text=True)
        if r.returncode != 0:
            fails.append((name, r.stderr.strip()))
    if fails:
        print("SLICE_FAILED")
        for name, err in fails:
            print(" -", name, err)
        raise SystemExit(EXIT_CONTRACT)
    print(f"SLICE_OK clips={len(records)} -> {out_dir}")


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)

    v = sub.add_parser("validate")
    v.add_argument("--annotations", required=True)
    v.add_argument("--exempt-compound", default="", help="comma-separated ids allowed to carry one short-bubble double clause")

    s = sub.add_parser("slice")
    s.add_argument("--annotations", required=True)
    s.add_argument("--audio", required=True)
    s.add_argument("--out", required=True)
    s.add_argument("--keep-old", action="store_true")

    args = ap.parse_args()
    if args.cmd == "validate":
        exempts = tuple(x.strip() for x in args.exempt_compound.split(",") if x.strip())
        validate_annotations(args.annotations, exempts)
    elif args.cmd == "slice":
        slice_sentences(args.annotations, args.audio, args.out, args.keep_old)


if __name__ == "__main__":
    main()
