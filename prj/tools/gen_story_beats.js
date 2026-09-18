"use strict";
/* 生成 content/game/story/ep{1..14}.json：三幕剧情节拍（数据驱动 + 角色台词模板）。
 * 词绑定来自各集 previewWords；Boss/NPC 来自 cast.json。用法：node tools 一次性运行。 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");  // prj/tools → 仓库根
const NU_EP = (ep) => path.join(ROOT, "content", "dialogue_stories", `ep${ep}.json`);

const ROLE_LINES = {
  chaosdemon: [
    ["The water cave is MINE!", "这水洞是俺的！"],
    ["My waves wash words away!", "俺的浪把词冲走！"],
  ],
  jadeemperor: [
    ["Welcome to the Heavenly Palace.", "欢迎来到天宫。"],
    ["Pass my test, little monkey.", "答对小猴的考验吧。"],
  ],
  tang: [
    ["Speak gently, learn deeply.", "轻声说，用心学。"],
    ["A kind heart learns fastest.", "善良的心学得最快。"],
  ],
  wukong: [
    ["Watch me learn this in one hop!", "看俺一跳就学会！"],
    ["Words fear my golden staff!", "词都怕俺的金箍棒！"],
  ],
  redboy: [
    ["My fire burns bright red!", "俺的火烧得红彤彤！"],
    ["Say the word or feel the heat!", "说出那个词，不然尝尝火热！"],
  ],
  imp: [
    ["We guard the words, hehe!", "嘿嘿，词由俺们看守！"],
    ["Try to catch us all!", "有本事全抓住俺们！"],
  ],
  default: [
    ["Who dares enter?", "谁敢进来？"],
    ["Words guard this place!", "词看守着这里！"],
  ],
};

const bossOf = JSON.parse(fs.readFileSync(path.join(ROOT, "content", "game", "cast.json"), "utf8")).bossByEp;
const themeOf = JSON.parse(fs.readFileSync(path.join(ROOT, "content", "game", "cast.json"), "utf8")).themesByEp;
const THEME_ZH = {
  "flower-fruit-mountain": "花果山", "water-curtain-cave": "水帘洞",
  "three-star-cave": "斜月三星洞", "water-dirty-cave": "水脏洞",
  "dragon-palace": "龙宫", "underworld": "幽冥界", "generic": "西游之路",
};

const lines = [];
for (let ep = 1; ep <= 14; ep++) {
  const dial = JSON.parse(fs.readFileSync(NU_EP(ep), "utf8"));
  const sb = JSON.parse(fs.readFileSync(path.join(ROOT, "content", "storybooks", `ep${ep}.json`), "utf8"));
  const level = JSON.parse(fs.readFileSync(path.join(ROOT, "content", "game", "levels", `ep${ep}.json`), "utf8"));
  const preview = level.previewWords || [];
  const bossId = level.cast.boss.id;
  const bossName = level.cast.boss.nameZh;
  const linesOf = ROLE_LINES[bossId] || ROLE_LINES[bossId.includes("demon") || bossId.includes("demon") ? "chaosdemon" : "default"] || ROLE_LINES.default;
  const bossLine = linesOf[0], bossLine2 = linesOf[1] || linesOf[0];

  const w = (i) => preview[i % preview.length] || { term: "word", zh: "词" };
  const doc = {
    schema_version: 1,
    ep,
    title: { zh: THEME_ZH[level.background?.theme] || sb.title.zh, en: sb.title.en },
    acts: [
      {
        act: 1, scene: level.background?.theme || "generic", station: "orb-battle",
        beats: [
          { speaker: "narrator", textEn: `Our journey begins: ${sb.title.en}.`, textZh: `旅程开始：${sb.title.zh}。`, reviewWords: [] },
          { speaker: bossId, textEn: bossLine.en, textZh: bossLine.zh, reviewWords: [preview[0]?.term].filter(Boolean) },
          { speaker: "wukong", textEn: `Hand over the word "${preview[0]?.term}"!`, textZh: `交出「${preview[0]?.zh}」！`, reviewWords: [preview[0]?.term].filter(Boolean) },
        ],
        words: preview.slice(0, 4).map((x) => x.term),
      },
      {
        act: 2, scene: level.background?.theme || "generic", station: "npc-quiz",
        beats: [
          { speaker: "narrator", textEn: "A friend appears with a question.", textZh: "一位朋友带着问题出现。", reviewWords: [] },
          { speaker: "wukong", textEn: `Let me try the word "${preview[4]?.term}"!`, textZh: `俺来试试「${preview[4]?.zh}」！`, reviewWords: [preview[4]?.term].filter(Boolean) },
        ],
        words: preview.slice(4, 8).map((x) => x.term),
      },
      {
        act: 3, scene: level.background?.theme || "generic", station: "boss",
        beats: [
          { speaker: bossId, textEn: bossLine2.en, textZh: bossLine2.zh, reviewWords: [level.boss.hpWords[0]?.term].filter(Boolean) },
          { speaker: "wukong", textEn: `Golden staff — ${level.boss.hpWords[0]?.term}!`, textZh: `金箍棒——「${level.boss.hpWords[0]?.zh}」！`, reviewWords: [level.boss.hpWords[0]?.term].filter(Boolean) },
        ],
        words: level.boss.hpWords.map((x) => x.term),
      },
    ],
  };
  const out = path.join(ROOT, "content", "game", "story", `ep${ep}.json`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(doc, null, 1) + "\n", "utf-8");
  lines.push(`ep${ep}: ${doc.acts.length} acts, ${doc.acts.reduce((n, a) => n + a.beats.length, 0)} beats`);
}
console.log(lines.join("\n"));
