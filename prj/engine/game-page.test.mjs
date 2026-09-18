import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const read = (name) => readFileSync(join(here, name), 'utf8');

test('game.html：按顺序引入 app-audio / tv-remote / battle-core / game.js 并加载 tv 与 battle 样式', () => {
  const html = read('game.html');
  const scripts = [...html.matchAll(/<script[^>]*\ssrc="([^"?]+)(?:\?[^"]*)?"/g)]
    .map((m) => m[1].replace(/^\.\//, ''))
    .filter((src) => src !== 'native-key.js' && src !== 'handheld-controls.js' && src !== 'content-gate.js');
  assert.deepEqual(scripts, ['app-audio.js', 'tv-remote.js', 'battle-core.js', 'game-core.js', 'game-input.js', 'game-audio.js', 'collection-core.js', 'schedule-core.js', 'economy-core.js', 'farm-core.js', 'farm-ui.js', 'game.js', 'game-feedback.js']);
  assert.match(html, /href=["']tv\.css(?:\?[^"']*)?["']/i, 'game.html must load tv.css');
  assert.match(html, /href=["']handheld\.css(?:\?[^"']*)?["']/i);
  assert.match(html, /href=["']app-audio\.css(?:\?[^"']*)?["']/i, '音效模块样式');
  assert.match(html, /href=["']battle\.css(?:\?[^"']*)?["']/i, '复用 battle 的对话框与 toast 样式');
  assert.match(html, /href=["']game\.css(?:\?[^"']*)?["']/i);
});

test('game.html：场景/HUD（星星/进度/护盾/词球/连击）/对话框/支援/横幅控件齐备', () => {
  const html = read('game.html');
  for (const id of [
    'game-world', 'game-backdrop', 'game-entities', 'game-projectiles', 'game-particles',
    'game-stars', 'game-progress', 'game-shields', 'game-carried', 'game-combo',
    'game-hint', 'game-exit', 'game-banner', 'game-banner-title', 'game-supports', 'game-hintcard', 'game-typepad',
    'game-joystick', 'game-route', 'game-dialogue', 'game-dialogue-face', 'game-dialogue-kicker', 'game-dialogue-name',
    'game-dialogue-en', 'game-dialogue-zh', 'game-dialogue-choices', 'game-dialogue-next', 'game-dialogue-close',
    'game-bossgate', 'game-pause', 'game-gate', 'game-toast',
  ]) {
    assert.match(html, new RegExp(`id="${id}"`), id);
  }
});

test('game.js：只使用两个 battle 存储键，无危险 API', () => {
  const js = read('game.js');
  const keys = [...js.matchAll(/bookplay_[a-z_0-9]+/g)].map((m) => m[0]);
  assert.deepEqual([...new Set(keys)].sort(), ['bookplay_battle_collection_v1', 'bookplay_battle_progress_v1', 'bookplay_dex_v1', 'bookplay_weak_v1']);
  assert.doesNotMatch(js, /\beval\s*\(|new Function\s*\(|document\.write/);
});

test('game.js：复用 battle-core 的出题/判定/精灵解析', () => {
  const js = read('game.js');
  for (const fn of ['buildLevel', 'buildWaveQuestions', 'buildOrbSet', 'judgeHit', 'loadSprites']) {
    assert.match(js, new RegExp(`\\.${fn}\\(`), fn);
  }
  assert.match(js, /BookPlayBattleCore/);
  assert.match(js, /BookPlayGameCore/);
});

test('game.js：对话层提供显式关闭并清理语音、锁定和弹层内容', () => {
  const js = read('game.js');
  assert.match(js, /function closeDialogue\(/);
  assert.match(js, /closeDialogue\(\)/);
  assert.match(js, /stopGameAudio\("close"\)/);
  assert.match(js, /els\.dialogue\.hidden = true/);
  assert.match(js, /state\.locked = false/);
});

test('game.js：NPC 答完点继续也会刷下一波，不依赖 choiceResolved 仍为 true', () => {
  const js = read('game.js');
  const start = js.indexOf('function closeDialogue(');
  const end = js.indexOf('function openBossGate(');
  assert.ok(start >= 0 && end > start, 'closeDialogue must precede openBossGate');
  const closeFn = js.slice(start, end);
  assert.match(closeFn, /state\.pendingWave/);
  assert.match(closeFn, /state\.npcDone/);
  assert.match(closeFn, /spawnWave\(/);
  assert.doesNotMatch(
    closeFn,
    /dlg && dlg\.choiceResolved && state\.pendingWave/,
    'advanceDialogue 会先把 choiceResolved 清掉，关对话不能再拿它当刷波条件',
  );
});

test('game.js：对话继续按钮只绑定一次，避免一次点击跳过两句', () => {
  const js = read('game.js');
  const bindings = js.match(/els\.dialogueNext\.addEventListener\("click", advanceDialogue\);/g) || [];
  assert.equal(bindings.length, 1);
});

test('game.js：主角与小怪使用提速后的行走档位，并按运动方向切换四向走路资源', () => {
  const js = read('game.js');
  const coreJs = read('game-core.js');
  assert.match(js, /MOVEMENT_SPEEDS/);
  assert.match(js, /setMonsterDir/);
  assert.match(js, /directionFromDelta/);
  assert.match(coreJs, /hero:\s*0\.6/);
  assert.match(coreJs, /monsterWander:\s*0\.12/);
  assert.match(coreJs, /monsterChase:\s*0\.28/);
  assert.match(js, /monsterIntent/);
  assert.match(js, /windupUntil/);
  assert.match(js, /setHeroDir\(moved\.facing\)/);
  assert.match(js, /setMonsterDir\(m, Game\.directionFromDelta/);
});

test('开战 URL skip 含 quiz，避免战斗页再跑整套关底测验', () => {
  const js = read('game.js');
  assert.match(js, /skip=intro,preview,waves,quiz&from=\$\{FROM_LESSON \? "lesson" : "game"\}/);
});

test('from=lesson 被读取，且不当成 from=battle 跳过开场', () => {
  const js = read('game.js');
  assert.match(js, /FROM_LESSON = params.get\("from"\) === "lesson"/);
  assert.match(js, /FROM_LESSON/);
  assert.match(js, /Game\.shouldAutoIntro\(FROM_BATTLE, state\.introAutoPlayed\)/);
  assert.doesNotMatch(js, /shouldAutoIntro\(FROM_LESSON/);
});

test('from=lesson 退出和通关回到 lesson.html，开战带 from=lesson', () => {
  const js = read('game.js');
  assert.match(js, /function leaveUrl\(/);
  assert.match(js, /FROM_LESSON \? `lesson\.html\?ep=\$\{EP\}` : "map\.html"/);
  assert.match(js, /from=\$\{FROM_LESSON \? "lesson" : "game"\}/);
  assert.match(js, /navigateGame\(leaveUrl\(\)\)/);
});

test('quiz NPC 优先使用本集官方测验选项', () => {
  const js = read('game.js');
  assert.match(js, /line\.options/);
  assert.match(js, /function resolveNpcAuthoredChoice\(/);
  assert.match(js, /opt\.correct/);
});

test('本集冻最多 10 词，问答可点不会且不算错', () => {
  const js = read('game.js');
  assert.match(js, /function freezeLevel\(/);
  assert.match(js, /Game\.freezeSessionCards/);
  assert.match(js, /Game\.applyFrozenLevel/);
  assert.match(js, /Game\.SESSION_CARD_LIMIT/);
  assert.match(js, /function skipNpcChoice\(/);
  assert.match(js, /skipped: true/);
  assert.match(js, /sessionCards \|\| state\.level\.previewWords/);
});

test('空手点小妖只预习词卡，不投掷', () => {
  const js = read('game.js');
  assert.match(js, /function previewMonsterWord\(/);
  assert.match(js, /if \(!state\.carried\) \{\s*previewMonsterWord\(monster\);/);
  assert.match(js, /near && near\.kind === "monster"\) previewMonsterWord\(near\.ref\)/);
  assert.doesNotMatch(js, /先走到中文词球上捡起一颗/);
  assert.doesNotMatch(js, /先捡一颗中文词球/);
});

test('持球时可用键盘跟打英文并自动投向对应小怪', () => {
  const js = read('game.js');
  const coreJs = read('game-core.js');
  assert.match(coreJs, /function typingStep\(/);
  assert.match(js, /typingMode: \(\) => Boolean\(state\.carried && state\.carried\.term\)/);
  assert.match(js, /onType: onTypeCarried/);
  assert.match(js, /function onTypeCarried\(/);
});

test('game.js：4×4 每格一屏，镜头锁在当前格避免拼缝', () => {
  const js = read('game.js');
  assert.match(js, /function tileCamera\(/);
  assert.match(js, /Math\.floor\(fx \/ vf\)/);
});

test('game.js：4×4 世界按视口平铺完整场景，而不是把一张图拉成整张大世界', () => {
  const js = read('game.js');
  assert.match(js, /100 \/ (tiles|world)/);
  assert.match(js, /backgroundRepeat = "repeat"/);
});

test('game.js：每集优先加载 epN 背景，缺文件再回退主题图', () => {
  const js = read('game.js');
  assert.match(js, /game-backgrounds\/ep\$\{EP\}\.jpg/);
  assert.match(js, /game-backgrounds\/\$\{theme\}\.jpg/);
});

test('game.js：悟空左右走用原始 walk PNG 循环，坏图时不拆掉 img 节点', () => {
  const js = read('game.js');
  assert.match(js, /WUKONG_WALK_PNG/);
  assert.match(js, /wukong-walk-0/);
  assert.doesNotMatch(js, /img\.replaceWith\(/);
  assert.match(js, /setHeroPose\("idle"\)/);
});

test('game.js：步行资源不复用混合挥棒 walk-action 资源', () => {
  const registry = JSON.parse(readFileSync(join(here, '..', '..', 'content', 'game', 'sprites.json'), 'utf8'));
  for (const entry of Object.values(registry.sprites)) {
    for (const path of Object.values(entry.walkGifs || {})) {
      assert.doesNotMatch(String(path), /walk-action/i);
    }
    for (const [dir, path] of Object.entries(entry.attackGifs || {})) {
      assert.notEqual(path, entry.walkGifs?.[dir], `${dir} attack must be separate from walk`);
    }
  }
});

test('game.js：主角与小怪的行走、待机与攻击使用独立精灵；攻击期间不继续移动', () => {
  const js = read('game.js');
  assert.match(js, /function spriteForPose\(/);
  assert.match(js, /idleFrames/);
  assert.match(js, /attackGifs/);
  assert.match(js, /function setHeroPose\(/);
  assert.match(js, /function setMonsterPose\(/);
  assert.match(js, /state\.hero\.attackUntil/);
  assert.match(js, /if \(performance\.now\(\) < state\.hero\.attackUntil\) return/);
  assert.match(js, /if \(now < m\.attackUntil\) \{\s*m\.moving = false;[\s\S]*?return;/);
  assert.match(js, /setMonsterPose\(monster, "attack"\)/);
  assert.match(js, /m\.moving = true;\s*setMonsterDir\(/);
  assert.match(js, /m\.moving = false;\s*setMonsterDir\([\s\S]*?setMonsterPose\(m, "idle"\)/);
  assert.match(js, /windupUntil/);
  assert.match(js, /if \(stillClose && !state\.locked\) monsterAttack\(m\)/, '小怪出招帧不得继续走位');
});

test('game.js：实体步进调用视口补偿，横竖移动在 16:9 下不变速', () => {
  const js = read('game.js');
  assert.match(js, /moveStepViewport\(dx, dy, speed, dt \/ 1000, \{ width: state\.vw, height: state\.vh \}\)/);
  assert.match(js, /moveStepViewport\(dx \/ dist, dy \/ dist, speed, dt \/ 1000, \{ width: state\.vw, height: state\.vh \}\)/);
});

test('game.js：本集三站路线可点，对话保留官方选项', () => {
  const js = read('game.js');
  const html = read('game.html');
  assert.match(js, /function refreshRoute\(/);
  assert.match(js, /function onRouteStop\(/);
  assert.match(html, /id="game-route"/);
  assert.match(html, /data-stop="wave1"/);
});

test('game.js：开场 NPC 走近自动对话一次，from=battle 不重弹；quiz 不自动开', () => {
  const js = read('game.js');
  assert.match(js, /introAutoPlayed:\s*false/);
  assert.match(js, /state\.introAutoPlayed = true;\s*openDialogue\(introNpc\)/);
  assert.doesNotMatch(js, /showBanner\("剧情提示"/);
  assert.match(js, /els\.dialogue\.hidden = true;\s*state\.locked = false/);
  assert.match(js, /Game\.shouldAutoIntro\(FROM_BATTLE, state\.introAutoPlayed\)/);
});

test('game.js：六种支援由击败小怪后掉在地图，靠近拾取而非直接塞入工具栏', () => {
  const js = read('game.js');
  const css = read('game.css');
  assert.match(js, /function maybeDrop\(/);
  assert.match(js, /state\.supportDrops\.push\(drop\)/);
  assert.match(js, /function updateSupportDrops\(/);
  assert.match(js, /Math\.hypot\(state\.hero\.x - drop\.x, state\.hero\.y - drop\.y\)/);
  assert.match(js, /Game\.addItem\(state\.items, drop\.type\)/);
  assert.match(css, /\.game-support-drop/);
});

test('game.js：只运行当前波次，使用关卡地图坐标，并按 NPC → 下一波 → Boss 门控', () => {
  const js = read('game.js');
  assert.match(js, /active:\s*false/);
  assert.match(js, /if \(!m\.alive \|\| !m\.active\) return/);
  assert.match(js, /map\.heroSpawn/);
  assert.match(js, /map\.monsterSpawns/);
  assert.match(js, /map\.bossSpot/);
  assert.match(js, /nextMapStage/);
  assert.match(js, /canOpenBoss/);
});

test('game.js：地图坐标、波次点位与可行走范围由关卡数据消费', () => {
  const js = read('game.js');
  assert.match(js, /coordinateSpace/);
  assert.match(js, /waveSpawns/);
  assert.match(js, /walkable/);
  assert.match(js, /function mapPoint\(/);
});

test('game.js：NPC 对话优先消费关卡 dialogue，并保留稳定台词引用', () => {
  const js = read('game.js');
  assert.match(js, /npcDialogue/);
  assert.match(js, /sourceNodeId/);
  assert.match(js, /audioRef/);
});

test('game.js：游戏语音使用静态索引适配器，支持重听与下一句取消', () => {
  const js = read('game.js');
  assert.match(js, /BookPlayGameAudio/);
  assert.match(js, /audioIndex/);
  assert.match(js, /dialogueReplay/);
  assert.match(js, /\.replay\(/);
  assert.match(js, /stopGameAudio\("next"\)/);
  assert.match(js, /function kickVoice\(/);
  assert.match(js, /voicePending/);
  assert.match(js, /BookPlayAudio\?\.unlock/);
  assert.match(js, /pickups, dexJson, audioIndex/);
  assert.doesNotMatch(js, /pickups, audioIndex, dexJson/);
});

test('game.js：type-lock 未跟打完不投掷，gourd-seek 走 seekAutoAim', () => {
  const js = read('game.js');
  assert.match(js, /Game\.throwLocked\(state\.playVerb, state\.carried, state\.carried\.term\)/);
  assert.match(js, /function renderTypePad\(/);
  assert.match(js, /Game\.seekAutoAim\(state\.playVerb, state\.buffs\)/);
  assert.match(js, /attackUntil = performance\.now\(\) \+ 620/);
  assert.match(js, /playVerb === "type-lock"/);
  assert.match(js, /playVerb === "gourd-seek"/);
  assert.match(js, /playVerb === "fan-blow"/);
  assert.match(js, /playVerb === "fire-ward"/);
  assert.match(js, /Game\.chooseFanTarget/);
  assert.match(js, /Game\.fireTooClose/);
  assert.match(js, /function updatePlotVfx\(/);
  assert.match(js, /is-burning/);
  assert.match(js, /is-fan-aim/);
  const css = read('game.css');
  assert.match(css, /\.game-entity\.is-burning/);
  assert.match(css, /\.game-entity\.is-fan-aim/);
  const ep8 = read('../data/game/levels/ep8.json');
  assert.match(ep8, /"playVerb": "type-lock"/);
  assert.match(read('../data/game/levels/ep4.json'), /"playVerb": "type-lock"/);
  assert.doesNotMatch(read('../data/game/levels/ep9.json'), /"playVerb": "type-lock"/);
  const ep40 = read('../data/game/levels/ep40.json');
  assert.match(ep40, /"playVerb": "gourd-seek"/);
  assert.match(read('../data/game/levels/ep29.json'), /"playVerb": "gourd-seek"/);
  assert.doesNotMatch(read('../data/game/levels/ep41.json'), /"playVerb": "gourd-seek"/);
  assert.match(read('../data/game/levels/ep2.json'), /"playVerb": "listen-rings"/);
  assert.match(read('../data/game/levels/ep73.json'), /"playVerb": "listen-rings"/);
  assert.match(read('../data/game/levels/ep77.json'), /"playVerb": "fan-blow"/);
  assert.match(read('../data/game/levels/ep25.json'), /"playVerb": "fan-blow"/);
  assert.match(read('../data/game/levels/ep50.json'), /"playVerb": "fire-ward"/);
  assert.match(read('../data/game/levels/ep79.json'), /"playVerb": "fire-ward"/);
  assert.match(read('../data/game/levels/ep74.json'), /"playVerb": "listen-rings"/);
  assert.doesNotMatch(read('../data/game/levels/ep14.json'), /"playVerb": "listen-rings"/);
  assert.match(css, /\.game-typepad/);
  assert.match(css, /\.game-typekey/);
});

test('game.js：命中特效与托盘图标走键控 PNG，不再纯 emoji 星星', () => {
  const js = read('game.js');
  const css = read('game.css');
  const core = read('game-core.js');
  assert.match(js, /const dist = Math\.hypot\(dx, dy\);/);
  assert.match(js, /function spawnFx\(/);
  assert.match(js, /fx-staff-impact\.png/);
  assert.match(js, /fx-star-burst\.png/);
  assert.doesNotMatch(js, /spawnFx\("bonk"/);
  assert.match(js, /function updateTargetArrow\(/);
  assert.match(js, /pose === "hurt"/);
  assert.match(core, /support-peach\.png/);
  assert.match(css, /\.game-fx-stamp/);
  assert.match(css, /\.game-target-arrow/);
});

test('game.js：listen-rings 走 game-core playVerb，走入匹配光环才收怪', () => {
  const js = read('game.js');
  assert.match(js, /Game\.resolvePlayVerb\(rawLevel\)/);
  assert.match(js, /function syncListenRings\(/);
  assert.match(js, /function updateListenRings\(/);
  assert.match(js, /Game\.chooseListenRing\(state\.listenRings, state\.listenSpoken\)/);
  assert.match(js, /Game\.listenRingWalkHit\(state\.hero, hit, ORB_PICKUP\)/);
  const css = read('game.css');
  assert.match(css, /\.game-listen-ring/);
  const ep2 = read('../data/game/levels/ep2.json');
  assert.match(ep2, /"playVerb": "listen-rings"/);
});

test('game.js：对话、暂停和切页统一停止静态语音与 TTS 回退', () => {
  const js = read('game.js');
  assert.match(js, /function stopGameAudio\(reason\)/);
  assert.match(js, /audioEl\.pause\(\)/);
  assert.match(js, /stopGameAudio\("next"\)/);
  assert.match(js, /stopGameAudio\("close"\)/);
  assert.match(js, /stopGameAudio\("pause"\)/);
  assert.match(js, /stopGameAudio\("navigation"\)/);
  assert.match(js, /visibilitychange.*stopGameAudio|stopGameAudio.*visibilitychange/s);
});

test('game.js：已完成地图再次点击 Boss 时只显示完成面板，不重开战斗', () => {
  const js = read('game.js');
  assert.match(js, /if \(Game\.isMapRunComplete\(state\.mapStage\)\) \{\s*showCompletedRun\(\);\s*return;\s*\}/);
});

test('game.js：通关后可以继续逛，完成面板可关掉', () => {
  const js = read('game.js');
  assert.match(js, /继续逛地图/);
  assert.match(js, /本集已完成，可以继续逛/);
  assert.doesNotMatch(js, /if \(state\.mapStage === "complete"\) \{\s*showCompletedRun\(\);/);
});

test('game.js / tv-remote.js：探索时方向键只移动人物，弹层打开后才恢复焦点导航', () => {
  const js = read('game.js');
  const tv = read('tv-remote.js');
  assert.match(js, /BookPlayDirectionalInputActive/);
  assert.match(tv, /BookPlayDirectionalInputActive/);
});

test('Android 大地图运行副本与浏览器版共享慢速四向/攻防契约', () => {
  const root = dirname(here);
  const androidRoot = join(root, '..', 'android', 'app', 'src', 'main', 'assets', 'engine');
  const androidGame = readFileSync(join(androidRoot, 'game.js'), 'utf8');
  const androidHtml = readFileSync(join(androidRoot, 'game.html'), 'utf8');
  const androidCss = readFileSync(join(androidRoot, 'game.css'), 'utf8');
  const androidCore = readFileSync(join(androidRoot, 'game-core.js'), 'utf8');
  assert.match(androidHtml, /<script src="game-input\.js(?:\?[^\"]*)?"><\/script>/);
  assert.match(androidGame, /MOVEMENT_SPEEDS/);
  assert.match(androidGame, /function spriteForPose\(/);
  assert.match(androidGame, /function setMonsterPose\(/);
  assert.match(androidGame, /attackUntil/);
  assert.match(androidGame, /function tileCamera\(/);
  // 2026-09-12 用户反馈提速后的行走档位（0.6 屏/秒档）
  assert.match(androidCore, /hero:\s*0\.6/);
  assert.match(androidCore, /monsterWander:\s*0\.12/);
  assert.match(androidCore, /monsterChase:\s*0\.28/);
  assert.match(androidCss, /\[hidden\]\s*\{[^}]*display\s*:\s*none\s*!important/);
  assert.match(androidCss, /width\s*:\s*400%/);
});

test('Android 精灵注册表提供 idle / walk / attack 三态四向资源', () => {
  const registry = JSON.parse(readFileSync(join(dirname(here), '..', 'content', 'game', 'sprites.json'), 'utf8'));
  const androidRegistry = JSON.parse(readFileSync(join(dirname(here), '..', 'android', 'app', 'src', 'main', 'assets', 'data', 'game', 'sprites.json'), 'utf8'));
  for (const id of ['wukong', 'monkey-minor', 'chaosdemon-minion']) {
    const source = registry.sprites[id];
    const embedded = androidRegistry.sprites[id];
    assert.ok(source && embedded, id);
    assert.deepEqual(Object.keys(embedded.idleFrames || {}).sort(), ['east', 'north', 'south', 'west'], `${id} idle`);
    assert.deepEqual(Object.keys(embedded.walkGifs || {}).sort(), ['east', 'north', 'south', 'west'], `${id} walk`);
    assert.deepEqual(Object.keys(embedded.attackGifs || {}).sort(), ['east', 'north', 'south', 'west'], `${id} attack`);
  }
});

test('game.js：六种西游支援与 NPC 门控，大地图无快卡', () => {
  const js = read('game.js');
  const coreJs = read('game-core.js');
  for (const id of ['peach', 'fan', 'gourd', 'cloud', 'mantra', 'staff']) {
    assert.match(coreJs, new RegExp(`"${id}"`), id);
  }
  assert.match(js, /SUPPORT_DEFS|nextDropType|applySupportUse|canTalkQuizNpc|shouldAutoIntro/);
  assert.match(js, /canTalkQuizNpc/);
  assert.match(js, /shouldAutoIntro/);
  assert.doesNotMatch(js, /flashcard/);
  assert.doesNotMatch(coreJs, /flashcard/);
});

test('game.js：词球飞向点中的小妖，词牌不对则弹回；葫芦才自动找对怪', () => {
  const js = read('game.js');
  const coreJs = read('game-core.js');
  assert.match(js, /function pickRunWords\(/);
  assert.match(js, /function matchingMonster\(/);
  assert.match(js, /Game\.chooseThrowTarget\(monster, matched, aim\.armed\)/);
  assert.match(js, /Game\.wordTagHits\(state\.carried\.zh, target\.zh\)/);
  assert.doesNotMatch(js, /let target = matched \|\| monster/);
  assert.match(coreJs, /function chooseThrowTarget\(/);
  assert.match(js, /HERO_INVULN = 2400/);
  assert.match(js, /ATTACK_CD = Game\.MONSTER_AI\.attackCd/);
  assert.match(js, /SHOT_HIT = 0\.18 \* NU/);
});

test('game.js：小怪追击按满速方向走，不把世界距离当成摇杆幅度', () => {
  const js = read('game.js');
  assert.match(js, /moveStepViewport\(dx \/ dist, dy \/ dist/);
  assert.match(js, /setMonsterDir\(m, moved\.facing \|\| Game\.directionFromDelta\(dx, dy, m\.dir\)\)/);
  assert.match(js, /directionFromDelta\(state\.hero\.x - m\.x, state\.hero\.y - m\.y, "west"\)/);
  assert.match(js, /if \(state\.locked\) \{[\s\S]*?updateMonsters\(dt, now\);\s*return;/);
});

test('game.js：投掷道具按 pickups.json 换图，不写死蟠桃 emoji', () => {
  const js = read('game.js');
  const html = read('game.html');
  assert.match(js, /resolvePickup\(pickups, EP\)/);
  assert.match(js, /function pickupFruitHtml\(/);
  assert.match(js, /function bindPickupImage\(/);
  assert.match(js, /game-orb-fruit-img/);
  assert.match(js, /pickups\.json/);
  assert.doesNotMatch(js, /innerHTML = `<span class="game-orb-fruit" aria-hidden="true">🍑/);
});

test('game.js：蟠桃词球与英文小怪分两侧出生，小怪会朝玩家靠近', () => {
  const js = read('game.js');
  assert.match(js, /SLOT_ORBS = \[\[0\.22, 0\.50\]/);
  assert.match(js, /SLOT_MONSTERS = \[\[0\.62, 0\.46\]/);
  assert.match(js, /game-orb-fruit/);
  assert.match(js, /unique slot around the hero/);
  assert.match(js, /Game\.chaseAnchor\(/);
  assert.match(js, /Game\.packSeparation\(/);
  assert.match(js, /Game\.spreadPack\(/);
});

test('game.js：点击词球的自动寻路停止点落在拾取半径内', () => {
  const js = read('game.js');
  // TARGET_STOP/ORB_PICKUP 已改为 let：boot 按关卡 worldTiles 重算（recomputeTuning）
  assert.match(js, /let ORB_PICKUP = 0\.11 \* NU/);
  assert.match(js, /let TARGET_STOP = ORB_PICKUP \* 0\.45/);
  assert.match(js, /TARGET_STOP = ORB_PICKUP \* 0\.45;/);
  assert.match(js, /if \(dist < TARGET_STOP\)/);
});

test('game.js：无摇杆时先走 walkTo，不先 idle 把寻路清掉', () => {
  const js = read('game.js');
  const update = js.slice(js.indexOf('function updateHero('), js.indexOf('function updateMonsters('));
  assert.match(update, /else if \(state\.hero\.tx != null\)/);
  assert.doesNotMatch(
    update,
    /else \{\s*state\.hero\.moving = false;\s*setHeroPose\("idle"\);\s*\}\s*if \(state\.hero\.tx != null/,
  );
});

test('game.js：walkTo 按满速方向走，不用剩余距离当摇杆幅度', () => {
  const js = read('game.js');
  const update = js.slice(js.indexOf('function updateHero('), js.indexOf('function updateMonsters('));
  assert.match(update, /moveHeroBy\(dx \/ dist, dy \/ dist/);
});

test('game.js：投掷物保留词球引用，答错或超时会把词球落回地图', () => {
  const js = read('game.js');
  assert.match(js, /function dropOrbAt\(x, y, orbRef\)/);
  assert.match(js, /const thrownOrb = state\.orbs\.find\(/);
  assert.match(js, /orb: thrownOrb/);
  assert.match(js, /dropOrbAt\(shot\.x, shot\.y, shot\.orb\)/);
});

test('game.js：词球槽位避开顶部 HUD，第二颗不被提示/暂停按钮盖住', () => {
  const js = read('game.js');
  assert.match(js, /const SLOT_ORBS = \[\[0\.22, 0\.50\], \[0\.32, 0\.62\]/);
});

test('game.css：命中高度不低于 64px 且尊重 reduced motion', () => {
  const css = read('game.css');
  assert.match(css, /min-height\s*:\s*64px/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /width\s*:\s*400%/);
  assert.match(css, /height\s*:\s*400%/);
});

test('game.css：词球和地图掉落可点击，不会穿透到下方 NPC', () => {
  const css = read('game.css');
  assert.match(css, /\.game-orb\s*\{[^}]*pointer-events\s*:\s*auto/);
  assert.match(css, /\.game-support-drop\s*\{[^}]*pointer-events\s*:\s*auto/);
});

test('game.css：重叠时小怪词牌层级高于 NPC，点击不会误开剧情', () => {
  const css = read('game.css');
  assert.match(css, /\.game-entity\.is-monster\s*\{[^}]*z-index\s*:\s*4/);
});

test('game.css：对话框放在顶部，避免盖住地面上的主角', () => {
  const css = read('game.css');
  assert.match(css, /\.game-dialogue\s*\{[^}]*top\s*:/);
  assert.doesNotMatch(css, /\.game-dialogue\s*\{[^}]*bottom\s*:\s*calc/);
  assert.match(css, /\.game-entity\.is-hero\s*\{[^}]*z-index\s*:\s*6/);
});

test('game.css：hidden 对话/弹层不会被 display 规则重新显示', () => {
  const css = read('game.css');
  assert.match(css, /\[hidden\]\s*\{[^}]*display\s*:\s*none\s*!important/);
});

test('game.html：无内联事件处理器', () => {
  const html = read('game.html');
  assert.doesNotMatch(html, /\son[a-z]+\s*=/i);
});
