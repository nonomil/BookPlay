# -*- coding: utf-8 -*-
"""`wala.js` 四个核心模块的 Node 合同测试。"""
from __future__ import annotations

import json
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
ENGINE = ROOT / "prj" / "engine"


def _node(module: str, expression: str, payload=None):
    path = ENGINE / module
    assert path.exists(), f"缺少播放器模块：{path.relative_to(ROOT)}"
    script = (
        "const api=require(process.argv[1]);"
        "const input=JSON.parse(require('fs').readFileSync(0,'utf8')||'null');"
        f"const result=({expression});"
        "process.stdout.write(JSON.stringify(result));"
    )
    proc = subprocess.run(
        ["node", "-e", script, str(path)],
        input=json.dumps(payload, ensure_ascii=False),
        text=True,
        encoding="utf-8",
        capture_output=True,
        check=False,
    )
    assert proc.returncode == 0, proc.stderr
    return json.loads(proc.stdout)


def test_storage_defaults_corrupt_json_and_legacy_contract() -> None:
    result = _node(
        "storage.js",
        "(()=>{const data={bookplay_lesson_settings_v1:'{bad',bookplay_adv_progress:'{bad'};"
        "const s={getItem:k=>Object.prototype.hasOwnProperty.call(data,k)?data[k]:null,"
        "setItem:(k,v)=>data[k]=String(v)};const store=api.create(s);"
        "store.saveEpisodeProgress(7,3,9,true);store.bumpVocab('monkey',false);"
        "return {keys:api.KEYS,lesson:store.readLessonSettings(),rate:store.readPlayRate(),"
        "level:store.readLearnLevel(),progress:store.readProgress(),stats:store.readVocabStats()};})()",
    )
    assert result["keys"]["PROG"] == "bookplay_adv_progress"
    assert result["keys"]["VSTAT"] == "bookplay_adv_vocab_stat"
    assert result["lesson"] == {"gradeBand": "g3_4", "intensity": "standard"}
    assert result["rate"] == 1
    assert result["level"] == "std"
    assert result["progress"]["7"]["node"] == 3
    assert result["progress"]["7"]["total"] == 9
    assert result["progress"]["7"]["done"] is True
    assert result["progress"]["7"]["at"] > 0
    assert result["progress"]["7"]["day"]
    assert result["stats"]["monkey"] == {"seen": 0, "right": 0, "wrong": 1}


def test_storage_persists_side_word_card_visibility() -> None:
    result = _node(
        "storage.js",
        "(()=>{const data={};const s={getItem:k=>data[k]??null,setItem:(k,v)=>data[k]=String(v)};"
        "const store=api.create(s);const initial=store.readSideCards();store.writeSideCards(false);"
        "const off=store.readSideCards();store.writeSideCards(true);const on=store.readSideCards();"
        "return {initial,off,on,key:api.KEYS.SIDE_CARDS,value:data[api.KEYS.SIDE_CARDS]};})()",
    )
    assert result == {"initial": True, "off": False, "on": True, "key": "bookplay_side_cards", "value": "1"}


def test_media_normalization_lookup_and_urls() -> None:
    result = _node(
        "media.js",
        "({norm:api.normSent('  Hello   world  '),clip:api.lookupClip({'Hello':'a.mp3'},'hello'),"
        "tts:api.ttsUrl('你好 世界','zh-CN'),fallback:api.videoUrl({},8),explicit:api.videoUrl({video:'v/x.mp4'},8)})",
    )
    assert result["norm"] == "Hello world"
    assert result["clip"] == "a.mp3"
    assert "voice=zh" in result["tts"] and "%E4%BD%A0%E5%A5%BD" in result["tts"]
    assert result["fallback"] == "../assets/video/ep8.mp4"
    assert result["explicit"] == "../v/x.mp4"


