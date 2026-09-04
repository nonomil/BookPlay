"""从页文本自动抽生词并出选择题。第 1 集仍可用人工表覆盖。"""
from __future__ import annotations

import random
import re

# 最长短语优先。覆盖西游记分级读物常见词，不够的页会少几条，不挡播放。
WORD_ZH: dict[str, str] = {
    "Jade Emperor": "玉皇大帝",
    "Fruit and Flower Mountain": "花果山",
    "Cloud Palace": "云宫 / 天庭",
    "Your Majesty": "陛下",
    "split open": "裂开",
    "magical sight": "法眼",
    "took a deep breath": "深吸一口气",
    "stepped forward": "站出来",
    "shook their heads": "摇头",
    "roaring like thunder": "声如雷鸣",
    "scratched her head": "挠挠头",
    "Water Curtain Cave": "水帘洞",
    "Monkey King": "美猴王",
    "Tang Monk": "唐僧",
    "Tripitaka": "三藏 / 唐僧",
    "Pigsy": "猪八戒",
    "Sandy": "沙僧",
    "Guanyin": "观音",
    "heaven": "天庭；天堂",
    "Heaven": "天庭",
    "emperor": "皇帝",
    "captain": "将领",
    "ruler": "统治者",
    "monkey": "猴子",
    "magic": "魔法；神奇的",
    "magical": "神奇的",
    "powerful": "强大的",
    "stretched": "伸展",
    "returned": "返回",
    "caused": "引起",
    "shrugged": "耸肩",
    "amazing": "令人惊叹的",
    "stream": "小溪",
    "streams": "小溪",
    "gathered": "采集",
    "explored": "探索",
    "apes": "猿",
    "shade": "树荫",
    "bounced": "弹跳",
    "splashed": "戏水",
    "flows": "流淌",
    "source": "源头",
    "continued": "继续",
    "alongside": "沿着",
    "swung": "荡",
    "steep": "陡峭的",
    "enormous": "巨大的",
    "gibbon": "长臂猿",
    "whoever": "无论谁",
    "brave": "勇敢的",
    "dangerous": "危险的",
    "afraid": "害怕的",
    "leaped": "跃入",
    "waterfall": "瀑布",
    "mountain": "山",
    "palace": "宫殿",
    "demon": "妖怪",
    "monster": "怪物",
    "spirit": "精；神灵",
    "robed": "穿着袍子",
    "robe": "袈裟；袍",
    "staff": "金箍棒；杖",
    "cloud": "云",
    "immortal": "神仙",
    "temple": "寺庙",
    "king": "国王；大王",
    "princess": "公主",
    "master": "师父",
    "disciple": "徒弟",
    "journey": "旅程",
    "west": "西方",
    "scripture": "经文",
    "scriptures": "经文",
    "Buddha": "佛",
    "dragon": "龙",
    "cave": "洞穴",
    "fruit": "果实",
    "peach": "桃子",
    "thunder": "雷",
    "wind": "风",
    "magic power": "法力",
    "somersault": "筋斗",
    "hair": "毫毛；头发",
    "prison": "监狱",
    "arrested": "被捕",
    "released": "释放",
    "promise": "承诺",
    "protect": "保护",
    "tricked": "被骗",
    "injured": "受伤的",
    "monk": "和尚",
    "gourd": "葫芦",
    "vase": "净瓶；花瓶",
    "pill": "丹药",
    "sleeve": "袖子",
    "frying pan": "油锅",
    "yellow wind": "黄风",
    "bear": "熊",
    "river": "河",
    "darkness": "黑暗",
    "heavenly": "天上的",
    "earth": "大地",
    "rock": "岩石",
    "light": "光",
    "eyes": "眼睛",
    "interesting": "有趣的",
    "surprised": "吃惊的",
    "together": "一起",
    "learned": "学会了",
    "walk": "走",
    "jump": "跳",
    "kingdom": "王国",
    "battle": "战斗",
    "fight": "打架",
    "escaped": "逃脱",
    "captured": "抓住",
    "rescue": "营救",
    "disguise": "伪装",
    "spell": "咒语",
    "curse": "诅咒",
    "mountainous": "多山的",
}

GLOSSARY_EP1: dict[int, list[dict]] = {
    3: [
        {"term": "magic", "zh": "魔法；神奇的"},
        {"term": "split open", "zh": "裂开"},
        {"term": "stretched", "zh": "伸展（伸懒腰）"},
        {"term": "powerful", "zh": "强大的"},
    ],
    4: [
        {"term": "Jade Emperor", "zh": "玉皇大帝"},
        {"term": "ruler", "zh": "统治者"},
        {"term": "captain", "zh": "（天庭）将领"},
        {"term": "Your Majesty", "zh": "陛下（尊称）"},
    ],
    5: [
        {"term": "magical sight", "zh": "法眼（千里眼）"},
        {"term": "returned", "zh": "返回"},
        {"term": "caused", "zh": "引起；造成"},
    ],
    6: [
        {"term": "shrugged", "zh": "耸耸肩"},
        {"term": "amazing", "zh": "令人惊叹的"},
        {"term": "Fruit and Flower Mountain", "zh": "花果山"},
    ],
    7: [
        {"term": "stream", "zh": "小溪"},
        {"term": "gathered", "zh": "采集"},
        {"term": "explored", "zh": "探索"},
        {"term": "apes", "zh": "猿"},
        {"term": "shade", "zh": "树荫"},
    ],
    8: [
        {"term": "bounced", "zh": "弹跳"},
        {"term": "splashed", "zh": "泼水；戏水"},
        {"term": "scratched her head", "zh": "挠挠头"},
        {"term": "flows", "zh": "流淌"},
    ],
    9: [
        {"term": "source", "zh": "源头"},
        {"term": "shook their heads", "zh": "摇头"},
        {"term": "continued", "zh": "接着说"},
    ],
    10: [
        {"term": "alongside", "zh": "沿着（一起）"},
        {"term": "swung", "zh": "荡（荡藤蔓/树枝）"},
        {"term": "steep", "zh": "陡峭的"},
        {"term": "enormous", "zh": "巨大的"},
        {"term": "roaring like thunder", "zh": "声如雷鸣"},
    ],
    11: [
        {"term": "gibbon", "zh": "长臂猿"},
        {"term": "whoever", "zh": "无论谁"},
        {"term": "brave", "zh": "勇敢的"},
    ],
    12: [
        {"term": "stepped forward", "zh": "站出来"},
        {"term": "dangerous", "zh": "危险的"},
        {"term": "afraid", "zh": "害怕的"},
    ],
    13: [
        {"term": "took a deep breath", "zh": "深吸一口气"},
        {"term": "leaped", "zh": "跃入；跳"},
    ],
}

