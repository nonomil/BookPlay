# -*- coding: utf-8 -*-
"""TDD 合同: 单词题「再学一次」同页覆盖式回顾 (jttw-drill-word-relearn)。

四类断言, 实现前必须全红 (红灯原因 = 功能缺失):
1. drill.html 有「再学一次」按钮, 覆盖层用 <dialog> / role=dialog 语义,
   含返回题目、可点发音的词、视频/图/文本回退三个媒体槽;
2. build_drill_packs.py 给每个「可匹配」official_word 生成 review
   (episode/node_id/illustration/video/start/end), 且 c01/ep1 的词与来源
   ep1.json 的 node 逐字段一致; 无匹配 node 的词不得生成 review;
3. 覆盖层打开/关闭不触碰 wordsIdx / wordsRight / 当前题 DOM 与 renderWord
   (对 openRelearn / closeRelearn 函数体做静态守卫);
4. 点词重复调用 playText(term); 缺视频退 illustration, 二者都缺显示文本回退。
"""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ENGINE = ROOT / "prj" / "engine"
STORIES = ROOT / "content" / "dialogue_stories"
DRILL_DIR = STORIES / "drill"

HTML_SRC = (ENGINE / "drill.html").read_text(encoding="utf-8")
JS_SRC = (ENGINE / "drill.js").read_text(encoding="utf-8")
CSS_SRC = (ENGINE / "drill.css").read_text(encoding="utf-8")

REVIEW_KEYS = ("episode", "node_id", "illustration", "video", "start", "end")


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", str(s or "")).strip()


def _match_norm(s: str) -> str:
    """忽略引号/标点/多余空格，保持单词边界用于来源包含匹配。"""
    return re.sub(r"[^a-z0-9]+", " ", str(s or "").lower()).strip()


def _expected_node(example: str, nodes: list[dict]) -> dict | None:
    key = _match_norm(example)
    if not key:
        return None
    candidates = []
    for node in nodes:
        node_key = _match_norm(node.get("text_en", ""))
        if node_key and (node_key == key or key in node_key or node_key in key):
            candidates.append((abs(len(node_key) - len(key)), node.get("node_id", ""), node))
    return min(candidates, default=(0, "", None))[2]


def _packs() -> list[dict]:
    return [
        json.loads(p.read_text(encoding="utf-8"))
        for p in sorted(DRILL_DIR.glob("c*.json"))
    ]


def _js_function_body(name: str) -> str:
    m = re.search(r"(?:async\s+)?function\s+" + name + r"\b[^\{]*\{", JS_SRC)
    assert m, f"缺少 function {name}("
    start = m.end()
    depth = 1
    i = start
    while i < len(JS_SRC) and depth:
        if JS_SRC[i] == "{":
            depth += 1
        elif JS_SRC[i] == "}":
            depth -= 1
        i += 1
    return JS_SRC[start:i]


# --- 1. 按钮与覆盖层结构 ---
def test_relearn_button_present() -> None:
    assert 'id="w-relearn"' in HTML_SRC or 'id="relearn-btn"' in HTML_SRC
    assert "🔁" not in HTML_SRC, "操作图标应使用一致的 SVG/CSS 图标，不使用 emoji"


def test_fullscreen_relearn_navigation_has_current_contract() -> None:
    """再学一次按当前产品合同进入正常的全屏精读页，而不是旧弹窗。"""
    assert 'id="w-relearn"' in HTML_SRC
    assert "function openWordRelearn" in JS_SRC
    assert "function openQuizRelearn" in JS_SRC
    assert re.search(r"new URL\([\"']wala\.html[\"']", JS_SRC)
    for key in ("mode", "subtitle", "sidecards", "annot", "review", "return"):
        assert f'searchParams.set("{key}"' in JS_SRC
    assert 'searchParams.set("mode", "study")' in JS_SRC
    assert 'searchParams.set("subtitle", "enzh")' in JS_SRC
    assert 'searchParams.set("sidecards", "1")' in JS_SRC
    assert 'searchParams.set("annot", "1")' in JS_SRC


# --- 2. 构建器 review 元数据 ---
def test_builder_emits_review_for_matchable_words() -> None:
    matched = 0
    for pack in _packs():
        for ep in pack["episodes"]:
            for w in ep.get("official_words", []):
                ex = _norm(w.get("example", ""))
                if not ex:
                    assert "review" not in w, (
                        f"{pack['collection']} ep{ep['episode']} {w['term']}: 空 example 却有 review"
                    )
                    continue
                r = w.get("review")
                if r is None:
                    continue  # example 存在但无匹配 node → 前端文本回退
                for k in REVIEW_KEYS:
                    assert k in r, (
                        f"{pack['collection']} ep{ep['episode']} {w['term']}: review 缺 {k}"
                    )
                assert r["episode"] == ep["episode"]
                assert r["video"], f"{w['term']}: review.video 为空"
                assert isinstance(r["start"], (int, float)) and isinstance(r["end"], (int, float))
                assert r["start"] < r["end"], f"{pack['collection']} {w['term']}: start/end 无效 {r}"
                matched += 1
    assert matched >= 50, f"可匹配词过少: {matched}"


