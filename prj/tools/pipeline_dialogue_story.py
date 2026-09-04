#!/usr/bin/env python3
"""PDF 旁白 + 视频帧 + 词库 → 对话冒险故事 JSON（全 108 集）。

每个故事:
  - 叙述节点: PDF 每页拆成 2 句一组（~220字），配 4 张循环剧照
  - 词卡: 节点文本按 WORD_ZH 词典抽词（最多3个/节点），
    出现节奏 = 第1次学习 / 第2次测试(选释义) / 第3次+复习(看释义选词)，
    测试/复习卡的干扰项从本集词池抽取
  - 章末测验: 复用 storybook 流水线的自动出题

用法:
    python tools/pipeline_dialogue_story.py --episode 2
    python tools/pipeline_dialogue_story.py --all [--frames]   # --frames 同时抽剧照(慢)
"""
from __future__ import annotations

import argparse
import json
import random
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent          # demo/
DEMO = ROOT
OUT_DIR = DEMO / "data" / "dialogue_stories"
FRAME_DIR = DEMO / "assets" / "adv_frames"
FF = Path(r"C:/Users/No'mi'l/AppData/Local/Programs/Python/Python311/Lib/site-packages"
          r"/imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe")
VIDEO_DIR = ROOT.parent / "data" / "Journey to the West西游记 中英双字幕版108集视频"

from storybook_learning import WORD_ZH  # noqa: E402

MAX_CARDS_PER_NODE = 3
SENTENCES_PER_NODE = 1
FRAME_TIMES = [9, 90, 180, 270]  # 秒：标题卡 + 三个剧情点


def ep_video(n: int) -> Path | None:
    hits = sorted(VIDEO_DIR.glob(f"*【中英字幕】{n}.mp4")) or \
           sorted(VIDEO_DIR.glob(f"*【中英字幕】{n:02d}.mp4"))
    return hits[0] if hits else None


def extract_frames(n: int, force: bool = False) -> list[str]:
    """抽 4 张剧照（裁字幕带），返回相对 assets 的路径列表。"""
    out_dir = FRAME_DIR / f"ep{n}"
    out_dir.mkdir(parents=True, exist_ok=True)
    rels = []
    video = ep_video(n)
    if not video:
        return rels
    for i, t in enumerate(FRAME_TIMES):
        out = out_dir / f"f{i}.jpg"
        rels.append(f"assets/adv_frames/ep{n}/f{i}.jpg")
        if out.exists() and not force:
            continue
        subprocess.run(
            [str(FF), "-y", "-v", "error", "-ss", str(t), "-i", str(video),
             "-frames:v", "1", "-vf", "crop=1280:616:0:0,scale=960:-2", "-q:v", "4", str(out)],
            capture_output=True, timeout=120)
        if not out.exists():  # 超出片尾则回退标题卡时间点
            subprocess.run(
                [str(FF), "-y", "-v", "error", "-ss", "9", "-i", str(video),
                 "-frames:v", "1", "-vf", "crop=1280:616:0:0,scale=960:-2", "-q:v", "4", str(out)],
                capture_output=True, timeout=120)
    return rels


def split_nodes(pages: list[dict]) -> list[tuple[str, dict, float, float]]:
    """PDF 页文本 → (单句节点文本, 源页, 句起始占比, 句结束占比)，用于细分音频切片。"""
    out = []
    for p in pages:
        full = p["text_en"].strip()
        sents = re.split(r"(?<=[.!?])\s+", full)
        pos = 0
        for s in sents:
            s = s.strip()
            if not s:
                continue
            start = full.find(s, pos)
            end = start + len(s)
            pos = end
            n_words = len(s.split())
            if len(s) > 15 and n_words >= 1:
                # 每节点 SENTENCES_PER_NODE 句
                out.append((s, p, start / max(1, len(full)), end / max(1, len(full))))
    # 合并相邻句直到达到每节点句数
    merged = []
    for item in out:
        if merged and merged[-1][1] is item[1] and len(merged[-1][0].split()) < SENTENCES_PER_NODE:
            prev = merged[-1]
            merged[-1] = (prev[0] + " " + item[0], item[1], prev[2], item[3])
        else:
            merged.append(item)
    return merged


