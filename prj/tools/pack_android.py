#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Prepare Android engine/data trees and the embedded starter bundle.

The normal mode keeps the historical external ``dist/android-data`` export.
``--builtin`` additionally writes a selective, runtime-ready tree under
``android/app/src/main/assets/data`` for the APK's first-run experience.
"""
from __future__ import annotations

import argparse
import json
import re
import shutil
from pathlib import Path

import sys

TOOLS = Path(__file__).resolve().parent
if str(TOOLS) not in sys.path:
    sys.path.insert(0, str(TOOLS))
from pack_datapack import _build_stage_pack  # noqa: E402

from paths import ASSETS, CONTENT, ENGINE, PRJ, STORIES, STORYBOOKS

REPO = PRJ.parent
ANDROID = REPO / "android"
ENGINE_ASSETS = ANDROID / "app" / "src" / "main" / "assets" / "engine"
DATA_OUT = REPO / "dist" / "android-data"
BUILTIN_ASSETS = ANDROID / "app" / "src" / "main" / "assets" / "data"
BUILTIN_VERSION = "0.1.9"

ENGINE_FILES = [
    "app-audio.js", "app-audio.css",
    "content-gate.js",
    "home.html", "home.js", "home.css",
    "shelf.html", "shelf.js",
    "wala.html", "wala.js", "wala.css",
    # 学习步日志 + 家长报告（P0 学习诊断，只读本机数据）
    "step-log-core.js", "step-log.js", "parent-report.html", "parent-report.js",
    # 学习教练：诊断路由「下一步练什么」（P4）
    "coach-core.js",
    # 看图复述（P3 OUTPUT）：四图排序 + 逐图录音 + 放映；复用 dub 录音/存储基建
    "retell.html", "retell.js", "retell-core.js", "dub-store.js", "dub-recorder.js",
    "storybook.html", "storybook.js", "storybook.css", "storybook-v3.css",
    "style.css",
    # The lesson page is part of the Android learning loop. Keep its shared
    # voice/review/reward runtime beside the page so per-episode stickers and
    # consolidation work in the APK, not only in the browser.
    "lesson.html", "lesson.js", "lesson.css", "lesson-core.js", "media.js",
    "lesson-words.html", "lesson-words.css",
    "walker-cast.js", "walker-progress.js",
    "voice-core.js", "voice.js", "review-queue.js", "episode-reward.js",
    "adventure.html", "adventure.js", "adventure.css",
    "map.html", "map.js", "map.css",
    # 降妖记小游戏：战斗页 + 大地图探索页及其运行时依赖
    "battle.html", "battle.js", "battle.css", "battle-core.js",
    "game.html", "game.js", "game.css", "game-core.js", "game-input.js", "game-audio.js",
    "episode-vocab-quiz.js",
    "tv.css", "tv-remote.js", "native-key.js", "handheld-keys.html",
    "handheld-controls.js", "handheld.css",
    "companion.html", "companion.js", "companion.css", "companion-core.js",
    "medals.html", "stickers.html", "room.html",
    "index.html", "main.js",
]

DATA_DIRS = [
    ("assets/music", ASSETS / "music"),
    ("assets/sfx", ASSETS / "sfx"),
    ("dialogue_stories", STORIES),
    # 全局阅读策略卡库（GUIDE 环节）
    ("strategy_cards.json", CONTENT / "strategy_cards.json"),
    ("achievements", CONTENT / "achievements"),
    ("companions", CONTENT / "companions"),
    ("rewards", CONTENT / "rewards"),
    ("storybooks", STORYBOOKS),
    # Lightweight storybook route metadata so home cards and maps work offline.
    ("storybooks-minecraft", CONTENT / "storybooks-minecraft"),
    ("storybooks-mikey-jj", CONTENT / "storybooks-mikey-jj"),
    ("assets/video", ASSETS / "video"),
    ("assets/adv_audio", ASSETS / "adv_audio"),
    # EP1's authored narration is referenced directly by ep1.json.  Keep it
    # beside the shared sentence/quiz audio so the built-in first-run lesson
    # can play offline without relying on an imported data pack.
    ("assets/lf_ep1/audio_ep1.mp3", ASSETS / "lf_ep1" / "audio_ep1.mp3"),
    ("assets/collections", ASSETS / "collections"),
    # Home cards and map splash covers for published storybook series.
    ("assets/minecraft/escape-from-the-nether/cover.webp", ASSETS / "minecraft" / "escape-from-the-nether" / "cover.webp"),
    ("assets/mikey-jj/zombie-school-adventure/pages/p01.webp", ASSETS / "mikey-jj" / "zombie-school-adventure" / "pages" / "p01.webp"),
    ("assets/minecraft/quiz", ASSETS / "minecraft" / "quiz"),
    # Mikey & JJ point-read vocabulary (Edge TTS English + Chinese clips and
    # index.json) is a runtime asset and is not referenced by book JSON.
    ("assets/mikey-jj/vocab", ASSETS / "mikey-jj" / "vocab"),
    # Minecraft sentence point-read vocabulary follows the same contract and
    # must travel with offline Android packs even though book JSON references
    # only sentence audio.
    ("assets/minecraft/vocab", ASSETS / "minecraft" / "vocab"),
    # Minecraft companion runtime art is kept explicit so the offline Byte
    # stage, completion card and six story keepsakes never depend on a browser
    # checkout having the generation workspace available.
    ("assets/generated/storybooks/minecraft/characters", ASSETS / "generated" / "storybooks" / "minecraft" / "characters"),
    ("assets/generated/storybooks/minecraft/rewards", ASSETS / "generated" / "storybooks" / "minecraft" / "rewards"),
    ("assets/generated/storybooks/minecraft/ep001", ASSETS / "generated" / "storybooks" / "minecraft" / "ep001"),
    ("assets/generated/storybooks/minecraft-story-scenes-v1", ASSETS / "generated" / "storybooks" / "minecraft-story-scenes-v1"),
    ("assets/covers", ASSETS / "covers"),
    ("assets/cast", ASSETS / "cast"),
    ("assets/ui", ASSETS / "ui"),
    ("assets/characters", ASSETS / "characters"),
    ("assets/backgrounds", ASSETS / "backgrounds"),
    ("assets/achievements", ASSETS / "achievements"),
    ("assets/companions", ASSETS / "companions"),
    # Keep only runtime-ready companion room art; do not copy the 50MB
    # generation workspace (prompts, responses and superseded variants).
    ("assets/generated/wala-gamification/companion-room-bg-v1.png", ASSETS / "generated" / "wala-gamification" / "companion-room-bg-v1.png"),
    ("assets/generated/wala-gamification/clean/decor-parts/decor01_417x485.png", ASSETS / "generated" / "wala-gamification" / "clean" / "decor-parts" / "decor01_417x485.png"),
    ("assets/generated/wala-gamification/clean/decor-parts/decor02_336x495.png", ASSETS / "generated" / "wala-gamification" / "clean" / "decor-parts" / "decor02_336x495.png"),
    ("assets/generated/wala-gamification/clean/decor-parts/decor03_396x465.png", ASSETS / "generated" / "wala-gamification" / "clean" / "decor-parts" / "decor03_396x465.png"),
    ("assets/generated/wala-gamification/clean/decor-parts/decor04_411x452.png", ASSETS / "generated" / "wala-gamification" / "clean" / "decor-parts" / "decor04_411x452.png"),
    ("assets/generated/wala-gamification/clean/decor-parts/decor05_305x433.png", ASSETS / "generated" / "wala-gamification" / "clean" / "decor-parts" / "decor05_305x433.png"),
    ("assets/generated/wala-gamification/clean/decor-parts/decor06_534x383.png", ASSETS / "generated" / "wala-gamification" / "clean" / "decor-parts" / "decor06_534x383.png"),
    ("assets/generated/wala-gamification/clean/gear-parts/gear01_541x573.png", ASSETS / "generated" / "wala-gamification" / "clean" / "gear-parts" / "gear01_541x573.png"),
    ("assets/generated/wala-gamification/clean/gear-parts/gear02_454x525.png", ASSETS / "generated" / "wala-gamification" / "clean" / "gear-parts" / "gear02_454x525.png"),
    ("assets/generated/wala-gamification/clean/gear-parts/gear03_514x504.png", ASSETS / "generated" / "wala-gamification" / "clean" / "gear-parts" / "gear03_514x504.png"),
    ("assets/generated/wala-gamification/clean/gear-parts/gear04_569x480.png", ASSETS / "generated" / "wala-gamification" / "clean" / "gear-parts" / "gear04_569x480.png"),
    # EP1 story-bound reward art: validated transparent PNGs only.
    ("assets/generated/jttw-ep001-story-rewards/transparent/jttw-ep001-stone-shard.png", ASSETS / "generated" / "jttw-ep001-story-rewards" / "transparent" / "jttw-ep001-stone-shard.png"),
    ("assets/generated/jttw-ep001-story-rewards/transparent/jttw-ep001-heaven-light.png", ASSETS / "generated" / "jttw-ep001-story-rewards" / "transparent" / "jttw-ep001-heaven-light.png"),
    ("assets/generated/jttw-ep001-story-rewards/transparent/jttw-ep001-peach-pip.png", ASSETS / "generated" / "jttw-ep001-story-rewards" / "transparent" / "jttw-ep001-peach-pip.png"),
    ("assets/generated/jttw-ep001-story-rewards/transparent/jttw-ep001-stream-splash.png", ASSETS / "generated" / "jttw-ep001-story-rewards" / "transparent" / "jttw-ep001-stream-splash.png"),
    ("assets/generated/jttw-ep001-story-rewards/transparent/jttw-ep001-waterfall-gate.png", ASSETS / "generated" / "jttw-ep001-story-rewards" / "transparent" / "jttw-ep001-waterfall-gate.png"),
    ("assets/generated/jttw-ep001-story-rewards/transparent/jttw-ep001-brave-ribbon.png", ASSETS / "generated" / "jttw-ep001-story-rewards" / "transparent" / "jttw-ep001-brave-ribbon.png"),
    ("assets/generated/jttw-ep001-story-rewards/transparent/jttw-ep001-water-curtain-token.png", ASSETS / "generated" / "jttw-ep001-story-rewards" / "transparent" / "jttw-ep001-water-curtain-token.png"),
    # Authored EP1 story pages used as the sticker-book chapter cover/detail.
    ("assets/lf_ep1/pages/p03.png", ASSETS / "lf_ep1" / "pages" / "p03.png"),
    ("assets/lf_ep1/pages/p10.png", ASSETS / "lf_ep1" / "pages" / "p10.png"),
    # Compact, text-free story-frame thumbnails used by every sticker card.
    ("assets/generated/jttw-story-scenes-v1", ASSETS / "generated" / "jttw-story-scenes-v1"),
    # Runtime-ready JTTW route companion animation (transparent PNG frames).
    ("assets/generated/jttw-route-companion/transparent", ASSETS / "generated" / "jttw-route-companion" / "transparent"),
    # Runtime-ready Mikey & JJ route companion atlas. Keep the source sheets
    # and prompt/generation records out of the Android data tree.
    ("assets/generated/mikey-jj-route-companion/transparent/mikey-walk-atlas.png", ASSETS / "generated" / "mikey-jj-route-companion" / "transparent" / "mikey-walk-atlas.png"),
    # Episode-stable character walkers. Ship only the compact transparent GIF
    # loops used by wala.html; generation sheets and QA reports stay local.
    ("assets/generated/jttw-player-walkers/wukong/wukong-walk.gif", ASSETS / "generated" / "jttw-player-walkers" / "wukong" / "wukong-walk.gif"),
    ("assets/generated/jttw-player-walkers/tang/tang-walk.gif", ASSETS / "generated" / "jttw-player-walkers" / "tang" / "tang-walk.gif"),
    ("assets/generated/jttw-player-walkers/bajie/bajie-walk.gif", ASSETS / "generated" / "jttw-player-walkers" / "bajie" / "bajie-walk.gif"),
    ("assets/generated/jttw-player-walkers/shawujing/shawujing-walk.gif", ASSETS / "generated" / "jttw-player-walkers" / "shawujing" / "shawujing-walk.gif"),
    ("assets/generated/jttw-player-walkers/guanyin/guanyin-walk.gif", ASSETS / "generated" / "jttw-player-walkers" / "guanyin" / "guanyin-walk.gif"),
    ("assets/generated/jttw-player-walkers/redboy/redboy-walk.gif", ASSETS / "generated" / "jttw-player-walkers" / "redboy" / "redboy-walk.gif"),
    ("assets/generated/jttw-player-walkers/ironfan/ironfan-walk.gif", ASSETS / "generated" / "jttw-player-walkers" / "ironfan" / "ironfan-walk.gif"),
    ("assets/generated/jttw-player-walkers/bullking/bullking-walk.gif", ASSETS / "generated" / "jttw-player-walkers" / "bullking" / "bullking-walk.gif"),
    ("assets/generated/jttw-player-walkers/dragonking/dragonking-walk.gif", ASSETS / "generated" / "jttw-player-walkers" / "dragonking" / "dragonking-walk.gif"),
    ("assets/generated/jttw-player-walkers/whitedragonhorse/whitedragonhorse-walk.gif", ASSETS / "generated" / "jttw-player-walkers" / "whitedragonhorse" / "whitedragonhorse-walk.gif"),
    ("assets/generated/jttw-player-walkers/subodhi/subodhi-walk.gif", ASSETS / "generated" / "jttw-player-walkers" / "subodhi" / "subodhi-walk.gif"),
    ("assets/generated/jttw-player-walkers/jadeemperor/jadeemperor-walk.gif", ASSETS / "generated" / "jttw-player-walkers" / "jadeemperor" / "jadeemperor-walk.gif"),
    ("assets/generated/jttw-player-walkers/yellowwind/yellowwind-walk.gif", ASSETS / "generated" / "jttw-player-walkers" / "yellowwind" / "yellowwind-walk.gif"),
    ("assets/generated/jttw-player-walkers/whitebone/whitebone-walk.gif", ASSETS / "generated" / "jttw-player-walkers" / "whitebone" / "whitebone-walk.gif"),
    ("assets/generated/jttw-player-walkers/blackwind/blackwind-walk.gif", ASSETS / "generated" / "jttw-player-walkers" / "blackwind" / "blackwind-walk.gif"),
    ("assets/generated/jttw-player-walkers/zhenyuan/zhenyuan-walk.gif", ASSETS / "generated" / "jttw-player-walkers" / "zhenyuan" / "zhenyuan-walk.gif"),
    ("assets/generated/jttw-player-walkers/hundredflowers/hundredflowers-walk.gif", ASSETS / "generated" / "jttw-player-walkers" / "hundredflowers" / "hundredflowers-walk.gif"),
    ("assets/generated/jttw-player-walkers/goldenhorn/goldenhorn-walk.gif", ASSETS / "generated" / "jttw-player-walkers" / "goldenhorn" / "goldenhorn-walk.gif"),
    ("assets/generated/jttw-player-walkers/liondemon/liondemon-walk.gif", ASSETS / "generated" / "jttw-player-walkers" / "liondemon" / "liondemon-walk.gif"),
    ("assets/generated/jttw-player-walkers/tigerimmortal/tigerimmortal-walk.gif", ASSETS / "generated" / "jttw-player-walkers" / "tigerimmortal" / "tigerimmortal-walk.gif"),
    ("assets/generated/jttw-player-walkers/yellowbrows/yellowbrows-walk.gif", ASSETS / "generated" / "jttw-player-walkers" / "yellowbrows" / "yellowbrows-walk.gif"),
    ("assets/generated/jttw-player-walkers/powerdemon/powerdemon-walk.gif", ASSETS / "generated" / "jttw-player-walkers" / "powerdemon" / "powerdemon-walk.gif"),
    ("assets/generated/jttw-player-walkers/spiderdemon/spiderdemon-walk.gif", ASSETS / "generated" / "jttw-player-walkers" / "spiderdemon" / "spiderdemon-walk.gif"),
    ("assets/generated/jttw-player-walkers/centipededemon/centipededemon-walk.gif", ASSETS / "generated" / "jttw-player-walkers" / "centipededemon" / "centipededemon-walk.gif"),
    ("assets/generated/jttw-player-walkers/wukong/wukong-walk-action-atlas.png", ASSETS / "generated" / "jttw-player-walkers" / "wukong" / "wukong-walk-action-atlas.png"),
    ("assets/generated/jttw-player-walkers/subodhi/subodhi-walk-action-atlas.png", ASSETS / "generated" / "jttw-player-walkers" / "subodhi" / "subodhi-walk-action-atlas.png"),
    ("assets/generated/jttw-player-walkers/chaosdemon/chaosdemon-walk-action-atlas.png", ASSETS / "generated" / "jttw-player-walkers" / "chaosdemon" / "chaosdemon-walk-action-atlas.png"),
    ("assets/generated/jttw-player-walkers/chaosdemon/chaosdemon-walk.gif", ASSETS / "generated" / "jttw-player-walkers" / "chaosdemon" / "chaosdemon-walk.gif"),
    ("assets/generated/jttw-player-walkers/dragonking/dragonking-walk-action-atlas.png", ASSETS / "generated" / "jttw-player-walkers" / "dragonking" / "dragonking-walk-action-atlas.png"),
    ("assets/generated/jttw-player-walkers/wukong/directions/wukong-east-walk-action.gif", ASSETS / "generated" / "jttw-player-walkers" / "wukong" / "directions" / "wukong-east-walk-action.gif"),
    ("assets/generated/jttw-player-walkers/wukong/directions/wukong-south-walk-action.gif", ASSETS / "generated" / "jttw-player-walkers" / "wukong" / "directions" / "wukong-south-walk-action.gif"),
    ("assets/generated/jttw-player-walkers/wukong/directions/wukong-west-walk-action.gif", ASSETS / "generated" / "jttw-player-walkers" / "wukong" / "directions" / "wukong-west-walk-action.gif"),
    ("assets/generated/jttw-player-walkers/wukong/directions/wukong-north-walk-action.gif", ASSETS / "generated" / "jttw-player-walkers" / "wukong" / "directions" / "wukong-north-walk-action.gif"),
    ("assets/generated/jttw-player-walkers/subodhi/directions/subodhi-east-walk-action.gif", ASSETS / "generated" / "jttw-player-walkers" / "subodhi" / "directions" / "subodhi-east-walk-action.gif"),
    ("assets/generated/jttw-player-walkers/subodhi/directions/subodhi-south-walk-action.gif", ASSETS / "generated" / "jttw-player-walkers" / "subodhi" / "directions" / "subodhi-south-walk-action.gif"),
    ("assets/generated/jttw-player-walkers/subodhi/directions/subodhi-west-walk-action.gif", ASSETS / "generated" / "jttw-player-walkers" / "subodhi" / "directions" / "subodhi-west-walk-action.gif"),
    ("assets/generated/jttw-player-walkers/subodhi/directions/subodhi-north-walk-action.gif", ASSETS / "generated" / "jttw-player-walkers" / "subodhi" / "directions" / "subodhi-north-walk-action.gif"),
    ("assets/generated/jttw-player-walkers/chaosdemon/directions/chaosdemon-east-walk-action.gif", ASSETS / "generated" / "jttw-player-walkers" / "chaosdemon" / "directions" / "chaosdemon-east-walk-action.gif"),
    ("assets/generated/jttw-player-walkers/chaosdemon/directions/chaosdemon-south-walk-action.gif", ASSETS / "generated" / "jttw-player-walkers" / "chaosdemon" / "directions" / "chaosdemon-south-walk-action.gif"),
    ("assets/generated/jttw-player-walkers/chaosdemon/directions/chaosdemon-west-walk-action.gif", ASSETS / "generated" / "jttw-player-walkers" / "chaosdemon" / "directions" / "chaosdemon-west-walk-action.gif"),
    ("assets/generated/jttw-player-walkers/chaosdemon/directions/chaosdemon-north-walk-action.gif", ASSETS / "generated" / "jttw-player-walkers" / "chaosdemon" / "directions" / "chaosdemon-north-walk-action.gif"),
    # ep1 / ep5 地图三态精灵：移动=walk，投掷/撞击=attack，静止=idle。
    ("assets/generated/jttw-player-walkers/wukong/directions/wukong-south-idle.png", ASSETS / "generated" / "jttw-player-walkers" / "wukong" / "directions" / "wukong-south-idle.png"),
    ("assets/generated/jttw-player-walkers/wukong/directions/wukong-west-idle.png", ASSETS / "generated" / "jttw-player-walkers" / "wukong" / "directions" / "wukong-west-idle.png"),
    ("assets/generated/jttw-player-walkers/wukong/directions/wukong-east-idle.png", ASSETS / "generated" / "jttw-player-walkers" / "wukong" / "directions" / "wukong-east-idle.png"),
    ("assets/generated/jttw-player-walkers/wukong/directions/wukong-north-idle.png", ASSETS / "generated" / "jttw-player-walkers" / "wukong" / "directions" / "wukong-north-idle.png"),
    ("assets/generated/jttw-player-walkers/wukong/directions/wukong-south-walk.gif", ASSETS / "generated" / "jttw-player-walkers" / "wukong" / "directions" / "wukong-south-walk.gif"),
    ("assets/generated/jttw-player-walkers/wukong/directions/wukong-west-walk.gif", ASSETS / "generated" / "jttw-player-walkers" / "wukong" / "directions" / "wukong-west-walk.gif"),
    ("assets/generated/jttw-player-walkers/wukong/directions/wukong-east-walk.gif", ASSETS / "generated" / "jttw-player-walkers" / "wukong" / "directions" / "wukong-east-walk.gif"),
    ("assets/generated/jttw-player-walkers/wukong/directions/wukong-north-walk.gif", ASSETS / "generated" / "jttw-player-walkers" / "wukong" / "directions" / "wukong-north-walk.gif"),
    ("assets/generated/jttw-player-walkers/wukong/directions/wukong-south-attack.gif", ASSETS / "generated" / "jttw-player-walkers" / "wukong" / "directions" / "wukong-south-attack.gif"),
    ("assets/generated/jttw-player-walkers/wukong/directions/wukong-west-attack.gif", ASSETS / "generated" / "jttw-player-walkers" / "wukong" / "directions" / "wukong-west-attack.gif"),
    ("assets/generated/jttw-player-walkers/wukong/directions/wukong-east-attack.gif", ASSETS / "generated" / "jttw-player-walkers" / "wukong" / "directions" / "wukong-east-attack.gif"),
    ("assets/generated/jttw-player-walkers/wukong/directions/wukong-north-attack.gif", ASSETS / "generated" / "jttw-player-walkers" / "wukong" / "directions" / "wukong-north-attack.gif"),
    ("assets/generated/jttw-player-walkers/chaosdemon/directions/chaosdemon-south-idle.png", ASSETS / "generated" / "jttw-player-walkers" / "chaosdemon" / "directions" / "chaosdemon-south-idle.png"),
    ("assets/generated/jttw-player-walkers/chaosdemon/directions/chaosdemon-west-idle.png", ASSETS / "generated" / "jttw-player-walkers" / "chaosdemon" / "directions" / "chaosdemon-west-idle.png"),
    ("assets/generated/jttw-player-walkers/chaosdemon/directions/chaosdemon-east-idle.png", ASSETS / "generated" / "jttw-player-walkers" / "chaosdemon" / "directions" / "chaosdemon-east-idle.png"),
    ("assets/generated/jttw-player-walkers/chaosdemon/directions/chaosdemon-north-idle.png", ASSETS / "generated" / "jttw-player-walkers" / "chaosdemon" / "directions" / "chaosdemon-north-idle.png"),
    ("assets/generated/jttw-player-walkers/chaosdemon/directions/chaosdemon-south-walk.gif", ASSETS / "generated" / "jttw-player-walkers" / "chaosdemon" / "directions" / "chaosdemon-south-walk.gif"),
    ("assets/generated/jttw-player-walkers/chaosdemon/directions/chaosdemon-west-walk.gif", ASSETS / "generated" / "jttw-player-walkers" / "chaosdemon" / "directions" / "chaosdemon-west-walk.gif"),
    ("assets/generated/jttw-player-walkers/chaosdemon/directions/chaosdemon-east-walk.gif", ASSETS / "generated" / "jttw-player-walkers" / "chaosdemon" / "directions" / "chaosdemon-east-walk.gif"),
    ("assets/generated/jttw-player-walkers/chaosdemon/directions/chaosdemon-north-walk.gif", ASSETS / "generated" / "jttw-player-walkers" / "chaosdemon" / "directions" / "chaosdemon-north-walk.gif"),
    ("assets/generated/jttw-player-walkers/chaosdemon/directions/chaosdemon-south-attack.gif", ASSETS / "generated" / "jttw-player-walkers" / "chaosdemon" / "directions" / "chaosdemon-south-attack.gif"),
    ("assets/generated/jttw-player-walkers/chaosdemon/directions/chaosdemon-west-attack.gif", ASSETS / "generated" / "jttw-player-walkers" / "chaosdemon" / "directions" / "chaosdemon-west-attack.gif"),
    ("assets/generated/jttw-player-walkers/chaosdemon/directions/chaosdemon-east-attack.gif", ASSETS / "generated" / "jttw-player-walkers" / "chaosdemon" / "directions" / "chaosdemon-east-attack.gif"),
    ("assets/generated/jttw-player-walkers/chaosdemon/directions/chaosdemon-north-attack.gif", ASSETS / "generated" / "jttw-player-walkers" / "chaosdemon" / "directions" / "chaosdemon-north-attack.gif"),
    ("assets/generated/jttw-player-walkers/dragonking/directions/dragonking-east-walk-action.gif", ASSETS / "generated" / "jttw-player-walkers" / "dragonking" / "directions" / "dragonking-east-walk-action.gif"),
    ("assets/generated/jttw-player-walkers/dragonking/directions/dragonking-south-walk-action.gif", ASSETS / "generated" / "jttw-player-walkers" / "dragonking" / "directions" / "dragonking-south-walk-action.gif"),
    ("assets/generated/jttw-player-walkers/dragonking/directions/dragonking-west-walk-action.gif", ASSETS / "generated" / "jttw-player-walkers" / "dragonking" / "directions" / "dragonking-west-walk-action.gif"),
    ("assets/generated/jttw-player-walkers/dragonking/directions/dragonking-north-walk-action.gif", ASSETS / "generated" / "jttw-player-walkers" / "dragonking" / "directions" / "dragonking-north-walk-action.gif"),
    # Runtime-ready story sticker/keepsake PNGs only. Keep generation
    # prompts, API responses, split intermediates and WebP previews local.
    ("assets/generated/jttw-story-stickers-v1/transparent/stone.png", ASSETS / "generated" / "jttw-story-stickers-v1" / "transparent" / "stone.png"),
    ("assets/generated/jttw-story-stickers-v1/transparent/peach.png", ASSETS / "generated" / "jttw-story-stickers-v1" / "transparent" / "peach.png"),
    ("assets/generated/jttw-story-stickers-v1/transparent/waterfall.png", ASSETS / "generated" / "jttw-story-stickers-v1" / "transparent" / "waterfall.png"),
    ("assets/generated/jttw-story-stickers-v1/transparent/cloud.png", ASSETS / "generated" / "jttw-story-stickers-v1" / "transparent" / "cloud.png"),
    ("assets/generated/jttw-story-stickers-v1/transparent/bell.png", ASSETS / "generated" / "jttw-story-stickers-v1" / "transparent" / "bell.png"),
    ("assets/generated/jttw-story-stickers-v1/transparent/dragon.png", ASSETS / "generated" / "jttw-story-stickers-v1" / "transparent" / "dragon.png"),
    ("assets/generated/jttw-story-stickers-v1/transparent/saddle.png", ASSETS / "generated" / "jttw-story-stickers-v1" / "transparent" / "saddle.png"),
    ("assets/generated/jttw-story-stickers-v1/transparent/gourd.png", ASSETS / "generated" / "jttw-story-stickers-v1" / "transparent" / "gourd.png"),
    ("assets/generated/jttw-story-stickers-v1/transparent/tree.png", ASSETS / "generated" / "jttw-story-stickers-v1" / "transparent" / "tree.png"),
    ("assets/generated/jttw-story-stickers-v1/transparent/golden-ring.png", ASSETS / "generated" / "jttw-story-stickers-v1" / "transparent" / "golden-ring.png"),
    ("assets/generated/jttw-story-stickers-v1/transparent/fan.png", ASSETS / "generated" / "jttw-story-stickers-v1" / "transparent" / "fan.png"),
    ("assets/generated/jttw-story-stickers-v1/transparent/river-fish.png", ASSETS / "generated" / "jttw-story-stickers-v1" / "transparent" / "river-fish.png"),
    # Runtime-ready GPT medal PNGs. Keep prompts, raw sheets, spare art and
    # alpha-quality reports out of APK data; only the 19 semantic files used
    # by achievements/jttw.json are shipped.
    ("assets/generated/jttw-medals-v2/transparent/flower-fruit-mountain.png", ASSETS / "generated" / "jttw-medals-v2" / "transparent" / "flower-fruit-mountain.png"),
    ("assets/generated/jttw-medals-v2/transparent/brave-heart.png", ASSETS / "generated" / "jttw-medals-v2" / "transparent" / "brave-heart.png"),
    ("assets/generated/jttw-medals-v2/transparent/journey-bell.png", ASSETS / "generated" / "jttw-medals-v2" / "transparent" / "journey-bell.png"),
    ("assets/generated/jttw-medals-v2/transparent/yellow-wind-shield.png", ASSETS / "generated" / "jttw-medals-v2" / "transparent" / "yellow-wind-shield.png"),
    ("assets/generated/jttw-medals-v2/transparent/truth-bone-flower.png", ASSETS / "generated" / "jttw-medals-v2" / "transparent" / "truth-bone-flower.png"),
    ("assets/generated/jttw-medals-v2/transparent/clever-gourd.png", ASSETS / "generated" / "jttw-medals-v2" / "transparent" / "clever-gourd.png"),
    ("assets/generated/jttw-medals-v2/transparent/fire-cloud-hero.png", ASSETS / "generated" / "jttw-medals-v2" / "transparent" / "fire-cloud-hero.png"),
    ("assets/generated/jttw-medals-v2/transparent/contest-scales.png", ASSETS / "generated" / "jttw-medals-v2" / "transparent" / "contest-scales.png"),
    ("assets/generated/jttw-medals-v2/transparent/steady-heart.png", ASSETS / "generated" / "jttw-medals-v2" / "transparent" / "steady-heart.png"),
    ("assets/generated/jttw-medals-v2/transparent/true-monkey-star.png", ASSETS / "generated" / "jttw-medals-v2" / "transparent" / "true-monkey-star.png"),
    ("assets/generated/jttw-medals-v2/transparent/illusion-lotus-lamp.png", ASSETS / "generated" / "jttw-medals-v2" / "transparent" / "illusion-lotus-lamp.png"),
    ("assets/generated/jttw-medals-v2/transparent/friendship-mountain.png", ASSETS / "generated" / "jttw-medals-v2" / "transparent" / "friendship-mountain.png"),
    ("assets/generated/jttw-medals-v2/transparent/spirit-mountain-scroll.png", ASSETS / "generated" / "jttw-medals-v2" / "transparent" / "spirit-mountain-scroll.png"),
    ("assets/generated/jttw-medals-v2/transparent/story-opener-door.png", ASSETS / "generated" / "jttw-medals-v2" / "transparent" / "story-opener-door.png"),
    ("assets/generated/jttw-medals-v2/transparent/ten-tales-beads.png", ASSETS / "generated" / "jttw-medals-v2" / "transparent" / "ten-tales-beads.png"),
    ("assets/generated/jttw-medals-v2/transparent/halfway-river.png", ASSETS / "generated" / "jttw-medals-v2" / "transparent" / "halfway-river.png"),
    ("assets/generated/jttw-medals-v2/transparent/seventy-two-cloud.png", ASSETS / "generated" / "jttw-medals-v2" / "transparent" / "seventy-two-cloud.png"),
    ("assets/generated/jttw-medals-v2/transparent/hundred-tale-compass.png", ASSETS / "generated" / "jttw-medals-v2" / "transparent" / "hundred-tale-compass.png"),
    ("assets/generated/jttw-medals-v2/transparent/journey-complete-crown.png", ASSETS / "generated" / "jttw-medals-v2" / "transparent" / "journey-complete-crown.png"),
    # 降妖记小游戏：关卡/角色表/台词库/精灵注册表由战斗页按固定路径 fetch，
    # 引用闭包扫描不到，显式携带；四向小怪 GIF（约 2.6MB）一并入包。
    ("game/cast.json", CONTENT / "game" / "cast.json"),
    ("game/taunts.json", CONTENT / "game" / "taunts.json"),
    ("game/maps.json", CONTENT / "game" / "maps.json"),
    ("game/sprites.json", CONTENT / "game" / "sprites.json"),
    ("game/dex.json", CONTENT / "game" / "dex.json"),
    ("game/pickups.json", CONTENT / "game" / "pickups.json"),
    ("game/boss-kits.json", CONTENT / "game" / "boss-kits.json"),
    ("assets/generated/jttw-arena/arena-floor.jpg", ASSETS / "generated" / "jttw-arena" / "arena-floor.jpg"),
    ("assets/game-fx", CONTENT / "assets" / "game-fx"),
    ("assets/game-pickups", CONTENT / "assets" / "game-pickups"),
    ("game/audio", CONTENT / "game" / "audio"),
    ("game/levels", CONTENT / "game" / "levels"),
    ("assets/game-sprites", CONTENT / "assets" / "game-sprites"),
    ("assets/game-farm", CONTENT / "assets" / "game-farm"),
    ("assets/game-cards", CONTENT / "assets" / "game-cards"),
]


def _link_or_copy(src: Path, dst: Path, link: bool) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    if dst.exists() or dst.is_symlink():
        if dst.is_dir() and not dst.is_symlink():
            # Large media trees on Windows can be touched by the indexer or
            # antivirus while rmtree walks them (WinError 145: directory not
            # empty). Merge directory contents in place so an Android data
            # refresh remains retryable and does not destroy a usable tree.
            if src.is_dir() and not link:
                shutil.copytree(src, dst, dirs_exist_ok=True)
                print(f"merge {src} -> {dst}")
                return
            shutil.rmtree(dst)
        else:
            dst.unlink()
    if not src.exists():
        print(f"skip missing {src}")
        return
    if link:
        try:
            dst.symlink_to(src.resolve(), target_is_directory=src.is_dir())
        except OSError:
            import subprocess
            subprocess.check_call(["cmd", "/c", "mklink", "/J", str(dst), str(src.resolve())])
        print(f"link {dst} -> {src}")
        return
    if src.is_dir():
        shutil.copytree(src, dst)
    else:
        shutil.copy2(src, dst)
    print(f"copy {src} -> {dst}")


def sync_engine() -> None:
    ENGINE_ASSETS.mkdir(parents=True, exist_ok=True)
    for name in ENGINE_FILES:
        src = ENGINE / name
        if src.exists():
            shutil.copy2(src, ENGINE_ASSETS / name)
            print(f"engine {name}")
    print(f"engine synced -> {ENGINE_ASSETS}")


def pack_data(out: Path, link: bool) -> None:
    out.mkdir(parents=True, exist_ok=True)
    for rel, src in DATA_DIRS:
        _link_or_copy(src, out / rel, link)
    print(f"data pack -> {out}")


def _json_bytes(value: object) -> bytes:
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode("utf-8")


def _load_bytes(source: Path | bytes) -> object | None:
    try:
        raw = source if isinstance(source, bytes) else source.read_bytes()
        return json.loads(raw.decode("utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError):
        return None


def _book_one_vocab(
    files: dict[str, Path | bytes], series: str, *, root: Path = CONTENT
) -> None:
    """Keep only book-1 vocabulary clips in the starter APK.

    The published indexes are shared across a series.  Their entries carry a
    ``books`` array, so filtering the index and the corresponding MP3 paths
    gives the same point-read behavior without shipping hundreds of clips for
    books that are intentionally gated behind an import.
    """
    prefix = f"assets/{series}/vocab/"
    index_rel = prefix + "index.json"
    payload = _load_bytes(files[index_rel]) if index_rel in files else None
    if not isinstance(payload, dict):
        return
    terms = payload.get("terms")
    if not isinstance(terms, dict):
        return
    selected: dict[str, object] = {}
    refs: set[str] = {index_rel}
    for key, value in terms.items():
        if not isinstance(value, dict) or 1 not in (value.get("books") or []):
            continue
        selected[str(key)] = value
        for field in ("audio_en", "audio_zh"):
            ref = value.get(field)
            if isinstance(ref, str) and ref.startswith(prefix):
                refs.add(ref.replace("\\", "/"))
        for variant in value.get("audio_zh_variants") or []:
            if isinstance(variant, dict):
                ref = variant.get("audio_zh")
                if isinstance(ref, str) and ref.startswith(prefix):
                    refs.add(ref.replace("\\", "/"))
    definitions = payload.get("definitions")
    if isinstance(definitions, dict):
        # Definitions are a reverse zh -> audio map for the whole series.
        # Keep only clips already referenced by a book-1 term.
        payload["definitions"] = {
            str(text): ref
            for text, ref in definitions.items()
            if isinstance(ref, str) and ref.replace("\\", "/") in refs
        }

    def collect_asset_refs(value: object) -> None:
        if isinstance(value, dict):
            for item in value.values():
                collect_asset_refs(item)
        elif isinstance(value, list):
            for item in value:
                collect_asset_refs(item)
        elif isinstance(value, str) and value.startswith(prefix):
            refs.add(value.replace("\\", "/"))

    # Some published series carry a small phrase table in addition to terms;
    # retain it for the starter and include every referenced clip.
    collect_asset_refs(payload.get("phrases"))
    payload["terms"] = selected
    stats = payload.get("stats")
    if isinstance(stats, dict):
        stats = dict(stats)
        stats["terms"] = len(selected)
        payload["stats"] = stats
    files[index_rel] = _json_bytes(payload)
    # The stage-pack builder does not include the shared vocabulary directory
    # wholesale.  Add the selected book's clips from the source tree now that
    # the index has been narrowed, otherwise the APK would advertise audio
    # paths which are not physically present.
    for rel in refs:
        if rel == index_rel or rel in files:
            continue
        source = root / rel
        if source.is_file():
            files[rel] = source
    for rel in list(files):
        if rel.startswith(prefix) and rel not in refs:
            del files[rel]


def _book_one_quiz(
    files: dict[str, Path | bytes], series: str, *, root: Path = CONTENT
) -> None:
    """Keep book-1 quiz clips and index entries only."""
    prefix = f"assets/{series}/quiz/"
    index_rel = prefix + "index.json"
    payload = _load_bytes(files[index_rel]) if index_rel in files else None
    if not isinstance(payload, dict):
        return
    refs: set[str] = {index_rel}

    def is_book_one_ref(value: str) -> bool:
        # Avoid the common substring trap where ``b10`` is mistaken for
        # ``b1``.  Quiz assets use a delimiter after the book number.
        return bool(re.search(r"(?:^|[-_])b0*1(?:[-_]|$)", value.lower()))

    text_audio = payload.get("text_audio")
    if isinstance(text_audio, dict):
        narrowed_audio: dict[str, dict[str, str]] = {}
        for lang, mapping in text_audio.items():
            if not isinstance(mapping, dict):
                continue
            keep: dict[str, str] = {}
            for text, ref in mapping.items():
                if isinstance(ref, str) and is_book_one_ref(ref):
                    keep[str(text)] = ref
                    refs.add(ref.replace("\\", "/"))
            narrowed_audio[str(lang)] = keep
        payload["text_audio"] = narrowed_audio
    questions = payload.get("questions")
    if isinstance(questions, dict):
        payload["questions"] = {
            str(key): value
            for key, value in questions.items()
            if is_book_one_ref(str(key))
        }
    files[index_rel] = _json_bytes(payload)
    for rel in refs:
        if rel == index_rel or rel in files:
            continue
        source = root / rel
        if source.is_file():
            files[rel] = source
    for rel in list(files):
        if rel.startswith(prefix) and rel not in refs:
            del files[rel]


def _add_full_catalog_metadata(root: Path, files: dict[str, Path | bytes]) -> None:
    """Restore lightweight full catalogs so gated future cards remain visible."""
    for rel in (
        "dialogue_stories/collections.json",
        "storybooks/catalog.json",
        "storybooks-minecraft/catalog.json",
        "storybooks-minecraft/collections.json",
        "storybooks-mikey-jj/catalog.json",
        "storybooks-mikey-jj/collections.json",
    ):
        path = root / rel
        if path.is_file():
            files[rel] = path

    # Catalog covers are intentionally independent of the book JSON.  Add
    # every small cover so the locked future cards still look like real
    # destinations, while their book payloads remain gated until import.
    for catalog_rel in (
        "storybooks/catalog.json",
        "storybooks-minecraft/catalog.json",
        "storybooks-mikey-jj/catalog.json",
    ):
        payload = _load_bytes(files[catalog_rel]) if catalog_rel in files else None
        if not isinstance(payload, dict) or not isinstance(payload.get("episodes"), list):
            continue
        for item in payload["episodes"]:
            if not isinstance(item, dict) or not isinstance(item.get("cover"), str):
                continue
            cover = item["cover"].replace("\\", "/")
            if cover.startswith("assets/"):
                path = root / cover
                if path.is_file():
                    files[cover] = path

    # Covers/backgrounds are small compared with media and keep the visible
    # locked route cards useful before a later data pack is imported.
    for rel in (
        "assets/covers",
        "assets/collections",
    ):
        folder = root / rel
        if not folder.is_dir():
            continue
        for path in folder.rglob("*"):
            if path.is_file():
                files[str(path.relative_to(root)).replace("\\", "/")] = path


def available_for_profile(profile: str) -> dict[str, dict[str, object]]:
    """Return the starter-gate allowlist for one builtin APK profile."""
    available: dict[str, dict[str, object]] = {
        "jttw": {"episodes": [1], "collections": ["c01"]},
    }
    if profile == "starter":
        available["minecraft"] = {"books": [1]}
        available["mikey-jj"] = {"books": [1]}
    return available


def _prune_jttw_only(files: dict[str, Path | bytes]) -> None:
    """Trim the starter tree to the playable Journey-to-the-West EP1.

    The normal starter intentionally carries the two published storybook
    lines.  A distribution constrained to two sub-100 MB files should not
    carry those assets (or future JTTW character art) just to render the first
    episode.  Missing optional art is handled by the existing SVG/glyph
    fallbacks in the engine; all EP1 media and its learning audio remain.
    """
    keep = {
        "assets/companions/white-dragon/stages/mysterious-egg.png",
        "assets/companions/white-dragon/stages/awakening-egg.png",
        "assets/generated/jttw-player-walkers/wukong/wukong-walk.gif",
        "assets/generated/jttw-route-companion/transparent/wukong-walk-atlas.png",
        "assets/generated/wala-gamification/companion-room-bg-v1.png",
    }
    # The playable EP1 map now uses the directional three-state contract for
    # the hero. Preserve those explicit files while still pruning every other
    # generated walker from the jttw-only APK profile.
    for direction in ("south", "west", "east", "north"):
        keep.add(f"assets/generated/jttw-player-walkers/wukong/directions/wukong-{direction}-idle.png")
        keep.add(f"assets/generated/jttw-player-walkers/wukong/directions/wukong-{direction}-walk.gif")
        keep.add(f"assets/generated/jttw-player-walkers/wukong/directions/wukong-{direction}-attack.gif")
    for n in range(1, 9):
        keep.add(f"assets/generated/jttw-player-walkers/wukong/wukong-walk-0{n}.png")
    drop_prefixes = (
        "assets/minecraft/",
        "assets/mikey-jj/",
        "assets/generated/mikey-jj-route-companion/",
        "assets/generated/jttw-player-walkers/",
        "assets/generated/jttw-route-companion/",
        "assets/generated/wala-gamification/",
        "assets/companions/white-dragon/stages/",
        "assets/map_audio/episodes/",
        "storybooks-minecraft/",
        "storybooks-mikey-jj/",
    )
    for rel in list(files):
        if rel in keep:
            continue
        if any(rel.startswith(prefix) for prefix in drop_prefixes):
            del files[rel]
    # These are added as COMMON_FILES by the generic stage builder.  The
    # JTTW-only bundle has its own cover and does not expose the other lines.
    for rel in (
        "assets/minecraft/escape-from-the-nether/cover.webp",
        "assets/mikey-jj/zombie-school-adventure/pages/p01.webp",
        "assets/achievements/minecraft.json",
        "assets/companions/block-buddy.json",
    ):
        files.pop(rel, None)


def pack_builtin(
    out: Path = BUILTIN_ASSETS,
    *,
    version: str = BUILTIN_VERSION,
    profile: str = "starter",
) -> None:
    """Build the first-run content embedded directly in the APK.

    The default ``starter`` bundle contains one playable item per content
    line: JTTW ep1, Minecraft book1 and Mikey & JJ book1.  The ``jttw-only``
    profile keeps only the Journey-to-the-West EP1 experience so each device
    APK stays below the small-file distribution limit.  Later content is
    explicitly marked unavailable in the manifest and the UI asks the learner
    to import the matching stage ZIP.
    """
    if profile not in {"starter", "jttw-only"}:
        raise ValueError(f"未知内置档案: {profile}")
    files, _ids, _episodes, _published, warnings = _build_stage_pack(
        CONTENT,
        collections="c01",
        published="none" if profile == "jttw-only" else "all",
        episodes="1",
        published_books={"minecraft": (1,), "mikey-jj": (1,)},
    )
    # ``pack_datapack`` deliberately omits the legacy full-story MP3s from
    # stage ZIPs to keep them small.  The APK starter is a different contract:
    # its first episode must be playable before any import, and ep1.json still
    # points at this authored narration file.  Add just EP1's clip explicitly.
    ep1_audio = CONTENT / "assets" / "lf_ep1" / "audio_ep1.mp3"
    if ep1_audio.is_file():
        files["assets/lf_ep1/audio_ep1.mp3"] = ep1_audio
    else:
        warnings.append(f"内置首发音频缺失: {ep1_audio}")
    if profile == "jttw-only":
        _prune_jttw_only(files)
    else:
        _book_one_vocab(files, "minecraft")
        _book_one_vocab(files, "mikey-jj")
        _book_one_quiz(files, "minecraft")
        _book_one_quiz(files, "mikey-jj")
        _add_full_catalog_metadata(CONTENT, files)

    available = available_for_profile(profile)
    manifest = {
        "schema_version": 1,
        "kind": "apk-builtin-jttw-only" if profile == "jttw-only" else "apk-builtin-starter",
        "version": version,
        "message": (
            "已内置西游记第1集；下一集请导入西游记阶段数据包。"
            if profile == "jttw-only"
            else "已内置西游记第1集、Minecraft第1本和Mikey & JJ第1本；下一关请导入对应数据包。"
        ),
        "available": available,
        "file_count": len(files),
        "warnings": warnings,
    }
    files["content-manifest.json"] = _json_bytes(manifest)

    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True, exist_ok=True)
    for rel, src in files.items():
        dst = out / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        if isinstance(src, bytes):
            dst.write_bytes(src)
        else:
            shutil.copy2(src, dst)
    print(f"builtin APK data -> {out} files={len(files)}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--engine-only", action="store_true")
    ap.add_argument("--builtin", action="store_true", help="embed the starter content into Android assets/data")
    ap.add_argument("--builtin-out", type=Path, default=BUILTIN_ASSETS)
    ap.add_argument("--builtin-version", default=BUILTIN_VERSION)
    ap.add_argument(
        "--builtin-profile",
        choices=("starter", "jttw-only"),
        default="starter",
        help="内置首发档案：starter（三条内容线）或 jttw-only（仅西游记第1集）",
    )
    ap.add_argument("--data-out", type=Path, default=DATA_OUT)
    ap.add_argument("--link", action="store_true", help="junction/symlink instead of copy")
    args = ap.parse_args()
    sync_engine()
    if not args.engine_only:
        pack_data(args.data_out, args.link)
    if args.builtin:
        pack_builtin(
            args.builtin_out,
            version=args.builtin_version,
            profile=args.builtin_profile,
        )


if __name__ == "__main__":
    main()