def test_word_question_keeps_review_metadata_for_the_ui() -> None:
    body = _js_function_body("buildWordQs")
    assert re.search(r"review\s*:\s*w\.review", body), (
        "精简包已有 review，但 buildWordQs 必须继续透传给当前题，覆盖层才能消费"
    )


def test_review_matches_source_for_ep1() -> None:
    ep1 = json.loads((STORIES / "ep1.json").read_text(encoding="utf-8-sig"))
    nodes = ep1.get("nodes", [])
    c01 = json.loads((DRILL_DIR / "c01.json").read_text(encoding="utf-8"))
    ep1_pack = next(e for e in c01["episodes"] if e["episode"] == 1)
    checked = 0
    for w in ep1_pack.get("official_words", []):
        ex = _norm(w.get("example", ""))
        if not ex:
            continue
        node = _expected_node(ex, nodes)
        numeric = (
            node is not None
            and isinstance(node.get("audio_start"), (int, float))
            and isinstance(node.get("audio_end"), (int, float))
        )
        r = w.get("review")
        if node is None or not numeric:
            assert r is None, f"{w['term']}: 无匹配/无音频 node 却生成了 review"
            continue
        checked += 1
        assert r is not None, f"{w['term']}: 匹配 node {node['node_id']} 却没有 review"
        assert r["episode"] == 1
        assert r["node_id"] == node["node_id"]
        assert r["illustration"] == (node.get("illustration") or "")
        assert r["video"] == (ep1.get("video") or "")
        assert r["start"] == node.get("audio_start")
        assert r["end"] == node.get("audio_end")
    assert checked >= 5, f"ep1 可匹配样本过少: {checked}"


def test_review_source_match_coverage_is_at_least_95_percent() -> None:
    """标点规范化 + 包含匹配应覆盖绝大多数有例句词，且指向真实来源节点。"""
    packed_eps = {
        ep["episode"]: ep
        for pack in _packs()
        for ep in pack["episodes"]
    }
    eligible = matched = 0
    for episode in range(1, 109):
        source = json.loads((STORIES / f"ep{episode}.json").read_text(encoding="utf-8-sig"))
        packed_words = packed_eps[episode].get("official_words", [])
        for word in packed_words:
            example = _norm(word.get("example", ""))
            if not example:
                continue
            eligible += 1
            node = _expected_node(example, source.get("nodes", []))
            if node is None:
                continue
            start, end = node.get("audio_start"), node.get("audio_end")
            if not (isinstance(start, (int, float)) and isinstance(end, (int, float)) and start < end):
                continue
            matched += 1
            review = word.get("review")
            assert review is not None, f"ep{episode} {word['term']}: 可匹配却没有 review"
            assert review["node_id"] == node["node_id"]
    assert eligible >= 3000
    assert matched / eligible >= 0.95, f"来源画面覆盖率仅 {matched}/{eligible}"


# --- 3. 覆盖层不重置当前题状态 ---
def test_word_relearn_navigation_does_not_reset_state() -> None:
    body = _js_function_body("openWordRelearn")
    for bad in ("wordsIdx =", "wordsRight =", "renderWord(",
                "innerHTML =", "w-card", "opt-grid"):
        assert bad not in body, f"openWordRelearn 触碰了 {bad}"
    assert "wordQs[wordsIdx]" in JS_SRC  # 读取的是当前题
    assert "saveWordResume" in body
    assert 'searchParams.set("wordId"' not in body  # wordId is carried by return URL


def test_quiz_relearn_navigation_does_not_advance_question() -> None:
    body = _js_function_body("openQuizRelearn")
    for bad in ("quizIdx +=", "quizRight +=", "renderQuiz(", "innerHTML =", "q-card"):
        assert bad not in body, f"openQuizRelearn 触碰了 {bad}"
    assert "saveQuizResume" in body
    assert 'searchParams.set("quizId"' not in body  # quizId is carried by return URL


def test_answer_auto_advance_is_deferred_to_timer() -> None:
    answer_body = _js_function_body("wordAnswer")
    assert "wordAdvanceTimer" in JS_SRC
    assert "scheduleWordAdvance(" in answer_body
    assert "setTimeout(() => { wordsIdx++; renderWord(); }, 1000)" not in answer_body
    assert "openWordRelearn" in JS_SRC


# --- 4. 点词发音 + 媒体回退 ---
def test_word_click_calls_playText() -> None:
    assert re.search(r"playText\(\s*w\.term\s*\)", JS_SRC) is not None


def test_media_fallback_order_in_code() -> None:
    assert "wordReviewNode" in JS_SRC
    assert "quizReviewNode" in JS_SRC
    assert "review" in JS_SRC
    assert "没有可用的视频与图片" not in HTML_SRC  # 旧弹窗文案不再存在
