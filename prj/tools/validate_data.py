#!/usr/bin/env python3
"""校验 demo/data 下全部剧情数据的结构与引用完整性。

用法:
    python tools/validate_data.py

检查项:
  - JSON 可解析、必需字段齐全（schema-lite）
  - speaker / character_ref / emotion / 资产文件引用存在
  - 对话树: 节点 id 唯一、start/end 存在、end 为 chapter_end、
    所有 next / player_choices.next 指向存在的节点
  - 从 start 可达所有节点（报告不可达节点）
  - 除 chapter_end 外无死路节点
  - require_flag 引用的 flag 至少被某个节点 set_flags 设置（warning）
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"

errors: list[str] = []
warnings: list[str] = []


def err(msg: str) -> None:
    errors.append(msg)


def warn(msg: str) -> None:
    warnings.append(msg)


def load(path: Path):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception as exc:  # noqa: BLE001
        err(f"{path}: JSON 解析失败: {exc}")
        return None


def require(obj: dict, fields: list[str], label: str) -> None:
    for field in fields:
        if field not in obj:
            err(f"{label}: 缺少必需字段 '{field}'")


def check_text(obj: dict, label: str, field: str = "fallback_text") -> None:
    t = obj.get(field)
    if t is None:
        return
    if not isinstance(t, dict) or "en" not in t or "zh" not in t:
        err(f"{label}: {field} 必须包含 en/zh 两个键")


def main() -> int:
    world = load(DATA / "world.json")
    outline = load(DATA / "story_outline.json")
    if world is None or outline is None:
        return finish()

    require(world, ["world_id", "speakers", "attributes", "tts", "art_style_anchor"], "world.json")
    require(outline, ["story_id", "chapters", "checkpoint"], "story_outline.json")

    speakers = world.get("speakers", {})
    scene_ids: list[str] = []
    for ch in outline.get("chapters", []):
        require(ch, ["chapter_id", "scenes", "summary_for_checkpoint"], f"story_outline 章节 {ch.get('chapter_id')}")
        scene_ids.extend(ch.get("scenes", []))

    # ---- scenes & characters ----
    char_refs: set[str] = set()
    scenes = {}
    for sid in scene_ids:
        sp = DATA / "scenes" / f"{sid}.json"
        scene = load(sp)
        if scene is None:
            continue
        scenes[sid] = scene
        require(scene, ["scene_id", "background", "characters_present", "dialogue_tree"], f"场景 {sid}")
        if scene.get("scene_id") != sid:
            err(f"场景 {sid}: scene_id 与文件名不一致")
        bg = scene.get("background", "")
        if bg and not (ROOT / bg).exists():
            warn(f"场景 {sid}: 背景图不存在: {bg}")
        char_refs.update(scene.get("characters_present", []))

    for cid in sorted(char_refs):
        cp = DATA / "characters" / f"{cid}.json"
        c = load(cp)
        if c is None:
            err(f"角色 {cid}: persona 文件缺失")
            continue
        require(c, ["character_id", "personality_en", "emotions"], f"角色 {cid}")
        if c.get("character_id") != cid:
            err(f"角色 {cid}: character_id 与文件名不一致")
        for emo, asset in (c.get("emotions") or {}).items():
            if not (ROOT / asset).exists():
                warn(f"角色 {cid}: 表情 {emo} 立绘文件不存在: {asset}")

    # ---- dialogues ----
    all_flags: set[str] = set()
    for sid, scene in scenes.items():
        dpath = DATA / scene.get("dialogue_tree", "")
        d = load(dpath)
        if d is None:
            continue
        label = f"{sid} 对话树"
        require(d, ["scene_id", "start_node", "end_node", "nodes"], label)
        if d.get("scene_id") != sid:
            err(f"{label}: scene_id 与场景不一致")
        nodes = d.get("nodes", [])
        by_id = {}
        for n in nodes:
            require(n, ["node_id", "speaker", "intent"], label)
            nid = n.get("node_id")
            if nid in by_id:
                err(f"{label}: 节点 id 重复: {nid}")
            by_id[nid] = n
            spk = n.get("speaker")
            if spk not in speakers:
                err(f"{label}/{nid}: 未知 speaker '{spk}'")
            check_text(n, f"{label}/{nid}")
            all_flags.update(n.get("set_flags", []) or [])
            for c in n.get("player_choices", []) or []:
                all_flags.update(c.get("set_flags", []) or [])

        start, end = d.get("start_node"), d.get("end_node")
        if start not in by_id:
            err(f"{label}: start_node '{start}' 不存在")
        if end not in by_id:
            err(f"{label}: end_node '{end}' 不存在")
        elif by_id[end].get("node_type") != "chapter_end":
            err(f"{label}: end_node '{end}' 不是 chapter_end 类型")

        # 边与死路
        for n in nodes:
            nid = n.get("node_id")
            is_end = n.get("node_type") == "chapter_end"
            nxt = n.get("next")
            choices = n.get("player_choices") or []
            if len(choices) > 4:
                err(f"{label}/{nid}: 选项超过 4 个")
            if not is_end and nxt is None and not choices:
                err(f"{label}/{nid}: 死路节点（既无 next 也无 player_choices）")
            if choices and nxt is not None:
                warn(f"{label}/{nid}: 同时存在 next 与 player_choices，next 将被忽略")
            if nxt is not None and nxt not in by_id:
                err(f"{label}/{nid}: next 指向不存在的节点 '{nxt}'")
            for c in choices:
                require(c, ["text", "next"], f"{label}/{nid} 选项")
                check_text(c, f"{label}/{nid} 选项")
                if c.get("next") not in by_id:
                    err(f"{label}/{nid}: 选项 next 指向不存在的节点 '{c.get('next')}'")
                rf = c.get("require_flag")
                if rf and rf not in all_flags:
                    warn(f"{label}/{nid}: 选项 require_flag '{rf}' 未见任何节点设置")

        # 可达性（忽略 require_flag，按最宽图算）
        if start in by_id:
            seen = set()
            stack = [start]
            while stack:
                cur = stack.pop()
                if cur in seen:
                    continue
                seen.add(cur)
                n = by_id[cur]
                if n.get("next"):
                    stack.append(n["next"])
                for c in n.get("player_choices", []) or []:
                    stack.append(c.get("next"))
            unreachable = set(by_id) - seen
            for nid in sorted(unreachable):
                err(f"{label}: 不可达节点 '{nid}'")
            if end not in seen:
                err(f"{label}: end_node '{end}' 从 start 不可达")

    return finish()


def finish() -> int:
    for w in warnings:
        print(f"  [警告] {w}")
    for e in errors:
        print(f"  [错误] {e}")
    if errors:
        print(f"\n校验失败: {len(errors)} 个错误, {len(warnings)} 个警告")
        return 1
    print(f"校验通过: 0 个错误, {len(warnings)} 个警告")
    return 0


if __name__ == "__main__":
    sys.exit(main())
