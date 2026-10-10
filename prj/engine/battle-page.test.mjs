import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const read = (name) => readFileSync(join(here, name), 'utf8');

test('battle.html：按顺序引入 tv-remote / quiz / battle-core / battle.js 并加载 tv 样式', () => {
  const html = read('battle.html');
  const scripts = [...html.matchAll(/<script[^>]*\ssrc="([^"?]+)(?:\?[^"]*)?"/g)]
    .map((m) => m[1].replace(/^\.\//, ''))
    .filter((src) => src !== 'native-key.js' && src !== 'handheld-controls.js' && src !== 'content-gate.js');
  assert.deepEqual(scripts, ['app-audio.js', 'tv-remote.js', 'game-common.js', 'episode-vocab-quiz.js', 'battle-core.js', 'game-core.js', 'game-audio.js', 'collection-core.js', 'battle.js']);
  assert.match(html, /href=["']tv\.css(?:\?[^"']*)?["']/i, 'battle.html must load tv.css');
  assert.match(html, /href=["']handheld\.css(?:\?[^"']*)?["']/i);
  assert.match(html, /href=["']battle\.css(?:\?[^"']*)?["']/i);
});

test('battle.html：六阶段骨架与核心控件齐备', () => {
  const html = read('battle.html');
  for (const id of [
    'battle-backdrop', 'battle-hero', 'battle-monsters', 'battle-projectiles',
    'battle-shields', 'battle-progress', 'battle-combo', 'battle-exit',
    'battle-bossbar', 'battle-dialogue', 'battle-preview', 'battle-orbs',
    'battle-quiz', 'battle-result', 'battle-pause', 'battle-gate', 'battle-toast',
    'battle-log', 'battle-boss-hp-fill', 'battle-dialogue-replay', 'battle-race', 'battle-race-fill', 'battle-skip',
  ]) {
    assert.match(html, new RegExp(`id="${id}"`), id);
  }
});

test('battle.js：只使用两个 battle 存储键，无危险 API', () => {
  const js = read('battle.js');
  const keys = [...js.matchAll(/bookplay_[a-z_0-9]+/g)].map((m) => m[0]);
  assert.deepEqual([...new Set(keys)].sort(), ['bookplay_battle_collection_v1', 'bookplay_battle_progress_v1', 'bookplay_dex_v1', 'bookplay_weak_v1']);
  assert.doesNotMatch(js, /\beval\s*\(|new Function\s*\(|document\.write/);
});

test('battle.js：复用 battle-core 与 vocab quiz 模块', () => {
  const js = read('battle.js');
  for (const fn of ['buildLevel', 'buildWaveQuestions', 'buildBossRound', 'judgeHit', 'settleRun', 'loadSprites']) {
    assert.match(js, new RegExp(`\\.${fn}\\(`), fn);
  }
  assert.match(js, /buildWordChoices/);
  assert.match(js, /BookPlayEpisodeVocabQuiz/);
  assert.match(js, /buildEpisodeQuiz/);
  assert.match(js, /BookPlayGameCore/);
});

test('battle.js：从大地图进入时保留地图存档字段，并带 from=battle 返回', () => {
  const js = read('battle.js');
  assert.match(js, /Object\.assign\(\{\}, prev/);
  assert.match(js, /game\.html\?ep=\$\{EP\}&from=battle/);
});

test('battle.js：关卡前有任务卡，选词直接扣血，答错不扔球也不扣护盾', () => {
  const js = read('battle.js');
  assert.match(js, /function showTaskCard\(/);
  assert.match(js, /再想一想。这只小妖还在。/);
  assert.match(js, /再想一想。这只妖怪还在。/);
  assert.match(js, /buildWordChoices/);
  const waveThrow = js.slice(js.indexOf('function throwOrb('), js.indexOf('function flyProjectile('));
  assert.doesNotMatch(waveThrow, /flyProjectile/);
  const bossThrow = js.slice(js.indexOf('function throwBossOrb('), js.indexOf('function showTaunt('));
  assert.doesNotMatch(bossThrow, /flyProjectile|applyBossMiss/);
});

test('battle.js：每个 Boss/小怪回合有 roundId 锁，连点只接收一次命中', () => {
  const js = read('battle.js');
  assert.match(js, /roundId/);
  assert.match(js, /roundLocked/);
  assert.match(js, /if \(state\.roundLocked\)/);
  assert.match(js, /const roundId = \+\+state\.roundId/);
  assert.match(js, /if \(roundId !== state\.roundId\) return/);
});

test('battle.js：战斗语音使用静态索引、支持重听并在切页/暂停时停止', () => {
  const js = read('battle.js');
  assert.match(js, /BookPlayGameAudio/);
  assert.match(js, /audioIndex/);
  assert.match(js, /battle-dialogue-replay/);
  assert.match(js, /\.replay\(/);
  assert.match(js, /stopAudio\("navigation"\)/);
  assert.match(js, /stopAudio\("pause"\)/);
});

test('Android 战斗副本完成后写回地图 complete 并带 from=battle 返回', () => {
  const androidPath = join(dirname(here), '..', 'android', 'app', 'src', 'main', 'assets', 'engine', 'battle.js');
  const js = readFileSync(androidPath, 'utf8');
  assert.match(js, /mapStage:\s*FROM_GAME \? "complete" : prev\.mapStage/);
  assert.match(js, /FROM_LESSON \? `game\.html\?ep=\$\{EP\}&from=lesson` : `game\.html\?ep=\$\{EP\}&from=battle`/);
});

test('结算下一集进入下一集大地图，不直进 battle.html', () => {
  const js = read('battle.js');
  assert.match(js, /下一集/);
  assert.doesNotMatch(js, /location\.href = `battle\.html\?ep=\$\{EP \+ 1\}`/);
  assert.match(js, /game\.html\?ep=\$\{EP \+ 1\}\$\{FROM_LESSON \? "&from=lesson" : ""\}/);
});

test('from=lesson 视为来自地图，返回 game.html?from=lesson', () => {
  const js = read('battle.js');
  assert.match(js, /FROM_LESSON = params.get\("from"\) === "lesson"/);
  assert.match(js, /FROM_GAME = params.get\("from"\) === "game" \|\| FROM_LESSON/);
  assert.match(js, /function mapUrl\(/);
  assert.match(js, /FROM_LESSON \? `game\.html\?ep=\$\{EP\}&from=lesson`/);
});

test('从大地图进入时 Boss 打完跳过关底 quiz 直接结算', () => {
  const js = read('battle.js');
  assert.match(js, /function shouldSkipEndQuiz\(/);
  assert.match(js, /FROM_GAME \|\| SKIP\.has\("quiz"\)/);
  assert.doesNotMatch(js, /setTimeout\(startQuiz,\s*1600\)/);
  assert.match(js, /if \(shouldSkipEndQuiz\(\)\) \{\s*state\.quizPassed = true;\s*showResult\(\);/s);
});

test('battle-core：保持纯逻辑（无 DOM / 无存储）', () => {
  const js = read('battle-core.js');
  assert.doesNotMatch(js, /localStorage|document\./);
  assert.doesNotMatch(js, /bookplay_/);
});

test('battle.css：命中高度不低于 64px 且尊重 reduced motion', () => {
  const css = read('battle.css');
  assert.match(css, /min-height\s*:\s*64px/);
  assert.match(css, /prefers-reduced-motion/);
});

test('battle.html：无内联事件处理器', () => {
  const html = read('battle.html');
  assert.doesNotMatch(html, /\son[a-z]+\s*=/i);
});

test("Boss 擂台按词格轮换题型并复用 game-core 跟打", () => {
  const html = read("battle.html");
  const js = read("battle.js");
  const css = read("battle.css");
  assert.match(html, /id="battle-listen"/);
  assert.match(js, /buildBossRound/);
  assert.match(js, /typingStep/);
  assert.match(js, /built\.listen/);
  assert.match(js, /kind === "typing"/);
  assert.match(js, /keyboardOk/);
  assert.match(css, /\.battle-typing-track/);
  assert.match(css, /\.battle-listen/);
});

test("本集冻 10 词，Boss 不会不算错词", () => {
  const js = read("battle.js");
  const html = read("battle.html");
  assert.match(js, /makeFreezeLevel\(/, 'freezeLevel 已收敛到 game-common（1b）');
  assert.match(js, /function skipBossWord\(/);
  assert.match(js, /skipped: true/);
  assert.match(html, /id="battle-skip"/);
});

test("选词路径不启动抢答倒计时，答错不扣护盾", () => {
  const js = read("battle.js");
  const html = read("battle.html");
  const renderBoss = js.slice(js.indexOf("function renderBossOrbs("), js.indexOf("function clearRaceTimers("));
  assert.doesNotMatch(renderBoss, /startRace\(/);
  assert.match(renderBoss, /throwBossOrb/);
  const waveThrow = js.slice(js.indexOf("function throwOrb("), js.indexOf("function flyProjectile("));
  assert.doesNotMatch(waveThrow, /startRace\(|applyBossMiss|flyProjectile/);
  const bossThrow = js.slice(js.indexOf("function throwBossOrb("), js.indexOf("function showTaunt("));
  assert.doesNotMatch(bossThrow, /startRace\(|applyBossMiss|flyProjectile/);
  assert.match(js, /再想一想。这只妖怪还在。/);
  assert.match(html, /id="battle-task"/);
  assert.doesNotMatch(renderBoss, /10 秒抢答/);
});

test("Boss 阶段是宝可梦式擂台：椭圆台、近大远小、回合条", () => {
  const html = read("battle.html");
  const css = read("battle.css");
  const js = read("battle.js");
  assert.match(html, /id="battle-arena"/);
  assert.match(html, /id="battle-arena-floor"/);
  assert.match(html, /id="battle-turn"/);
  assert.match(css, /\.battle-arena-floor/);
  assert.match(css, /\.battle\.is-boss-stage \.battle-hero/);
  assert.match(css, /\.battle\.is-boss-stage \.battle-monsters/);
  assert.match(js, /悟空回合/);
  assert.match(js, /妖怪回合/);
});

test("Boss 台题面置顶、双方血条、护体按钮齐备", () => {
  const html = read("battle.html");
  const js = read("battle.js");
  const css = read("battle.css");
  for (const id of ["battle-prompt", "battle-prompt-main", "battle-hp-dock", "battle-hero-hp-fill", "battle-defend", "battle-skill-banner"]) {
    assert.match(html, new RegExp(`id="${id}"`), id);
  }
  assert.match(js, /boss-kits\.json/);
  assert.match(js, /resolveBossKit/);
  assert.match(js, /pickHeroSkill/);
  assert.match(js, /pickBossSkill/);
  assert.match(js, /applyIncomingHit/);
  assert.match(js, /is-boss-stage/);
  assert.match(js, /is-lunge-left/);
  assert.match(js, /resolveSkillFx/);
  assert.match(js, /showSkillFx\(skill, bossEl, ["']hero["']\)/);
  assert.match(js, /showSkillFx\(skill, els\.hero, ["']boss["']\)/);
  assert.match(css, /battle-prompt-main/);
  assert.match(css, /\.battle\.is-boss-stage \.battle-orbs/);
  assert.match(css, /\.battle-hero-hp-fill/);
  assert.match(css, /is-lunge-left/);
  assert.match(css, /\.battle-skill-fx\s*\{[^}]*width:\s*220px/s);
  assert.match(css, /battle-skill-fx-pop/);
});