def find_terms(text: str) -> list[str]:
    """按长短语优先匹配词典词。"""
    found = []
    low = text.lower()
    for term in sorted(WORD_ZH, key=len, reverse=True):
        if re.search(rf"\b{re.escape(term)}\b", low):
            found.append(term)
    return found


def build_vocab(nodes_text: list[str]) -> tuple[list[dict], dict[int, list[dict]]]:
    """预计算每节点词卡。出现节奏按“到该节点为止的出现次数”：
    第1次=learn，第2次=test，第3次+=review；干扰项取本集词池其他释义。"""
    # 第一遍：收集每节点词条 + 全集词池
    node_terms: dict[int, list[str]] = {}
    pool: dict[str, str] = {}
    for i, text in enumerate(nodes_text):
        terms = find_terms(text)[:MAX_CARDS_PER_NODE]
        node_terms[i] = terms
        for t in terms:
            pool.setdefault(t, WORD_ZH[t])

    rng = random.Random(42)  # 固定种子，重跑干扰项稳定
    run: dict[str, int] = {}
    node_cards: dict[int, list[dict]] = {}
    for i, text in enumerate(nodes_text):
        cards = []
        for t in node_terms[i]:
            run[t] = run.get(t, 0) + 1
            c = run[t]
            mode = "learn" if c == 1 else ("test" if c == 2 else "review")
            if mode == "learn":
                sent = next((s for s in re.split(r"(?<=[.!?])\s+", text)
                             if re.search(rf"\b{re.escape(t)}\b", s, re.I)), text)
                cards.append({"term": t, "zh": WORD_ZH[t], "mode": mode, "example": sent})
            else:
                others = [zh for w, zh in pool.items() if w != t]
                rng.shuffle(others)
                if mode == "test":  # 选释义
                    opts = others[:3] + [WORD_ZH[t]]
                else:  # review: 看释义选词
                    w_others = [w for w in pool if w != t]
                    rng.shuffle(w_others)
                    opts = w_others[:3] + [t]
                rng.shuffle(opts)
                cards.append({"term": t, "zh": WORD_ZH[t], "mode": mode,
                              "options": opts, "answer": opts.index(WORD_ZH[t] if mode == "test" else t)})
        if cards:
            node_cards[i] = cards
    return pool, node_cards


def make_puzzles(nodes_text: list[str], count: int = 2) -> list[dict]:
    """句子排序题：选 4-7 词的陈述句，拆成词块打乱。"""
    rng = random.Random(7)
    cands = []
    allowed = set("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ,.'?!")
    for text in nodes_text:
        for s in re.split(r"(?<=[.!?])\s+", text):
            s = s.strip().strip('"').strip()
            words = s.split()
            if 4 <= len(words) <= 7 and s.endswith((".", "!", "?")) and set(s) <= allowed:
                cands.append(s)
    rng.shuffle(cands)
    picked, seen = [], set()
    for s in cands:
        key = s.lower()
        if key in seen:
            continue
        seen.add(key)
        words = s[:-1].split()  # 去尾标点再拆
        shuffled = words[:]
        rng.shuffle(shuffled)
        picked.append({"sentence": s, "words": shuffled})
        if len(picked) >= count:
            break
    return picked


def make_patterns(nodes_text: list[str], pool: dict, count: int = 3) -> list[dict]:
    """句型卡：含本集目标词的完整句（词/句型学习展示）。"""
    picked, used = [], set()
    for text in nodes_text:
        for s in re.split(r"(?<=[.!?])\s+", text):
            s = s.strip()
            if not (20 <= len(s) <= 90) or s.lower() in used:
                continue
            hit = next((t for t in pool if re.search(rf"\b{re.escape(t)}\b", s, re.I)), None)
            if hit:
                used.add(s.lower())
                picked.append({"pattern": s, "term": hit, "zh": pool[hit]})
            if len(picked) >= count:
                return picked
    return picked


