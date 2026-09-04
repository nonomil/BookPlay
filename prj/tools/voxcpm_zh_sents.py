# -*- coding: utf-8 -*-
"""Fill missing Chinese sentence/quiz MP3s with the workbench VoxCPM2 GPU env.

Uses the same hashes and folders as make_word_audio.py so the player can play
them without any URL change. Existing Edge clips are skipped.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path

from make_word_audio import (
    AUDIO_OUT,
    STORIES,
    _write_manifest,
    collect_quiz_texts,
    collect_sentences,
    sent_hash,
)

DEFAULT_MODEL = os.environ.get("VOXCPM2_MODEL_PATH", "D:/HuggingFaceCache/VoxCPM2")
PROMPT = "(年轻女性，声音清晰温柔，老师上课的语调)"
SAVE_EVERY = 20


def collect_missing() -> tuple[list[tuple[str, Path, str]], dict[str, str], dict[str, str]]:
    sents: dict[str, str] = {}
    quiz: dict[str, str] = {}
    for path in sorted(STORIES.glob("ep*.json")):
        story = json.loads(path.read_text(encoding="utf-8"))
        _en, zh = collect_sentences(story)
        sents.update(zh)
        _en, zh = collect_quiz_texts(story)
        quiz.update(zh)

    sent_man = json.loads((AUDIO_OUT / "sent_zh_index.json").read_text(encoding="utf-8")) if (AUDIO_OUT / "sent_zh_index.json").exists() else {}
    quiz_man = json.loads((AUDIO_OUT / "quiz_zh_index.json").read_text(encoding="utf-8")) if (AUDIO_OUT / "quiz_zh_index.json").exists() else {}
    jobs: list[tuple[str, Path, str]] = []
    seen: set[str] = set()
    for source, texts, man in (("sent", sents, sent_man), ("quiz", quiz, quiz_man)):
        for text in sorted(texts):
            h = sent_hash(text)
            rel = f"assets/adv_audio/sent_zh/{h}.mp3"
            dest = AUDIO_OUT / "sent_zh" / f"{h}.mp3"
            if dest.exists() and dest.stat().st_size > 1000:
                man[text] = rel
                continue
            if h in seen:
                continue
            seen.add(h)
            jobs.append((text, dest, rel))
        if source == "sent":
            sent_man = man
        else:
            quiz_man = man
    return jobs, sent_man, quiz_man


def load_model(model_ref: str, device: str):
    from voxcpm import VoxCPM

    kwargs = {"load_denoiser": False}
    if device != "auto":
        kwargs["device"] = device
    model_path = Path(model_ref)
    if model_path.exists():
        kwargs["local_files_only"] = True
    return VoxCPM.from_pretrained(model_ref, **kwargs)


def speak(model, text: str, dest: Path) -> bool:
    import numpy as np
    import soundfile as sf

    dest.parent.mkdir(parents=True, exist_ok=True)
    wav = model.generate(
        text=f"{PROMPT}{text}",
        cfg_value=2.0,
        inference_timesteps=8,
        max_len=min(72, max(28, len(text) * 2)),
        retry_badcase_ratio_threshold=4.0,
    )
    array = np.asarray(wav, dtype=np.float32)
    if array.ndim > 1:
        array = array.mean(axis=0 if array.shape[0] <= 4 else 1)
    array = np.clip(array, -1.0, 1.0)
    tmp = dest.with_name(f".{dest.name}.tmp")
    sf.write(str(tmp), array, int(model.tts_model.sample_rate), format="MP3", subtype="MPEG_LAYER_III")
    if not tmp.exists() or tmp.stat().st_size <= 1000:
        tmp.unlink(missing_ok=True)
        return False
    tmp.replace(dest)
    return True


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default=DEFAULT_MODEL)
    ap.add_argument("--device", default="cuda")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    jobs, sent_man, quiz_man = collect_missing()
    if args.limit:
        jobs = jobs[: args.limit]
    print(f"missing {len(jobs)} chinese clips -> {AUDIO_OUT / 'sent_zh'}", flush=True)
    if args.dry_run:
        return 0
    if not jobs:
        _write_manifest(AUDIO_OUT / "sent_zh_index.json", sent_man)
        _write_manifest(AUDIO_OUT / "quiz_zh_index.json", quiz_man)
        print("nothing to do", flush=True)
        return 0

    t0 = time.time()
    model = load_model(args.model, args.device)
    print(f"model ready in {time.time() - t0:.1f}s", flush=True)
    made = 0
    for i, (text, dest, rel) in enumerate(jobs, 1):
        ok = False
        try:
            ok = speak(model, text, dest)
        except Exception as exc:  # noqa: BLE001
            print(f"  fail {text[:24]}: {exc}", file=sys.stderr, flush=True)
        if ok:
            made += 1
            sent_man.setdefault(text, rel)
            quiz_man.setdefault(text, rel)
        if i % SAVE_EVERY == 0 or i == len(jobs):
            _write_manifest(AUDIO_OUT / "sent_zh_index.json", sent_man)
            _write_manifest(AUDIO_OUT / "quiz_zh_index.json", quiz_man)
            rate = (time.time() - t0) / max(1, i)
            print(f"  [voxcpm-zh] {i}/{len(jobs)} +{made} {rate:.2f}s/clip {text[:18]}", flush=True)
    for text, dest, rel in jobs:
        if dest.exists() and dest.stat().st_size > 1000:
            sent_man.setdefault(text, rel)
            quiz_man.setdefault(text, rel)
    _write_manifest(AUDIO_OUT / "sent_zh_index.json", sent_man)
    _write_manifest(AUDIO_OUT / "quiz_zh_index.json", quiz_man)
    print(f"done made={made}/{len(jobs)}", flush=True)
    return 0 if made or not jobs else 1


if __name__ == "__main__":
    raise SystemExit(main())
