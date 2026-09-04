# -*- coding: utf-8 -*-
"""Fill ep1 sentence Chinese + per-word English/Chinese phrases."""
from pathlib import Path
import json

ROOT = Path(r"G:\Game\BookPlay书戏\demo\data\dialogue_stories\ep1.json")

SENT_ZH = {
    "n000": "西游记 第1集",
    "n001": "远古以来，一块石头一直高高地坐在山顶上。",
    "n002": "太阳、月亮、天和地，都把神奇的力量施在这块石头上。",
    "n003": "有一天，石头裂开了。",
    "n004": "里面是一只猴子。",
    "n005": "猴子站起来，伸了伸懒腰。",
    "n006": "突然，强大的光从他的眼睛里射出来。",
    "n007": "那道光一瞬间直达天庭的云宫。",
    "n008": "天庭的统治者玉皇大帝坐直了身子。",
    "n009": "他转向身边的一名将领。",
    "n010": "「去查查那道光是怎么来的。」玉帝说。",
    "n011": "「是，陛下。」将领说。",
    "n012": "将领冲出大殿。",
    "n013": "他从天庭南门向外望去，看见了下面大地上的那只猴子。",
    "n014": "可是将领有法眼。",
    "n015": "刚才发生的一切，他都能看见。",
    "n016": "「有意思。」将领说。",
    "n017": "「怎么样？」将领回来时，玉皇大帝问。",
    "n018": "「是什么引起了那道光？」「是一只猴子。」将领说。",
    "n019": "「一只猴子？」玉皇大帝问。",
    "n020": "「是的。」将领说。",
    "n021": "在下方大地上的花果山。",
    "n022": "山上曾经有一块石头。",
    "n023": "这只猴子就是从那块石头里来的。",
    "n024": "光从猴子的眼睛里射出来。」皇帝想了一会儿，然后耸了耸肩。",
    "n025": "「我并不吃惊。」他说。",
    "n026": "「天地合力时，就会发生奇妙的事。」日子一天天过去，猴子学会了走路，",
    "n027": "他在溪边喝水，吃草和树叶。",
    "n028": "他采集果实，探索洞穴和山顶。",
    "n029": "他和所有别的猴子、猿成了朋友。",
    "n030": "夜里，他睡在悬崖下面。",
    "n031": "一个很热的早晨，所有的猴子和猿都在树荫下玩耍。",
    "n032": "「今天好热啊！」一只猴子喊道。",
    "n033": "「我们去溪里玩吧。」",
    "n034": "「好主意！」另一只猴子说。",
    "n035": "猴子和猿跑向小溪。",
    "n036": "溪水翻滚着，在石头上蹦跳。",
    "n037": "猴子们跳进清凉的水里。",
    "n038": "大家都溅着水花玩耍。",
    "n039": "过了一会儿，一只猴子挠了挠头。",
    "n040": "「我们都喜欢这条小溪。」她说。",
    "n041": "「我们从这里喝水。",
    "n042": "我们知道它一直流到",
    "n043": "可是有谁知道小溪是从哪儿流出来的吗？」他们互相看了看，摇了摇头。",
    "n044": "「我们今天没事做。」那只猴子接着说。",
    "n045": "「我们为什么不顺着小溪去找源头呢？」「听起来很好玩。」另一只猴子说。",
    "n046": "「走吧！」第三只猴子说。",
    "n047": "大家都跳出了水。",
    "n048": "他们沿着小溪跑，从一棵树荡到另一棵树。",
    "n049": "他们跳过石头，爬上陡峭的悬崖。",
    "n050": "他们越爬越高，一直来到一座巨大的瀑布前。",
    "n051": "空气里满是水雾。",
    "n052": "水轰然砸下，声如雷鸣。",
    "n053": "「我想知道瀑布后面有什么。」",
    "n054": "一只猴子说。",
    "n055": "「我也是。」第二只猴子说。",
    "n056": "「可是谁也跳不过去。」「谁能跳过去再活着回来，谁就是我们的大王。」一只长臂猿说。",
    "n057": "「有谁够勇敢，敢试一试吗？」所有的猴子和猿互相看了看。",
    "n058": "他们摇了摇头。",
    "n059": "「我不去试。」一只高个子猴子说。",
    "n060": "「我也不去。」一只矮个子猴子说。",
    "n061": "一个声音喊道：「我来！」大家让开路，说话的走了上来。",
    "n062": "「你确定吗？」长臂猿问。",
    "n063": "「看起来很危险。」猴子笑了。",
    "n064": "「我什么都不怕！",
    "n065": "等我回来，我就是大王！」",
}

