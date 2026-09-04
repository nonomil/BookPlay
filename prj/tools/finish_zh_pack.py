# -*- coding: utf-8 -*-
"""Wait for in-flight Chinese TTS, fill leftovers, write coverage, pack 0.1.1.

Do not start a second make_word_audio while one is already running.
Do not compress or rewrite videos.
"""
from __future__ import annotations

import json
import subprocess
import sys
import time
from pathlib import Path

from make_word_audio import AUDIO_OUT, STORIES, collect_quiz_texts, collect_sentences, sent_hash
from paths import REPO

VERSION = "0.1.1"
TOOLS = Path(__file__).resolve().parent


def python_exe() -> str:
    return sys.executable


def tts_pids() -> list[int]:
    r = subprocess.run(
        ["powershell", "-NoProfile", "-Command",
         "Get-CimInstance Win32_Process -Filter \"Name='python.exe'\" | "
         "Where-Object { $_.CommandLine -match 'make_word_audio' } | "
         "Select-Object -ExpandProperty ProcessId"],
        capture_output=True, text=True,
    )
    pids = []
    for line in (r.stdout or "").splitlines():
        line = line.strip()
        if line.isdigit():
            pids.append(int(line))
    return pids


def wait_existing_tts(timeout_sec: int = 3600) -> None:
    start = time.time()
    last = None
    while True:
        pids = tts_pids()
        if not pids:
            print("no in-flight make_word_audio", flush=True)
            return
        now = time.time()
        if last is None or now - last > 30:
            print(f"wait TTS pids={pids} elapsed={now-start:.0f}s", flush=True)
            last = now
        if now - start > timeout_sec:
            raise SystemExit(f"BLOCKED: make_word_audio still running after {timeout_sec}s pids={pids}")
        time.sleep(10)


def run_audio(args: list[str]) -> None:
    cmd = [python_exe(), "-X", "utf8", "-u", str(TOOLS / "make_word_audio.py"), *args]
    print("+", " ".join(cmd), flush=True)
    subprocess.check_call(cmd, cwd=str(TOOLS))


def coverage() -> dict:
    zh: dict[str, str] = {}
    qzh: dict[str, str] = {}
    for p in sorted(STORIES.glob("ep*.json")):
        story = json.loads(p.read_text(encoding="utf-8"))
        zh.update(collect_sentences(story)[1])
        qzh.update(collect_quiz_texts(story)[1])
    audio = AUDIO_OUT / "sent_zh"
    missing = []
    tiny = []
    for text in sorted(zh):
        h = sent_hash(text)
        f = audio / f"{h}.mp3"
        if not f.exists():
            missing.append(text)
        elif f.stat().st_size <= 1000:
            tiny.append(text)
    q_missing = []
    for text in sorted(qzh):
        h = sent_hash(text)
        f = audio / f"{h}.mp3"
        if not f.exists() or f.stat().st_size <= 1000:
            q_missing.append(text)
    idx = AUDIO_OUT / "sent_zh_index.json"
    qidx = AUDIO_OUT / "quiz_zh_index.json"
    idx_n = len(json.loads(idx.read_text(encoding="utf-8"))) if idx.exists() else 0
    qidx_n = len(json.loads(qidx.read_text(encoding="utf-8"))) if qidx.exists() else 0
    return {
        "zh_unique": len(zh),
        "zh_files_ok": len(zh) - len(missing) - len(tiny),
        "zh_missing": len(missing),
        "zh_tiny": len(tiny),
        "quiz_zh_unique": len(qzh),
        "quiz_zh_missing": len(q_missing),
        "sent_zh_index": idx_n,
        "quiz_zh_index": qidx_n,
        "missing_samples": missing[:8],
    }


def main() -> None:
    wait_existing_tts()
    run_audio(["--sent-only", "--skip-en", "--concurrency", "20"])
    wait_existing_tts()
    run_audio(["--quiz-only", "--skip-en", "--concurrency", "12"])
    report = coverage()
    dest = REPO / "release" / f"v{VERSION}"
    dest.mkdir(parents=True, exist_ok=True)
    cov = dest / "coverage.json"
    cov.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("coverage", json.dumps(report, ensure_ascii=False), flush=True)
    if report["zh_missing"] > 20 or report["quiz_zh_missing"] > 20:
        raise SystemExit(f"BLOCKED: too many missing zh clips {report}")
    subprocess.check_call(
        [python_exe(), "-X", "utf8", "-u", str(TOOLS / "make_release.py"), "--version", VERSION, "--pack"],
        cwd=str(TOOLS),
    )


if __name__ == "__main__":
    main()
