# -*- coding: utf-8 -*-
"""仓库路径：代码在 prj/，可更新的故事在 content/，原始文档在 data/。"""
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
PRJ = REPO / "prj"
CONTENT = REPO / "content"
ENGINE = PRJ / "engine"
ASSETS = CONTENT / "assets"
STORIES = CONTENT / "dialogue_stories"
STORYBOOKS = CONTENT / "storybooks"
SOURCE_DOCS = REPO / "data"
# 旧脚本里的 demo 根：代码仍在 prj，data/assets 由 junction 指到 content
DEMO = PRJ