# Word -> short phrase pair from the 266-page vocab book examples (tightened).
PHRASES = {
    "mountain": ("on top of a mountain", "在山顶上"),
    "rock": ("the rock split open", "石头裂开了"),
    "heaven": ("ruler of Heaven", "天庭的统治者"),
    "magic": ("worked their magic", "施展神奇的力量"),
    "earth": ("Heaven and Earth", "天和地"),
    "split open": ("the rock split open", "石头裂开了"),
    "monkey": ("a monkey", "一只猴子"),
    "stretched": ("stood up and stretched", "站起来伸了伸懒腰"),
    "powerful": ("powerful light", "强大的光"),
    "light": ("powerful light", "强大的光"),
    "eyes": ("shot from his eyes", "从他的眼睛里射出来"),
    "palace": ("the Cloud Palace", "云宫"),
    "cloud": ("the Cloud Palace", "云宫"),
    "emperor": ("the Jade Emperor", "玉皇大帝"),
    "ruler": ("ruler of Heaven", "天庭的统治者"),
    "caused": ("caused that light", "引起了那道光"),
    "captain": ("one of his captains", "他的一名将领"),
    "magical sight": ("magical sight", "法眼"),
    "magical": ("magical sight", "神奇的眼力"),
    "interesting": ("Interesting", "有意思"),
    "returned": ("when the captain returned", "将领回来的时候"),
    "fruit": ("Fruit and Flower Mountain", "花果山"),
    "shrugged": ("thought and then shrugged", "想了想，然后耸耸肩"),
    "surprised": ("not surprised", "并不吃惊"),
    "together": ("work together", "一起发挥作用"),
    "amazing": ("Amazing things", "奇妙的事"),
    "learned": ("learned to walk", "学会走路"),
    "streams": ("drank from streams", "在溪边喝水"),
    "gathered": ("gathered fruit", "采集果实"),
    "explored": ("explored caves", "探索洞穴"),
    "apes": ("monkeys and apes", "猴子和猿"),
    "shade": ("in the shade", "在树荫下"),
    "stream": ("play in the stream", "在溪里玩"),
    "bounced": ("bounced over the rocks", "在石头上蹦跳"),
    "splashed": ("splashed and played", "溅水玩耍"),
    "scratched her head": ("scratched her head", "挠了挠头"),
    "flows": ("flows to the ocean", "一直流到海里"),
    "shook their heads": ("shook their heads", "摇了摇头"),
    "continued": ("the monkey continued", "那只猴子接着说"),
    "source": ("find its source", "找到源头"),
    "alongside": ("ran alongside the stream", "沿着小溪跑"),
    "swung": ("swung from tree to tree", "从一棵树荡到另一棵树"),
    "steep": ("steep cliffs", "陡峭的悬崖"),
    "waterfall": ("an enormous waterfall", "巨大的瀑布"),
    "enormous": ("an enormous waterfall", "巨大的瀑布"),
    "roaring like thunder": ("roaring like thunder", "声如雷鸣"),
    "thunder": ("like thunder", "像打雷一样"),
    "whoever": ("Whoever can jump through", "谁能跳过去"),
    "gibbon": ("said a gibbon", "一只长臂猿说"),
    "king": ("be our king", "当我们的大王"),
    "brave": ("brave enough", "足够勇敢"),
    "stepped forward": ("stepped forward", "走上前来"),
    "dangerous": ("It looks dangerous", "看起来很危险"),
    "afraid": ("not afraid of anything", "什么都不怕"),
}


def phrase_for(term, zh):
    key = (term or "").strip()
    pair = PHRASES.get(key) or PHRASES.get(key.lower())
    if pair:
        return pair
    return (key, zh or key)


def main():
    data = json.loads(ROOT.read_text(encoding="utf-8"))
    filled_sent = 0
    filled_card = 0
    missing = []
    for n in data.get("nodes", []):
        nid = n.get("node_id")
        if nid in SENT_ZH:
            n["text_zh"] = SENT_ZH[nid]
            filled_sent += 1
        elif n.get("type") == "narration" and not n.get("text_zh"):
            missing.append(nid)
        for card in n.get("vocab") or []:
            en, zh = phrase_for(card.get("term"), card.get("zh"))
            card["phrase_en"] = en
            card["phrase_zh"] = zh
            card.pop("example", None)
            filled_card += 1
    data["source_note"] = (
        "台词英文本来自 data/08 原文台词本；词汇短语来自 data/05 中英对照词汇。"
        "中文句译按英文台词逐句对照（网上无完整官方中文台词）。个人使用。"
    )
    ROOT.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("sentences_filled", filled_sent)
    print("cards_filled", filled_card)
    print("missing_narration_zh", missing)


if __name__ == "__main__":
    main()
