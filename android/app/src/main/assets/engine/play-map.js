"use strict";

/* X35S 降妖记选关：不读绘本/听力，不弹学习层。合辑写死，关卡进 game.html。 */
var COLLECTIONS = [
  { id: "c01", zh: "花果山出世", from: 1, to: 7 },
  { id: "c02", zh: "大闹天宫", from: 8, to: 13 },
  { id: "c03", zh: "取经启程", from: 14, to: 23 },
  { id: "c04", zh: "黄风与人参果", from: 24, to: 31 },
  { id: "c05", zh: "白骨夫人", from: 32, to: 39 },
  { id: "c06", zh: "金角银角", from: 40, to: 48 },
  { id: "c07", zh: "红孩儿", from: 49, to: 54 },
  { id: "c08", zh: "车迟国斗法", from: 55, to: 63 },
  { id: "c09", zh: "金箍与星君", from: 64, to: 71 },
  { id: "c10", zh: "真假美猴王", from: 72, to: 79 },
  { id: "c11", zh: "小雷音与蜘蛛精", from: 80, to: 91 },
  { id: "c12", zh: "狮驼岭三妖", from: 92, to: 99 },
  { id: "c13", zh: "灵山取经", from: 100, to: 108 }
];

function coverRange(list) {
  var seen = {};
  list.forEach(function (c) {
    var n;
    for (n = c.from; n <= c.to; n += 1) seen[n] = true;
  });
  var missing = [];
  var n;
  for (n = 1; n <= 108; n += 1) if (!seen[n]) missing.push(n);
  return missing;
}

if (typeof module === "object" && module.exports) {
  module.exports = { COLLECTIONS: COLLECTIONS, coverRange: coverRange };
} else {
  (function () {
    var at = 0;
    var params = new URLSearchParams(location.search);
    var want = Number(params.get("c") || params.get("col") || 0);
    if (want >= 1 && want <= COLLECTIONS.length) at = want - 1;
    var title = document.getElementById("col-title");
    var grid = document.getElementById("eps");
    var prev = document.getElementById("prev");
    var next = document.getElementById("next");

    function render() {
      var col = COLLECTIONS[at];
      title.textContent = col.zh + " · " + col.from + "–" + col.to + "集";
      prev.disabled = at === 0;
      next.disabled = at === COLLECTIONS.length - 1;
      var html = "";
      var n;
      for (n = col.from; n <= col.to; n += 1) {
        html += '<a class="play-ep" href="game.html?ep=' + n + '">第' + n + "集</a>";
      }
      grid.innerHTML = html;
      var first = grid.querySelector(".play-ep");
      if (first) first.focus();
    }

    prev.addEventListener("click", function () {
      if (at > 0) { at -= 1; render(); }
    });
    next.addEventListener("click", function () {
      if (at < COLLECTIONS.length - 1) { at += 1; render(); }
    });
    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape") {
        ev.preventDefault();
        if (at > 0) { at -= 1; render(); }
      }
    });
    render();
  })();
}
