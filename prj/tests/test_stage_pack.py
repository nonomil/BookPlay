# -*- coding: utf-8 -*-
from __future__ import annotations

import json
import sys
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
from pack_datapack import (  # noqa: E402
    parse_collection_ids,
    parse_episode_ids,
    parse_published_books,
    iter_stage_pack_files,
    write_datapack_zip,
)


def _write(path: Path, value: str | bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(value.encode("utf-8") if isinstance(value, str) else value)


def _fixture(root: Path) -> None:
    collections = {
        "schema_version": 1,
        "story": "Journey to the West",
        "collections": [
            {"id": "c01", "index": 1, "from": 1, "to": 2, "background": "assets/collections/normalized/c01.jpg"},
            {"id": "c02", "index": 2, "from": 3, "to": 4, "background": "assets/collections/normalized/c02.jpg"},
        ],
    }
    _write(root / "dialogue_stories/collections.json", json.dumps(collections))
    for ep in range(1, 5):
        book = {
            "episode": ep,
            "video": f"assets/video/ep{ep}.mp4",
            "frames": [f"assets/adv_frames/ep{ep}/f0.jpg"],
            "nodes": [{"text_en": f"Sentence {ep}", "text_zh": f"句子 {ep}", "vocab": [{"term": f"word{ep}"}]}],
        }
        _write(root / f"dialogue_stories/ep{ep}.json", json.dumps(book))
        _write(root / f"dialogue_stories/drill/c0{1 if ep <= 2 else 2}.json", json.dumps({"sentence": f"Sentence {ep}"}))
        _write(root / f"assets/video/ep{ep}.mp4", b"video")
        _write(root / f"assets/adv_frames/ep{ep}/f0.jpg", b"frame")
        _write(root / f"assets/adv_audio/ep{ep}/index.json", json.dumps({f"word{ep}": f"assets/adv_audio/ep{ep}/word{ep}.mp3"}))
        _write(root / f"assets/adv_audio/ep{ep}/word{ep}.mp3", b"word")
        _write(root / f"assets/covers/ep{ep:03d}.jpg", b"cover")
        lesson = {"title": {"en": f"Episode {ep}", "zh": f"第{ep}集"}}
        if ep == 1:
            lesson["title"] = {"en": "What did monkey come out of?", "zh": "猴子是从什么出来的？"}
        _write(root / f"lesson_guides/ep{ep:03d}/lesson.json", json.dumps(lesson))
        _write(root / f"assets/collections/normalized/c0{1 if ep <= 2 else 2}.jpg", b"background")
    _write(root / "assets/adv_audio/sent_en_index.json", json.dumps({
        "Sentence 1": "assets/adv_audio/sent_en/s1.mp3",
        "Sentence 4": "assets/adv_audio/sent_en/s4.mp3",
        "What did monkey come out of?": "assets/adv_audio/sent_en/lesson-prompt.mp3",
        "unused": "assets/adv_audio/sent_en/unused.mp3",
    }))
    _write(root / "assets/adv_audio/sent_zh_index.json", json.dumps({"句子 1": "assets/adv_audio/sent_zh/z1.mp3"}))
    _write(root / "assets/adv_audio/en_index.json", json.dumps({"word1": "assets/adv_audio/en/w1.mp3", "unused": "assets/adv_audio/en/u.mp3"}))
    _write(root / "assets/adv_audio/zh_index.json", json.dumps({"中文": "assets/adv_audio/zh/z.mp3"}))
    _write(root / "assets/adv_audio/quiz_en_index.json", json.dumps({"Sentence 1": "assets/adv_audio/quiz_en/q1.mp3"}))
    _write(root / "assets/adv_audio/quiz_zh_index.json", json.dumps({"句子 1": "assets/adv_audio/quiz_zh/q1.mp3"}))
    _write(root / "assets/adv_audio/sent_en/s1.mp3", b"s1")
    _write(root / "assets/adv_audio/sent_en/s4.mp3", b"s4")
    _write(root / "assets/adv_audio/sent_en/lesson-prompt.mp3", b"lesson")
    _write(root / "assets/adv_audio/sent_en/unused.mp3", b"unused")
    _write(root / "assets/adv_audio/sent_zh/z1.mp3", b"z1")
    _write(root / "assets/adv_audio/en/w1.mp3", b"w1")
    _write(root / "assets/adv_audio/en/u.mp3", b"u")
    _write(root / "assets/adv_audio/zh/z.mp3", b"z")
    _write(root / "assets/adv_audio/quiz_en/q1.mp3", b"q1")
    _write(root / "assets/adv_audio/quiz_zh/q1.mp3", b"q1")
    _write(root / "assets/map_audio/manifest.json", b"{}")
    _write(root / "assets/ui/logo.png", b"logo")
    _write(root / "achievements/jttw.json", b"{}")
    _write(root / "companions/white-dragon.json", b"{}")
    _write(root / "storybooks-mikey-jj/catalog.json", json.dumps({"episodes": [{"book": 1}]}))
    _write(root / "storybooks-mikey-jj/book1.json", json.dumps({"image": "assets/mikey-jj/book1/page.webp", "audio": "assets/mikey-jj/book1/audio.mp3"}))
    _write(root / "assets/mikey-jj/book1/page.webp", b"page")
    _write(root / "assets/mikey-jj/book1/audio.mp3", b"audio")
    _write(root / "assets/mikey-jj/vocab/index.json", json.dumps({"series": "mikey-jj", "terms": {}}))
    _write(root / "assets/mikey-jj/vocab/en/example.mp3", b"en")
    _write(root / "assets/mikey-jj/vocab/zh/example.mp3", b"zh")
    _write(root / "assets/mikey-jj/quiz/index.json", json.dumps({"series": "mikey-jj"}))
    _write(root / "assets/mikey-jj/quiz/en/example.mp3", b"quiz-en")
    _write(root / "assets/mikey-jj/ui/quiz-bg.png", b"mikey-quiz-bg")
    _write(root / "storybooks-minecraft/catalog.json", json.dumps({"episodes": [{"book": 1}]}))
    _write(root / "storybooks-minecraft/book1.json", json.dumps({"image": "assets/minecraft/book1/page.webp"}))
    _write(root / "assets/minecraft/book1/page.webp", b"page")
    _write(root / "assets/minecraft/ui/quiz-bg-v2.webp", b"minecraft-quiz-bg")
    _write(root / "dialogue_stories/ep3.json", json.dumps({"video": "assets/video/ep3.mp4", "nodes": []}))


def test_collection_selector_and_stage_boundaries(tmp_path: Path) -> None:
    root = tmp_path / "content"
    _fixture(root)
    assert parse_collection_ids(root, "c01") == ("c01",)
    assert parse_collection_ids(root, "c01,c02") == ("c01", "c02")
    names = {rel for rel, _src in iter_stage_pack_files(root, collections="c01", published="none")}
    assert "dialogue_stories/ep1.json" in names
    assert "dialogue_stories/ep2.json" in names
    assert "dialogue_stories/ep3.json" not in names
    assert "assets/video/ep3.mp4" not in names
    assert "assets/adv_audio/sent_en/s1.mp3" in names
    assert "assets/adv_audio/sent_en/lesson-prompt.mp3" in names
    assert "assets/adv_audio/sent_en/unused.mp3" not in names
    assert "assets/adv_audio/ep1/word1.mp3" in names
    assert "assets/ui/logo.png" in names


def test_stage_pack_includes_published_book_reference_closure_and_manifest(tmp_path: Path) -> None:
    root = tmp_path / "content"
    _fixture(root)
    dest = tmp_path / "stage.zip"
    write_datapack_zip(root, dest, collections="c01", published="all", version="0.1.6")
    with zipfile.ZipFile(dest) as zf:
        names = set(zf.namelist())
        assert "storybooks-mikey-jj/catalog.json" in names
        assert "assets/mikey-jj/book1/page.webp" in names
        assert "assets/mikey-jj/vocab/index.json" in names
        assert "assets/mikey-jj/vocab/en/example.mp3" in names
        assert "assets/mikey-jj/vocab/zh/example.mp3" in names
        assert "assets/mikey-jj/quiz/index.json" in names
        assert "assets/mikey-jj/quiz/en/example.mp3" in names
        assert "assets/mikey-jj/ui/quiz-bg.png" in names
        assert "storybooks-minecraft/book1.json" in names
        assert "assets/minecraft/book1/page.webp" in names
        assert "assets/minecraft/ui/quiz-bg-v2.webp" in names
        manifest = json.loads(zf.read("pack-manifest.json"))
        assert manifest["collections"] == ["c01"]
        assert manifest["episodes"] == [1, 2]
        assert manifest["published_books"] == ["mikey-jj", "minecraft"]
        assert manifest["file_count"] == len(names) - 1
        assert all(item["sha256"] for item in manifest["files"])


def test_stage_pack_includes_filtered_map_catalog_and_home_cover(tmp_path: Path) -> None:
    root = tmp_path / "content"
    _fixture(root)
    # The real c01 pack needs the same metadata/assets that home.html and
    # map.html request before the selected episode assets can render.
    catalog = {
        "schema_version": 1,
        "story": "Journey to the West",
        "count": 4,
        "episodes": [
            {"episode": 1, "title": {"en": "One", "zh": "一"}, "cover": "assets/covers/ep001.jpg"},
            {"episode": 2, "title": {"en": "Two", "zh": "二"}, "cover": "assets/covers/ep002.jpg"},
            {"episode": 3, "title": {"en": "Three", "zh": "三"}, "cover": "assets/covers/ep003.jpg"},
            {"episode": 4, "title": {"en": "Four", "zh": "四"}, "cover": "assets/covers/ep004.jpg"},
        ],
    }
    _write(root / "storybooks/catalog.json", json.dumps(catalog))
    _write(root / "assets/covers/journey-west-cover.png", b"journey-cover")
    dest = tmp_path / "stage.zip"
    write_datapack_zip(root, dest, collections="c01", published="none", version="test")
    with zipfile.ZipFile(dest) as zf:
        names = set(zf.namelist())
        assert "storybooks/catalog.json" in names
        assert "assets/covers/journey-west-cover.png" in names
        stage_catalog = json.loads(zf.read("storybooks/catalog.json"))
        assert [ep["episode"] for ep in stage_catalog["episodes"]] == [1, 2]
        assert all(ep["cover"] in names for ep in stage_catalog["episodes"])


def test_stage_pack_can_limit_a_collection_to_one_episode(tmp_path: Path) -> None:
    root = tmp_path / "content"
    _fixture(root)
    _write(root / "dialogue_stories/drill/c01.json", json.dumps({
        "schema_version": 1,
        "episodes": [{"episode": 1}, {"episode": 2}],
    }))
    files = dict(iter_stage_pack_files(root, collections="c01", published="none", episodes="1"))
    assert "dialogue_stories/ep1.json" in files
    assert "dialogue_stories/ep2.json" not in files
    assert "assets/collections/normalized/c01.jpg" in files
    assert "assets/video/ep1.mp4" in files
    assert "assets/video/ep2.mp4" not in files
    drill = json.loads(files["dialogue_stories/drill/c01.json"].decode("utf-8"))
    assert [item["episode"] for item in drill["episodes"]] == [1]


def test_follow_up_pack_excludes_starter_titles_but_keeps_catalogs(tmp_path: Path) -> None:
    root = tmp_path / "content"
    _fixture(root)
    _write(root / "storybooks-minecraft/catalog.json", json.dumps({
        "episodes": [
            {"book": 1, "cover": "assets/minecraft/book1/cover.webp"},
            {"book": 2, "cover": "assets/minecraft/book2/cover.webp"},
        ],
    }))
    _write(root / "storybooks-minecraft/book2.json", json.dumps({"image": "assets/minecraft/book2/page.webp"}))
    _write(root / "assets/minecraft/book1/cover.webp", b"cover1")
    _write(root / "assets/minecraft/book2/cover.webp", b"cover2")
    _write(root / "assets/minecraft/book2/page.webp", b"page2")
    _write(root / "storybooks/catalog.json", json.dumps({
        "episodes": [
            {"episode": 1, "cover": "assets/covers/ep001.jpg"},
            {"episode": 2, "cover": "assets/covers/ep002.jpg"},
            {"episode": 3, "cover": "assets/covers/ep003.jpg"},
        ],
    }))
    dest = tmp_path / "follow-up.zip"
    write_datapack_zip(
        root,
        dest,
        collections="all",
        published="all",
        exclude_episodes="1",
        published_books={"minecraft": (2,), "mikey-jj": ()},
        keep_full_catalogs=True,
        version="1.0.5",
    )
    with zipfile.ZipFile(dest) as zf:
        names = set(zf.namelist())
        assert "dialogue_stories/ep1.json" not in names
        assert "assets/video/ep1.mp4" not in names
        assert "dialogue_stories/ep2.json" in names
        assert "storybooks-minecraft/book1.json" not in names
        assert "storybooks-minecraft/book2.json" in names
        catalog = json.loads(zf.read("storybooks/catalog.json"))
        assert [item["episode"] for item in catalog["episodes"]] == [1, 2, 3]
        gate = json.loads(zf.read("content-manifest.json"))
        assert gate["kind"] == "apk-builtin-starter"
        assert gate["available"]["jttw"]["episodes"][0] == 1
        assert 2 in gate["available"]["jttw"]["episodes"]
        assert gate["available"]["minecraft"]["books"] == [1, 2]


def test_parse_episode_and_published_book_ranges() -> None:
    assert parse_episode_ids("2-5") == (2, 3, 4, 5)
    assert parse_published_books("minecraft:2-5;mikey-jj:2,3,5-6") == {
        "minecraft": (2, 3, 4, 5),
        "mikey-jj": (2, 3, 5, 6),
    }


def test_stage_pack_rejects_an_episode_outside_selected_collection(tmp_path: Path) -> None:
    root = tmp_path / "content"
    _fixture(root)
    try:
        list(iter_stage_pack_files(root, collections="c01", published="none", episodes="3"))
    except ValueError as error:
        assert "不属于所选合辑" in str(error)
    else:
        raise AssertionError("episode 3 should not be accepted for c01")


if __name__ == "__main__":
    import tempfile
    with tempfile.TemporaryDirectory() as d:
        test_collection_selector_and_stage_boundaries(Path(d))
    print("ok")