def build_episode(n: int, force: bool = False, with_frames: bool = True) -> dict:
    book_path = DEMO / "data" / "storybooks" / f"ep{n}.json"
    if not book_path.exists():
        raise FileNotFoundError(f"缺少 data/storybooks/ep{n}.json，先跑 pipeline_lf_episode.py")
    book = json.loads(book_path.read_text(encoding="utf-8"))

    frames = extract_frames(n, force) if with_frames else []

    chunks = split_nodes(book["pages"])
    nodes_text = [c for c, _, _, _ in chunks]
    pool, node_cards = build_vocab(nodes_text)

    nodes = []
    # 开场标题节点
    nodes.append({
        "node_id": "n000",
        "type": "narration",
        "speaker": "narrator",
        "text_en": f"Chapter {n}: {book['title']['en']}",
        "text_zh": book["title"]["zh"],
        "illustration": frames[0] if frames else None,
        "vocab": [],
    })
    puzzles = make_puzzles(nodes_text)
    puzzle_at = sorted({max(1, len(chunks) // 3), max(2, len(chunks) * 2 // 3)})
    pi = 0
    for i, (text, page, f0, f1) in enumerate(chunks):
        nodes.append({
            "node_id": f"n{i + 1:03d}",
            "type": "narration",
            "speaker": "narrator",
            "text_en": text,
            "text_zh": "",
            "illustration": frames[(i + 1) % len(frames)] if frames else None,
            "audio_start": round(page["start_sec"] + (page["end_sec"] - page["start_sec"]) * f0, 2) if page.get("start_sec") is not None else None,
            "audio_end": round(page["start_sec"] + (page["end_sec"] - page["start_sec"]) * f1, 2) if page.get("start_sec") is not None else None,
            "vocab": node_cards.get(i, []),
        })
        if (i + 1) in puzzle_at and pi < len(puzzles):
            nodes.append({
                "node_id": f"p{pi + 1:02d}",
                "type": "puzzle",
                "speaker": "system",
                "text_en": "Put the words in order",
                "text_zh": "点词块组句，完成后点确定",
                "illustration": None,
                "puzzle": puzzles[pi],
                "vocab": [],
            })
            pi += 1

    story = {
        "schema_version": 1,
        "story_id": f"adv_ep{n}",
        "episode": n,
        "title": book["title"],
        "source_note": book.get("source_note", ""),
        "audio": book.get("audio"),
        "video": f"assets/video/ep{n}.mp4",
        "frames": frames,
        "vocab_pool": pool,
        "nodes": nodes,
        "puzzles": puzzles,
        "patterns": make_patterns(nodes_text, pool),
        "quiz": book.get("quiz", []),
    }
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out = OUT_DIR / f"ep{n}.json"
    out.write_text(json.dumps(story, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return story


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--episode", type=int)
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--frames", action="store_true", help="同时抽剧照（首次较慢）")
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()

    nums = list(range(1, 109)) if args.all else [args.episode or 1]
    done = []
    for n in nums:
        try:
            s = build_episode(n, force=args.force, with_frames=args.frames or
                              any((FRAME_DIR / f"ep{n}").glob("f*.jpg")))
            cards = sum(len(nd["vocab"]) for nd in s["nodes"])
            print(f"ep{n}: {len(s['nodes'])}节点, {cards}张词卡, 剧照{len(s['frames'])}")
            done.append(n)
        except FileNotFoundError as e:
            print(f"ep{n}: 跳过（{e}）")

    # index.json：已生成列表（adventure.html 选集页用）
    idx_path = OUT_DIR / "index.json"
    have = set()
    if idx_path.exists():
        have = set(json.loads(idx_path.read_text(encoding="utf-8")).get("episodes", []))
    have.update(done)
    idx_path.write_text(json.dumps({"episodes": sorted(have)}, ensure_ascii=False) + chr(10),
                        encoding="utf-8")
    print(f"index.json: {sorted(have)}")


if __name__ == "__main__":
    main()
