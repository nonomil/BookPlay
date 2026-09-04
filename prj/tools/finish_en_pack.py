# -*- coding: utf-8 -*-
"""Wait for in-flight sentence TTS, fill leftover English, write coverage, pack 0.1.2.

Do not start a second make_word_audio while one is already running.
Do not compress videos.
"""
from __future__ import annotations

import json
import subprocess
import sys
import time
from pathlib import Path

from make_word_audio import AUDIO_OUT, STORIES, collect_sentences, sent_hash
from paths import REPO

VERSION = "0.1.2"
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
    return [int(x) for x in (r.stdout or "").split() if x.isdigit()]


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
    en: dict[str, str] = {}
    zh: dict[str, str] = {}
    for p in sorted(STORIES.glob("ep*.json")):
        e, z = collect_sentences(json.loads(p.read_text(encoding="utf-8")))
        en.update(e)
        zh.update(z)

    def miss(texts: dict, folder: str) -> list[str]:
        out = []
        for text in texts:
            f = AUDIO_OUT / folder / f"{sent_hash(text)}.mp3"
            if not f.exists() or f.stat().st_size <= 1000:
                out.append(text)
        return out

    en_miss = miss(en, "sent_en")
    zh_miss = miss(zh, "sent_zh")
    return {
        "en_unique": len(en),
        "en_missing": len(en_miss),
        "zh_unique": len(zh),
        "zh_missing": len(zh_miss),
        "en_samples": en_miss[:6],
    }


def main() -> None:
    wait_existing_tts()
    run_audio(["--sent-only", "--concurrency", "20"])
    report = coverage()
    dest = REPO / "release" / f"v{VERSION}"
    dest.mkdir(parents=True, exist_ok=True)
    cov = dest / "coverage.json"
    cov.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("coverage", json.dumps(report, ensure_ascii=False), flush=True)
    if report["en_missing"] > 20 or report["zh_missing"] > 0:
        raise SystemExit(f"BLOCKED: leftover clips {report}")
    subprocess.check_call(
        [python_exe(), "-X", "utf8", "-u", str(TOOLS / "make_release.py"), "--version", VERSION, "--pack"],
        cwd=str(TOOLS),
    )


if __name__ == "__main__":
    main()