def test_media_controller_owns_rate_and_cancellation_tokens() -> None:
    result = _node(
        "media.js",
        "(()=>{const audio={playbackRate:1,paused:0,pause(){this.paused++}};"
        "const video={defaultPlaybackRate:1,playbackRate:1,paused:0,pause(){this.paused++}};"
        "let stopped=0;const media=api.createController({audio,rate:1,getBook:()=>({}),"
        "getEpisode:()=>1,getVideo:()=>video,stopKaraoke:()=>stopped++,requestFrame:()=>{}});"
        "const next=media.nextSequenceToken();media.setRate(.75);media.cancel();"
        "return {next,current:media.currentSequenceToken(),audioRate:audio.playbackRate,"
        "videoRate:video.playbackRate,audioPaused:audio.paused,videoPaused:video.paused,stopped};})()",
    )
    assert result == {
        "next": 1,
        "current": 1,
        "audioRate": 0.75,
        "videoRate": 0.75,
        "audioPaused": 1,
        "videoPaused": 1,
        "stopped": 1,
    }


def test_study_plan_keeps_three_learning_levels_and_bag_order() -> None:
    payload = {
        "nodes": [
            {"text_en": "Monkey found a stone."},
            {"text_en": "The stone opened beside a river."},
            {"text_en": "Monkey crossed the river."},
        ],
        "official": [
            {"term": "monkey", "zh": "猴子"},
            {"term": "stone", "zh": "石头"},
            {"term": "river", "zh": "河流"},
        ],
    }
    expression = (
        "(()=>{const words=(text)=>input.official.filter(w=>new RegExp('\\\\b'+w.term+'\\\\b','i').test(text));"
        "const args={nodes:input.nodes,officialWords:input.official,isListenNode:()=>true,"
        "officialInSentence:words,bareWord:s=>String(s).toLowerCase()};"
        "return {std:api.buildWordCardPlan({...args,learnLevel:'std'}),"
        "max:api.buildWordCardPlan({...args,learnLevel:'max'}),"
        "bag:api.collectBagThrough({...args,endIndex:2})};})()"
    )
    result = _node("study-plan.js", expression, payload)
    assert result["std"]["wordCardPlan"] == {"0": ["stone"], "1": ["river"]}
    assert result["max"]["wordCardPlan"] == {"0": ["monkey", "stone"], "1": ["river"]}
    assert [word["term"] for word in result["bag"]] == ["monkey", "stone", "river"]


def test_quiz_rehomes_after_evidence_and_builds_review_answer() -> None:
    payload = {
        "nodes": [
            {"text_en": "Monkey walked into the cave."},
            {"text_en": "He found the golden crown inside."},
        ],
        "quiz": {"q": "What was inside?", "choices": ["A river", "The golden crown"], "answer": 1},
    }
    result = _node(
        "quiz.js",
        "(()=>{const placed=api.rehomePlotQuizzes({nodes:input.nodes,officialQuiz:[input.quiz],"
        "isListenNode:()=>true,normSent:s=>String(s||'').trim()});"
        "const review=api.buildReviewQuestion({term:'stone',zh:'石头',distractors:['河流','山峰'],random:()=>0});"
        "return {at:Object.keys(placed),same:placed[1]===input.quiz,review};})()",
        payload,
    )
    assert result["at"] == ["1"]
    assert result["same"] is True
    assert result["review"]["choices"][result["review"]["answer"]] == "石头"


def test_wala_loads_modules_before_orchestrator() -> None:
    html = (ENGINE / "wala.html").read_text(encoding="utf-8")
    order = [html.index(name) for name in ("storage.js", "media.js", "study-plan.js", "quiz.js", "wala.js")]
    assert order == sorted(order)
    wala = (ENGINE / "wala.js").read_text(encoding="utf-8")
    for old_definition in (
        "function readLessonSettings(",
        "function normSent(",
        "function rebuildStudyPlan(",
        "function quizTokens(",
    ):
        assert old_definition not in wala
    # The player now carries the independent listen mode and study-session
    # integration; keep a guard against accidental multi-hundred-kilobyte
    # growth while allowing the current modular boundary.
    # The episode-stable avatar cast now includes middle/late-arc leads and
    # their exact title cues; keep the guard below the old monolith size while
    # allowing this data-driven selection table to grow intentionally.
    assert len(wala.encode("utf-8")) < 105_000
