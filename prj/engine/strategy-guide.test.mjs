import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import studyPlan from "./study-plan.js";
import core from "./lesson-core.js";

const here = dirname(fileURLToPath(import.meta.url));
const read = (name) => readFileSync(join(here, name), "utf8");

const listenNode = (id, text = `sentence ${id}`) => ({ type: "narration", text_en: text, node_id: `n${id}` });
const fillerNode = (id) => ({ type: "dialogue", text_en: `talk ${id}`, node_id: `d${id}` });
const CARDS = [
  { id: "c1", title: "卡一", body: "方法一" },
  { id: "c2", title: "卡二", body: "方法二" },
  { id: "c3", title: "卡三", body: "方法三" },
  { id: "c4", title: "卡四", body: "方法四" },
];

function episode(totalListen) {
  const nodes = [];
  for (let i = 0; i < totalListen; i += 1) {
    nodes.push(listenNode(i));
    if (i % 2 === 1) nodes.push(fillerNode(i));
  }
  return nodes;
}

test("buildGuidePlan：标准档插 2 张、避开随堂题节点、首卡靠前、完全确定", () => {
  const nodes = episode(12);
  const plan = studyPlan.buildGuidePlan({ nodes, cards: CARDS, learnLevel: "std", checkpointIndexes: [4] });
  assert.equal(plan.total, 2);
  assert.ok(!plan.indexes.includes(4), "不与随堂题同节点");
  assert.ok(plan.indexes[0] < 6, "第一张卡放在故事前段（先方法后练习）");
  const again = studyPlan.buildGuidePlan({ nodes, cards: CARDS, learnLevel: "std", checkpointIndexes: [4] });
  assert.deepEqual(again.indexes, plan.indexes, "两次构建结果一致（无随机）");
  assert.deepEqual(Object.keys(plan.byIndex).map(Number).sort((a, b) => a - b), plan.indexes);
});

test("buildGuidePlan：lite 1 张 / max 3 张，卡片按库顺序轮转", () => {
  const nodes = episode(14);
  const lite = studyPlan.buildGuidePlan({ nodes, cards: CARDS, learnLevel: "lite" });
  assert.equal(lite.total, 1);
  const max = studyPlan.buildGuidePlan({ nodes, cards: CARDS, learnLevel: "max" });
  assert.equal(max.total, 3);
  const ordered = max.indexes.slice().sort((a, b) => a - b);
  assert.deepEqual(ordered.map((index) => max.byIndex[index].id), ["c1", "c2", "c3"], "按库顺序分配");
});

test("buildGuidePlan：卡库为空或非法卡片时安全退化为无卡", () => {
  const nodes = episode(6);
  assert.equal(studyPlan.buildGuidePlan({ nodes, cards: [], learnLevel: "std" }).total, 0);
  const dirty = studyPlan.buildGuidePlan({ nodes, cards: [{ title: "没 id" }, null, ...CARDS], learnLevel: "std" });
  assert.equal(dirty.total, 2);
  assert.ok(dirty.indexes.every((index) => dirty.byIndex[index].id));
});

test("strategy_cards.json：全局卡库 schema 合法（5-10 张、id 唯一、字段非空）", () => {
  const pack = JSON.parse(readFileSync(join(here, "..", "..", "content", "strategy_cards.json"), "utf8"));
  assert.equal(pack.version, 1);
  assert.ok(Array.isArray(pack.cards) && pack.cards.length >= 5 && pack.cards.length <= 10);
  const ids = pack.cards.map((card) => card.id);
  assert.deepEqual([...new Set(ids)], ids, "id 不重复");
  for (const card of pack.cards) {
    for (const field of ["id", "title", "body"]) {
      assert.ok(typeof card[field] === "string" && card[field].trim(), `${card.id}.${field} 非空`);
    }
  }
});

test("lesson-core.normalizeStudySession：firstAttempt 透传并归一，非法输入归 null", () => {
  const session = core.normalizeStudySession({
    version: 2, episode: 3,
    quiz: { current: 1, correct: 1, answers: [{ index: 0, ok: true }] },
    firstAttempt: { total: 5, correct: 9, at: "2026-09-19T10:00:00.000Z" },
  });
  assert.equal(session.firstAttempt.total, 5);
  assert.equal(session.firstAttempt.correct, 5, "correct 不超过 total");
  assert.equal(session.firstAttempt.ratio, 1);
  const none = core.normalizeStudySession({ version: 2, episode: 1, quiz: {} });
  assert.equal(none.firstAttempt, null);
});

test("lesson.js resetQuizSession：重置前归档首答，已有首答不覆盖", () => {
  const js = read("lesson.js");
  const body = js.slice(js.indexOf("function resetQuizSession"));
  assert.match(body, /firstAttempt/);
  assert.match(body, /!\s*studySession\.firstAttempt/, "只在没有首答时归档");
  assert.match(body, /ratio:\s*prevCorrect\s*\/\s*prevAnswers\.length/);
});

test("wala.js：guide act 全链路接线（载卡→建计划→入队→渲染）", () => {
  const js = read("wala.js");
  assert.match(js, /strategy_cards\.json/, "启动时加载全局策略卡库");
  assert.match(js, /let strategyPack = null;/, "strategyPack 必须声明（严格模式解构不声明会炸掉整个启动）");
  assert.match(js, /WalaStudyPlan\.buildGuidePlan\(/, "rebuildCheckpointPlan 里构建方法卡计划");
  assert.match(js, /type: "guide", card: guide/, "studyActsFor 入队 guide act");
  const runActsBody = js.slice(js.indexOf("function runActs"), js.indexOf("function studyActsFor"));
  assert.match(runActsBody, /act\.type === "guide"[\s\S]{0,120}inlineQueued = true;[\s\S]{0,80}showGuideCard\(act\.card, step\)/,
    "runActs 分发 guide act，读完自动续播");
  assert.match(js, /function showGuideCard\(/, "渲染函数存在");
  assert.match(js, /guidesShown\.add\(card\.id\)/, "渲染时去重，一集内每张卡只出一次");
  assert.match(js, /guidesShown\.clear\(\)/, "换集时清空去重表");
  // 方法卡先于词卡（先学方法再练习）
  const actsBody = js.slice(js.indexOf("function studyActsFor"), js.indexOf("function afterSentence"));
  assert.ok(actsBody.indexOf("type: \"guide\"") < actsBody.indexOf("type: \"word\""), "guide 排在 word 之前");
});

test("打包三处：策略卡库进全量包 / 阶段包 / APK 内置树", () => {
  const datapack = readFileSync(join(here, "..", "tools", "pack_datapack.py"), "utf8");
  assert.match(datapack, /"strategy_cards.json",\n    "dialogue_stories",/, "INCLUDE_DIRS 全量包白名单");
  const common = datapack.slice(datapack.indexOf("COMMON_FILES = ("));
  assert.match(common, /"strategy_cards\.json"/, "COMMON_FILES 阶段包白名单");
  const apk = readFileSync(join(here, "..", "tools", "pack_android.py"), "utf8");
  assert.match(apk, /"strategy_cards\.json", CONTENT \/ "strategy_cards\.json"/, "APK 内置数据树");
});