CHOICES_EP1: dict[int, dict] = {
    11: {
        "prompt": "The gibbon asks who is brave enough to jump. What would you do?",
        "prompt_zh": "长臂猿问：谁有胆量跳过瀑布？你会怎么做？",
        "options": [
            {
                "id": "try",
                "en": "I would try.",
                "zh": "我去试试。",
                "reply": "The others step back. Someone has to go first.",
            },
            {
                "id": "stay",
                "en": "I would stay back.",
                "zh": "我先看看。",
                "reply": "Most of the monkeys think the same. Then a voice calls out.",
            },
        ],
    },
    12: {
        "prompt": "Monkey is going to jump. What do you say?",
        "prompt_zh": "石猴要跳了。你会对他说什么？",
        "options": [
            {
                "id": "cheer",
                "en": "Go, Monkey!",
                "zh": "跳吧！",
                "reply": "The troop cheers. He is not afraid of anything.",
            },
            {
                "id": "warn",
                "en": "It looks dangerous.",
                "zh": "太危险了。",
                "reply": "The gibbon said the same thing. Monkey only laughs.",
            },
        ],
    },
}

QUIZ_EP1 = [
    {"q": "The rock split open. 「split open」 是什么意思？", "choices": ["裂开", "飞走了", "慢慢长大"], "answer": 0},
    {"q": "Who is the ruler of Heaven? 天庭的统治者是谁？", "choices": ["the captain 将领", "the Jade Emperor 玉帝", "Monkey 猴子"], "answer": 1},
    {"q": "He drank from streams. 「stream」 是什么？", "choices": ["小溪", "大海", "山洞"], "answer": 0},
    {"q": "an enormous waterfall 「enormous」 是什么意思？", "choices": ["很小的", "巨大的", "结冰的"], "answer": 1},
    {"q": "「Whoever can jump through will be our king,」 said the gibbon. gibbon 指谁？", "choices": ["长臂猿（猴群的一员）", "老虎", "玉皇大帝"], "answer": 0},
]

_DISTRACTORS = ["小溪", "大海", "山洞", "皇帝", "猴子", "妖怪", "瀑布", "寺庙", "经文", "勇敢的", "害怕的", "巨大的"]


def glossary_for_page(text: str, limit: int = 4) -> list[dict]:
    hits: list[dict] = []
    used = set()
    for term in sorted(WORD_ZH, key=len, reverse=True):
        if term.lower() in used:
            continue
        if re.search(rf"\b{re.escape(term)}\b", text, flags=re.I):
            hits.append({"term": term, "zh": WORD_ZH[term]})
            used.add(term.lower())
        if len(hits) >= limit:
            break
    return hits


def quiz_from_glossary(glossary: list[dict], n: int = 3, rng: random.Random | None = None) -> list[dict]:
    rng = rng or random.Random(42)
    seen: set[str] = set()
    items: list[dict] = []
    for g in glossary:
        key = str(g.get("term") or "").strip().lower()
        if not g.get("zh") or not key or key in seen:
            continue
        seen.add(key)
        items.append(g)
    rng.shuffle(items)
    quiz = []
    for g in items[:n]:
        correct = g["zh"]
        pool = [d for d in _DISTRACTORS if d != correct]
        wrong = rng.sample(pool, 2)
        choices = [correct] + wrong
        rng.shuffle(choices)
        quiz.append({
            "q": f"「{g['term']}」 是什么意思？",
            "choices": choices,
            "answer": choices.index(correct),
        })
    return quiz


def attach_learning(
    pages: list[dict],
    manual_map: dict | None = None,
    manual_quiz: list | None = None,
    choice_map: dict | None = None,
) -> tuple[list[dict], list[dict]]:
    all_gloss: list[dict] = []
    for page in pages:
        if manual_map and page["page_no"] in manual_map:
            page["glossary"] = manual_map[page["page_no"]]
        else:
            page["glossary"] = glossary_for_page(page["text_en"])
        all_gloss.extend(page["glossary"])
        if choice_map and page["page_no"] in choice_map:
            page["choice"] = choice_map[page["page_no"]]
    quiz = manual_quiz if manual_quiz else quiz_from_glossary(all_gloss, n=5)
    return pages, quiz
