#!/usr/bin/env python3
"""对话冒险的双模式朗读素材：

1. 单词原音截取：从每集整集 MP3 里按“词在页文本中的字符位置占比”估算时间点，
   裁出原声片段 -> assets/adv_audio/ep{N}/{slug}.mp3（index.json 清单）
2. 中文合成：所有词卡释义用 edge-tts 女声（晓晓）预合成 -> assets/adv_audio/zh/{md5}.mp3
   （zh_index.json 清单，全局去重）

用法:
    python tools/make_word_audio.py                # 全部
    python tools/make_word_audio.py --episode 2    # 单集单词原音
    python tools/make_word_audio.py --zh-only      # 只合成中文释义
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent          # demo/
STORIES = ROOT / "data" / "dialogue_stories"
AUDIO_OUT = ROOT / "assets" / "adv_audio"
FF = Path(r"C:/Users/No'mi'l/AppData/Local/Programs/Python/Python311/Lib/site-packages"
          r"/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe")
ZH_VOICE = "zh-CN-XiaoxiaoNeural"  # edge-tts 女声
EN_VOICE = "en-US-JennyNeural"  # 词卡英文，不用浏览器自带 TTS
CONCURRENCY = 8
SAVE_EVERY = 40

# 原音窗口：估算词起点前 0.6s 到后 1.8s（旁白语速下正好包含该词及少量上下文）
WIN_BEFORE, WIN_AFTER = 0.6, 1.8


def slug(term: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", term.lower()).strip("_")


def ffmpeg_cut(src: Path, start: float, dur: float, dst: Path) -> bool:
    dst.parent.mkdir(parents=True, exist_ok=True)
    r = subprocess.run([str(FF), "-y", "-v", "error", "-ss", f"{max(0, start):.2f}",
                        "-t", f"{dur:.2f}", "-i", str(src),
                        "-af", "loudnorm=I=-16:TP=-1.5",
                        "-ac", "1", "-ar", "24000", "-c:a", "libmp3lame", "-b:a", "48k",
                        str(dst)],
                       capture_output=True, timeout=60)
    return r.returncode == 0 and dst.exists() and dst.stat().st_size > 1000


def word_clips(n: int, force: bool) -> int:
    story_path = STORIES / f"ep{n}.json"
    if not story_path.exists():
        return 0
    story = json.loads(story_path.read_text(encoding="utf-8"))
    if not story.get("audio"):
        return 0
    src = ROOT / story["audio"]
    if not src.exists():
        return 0
    out_dir = AUDIO_OUT / f"ep{n}"
    out_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = out_dir / "index.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.exists() else {}
    made = 0
    for node in story["nodes"]:
        text = node["text_en"]
        a0, a1 = node.get("audio_start"), node.get("audio_end")
        if a0 is None or a1 is None or not text:
            continue
        for card in node.get("vocab", []):
            if card["mode"] != "learn":
                continue  # 只在首次学习处截原音
            key = slug(card["term"])
            out = out_dir / f"{key}.mp3"
            if out.exists() and not force:
                manifest.setdefault(card["term"], f"assets/adv_audio/ep{n}/{key}.mp3")
                continue
            m = re.search(rf"\b{re.escape(card['term'])}\b", text, re.I)
            if not m:
                continue
            frac = m.start() / len(text)
            t0 = a0 + (a1 - a0) * frac
            if ffmpeg_cut(src, t0 - WIN_BEFORE, WIN_BEFORE + WIN_AFTER, out):
                manifest[card["term"]] = f"assets/adv_audio/ep{n}/{key}.mp3"
                made += 1
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=1) + "\n", "utf-8")
    return made


def zh_hash(text: str) -> str:
    return hashlib.md5(text.strip().encode("utf-8")).hexdigest()[:10]


async def _speak_and_index(text: str, voice: str, dst: Path, manifest: dict, key: str, rel: str) -> bool:
    ok = await speak(text, voice, dst)
    if ok:
        manifest[key] = rel
    return ok


async def speak(text: str, voice: str, dst: Path) -> bool:
    import asyncio
    import edge_tts
    dst.parent.mkdir(parents=True, exist_ok=True)
    last = ""
    for attempt in range(3):
        try:
            await asyncio.wait_for(
                edge_tts.Communicate(text, voice).save(str(dst)),
                timeout=25,
            )
            if dst.exists() and dst.stat().st_size > 1000:
                return True
            last = "empty-file"
        except Exception as exc:  # noqa: BLE001
            last = str(exc)[:80]
        await asyncio.sleep(0.6 * (attempt + 1))
    print(f"  [tts失败] {text[:40]}: {last}", file=sys.stderr)
    return False


def _write_manifest(path: Path, manifest: dict) -> None:
    path.write_text(json.dumps(manifest, ensure_ascii=False, indent=1) + "\n", "utf-8")


async def _run_jobs(jobs: list, label: str, write_cb) -> int:
    import asyncio
    sem = asyncio.Semaphore(CONCURRENCY)
    made = 0
    done = 0

    async def one(fn):
        async with sem:
            return await fn()

    step = max(SAVE_EVERY, CONCURRENCY * 4)
    for i in range(0, len(jobs), step):
        chunk = jobs[i:i + step]
        results = await asyncio.gather(*[one(fn) for fn in chunk], return_exceptions=True)
        for r in results:
            done += 1
            if r is True:
                made += 1
        write_cb()
        print(f"  [{label}] {done}/{len(jobs)} 新合成 +{made}", flush=True)
    return made


async def zh_tts(text: str, dst: Path) -> bool:
    return await speak(text, ZH_VOICE, dst)


def collect_en_terms(story: dict) -> dict[str, str]:
    terms: dict[str, str] = {}
    def add(term: str) -> None:
        t = (term or "").strip()
        if t:
            terms.setdefault(t.lower(), t)
    for term in (story.get("vocab_pool") or {}):
        add(term)
    for node in story.get("nodes") or []:
        for card in node.get("vocab") or []:
            add(card.get("term") or "")
    for w in story.get("official_words") or []:
        add(w.get("term") or "")
    for k in (story.get("script_gloss") or {}):
        add(k)
    for k in (story.get("script_lexicon") or {}):
        add(k)
    return terms


def collect_zh_texts(story: dict) -> dict[str, str]:
    texts: dict[str, str] = {}
    def add(text: str) -> None:
        t = (text or "").strip()
        if t and any("\u4e00" <= ch <= "\u9fff" for ch in t):
            texts.setdefault(t, t)
    for node in story.get("nodes") or []:
        for card in node.get("vocab") or []:
            add(card.get("zh") or "")
            add(card.get("gloss") or "")
    for v in (story.get("script_gloss") or {}).values():
        add(v)
    for w in story.get("official_words") or []:
        add(w.get("zh") or "")
    for info in (story.get("script_lexicon") or {}).values():
        add((info or {}).get("zh") or "")
        add((info or {}).get("def") or "")
    return texts


async def en_clips(episode: int | None = None, force: bool = False) -> int:
    terms: dict[str, str] = {}
    paths = [STORIES / f"ep{episode}.json"] if episode else sorted(STORIES.glob("ep*.json"))
    for p in paths:
        if not p.exists():
            continue
        story = json.loads(p.read_text(encoding="utf-8"))
        terms.update(collect_en_terms(story))
    manifest_path = AUDIO_OUT / "en_index.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.exists() else {}
    jobs = []
    for key, term in sorted(terms.items()):
        out = AUDIO_OUT / "en" / f"{slug(term)}.mp3"
        rel = f"assets/adv_audio/en/{slug(term)}.mp3"
        manifest[term] = rel
        if out.exists() and out.stat().st_size > 1000 and not force:
            continue
        jobs.append(lambda t=term, o=out: speak(t, EN_VOICE, o))
    print(f"英文待合成: {len(jobs)} / {len(terms)}", flush=True)
    made = await _run_jobs(jobs, "en", lambda: _write_manifest(manifest_path, manifest))
    _write_manifest(manifest_path, manifest)
    return made


def sent_hash(text: str) -> str:
    return hashlib.md5(text.strip().encode("utf-8")).hexdigest()[:12]


def collect_sentences(story: dict) -> tuple[dict[str, str], dict[str, str]]:
    en: dict[str, str] = {}
    zh: dict[str, str] = {}
    def add_en(text: str) -> None:
        t = " ".join((text or "").split()).strip()
        if t and re.search(r"[A-Za-z]", t) and len(t) > 3:
            en.setdefault(t, t)
    def add_zh(text: str) -> None:
        t = " ".join((text or "").split()).strip()
        if t and any("\u4e00" <= ch <= "\u9fff" for ch in t) and len(t) > 1:
            zh.setdefault(t, t)
    def add_quiz(q: dict) -> None:
        if not q:
            return
        add_en(q.get("q") or "")
        add_zh(q.get("q_zh") or "")
        for c in q.get("choices") or []:
            add_en(c)
        for c in q.get("choices_zh") or []:
            add_zh(c)
    for w in story.get("official_words") or []:
        add_en(w.get("example") or "")
    for puzzle in story.get("puzzles") or []:
        add_en(puzzle.get("sentence") or "")
    for node in story.get("nodes") or []:
        if node.get("type") != "narration":
            continue
        add_en(node.get("text_en") or "")
        add_zh(node.get("text_zh") or "")
        add_quiz(node.get("quiz_after") or {})
    for q in story.get("official_quiz") or []:
        add_quiz(q)
    for q in story.get("quiz") or []:
        add_quiz(q)
    return en, zh


def collect_quiz_texts(story: dict) -> tuple[dict[str, str], dict[str, str]]:
    en: dict[str, str] = {}
    zh: dict[str, str] = {}

    def add_en(text: str) -> None:
        t = " ".join((text or "").split()).strip()
        if t and re.search(r"[A-Za-z]", t) and len(t) > 1:
            en.setdefault(t, t)

    def add_zh(text: str) -> None:
        t = " ".join((text or "").split()).strip()
        if t and any("\u4e00" <= ch <= "\u9fff" for ch in t):
            zh.setdefault(t, t)

    def add_quiz(q: dict) -> None:
        if not q:
            return
        add_en(q.get("q") or "")
        add_zh(q.get("q_zh") or "")
        for c in q.get("choices") or []:
            add_en(c)
        for c in q.get("choices_zh") or []:
            add_zh(c)

    for node in story.get("nodes") or []:
        add_quiz(node.get("quiz_after") or {})
    for q in story.get("official_quiz") or []:
        add_quiz(q)
    for q in story.get("quiz") or []:
        add_quiz(q)
    add_zh("是什么意思？")
    return en, zh


async def quiz_clips(episode: int | None = None, force: bool = False, skip_en: bool = False) -> tuple[int, int]:
    en: dict[str, str] = {}
    zh: dict[str, str] = {}
    paths = [STORIES / f"ep{episode}.json"] if episode else sorted(STORIES.glob("ep*.json"))
    for p in paths:
        if not p.exists():
            continue
        story = json.loads(p.read_text(encoding="utf-8"))
        e, z = collect_quiz_texts(story)
        en.update(e)
        zh.update(z)
    en_path = AUDIO_OUT / "quiz_en_index.json"
    zh_path = AUDIO_OUT / "quiz_zh_index.json"
    en_man = json.loads(en_path.read_text(encoding="utf-8")) if en_path.exists() else {}
    zh_man = json.loads(zh_path.read_text(encoding="utf-8")) if zh_path.exists() else {}
    en_jobs, zh_jobs = [], []
    for text in sorted(en):
        h = sent_hash(text)
        out = AUDIO_OUT / "sent_en" / f"{h}.mp3"
        rel = f"assets/adv_audio/sent_en/{h}.mp3"
        if out.exists() and out.stat().st_size > 1000:
            en_man[text] = rel
            if not force:
                continue
        if not skip_en:
            en_jobs.append(lambda t=text, o=out, key=text, r=rel: _speak_and_index(t, EN_VOICE, o, en_man, key, r))
    for text in sorted(zh):
        h = sent_hash(text)
        out = AUDIO_OUT / "sent_zh" / f"{h}.mp3"
        rel = f"assets/adv_audio/sent_zh/{h}.mp3"
        if out.exists() and out.stat().st_size > 1000:
            zh_man[text] = rel
            if not force:
                continue
        zh_jobs.append(lambda t=text, o=out, key=text, r=rel: _speak_and_index(t, ZH_VOICE, o, zh_man, key, r))
    print(f"测验英文待合成: {len(en_jobs)} / {len(en)}", flush=True)
    made_en = await _run_jobs(en_jobs, "quiz-en", lambda: _write_manifest(en_path, en_man))
    _write_manifest(en_path, en_man)
    print(f"测验中文待合成: {len(zh_jobs)} / {len(zh)}", flush=True)
    made_zh = await _run_jobs(zh_jobs, "quiz-zh", lambda: _write_manifest(zh_path, zh_man))
    _write_manifest(zh_path, zh_man)
    return made_en, made_zh


async def sent_clips(episode: int | None = None, force: bool = False, skip_en: bool = False) -> tuple[int, int]:
    en: dict[str, str] = {}
    zh: dict[str, str] = {}
    paths = [STORIES / f"ep{episode}.json"] if episode else sorted(STORIES.glob("ep*.json"))
    for p in paths:
        if not p.exists():
            continue
        story = json.loads(p.read_text(encoding="utf-8"))
        e, z = collect_sentences(story)
        en.update(e)
        zh.update(z)
    en_path = AUDIO_OUT / "sent_en_index.json"
    zh_path = AUDIO_OUT / "sent_zh_index.json"
    en_man = json.loads(en_path.read_text(encoding="utf-8")) if en_path.exists() else {}
    zh_man = json.loads(zh_path.read_text(encoding="utf-8")) if zh_path.exists() else {}
    en_jobs, zh_jobs = [], []
    for text in sorted(en):
        h = sent_hash(text)
        out = AUDIO_OUT / "sent_en" / f"{h}.mp3"
        rel = f"assets/adv_audio/sent_en/{h}.mp3"
        if out.exists() and out.stat().st_size > 1000:
            en_man[text] = rel
            if not force:
                continue
        if not skip_en:
            en_jobs.append(lambda t=text, o=out, key=text, r=rel: _speak_and_index(t, EN_VOICE, o, en_man, key, r))
    for text in sorted(zh):
        h = sent_hash(text)
        out = AUDIO_OUT / "sent_zh" / f"{h}.mp3"
        rel = f"assets/adv_audio/sent_zh/{h}.mp3"
        if out.exists() and out.stat().st_size > 1000:
            zh_man[text] = rel
            if not force:
                continue
        zh_jobs.append(lambda t=text, o=out, key=text, r=rel: _speak_and_index(t, ZH_VOICE, o, zh_man, key, r))
    print(f"英文例句待合成: {len(en_jobs)} / {len(en)}", flush=True)
    made_en = await _run_jobs(en_jobs, "sent-en", lambda: _write_manifest(en_path, en_man))
    _write_manifest(en_path, en_man)
    print(f"中文例句待合成: {len(zh_jobs)} / {len(zh)}", flush=True)
    made_zh = await _run_jobs(zh_jobs, "sent-zh", lambda: _write_manifest(zh_path, zh_man))
    _write_manifest(zh_path, zh_man)
    return made_en, made_zh


async def zh_clips(episode: int | None = None) -> int:
    texts: dict[str, str] = {}
    paths = [STORIES / f"ep{episode}.json"] if episode else sorted(STORIES.glob("ep*.json"))
    for p in paths:
        if not p.exists():
            continue
        story = json.loads(p.read_text(encoding="utf-8"))
        texts.update(collect_zh_texts(story))
    manifest_path = AUDIO_OUT / "zh_index.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.exists() else {}
    jobs = []
    for zh in sorted(texts):
        h = zh_hash(zh)
        out = AUDIO_OUT / "zh" / f"{h}.mp3"
        manifest[zh] = f"assets/adv_audio/zh/{h}.mp3"
        if out.exists() and out.stat().st_size > 1000:
            continue
        jobs.append(lambda t=zh, o=out: zh_tts(t, o))
    print(f"中文待合成: {len(jobs)} / {len(texts)}", flush=True)
    made = await _run_jobs(jobs, "zh", lambda: _write_manifest(manifest_path, manifest))
    _write_manifest(manifest_path, manifest)
    return made


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--episode", type=int)
    ap.add_argument("--zh-only", action="store_true")
    ap.add_argument("--en-only", action="store_true")
    ap.add_argument("--sent-only", action="store_true")
    ap.add_argument("--quiz-only", action="store_true")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--concurrency", type=int, default=8)
    ap.add_argument("--skip-en", action="store_true", help="only synthesize missing Chinese clips")
    args = ap.parse_args()
    globals()["CONCURRENCY"] = max(1, args.concurrency)

    import asyncio
    if args.quiz_only:
        made_en, made_zh = asyncio.run(quiz_clips(args.episode, args.force, args.skip_en))
        print(f"测验例句合成完成: 英 +{made_en} 中 +{made_zh}")
        return
    if args.sent_only:
        made_en, made_zh = asyncio.run(sent_clips(args.episode, args.force, args.skip_en))
        print(f"例句合成完成: 英 +{made_en} 中 +{made_zh}")
        return
    if args.en_only:
        made = asyncio.run(en_clips(args.episode, args.force))
        print(f"英文单词合成完成: +{made} 段 -> {AUDIO_OUT / 'en_index.json'}")
        return

    if not args.zh_only:
        nums = [args.episode] if args.episode else sorted(
            int(p.stem[2:]) for p in STORIES.glob("ep*.json"))
        total = 0
        for n in nums:
            k = word_clips(n, args.force)
            total += k
            if k or n % 20 == 0:
                print(f"ep{n}: +{k} 原音片段")
        print(f"单词原音完成: 共 {total} 段")
        made_en = asyncio.run(en_clips(args.episode, args.force))
        print(f"英文单词合成完成: +{made_en} 段 -> {AUDIO_OUT / 'en_index.json'}")

    made = asyncio.run(zh_clips(args.episode))
    print(f"中文释义合成完成: +{made} 段 -> {AUDIO_OUT / 'zh_index.json'}")


if __name__ == "__main__":
    main()
