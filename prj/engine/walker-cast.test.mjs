import test from "node:test";
import assert from "node:assert/strict";
import cast from "./walker-cast.js";

test("resolve returns the generated walker gif the APK actually ships", () => {
  const role = cast.resolve({ title: { en: "The Monkey", zh: "西游记 第1集" } }, 1);
  assert.equal(role.id, "wukong");
  assert.equal(role.gif, cast.WALKING_CAST.wukong.gif);
  assert.match(role.gif, /^assets\/generated\/jttw-player-walkers\/wukong\//);
  assert.doesNotMatch(role.gif, /walker-gifs/);
});

test("title scoring also uses the packed generated gif path", () => {
  const role = cast.resolve({ title: { en: "Red Boy", zh: "红孩儿" } });
  assert.equal(role.id, "redboy");
  assert.equal(role.gif, cast.WALKING_CAST.redboy.gif);
  assert.doesNotMatch(role.gif, /walker-gifs/);
});
