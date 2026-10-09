"use strict";

/* 花果山挥棒的纯规则：打中就掉血，词对上这一下更重，对不上仍是击退。
 * 无 DOM。页面见 game.js。
 */
(function expose(root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.HuaguoFight = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function fightRulesFactory() {
  var REACH = 240;

  function dist(a, b) {
    var dx = a.x - b.x;
    var dz = a.z - b.z;
    return Math.sqrt(dx * dx + dz * dz);
  }

  function swing(fight, level) {
    if (!fight || !fight.running || fight.hero.cool > 0) return null;
    var hero = fight.hero;
    hero.cool = 280;
    hero.swing = 480;
    var best = null;
    var bestD = REACH;
    for (var i = 0; i < fight.foes.length; i++) {
      var foe = fight.foes[i];
      var gap = dist(foe, hero);
      if (gap < bestD) {
        best = foe;
        bestD = gap;
      }
    }
    if (!best) return { hit: false };
    hero.facing = Math.atan2(best.z - hero.z, best.x - hero.x);
    var word = level.words[fight.move];
    var match = best.word.en === word.en;
    var dmg = best.boss ? 1 : (match ? best.hp : 1);
    best.hp -= dmg;
    var away = bestD || 1;
    var knock = match ? 340 : 200;
    best.vx = (best.x - hero.x) / away * knock;
    best.vz = (best.z - hero.z) / away * knock;
    return {
      hit: true,
      foe: best,
      x: best.x,
      z: best.z,
      text: match ? best.word.zh : "击退",
      killed: best.hp <= 0
    };
  }

  function advanceMove(fight, level) {
    if (!fight || fight.phase !== "wave") return false;
    var en = level.words[fight.move].en;
    for (var i = 0; i < fight.foes.length; i++) {
      if (fight.foes[i].word.en === en) return false;
    }
    return true;
  }

  function defeat(fight, foe, level) {
    var at = fight.foes.indexOf(foe);
    if (at >= 0) fight.foes.splice(at, 1);
    if (foe.boss) {
      fight.running = false;
      fight.phase = "win";
      return { type: "win" };
    }
    fight.got += 1;
    if (fight.got < fight.need) {
      return {
        type: "progress",
        label: "第 " + (fight.wave + 1) + " 波 · 击退 " + fight.got + "/" + fight.need
      };
    }
    var leftoverFoes = fight.foes;
    var leftoverShots = fight.shots;
    fight.foes = [];
    fight.shots = [];
    if (fight.wave === 0) {
      fight.wave = 1;
      fight.got = 0;
      fight.need = level.waves[1].quota;
      return {
        type: "wave",
        label: "第 2 波 · 击退 0/" + fight.need,
        banner: "第二波，猴子更耐打",
        leftoverFoes: leftoverFoes,
        leftoverShots: leftoverShots
      };
    }
    fight.phase = "countdown";
    fight.count = level.countdownSec;
    return {
      type: "countdown",
      banner: level.bossName + " " + level.countdownSec + " 秒后上岸",
      leftoverFoes: leftoverFoes,
      leftoverShots: leftoverShots
    };
  }

  function hurt(fight) {
    if (!fight || !fight.running) return { hurt: false };
    var hero = fight.hero;
    if (fight.calm > 0 || hero.inv > 0 || hero.hop > 0) return { hurt: false };
    fight.lives -= 1;
    hero.inv = 1100;
    if (fight.lives <= 0) {
      fight.running = false;
      fight.phase = "lose";
      return { hurt: true, lost: true, lives: fight.lives };
    }
    return { hurt: true, lost: false, lives: fight.lives };
  }

  return { swing: swing, advanceMove: advanceMove, defeat: defeat, hurt: hurt };
});
