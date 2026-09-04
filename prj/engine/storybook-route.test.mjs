import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const modulePath = new URL("./storybook-route.js", import.meta.url);

test("defaults to the existing Journey to the West reader", () => {
  assert.equal(fs.existsSync(modulePath), true, "storybook-route.js 尚未实现");
  const { resolveStorybookRequest } = require(fileURLToPath(modulePath));
  assert.deepEqual(resolveStorybookRequest("?ep=7"), {
    series: "jttw",
    id: 7,
    uiVariant: "legacy",
    progressKey: "jttw:7",
    dataUrl: "../data/storybooks/ep7.json",
    shelfUrl: "shelf.html",
  });
});

test("resolves a Minecraft book without colliding with episode progress", () => {
  assert.equal(fs.existsSync(modulePath), true, "storybook-route.js 尚未实现");
  const { resolveStorybookRequest } = require(fileURLToPath(modulePath));
  assert.deepEqual(resolveStorybookRequest("?series=minecraft&book=3"), {
    series: "minecraft",
    id: 3,
    uiVariant: "legacy",
    progressKey: "minecraft:3",
    dataUrl: "../data/storybooks-minecraft/book3.json",
    shelfUrl: "map.html?series=minecraft",
  });
});

test("the reader loads routing before the main controller", () => {
  const html = fs.readFileSync(new URL("./storybook.html", import.meta.url), "utf8");
  const routeAt = html.indexOf("storybook-route.js");
  const readerAt = html.indexOf("storybook.js");
  assert.ok(routeAt >= 0);
  assert.ok(readerAt > routeAt);
});

test("storybook route resolves explicit UI variants without changing progress identity", () => {
  const { resolveStorybookRequest } = require(fileURLToPath(modulePath));
  const v3 = resolveStorybookRequest("?series=minecraft&book=1&ui=unified-v3");
  const legacy = resolveStorybookRequest("?series=minecraft&book=1&ui=legacy");
  assert.equal(v3.uiVariant, "unified-v3");
  assert.equal(legacy.uiVariant, "legacy");
  assert.equal(v3.progressKey, legacy.progressKey);
});

test("v3 assets are loaded in a deterministic order and remain scoped", () => {
  const html = fs.readFileSync(new URL("./storybook.html", import.meta.url), "utf8");
  assert.ok(html.indexOf("storybook-v3.css") > html.indexOf("storybook.css"));
  assert.ok(html.indexOf("storybook-ui.js") > html.indexOf("storybook-route.js"));
  assert.ok(html.indexOf("storybook-ui.js") < html.indexOf("storybook.js"));
  const css = fs.existsSync(new URL("./storybook-v3.css", import.meta.url))
    ? fs.readFileSync(new URL("./storybook-v3.css", import.meta.url), "utf8")
    : "";
  assert.match(css, /body\.sb-ui-v3/);
  assert.doesNotMatch(css, /(?:^|\n)\s*#sb-panel\s*\{/);
});

test("unified reader exposes stable semantic learning DOM", () => {
  const html = fs.readFileSync(new URL("./storybook.html", import.meta.url), "utf8");
  for (const id of ["sb-reader-modes", "sb-unit-head", "sb-unit-progress", "sb-speaker-chip", "sb-translation-toggle", "sb-zh", "sb-bubble-locator", "sb-reader-notice"]) {
    assert.equal((html.match(new RegExp(`id=\\"${id}\\"`, "g")) || []).length, 1, `${id} must be unique`);
  }
  assert.ok(html.indexOf('id="sb-reader-modes"') < html.indexOf('id="btn-audio"'));
  assert.ok(html.indexOf('id="sb-zh"') > html.indexOf('id="sb-text"'));
  assert.ok(html.indexOf('id="sb-bubble-locator"') > html.indexOf('id="sb-stage-inner"'));
  assert.ok(html.indexOf('id="sb-reader-notice"') > html.indexOf('id="sb-panel"'));
  assert.match(html, /id="sb-bubble-locator"[^>]*aria-hidden="true"/);
  const buttons = [...html.matchAll(/<button\b[^>]*>/g)].map((m) => m[0]);
  buttons.forEach((button) => assert.match(button, /\btype="button"/, `button missing type: ${button}`));
});

test("the library exposes the Minecraft collection", () => {
  const html = fs.readFileSync(new URL("./home.html", import.meta.url), "utf8");
  assert.match(html, /map\.html\?series=minecraft/);
  assert.match(html, /我的世界/);
});

test("mobile reader uses page scrolling instead of a nested caption scrollbar", () => {
  const css = fs.readFileSync(new URL("./storybook.css", import.meta.url), "utf8");
  const mobileCss = css.slice(css.indexOf("@media (max-width: 900px)"));
  assert.match(mobileCss, /body\.storybook-split #sb-panel\s*\{[^}]*overflow:\s*visible/s);
});

test("mobile reader keeps toolbar buttons compact", () => {
  const css = fs.readFileSync(new URL("./storybook.css", import.meta.url), "utf8");
  const mobileCss = css.slice(css.indexOf("@media (max-width: 900px)"));
  assert.match(mobileCss, /#topbar button\s*\{[^}]*white-space:\s*nowrap/s);
  assert.match(mobileCss, /#btn-shelf\s*\{[^}]*white-space:\s*nowrap/s);
});

test("mobile v3 grid cannot inherit intrinsic desktop width", () => {
  const css = fs.readFileSync(new URL("./storybook-v3.css", import.meta.url), "utf8");
  assert.match(css, /body\.sb-ui-v3 \.sb-app\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/s);
  assert.match(css, /body\.sb-ui-v3 #topbar\s*\{[^}]*min-width:\s*0/s);
  assert.match(css, /body\.sb-ui-v3 #sb-panel\s*\{[^}]*width:\s*100%/s);
});

test("books without matched audio expose a disabled state", () => {
  const source = fs.readFileSync(new URL("./storybook.js", import.meta.url), "utf8");
  assert.match(source, /btnAudio\.disabled\s*=\s*true/);
  assert.match(source, /暂无原音/);
});

test("split reader keeps ~68/32 spread-to-learning ratio with contain", () => {
  const css = fs.readFileSync(new URL("./storybook.css", import.meta.url), "utf8");
  assert.match(css, /body\.storybook-split \.sb-app\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*2\.125fr\)\s+minmax\(320px,\s*1fr\)/s);
  assert.match(css, /body\.storybook-split #sb-page\s*\{[^}]*object-fit:\s*contain/s);
});

test("Mikey & JJ desktop split gives the learning column more width than the comic frame", () => {
  const v3 = fs.readFileSync(new URL("./storybook-v3.css", import.meta.url), "utf8");
  assert.match(v3, /@media \(min-width: 901px\)[\s\S]*body\.sb-ui-v3\.sb-mj \.sb-app\s*\{[^}]*grid-template-columns:\s*minmax\(260px,\s*0\.72fr\)\s+minmax\(460px,\s*1\.28fr\)/s);
  const css = fs.readFileSync(new URL("./storybook.css", import.meta.url), "utf8");
  assert.match(css, /body\.storybook-split\.sb-mj \.sb-app\s*\{[^}]*grid-template-columns:\s*minmax\(260px,\s*0\.72fr\)\s+minmax\(420px,\s*1\.28fr\)/s);
});

test("word cards render from real glossary data and stay quiet when empty", () => {
  const source = fs.readFileSync(new URL("./storybook.js", import.meta.url), "utf8");
  assert.match(source, /sb-word-card/);
  assert.match(source, /page\.glossary/);
  assert.match(source, /本页没有列出的重点词/);
});

test("sentence word DOM exposes an accessible, punctuation-safe point-read contract", () => {
  const source = fs.readFileSync(new URL("./storybook.js", import.meta.url), "utf8");
  assert.match(source, /class="sb-sentence-word"/);
  assert.match(source, /role="button"/);
  assert.match(source, /tabindex="0"/);
  assert.match(source, /data-speak/);
  assert.match(source, /data-zh/);
  assert.match(source, /bareSpeakWord/);
  assert.match(source, /ev\.stopPropagation\(\)/);
});

test("word playback cancels stale async Chinese clips before a new click", () => {
  const source = fs.readFileSync(new URL("./storybook.js", import.meta.url), "utf8");
  assert.match(source, /navigationGeneration/);
  assert.match(source, /wordGeneration/);
  assert.match(source, /pendingWordResolve/);
  assert.match(source, /function cancelWordPlayback\(\)/);
  assert.match(source, /if \(!isCurrent\(\)\) return;/);
  assert.match(source, /if \(zh && okEn === true\) await play\(zh, "zh-CN"\)/);
});

test("v3 Mikey rendering keeps the comic unobstructed and uses the caption column", () => {
  const html = fs.readFileSync(new URL("./storybook.html", import.meta.url), "utf8");
  const source = fs.readFileSync(new URL("./storybook.js", import.meta.url), "utf8");
  const css = fs.readFileSync(new URL("./storybook-v3.css", import.meta.url), "utf8");
  assert.match(html, /id="sb-bubble-locator"[^>]*aria-hidden="true"/);
  assert.match(source, /function updateBubbleLocator\(sentence\)/);
  assert.match(source, /Unified v3 keeps the comic unobstructed/,
    "v3 must keep the sentence caption in the learning column");
  assert.match(source, /bubbleEl\.hidden = true/,
    "v3 must hide the legacy bubble node");
  assert.doesNotMatch(source, /bubbleLocatorEl\.(?:innerHTML|textContent)/);
  assert.match(css, /body\.sb-ui-v3 #sb-speaking-bubble/);
  assert.match(css, /body\.sb-ui-v3 #sb-speaking-bubble\s*\{[^}]*display:\s*none\s*!important/s,
    "the popup bubble must not cover the comic in v3");
  assert.match(css, /body\.sb-ui-v3 #sb-bubble-locator\s*\{[^}]*display:\s*none/s,
    "the inaccurate PDF-coordinate red box must stay hidden in v3");
});

test("unified v3 exposes review and practice stages without reusing the right rail", () => {
  const html = fs.readFileSync(new URL("./storybook.html", import.meta.url), "utf8");
  const source = fs.readFileSync(new URL("./storybook.js", import.meta.url), "utf8");
  const css = fs.readFileSync(new URL("./storybook-v3.css", import.meta.url), "utf8");
  assert.match(html, /id="sb-review"/);
  assert.ok(html.indexOf("storybook-practice.js") < html.indexOf("storybook.js"));
  assert.match(source, /function openReview\(\)/);
  assert.match(source, /function renderPracticeResult\(\)/);
  assert.match(source, /sb-start-practice/);
  assert.match(css, /body\.sb-ui-v3\.sb-review-full/);
  assert.match(css, /body\.sb-ui-v3\.sb-practice-result-full/);
});

test("quiz renders indexed cards with lettered options and text feedback", () => {
  const source = fs.readFileSync(new URL("./storybook.js", import.meta.url), "utf8");
  const css = fs.readFileSync(new URL("./storybook.css", import.meta.url), "utf8");
  assert.match(source, /sb-quiz-index/);
  assert.match(source, /sb-quiz-option/);
  assert.match(source, /正确答案是/);
  assert.match(source, /aria-live/);
  assert.match(css, /\.sb-quiz-card/);
});

test("reader marks progress with a chip on the art stage", () => {
  const source = fs.readFileSync(new URL("./storybook.js", import.meta.url), "utf8");
  const css = fs.readFileSync(new URL("./storybook.css", import.meta.url), "utf8");
  assert.match(source, /sb-progress-chip/);
  assert.match(css, /\.sb-progress-chip/);
});

test("small screens keep 44px touch targets, 8px gaps, visible focus, reduced motion", () => {
  const css = fs.readFileSync(new URL("./storybook.css", import.meta.url), "utf8");
  const mobileCss = css.slice(css.indexOf("@media (max-width: 900px)"));
  assert.match(mobileCss, /#topbar button\s*\{[^}]*min-height:\s*44px/s);
  assert.match(mobileCss, /#sb-nav\s*\{[^}]*gap:\s*8px/s);
  assert.match(css, /:focus-visible\s*\{/);
  const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
  assert.match(reduced, /animation:\s*none/);
});

test("desktop split panel top padding clears the fixed topbar", () => {
  const css = fs.readFileSync(new URL("./storybook.css", import.meta.url), "utf8");
  const desktop = css.slice(0, css.indexOf("@media (max-width: 900px)"));
  const rule = desktop.match(/body\.storybook-split #sb-panel\s*\{([^}]*)\}/s);
  assert.ok(rule, "desktop split #sb-panel rule must exist");
  const rem = rule[1].match(/padding(?::top)?:\s*([\d.]+)rem/);
  assert.ok(rem, "desktop split #sb-panel must declare a rem-based top padding");
  const px = parseFloat(rem[1]) * 16;
  assert.ok(px > 63, `top padding ${rem[1]}rem (${px}px) must clear the 63px fixed topbar`);
});

test("minecraft sentence playback seeks per sentence and pauses at sentence end", () => {
  const source = fs.readFileSync(new URL("./storybook.js", import.meta.url), "utf8");
  assert.match(source, /sentences\[sentIdx\]/);
  assert.match(source, /end_sec - 0\.06/);
  assert.match(source, /这一句读完了/);
  assert.match(source, /Story · 第 \$\{sentIdx \+ 1\} 句 \/ 共/);
});

test("minecraft quiz opens as a fullscreen overlay with one question at a time", () => {
  const source = fs.readFileSync(new URL("./storybook.js", import.meta.url), "utf8");
  const css = fs.readFileSync(new URL("./storybook.css", import.meta.url), "utf8");
  assert.match(source, /sb-quiz-full/);
  assert.match(source, /第 \$\{quizIndex \+ 1\} 题 \/ 共 \$\{quiz\.length\} 题/);
  assert.match(css, /body\.sb-mc\.sb-quiz-full #sb-quiz\s*\{/);
  assert.match(css, /\.sb-quiz-options\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(css, /@media \(max-width: 560px\)/);
});

test("page-01 sentence clips exist and data references exact verified boundaries", () => {
  const data = JSON.parse(fs.readFileSync(new URL("../data/storybooks-minecraft/book2.json", import.meta.url), "utf8"));
  const sents = data.pages[0].sentences;
  assert.equal(sents.length, 5);
  const expected = [[166.87, 171.07], [172.39, 176.51], [178.15, 181.93], [183.09, 186.35], [187.17, 190.85]];
  sents.forEach((s, i) => {
    assert.ok(Math.abs(s.start_sec - expected[i][0]) < 1e-6);
    assert.ok(Math.abs(s.end_sec - expected[i][1]) < 1e-6);
    assert.match(s.audio, /sentences(?:-repaired)?\/page-01-sentence-0\d+\.mp3/);
    const clip = new URL("../" + s.audio, import.meta.url);
    assert.equal(fs.existsSync(clip), true, `missing clip ${s.audio}`);
  });
});

test("sentence glossary shows English /IPA/ POS -> Chinese and covers the key words", () => {
  const data = JSON.parse(fs.readFileSync(new URL("../data/storybooks-minecraft/book2.json", import.meta.url), "utf8"));
  const sents = data.pages[0].sentences;
  const terms = sents.flatMap((s) => (s.glossary || []).map((g) => g.term));
  for (const t of ["threw", "stick", "village", "pet", "plan"]) {
    assert.ok(terms.includes(t), `${t} must be covered by page-01 sentence glossaries`);
  }
  sents.forEach((s) => {
    (s.glossary || []).forEach((g) => {
      assert.ok(g.term && g.ipa && g.pos && g.zh, `missing field in ${g.term}`);
      assert.ok(g.ipa.length >= 2 && !/\s/.test(g.ipa), `ipa '${g.ipa}' must be a compact IPA string`);
    });
  });
  const source = fs.readFileSync(new URL("./storybook.js", import.meta.url), "utf8");
  assert.match(source, /sb-word-ipa-pos/);
  assert.match(source, /sb-word-arrow/);
  assert.match(source, /sb-word-zh/);
});

test("sentence mode prefers the derived clip and never reapplies absolute seconds", () => {
  const source = fs.readFileSync(new URL("./storybook.js", import.meta.url), "utf8");
  assert.match(source, /function sentenceClip/);
  assert.match(source, /audio\.currentTime\s*=\s*0/);
  assert.match(source, /if \(useSentenceMode\(\)\) return;/);
  assert.doesNotMatch(source, /sentences\[sentIdx\]\.start_sec/);
});

test("fullscreen quiz hides topbar and non-quiz UI", () => {
  const css = fs.readFileSync(new URL("./storybook.css", import.meta.url), "utf8");
  assert.match(css, /body\.sb-mc\.sb-quiz-full #topbar/);
  assert.match(css, /body\.sb-mc\.sb-quiz-full #sb-stage/);
  assert.match(css, /body\.sb-mc\.sb-quiz-full #sb-panel > :not\(#sb-quiz\)/);
});

test("every book2 page (1-15) exposes anchored sentences with valid clips", () => {
  const data = JSON.parse(fs.readFileSync(new URL("../data/storybooks-minecraft/book2.json", import.meta.url), "utf8"));
  assert.equal(data.pages.length, 15);
  data.pages.forEach((p) => {
    assert.ok(p.sentences && p.sentences.length >= 1, `page ${p.page_no} must have sentences[]`);
    p.sentences.forEach((s, i) => {
      assert.ok(s.start_sec >= 0 && s.end_sec > s.start_sec && s.end_sec <= 642, `page ${p.page_no} sentence ${i + 1} bounds`);
      assert.ok(s.text_en && s.text_en.length > 0, `page ${p.page_no} sentence ${i + 1} text`);
      const expected = `assets/minecraft/mobs-in-the-overworld/sentences/page-${String(p.page_no).padStart(2, "0")}-sentence-${String(i + 1).padStart(2, "0")}.mp3`;
      const canonical = s.audio.replace("/sentences-repaired/", "/sentences/");
      assert.equal(canonical, expected, `page ${p.page_no} sentence ${i + 1} audio path`);
      const clip = new URL("../" + s.audio, import.meta.url);
      assert.equal(fs.existsSync(clip), true, `page ${p.page_no} missing clip ${s.audio}`);
    });
  });
});

test("pages 2-15 keep 2-4 key words per page with complete, current-sentence fields", () => {
  const data = JSON.parse(fs.readFileSync(new URL("../data/storybooks-minecraft/book2.json", import.meta.url), "utf8"));
  data.pages.slice(1).forEach((p) => {
    const terms = new Set();
    p.sentences.forEach((s) => {
      (s.glossary || []).forEach((g) => {
        assert.ok(g.term && g.ipa && g.pos && g.zh, `page ${p.page_no} incomplete card ${g.term}`);
        assert.ok(g.ipa.length >= 2 && !/\s/.test(g.ipa), `page ${p.page_no} ipa '${g.ipa}'`);
        const esc = g.term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        assert.ok(new RegExp(`\\b${esc}[a-z]*\\b`, "i").test(s.text_en), `page ${p.page_no} term '${g.term}' must appear in its sentence`);
        terms.add(g.term);
      });
    });
    assert.ok(terms.size >= 2 && terms.size <= 4, `page ${p.page_no} must carry 2-4 key words, got ${terms.size}`);
  });
});

test("page 1 accepted sentences are preserved exactly", () => {
  const data = JSON.parse(fs.readFileSync(new URL("../data/storybooks-minecraft/book2.json", import.meta.url), "utf8"));
  const s1 = data.pages[0].sentences;
  assert.equal(s1.length, 5);
  const expected = [[166.87, 171.07], [172.39, 176.51], [178.15, 181.93], [183.09, 186.35], [187.17, 190.85]];
  s1.forEach((s, i) => {
    assert.ok(Math.abs(s.start_sec - expected[i][0]) < 1e-6, `p1 s${i + 1} start changed`);
    assert.ok(Math.abs(s.end_sec - expected[i][1]) < 1e-6, `p1 s${i + 1} end changed`);
  });
  const terms = s1.flatMap((s) => (s.glossary || []).map((g) => g.term));
  for (const t of ["threw", "stick", "village", "pet", "plan"]) assert.ok(terms.includes(t), `${t} missing`);
});

const ALL_BOOKS = [1, 2, 3, 4, 5];
const AUDIO_BOOKS = { 1: 540.124, 2: 641.95, 4: 571.21, 5: 583.984 };

test("all five minecraft books enable sentence mode on 15/15 pages", () => {
  [1, 2, 3, 4, 5].forEach((b) => {
    const data = JSON.parse(fs.readFileSync(new URL(`../data/storybooks-minecraft/book${b}.json`, import.meta.url), "utf8"));
    assert.equal(data.pages.length, 15, `book${b} pages`);
    data.pages.forEach((p) => {
      assert.ok(p.sentences && p.sentences.length >= 1, `book${b} page ${p.page_no} sentences[]`);
    });
  });
});

test("audio books expose valid clips with monotonic in-range boundaries", () => {
  Object.entries({ 1: 540.124, 2: 641.95, 4: 571.21, 5: 583.984 }).forEach(([bk, dur]) => {
    const b = Number(bk);
    const data = JSON.parse(fs.readFileSync(new URL(`../data/storybooks-minecraft/book${b}.json`, import.meta.url), "utf8"));
    const slug = data.audio.split("/")[2];
    let prev = 0;
    data.pages.forEach((p) => {
      p.sentences.forEach((s, i) => {
        if (s.audio_missing) {
          assert.equal("start_sec" in s, false, `book${b} p${p.page_no} s${i + 1} audio_missing start`);
          assert.equal("end_sec" in s, false, `book${b} p${p.page_no} s${i + 1} audio_missing end`);
          assert.equal("audio" in s, false, `book${b} p${p.page_no} s${i + 1} audio_missing audio`);
          return;
        }
        assert.ok(s.start_sec >= 0 && s.start_sec < s.end_sec && s.end_sec <= dur, `book${b} p${p.page_no} s${i + 1} bounds`);
        assert.ok(s.start_sec >= prev - 0.25, `book${b} p${p.page_no} s${i + 1} monotonic`);
        prev = s.end_sec;
        const expected = `assets/minecraft/${slug}/sentences/page-${String(p.page_no).padStart(2, "0")}-sentence-${String(i + 1).padStart(2, "0")}.mp3`;
        const canonical = s.audio.replace("/sentences-repaired/", "/sentences/");
        assert.equal(canonical, expected, `book${b} p${p.page_no} s${i + 1} audio`);
        const clip = new URL("../" + s.audio, import.meta.url);
        assert.equal(fs.existsSync(clip), true, `book${b} missing clip ${s.audio}`);
      });
    });
  });
});

test("book3 uses explicit Edge-TTS sentence clips without a fabricated source MP3", () => {
  const data = JSON.parse(fs.readFileSync(new URL("../data/storybooks-minecraft/book3.json", import.meta.url), "utf8"));
  assert.equal(data.audio, null);
  assert.equal(data.audio_duration_sec, null);
  assert.equal(data.audio_source, "edge-tts-sentence-clips");
  data.pages.forEach((p) => {
    p.sentences.forEach((s, i) => {
      assert.ok(s.text_en && s.text_en.length > 0, `book3 p${p.page_no}`);
      assert.equal("start_sec" in s, false, `book3 p${p.page_no} must not carry start_sec`);
      assert.equal("end_sec" in s, false, `book3 p${p.page_no} must not carry end_sec`);
      const expected = `assets/minecraft/trouble-brewing/sentences/page-${String(p.page_no).padStart(2, "0")}-sentence-${String(i + 1).padStart(2, "0")}.mp3`;
      assert.equal(s.audio, expected, `book3 p${p.page_no} s${i + 1} audio`);
      assert.equal(s.audio_source, "edge-tts");
      const clip = new URL("../" + s.audio, import.meta.url);
      assert.equal(fs.existsSync(clip), true, `book3 missing clip ${s.audio}`);
    });
  });
});

test("every page keeps 2-4 key words with complete fields inside their sentence", () => {
  [1, 3, 4, 5].forEach((b) => {
    const data = JSON.parse(fs.readFileSync(new URL(`../data/storybooks-minecraft/book${b}.json`, import.meta.url), "utf8"));
    data.pages.forEach((p) => {
      const terms = new Set();
      p.sentences.forEach((s) => {
        (s.glossary || []).forEach((g) => {
          assert.ok(g.term && g.ipa && g.pos && g.zh, `book${b} p${p.page_no} incomplete card ${g.term}`);
          assert.ok(g.ipa.length >= 2 && !/\s/.test(g.ipa), `book${b} p${p.page_no} ipa '${g.ipa}'`);
          const esc = g.term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          assert.ok(new RegExp(`\\b${esc}[a-z]*\\b`, "i").test(s.text_en), `book${b} p${p.page_no} term '${g.term}' must appear in its sentence`);
          terms.add(g.term);
        });
      });
      assert.ok(terms.size >= 2 && terms.size <= 4, `book${b} p${p.page_no} must carry 2-4 key words, got ${terms.size}`);
    });
  });
});

test("book4 marks exactly one explicit audio_missing with preserved text", () => {
  const data = JSON.parse(fs.readFileSync(new URL("../data/storybooks-minecraft/book4.json", import.meta.url), "utf8"));
  const miss = data.pages.flatMap((p) => p.sentences.filter((s) => s.audio_missing).map((s) => ({ page: p.page_no, s })));
  assert.equal(miss.length, 1, "book4 must have exactly one audio_missing sentence");
  assert.equal(miss[0].page, 13);
  assert.equal(miss[0].s.text_en, "Both illagers were defeated.");
  assert.ok(miss[0].s.audio_missing_reason && miss[0].s.audio_missing_reason.length > 1, "reason required");
  assert.equal("start_sec" in miss[0].s, false, "audio_missing must not carry start_sec");
  assert.equal("end_sec" in miss[0].s, false, "audio_missing must not carry end_sec");
  assert.equal("audio" in miss[0].s, false, "audio_missing must not carry audio");
});

test("consumer handles mixed-audio missing sentences honestly", () => {
  const source = fs.readFileSync(new URL("./storybook.js", import.meta.url), "utf8");
  assert.match(source, /本句原音缺失/);
  assert.match(source, /audio\.removeAttribute\("src"\)/);
  assert.match(source, /btnAudio\.disabled = true/);
  assert.match(source, /audio_missing_reason/);
});

test("fullscreen quiz uses the exact bundled background asset only in Minecraft rules", () => {
  const css = fs.readFileSync(new URL("./storybook.css", import.meta.url), "utf8");
  const asset = new URL("../assets/minecraft/ui/quiz-bg-v2.webp", import.meta.url);
  assert.equal(fs.existsSync(asset), true, "quiz-bg-v2.webp must exist");
  const ruleStart = css.indexOf("body.sb-mc.sb-quiz-full #sb-quiz");
  assert.ok(ruleStart >= 0, "quiz-full rule must exist");
  const ruleText = css.slice(ruleStart, css.indexOf("}", ruleStart));
  assert.match(ruleText, /url\("\.\.\/assets\/minecraft\/ui\/quiz-bg-v2\.webp"\) center \/ cover no-repeat/);
  assert.match(ruleText, /radial-gradient/, "readability mask must be preserved");
  assert.ok(ruleText.indexOf("radial-gradient") < ruleText.indexOf("quiz-bg-v2.webp"), "readability gradient must be above the image (image is the bottom layer)");
  assert.ok(ruleText.indexOf("quiz-bg-v2.webp") < ruleText.indexOf("rgba(9, 17, 13, 0.96)"), "image must be above the flat dark base color");
  assert.match(css, /body\.sb-mc\.sb-quiz-full #topbar/);
  assert.match(css, /body\.sb-mc\.sb-quiz-full #sb-stage/);
  const occurrences = (css.match(/quiz-bg-v2\.webp/g) || []).length;
  assert.equal(occurrences, 1, "background asset must be referenced by exactly one (Minecraft) rule");
});

test("stylesheet cache buster advances when quiz controls change", () => {
  const html = fs.readFileSync(new URL("./storybook.html", import.meta.url), "utf8");
  assert.match(html, /storybook\.css\?v=mcquiz5/);
  assert.doesNotMatch(html, /storybook\.css\?v=png1/);
});

test("no minecraft quiz carries Xiyou polluted distractor words", () => {
  ALL_BOOKS.forEach((b) => {
    const data = JSON.parse(fs.readFileSync(new URL(`../data/storybooks-minecraft/book${b}.json`, import.meta.url), "utf8"));
    const flat = JSON.stringify(data.quiz || []);
    for (const w of ["皇帝", "寺庙", "经文"]) {
      assert.equal(flat.includes(w), false, `book${b} quiz must not contain ${w}`);
    }
  });
});

/* ===================== Mikey & JJ series (Zombie School Adventure) ===================== */

const MJ_DATA = new URL("../data/storybooks-mikey-jj/book1.json", import.meta.url);
const MJ_AUDIO_DURATION_MS = 146048;

test("mikey-jj route resolves a book without colliding with other series", () => {
  const { resolveStorybookRequest } = require(fileURLToPath(modulePath));
  assert.deepEqual(resolveStorybookRequest("?series=mikey-jj&book=1"), {
    series: "mikey-jj",
    id: 1,
    uiVariant: "legacy",
    progressKey: "mikey-jj:1",
    dataUrl: "../data/storybooks-mikey-jj/book1.json",
    shelfUrl: "map.html?series=mikey-jj",
  });
  assert.equal(resolveStorybookRequest("?series=mikey-jj&book=2").id, 2);
  assert.equal(resolveStorybookRequest("?ep=3").series, "jttw");
});

test("mikey-jj map collection skips unpublished book 4 explicitly", () => {
  const col = JSON.parse(fs.readFileSync(new URL("../data/storybooks-mikey-jj/collections.json", import.meta.url), "utf8"));
  assert.equal(col.collections.length, 1);
  assert.deepEqual(col.collections[0].books, [1, 2, 3, 5, 6, 7, 8, 9, 10, 11]);
});

test("mikey-jj reader starts silent and does not auto-advance after a sentence ends", () => {
  const source = fs.readFileSync(new URL("./storybook.js", import.meta.url), "utf8");
  assert.match(source, /if \(useSentenceMode\(\) && request\.series !== "mikey-jj"\) playActiveSentence\(\)/);
  assert.match(source, /const canAdvance = request\.series !== "mikey-jj" && BookPlayStorybookUI\.shouldAutoAdvance\(/);
  assert.match(source, /function playActiveSentence\(\)/);
});

test("mikey-jj book1 covers 10 pages with real per-bubble sentences and ms boundaries", () => {
  const data = JSON.parse(fs.readFileSync(MJ_DATA, "utf8"));
  assert.equal(data.series, "mikey-jj");
  assert.equal(data.book, 1);
  assert.equal(data.pages.length, 10);
  const counts = [];
  data.pages.forEach((p) => {
    assert.ok(p.sentences && p.sentences.length >= 1, `page ${p.page_no} sentences[]`);
    assert.ok(p.image.endsWith(`/pages/p${String(p.page_no).padStart(2, "0")}.webp`), `page ${p.page_no} image`);
    p.sentences.forEach((s, i) => {
      assert.ok(s.text_en && s.text_en.length > 0, `p${p.page_no} s${i + 1} text_en`);
      assert.ok(s.zh && s.zh.length > 0, `p${p.page_no} s${i + 1} zh`);
      assert.ok(Number.isInteger(s.start_ms) && Number.isInteger(s.end_ms), `p${p.page_no} s${i + 1} ms integers`);
      assert.ok(s.start_ms >= 0 && s.end_ms > s.start_ms && s.end_ms <= MJ_AUDIO_DURATION_MS, `p${p.page_no} s${i + 1} ms bounds`);
      const expected = `assets/mikey-jj/zombie-school-adventure/sentences/page-${String(p.page_no).padStart(2, "0")}-sentence-${String(i + 1).padStart(2, "0")}.mp3`;
      assert.equal(s.audio, expected, `p${p.page_no} s${i + 1} audio path`);
      const clip = new URL(`../assets/mikey-jj/zombie-school-adventure/sentences/` + s.audio.split("/").pop(), import.meta.url);
      assert.equal(fs.existsSync(clip), true, `missing clip ${s.audio}`);
      assert.ok(fs.statSync(clip).size > 1024, `clip ${s.audio} suspiciously small`);
    });
    counts.push(p.sentences.length);
  });
  assert.deepEqual(counts, [7, 6, 7, 7, 8, 7, 6, 6, 4, 6], "per-page sentence counts must match ASR bubbles");
  // monotonic in reading order across the book
  let prevEnd = 0;
  data.pages.forEach((p) => {
    p.sentences.forEach((s) => {
      assert.ok(s.start_ms >= prevEnd - 30, `p${p.page_no} sentence not monotonic after ${prevEnd}`);
      prevEnd = s.end_ms;
    });
  });
});

test("mikey-jj pages keep 2-4 key words with complete three-layer fields inside their sentence", () => {
  const data = JSON.parse(fs.readFileSync(MJ_DATA, "utf8"));
  data.pages.forEach((p) => {
    const terms = new Set();
    p.sentences.forEach((s) => {
      (s.glossary || []).forEach((g) => {
        assert.ok(g.term && g.ipa && g.pos && g.zh, `p${p.page_no} incomplete card ${g.term}`);
        assert.ok(g.ipa.length >= 2 && !/\s/.test(g.ipa), `p${p.page_no} ipa '${g.ipa}' must be compact`);
        const esc = g.term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        assert.ok(new RegExp(`\\b${esc}[a-z]*\\b`, "i").test(s.text_en), `p${p.page_no} term '${g.term}' must appear in its sentence`);
        terms.add(g.term);
      });
    });
    assert.ok(terms.size >= 2 && terms.size <= 4, `p${p.page_no} must carry 2-4 key words, got ${terms.size}`);
  });
});

test("mikey-jj fullscreen quiz has valid answers and clean distractors", () => {
  const data = JSON.parse(fs.readFileSync(MJ_DATA, "utf8"));
  assert.ok(data.quiz && data.quiz.length === 5, "quiz must have 5 questions");
  data.quiz.forEach((q, qi) => {
    assert.ok(q.q && q.choices.length >= 3, `q${qi + 1} invalid`);
    assert.ok(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.choices.length, `q${qi + 1} answer index`);
  });
  const flat = JSON.stringify(data.quiz);
  for (const w of ["皇帝", "寺庙", "经文"]) assert.equal(flat.includes(w), false, `quiz must not contain ${w}`);
});

test("published quiz evidence takes precedence over prompt term guessing", () => {
  const source = fs.readFileSync(new URL("./storybook.js", import.meta.url), "utf8");
  assert.match(source, /function quizQuestionHasAuthoredEvidence\(question\)/);
  assert.match(source, /const term = quizQuestionHasAuthoredEvidence\(question\)[\s\S]*?normalizeVocabTerm\(question\.term\)[\s\S]*?episodeVocabQuiz\.questionTerm/);
});

test("mikey-jj consumer enables sentence mode, zh line, and fullscreen quiz styling", () => {
  const source = fs.readFileSync(new URL("./storybook.js", import.meta.url), "utf8");
  const css = fs.readFileSync(new URL("./storybook.css", import.meta.url), "utf8");
  assert.match(source, /request\.series === "mikey-jj"/);
  assert.match(source, /zhLineEl/);
  assert.match(source, /sents\[sentIdx\]\.zh/);
  assert.match(source, /ev\.key === "Escape" && \(quizOpen \|\| reviewOpen \|\| practiceResultOpen\)/);
  assert.match(source, /btnNext\.focus\(\)/);
  assert.match(css, /body\.sb-mj\.sb-quiz-full #sb-quiz\s*\{/);
  assert.match(css, /url\("\.\.\/assets\/mikey-jj\/ui\/quiz-bg\.png"\) center \/ cover no-repeat/);
  const asset = new URL("../assets/mikey-jj/ui/quiz-bg.png", import.meta.url);
  assert.equal(fs.existsSync(asset), true, "quiz-bg.png must be bundled");
  const mcOccurrences = (css.match(/quiz-bg-v2\.webp/g) || []).length;
  assert.equal(mcOccurrences, 1, "minecraft background rule must stay untouched");
});

/* ============= Mikey & JJ Water House Adventure (book=2) ============= */

const MH_DATA = new URL("../data/storybooks-mikey-jj/book2.json", import.meta.url);
const MH_AUDIO_DURATION_MS = 130795;

test("mikey-jj book=2 route resolves to the Water House book", () => {
  const { resolveStorybookRequest } = require(fileURLToPath(modulePath));
  assert.deepEqual(resolveStorybookRequest("?series=mikey-jj&book=2"), {
    series: "mikey-jj",
    id: 2,
    uiVariant: "legacy",
    progressKey: "mikey-jj:2",
    dataUrl: "../data/storybooks-mikey-jj/book2.json",
    shelfUrl: "map.html?series=mikey-jj",
  });
});

test("mikey-jj book2 covers 10 pages with real per-bubble sentences and ms boundaries", () => {
  const data = JSON.parse(fs.readFileSync(MH_DATA, "utf8"));
  assert.equal(data.series, "mikey-jj");
  assert.equal(data.book, 2);
  assert.equal(data.pages.length, 10);
  const counts = [];
  data.pages.forEach((p) => {
    assert.ok(p.sentences && p.sentences.length >= 1, `page ${p.page_no} sentences[]`);
    assert.ok(p.image.endsWith(`/pages/p${String(p.page_no).padStart(2, "0")}.webp`), `page ${p.page_no} image`);
    p.sentences.forEach((s, i) => {
      assert.ok(s.text_en && s.text_en.length > 0, `p${p.page_no} s${i + 1} text_en`);
      assert.ok(s.zh && s.zh.length > 0, `p${p.page_no} s${i + 1} zh`);
      assert.ok(Number.isInteger(s.start_ms) && Number.isInteger(s.end_ms), `p${p.page_no} s${i + 1} ms integers`);
      assert.ok(s.start_ms >= 0 && s.end_ms > s.start_ms && s.end_ms <= MH_AUDIO_DURATION_MS, `p${p.page_no} s${i + 1} ms bounds`);
      const expected = `assets/mikey-jj/water-house-adventure/sentences/page-${String(p.page_no).padStart(2, "0")}-sentence-${String(i + 1).padStart(2, "0")}.mp3`;
      assert.equal(s.audio, expected, `p${p.page_no} s${i + 1} audio path`);
      const clip = new URL(`../assets/mikey-jj/water-house-adventure/sentences/` + s.audio.split("/").pop(), import.meta.url);
      assert.equal(fs.existsSync(clip), true, `missing clip ${s.audio}`);
      assert.ok(fs.statSync(clip).size > 1024, `clip ${s.audio} suspiciously small`);
    });
    counts.push(p.sentences.length);
  });
  assert.deepEqual(counts, [11, 6, 6, 6, 6, 5, 4, 4, 3, 3], "per-page sentence counts must match ASR bubbles");
  let prevEnd = 0;
  data.pages.forEach((p) => {
    p.sentences.forEach((s) => {
      assert.ok(s.start_ms >= prevEnd - 30, `p${p.page_no} sentence not monotonic after ${prevEnd}`);
      prevEnd = s.end_ms;
    });
  });
});

test("mikey-jj book2 pages keep 2-4 key words with complete three-layer fields inside their sentence", () => {
  const data = JSON.parse(fs.readFileSync(MH_DATA, "utf8"));
  data.pages.forEach((p) => {
    const terms = new Set();
    p.sentences.forEach((s) => {
      (s.glossary || []).forEach((g) => {
        assert.ok(g.term && g.ipa && g.pos && g.zh, `p${p.page_no} incomplete card ${g.term}`);
        assert.ok(g.ipa.length >= 2 && !/\s/.test(g.ipa), `p${p.page_no} ipa '${g.ipa}' must be compact`);
        const esc = g.term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        assert.ok(new RegExp(`\\b${esc}[a-z]*\\b`, "i").test(s.text_en), `p${p.page_no} term '${g.term}' must appear in its sentence`);
        terms.add(g.term);
      });
    });
    assert.ok(terms.size >= 2 && terms.size <= 4, `p${p.page_no} must carry 2-4 key words, got ${terms.size}`);
  });
});

test("mikey-jj book2 fullscreen quiz has valid answers and clean distractors", () => {
  const data = JSON.parse(fs.readFileSync(MH_DATA, "utf8"));
  assert.ok(data.quiz && data.quiz.length === 5, "quiz must have 5 questions");
  data.quiz.forEach((q, qi) => {
    assert.ok(q.q && q.choices.length >= 3, `q${qi + 1} invalid`);
    assert.ok(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.choices.length, `q${qi + 1} answer index`);
  });
  const flat = JSON.stringify(data.quiz);
  for (const w of ["皇帝", "寺庙", "经文", "僵尸", "留堂", "校长"]) {
    assert.equal(flat.includes(w), false, `quiz must not contain ${w}`);
  }
});

test("mikey-jj missing-audio sentence keeps text learning data and never reuses a stale clip", () => {
  const data = JSON.parse(fs.readFileSync(new URL("../data/storybooks-mikey-jj/book6.json", import.meta.url), "utf8"));
  const page = data.pages.find((item) => item.page_no === 9);
  assert.ok(page, "book6 page 9 must exist");
  const sentence = page.sentences.find((item) => item.id === "b6-p09-s01");
  assert.ok(sentence, "missing-audio sentence id must be stable");
  assert.equal(sentence.audio, null);
  assert.ok(sentence.text_en && sentence.zh && sentence.speaker && sentence.bubble && sentence.words?.length);
  assert.ok(sentence.audio_missing_reason);
  const source = fs.readFileSync(new URL("./storybook.js", import.meta.url), "utf8");
  assert.match(source, /audio\.removeAttribute\("src"\)/);
  assert.match(source, /function currentMikeySentence\(\)/);
  assert.match(source, /function canLocateBubble\(\)/);
  assert.match(source, /!isUnifiedV3\(\) && canLocateBubble\(\)\) updateBubbleLocator\(currentMikeySentence\(\)/);
  assert.match(source, /if \(isUnifiedV3\(\)\) positionPopupBubble\(\)/,
    "unified v3 word playback and resize paths must keep using the popup, not PDF coordinates");
  assert.match(source, /!wasPlaying\) \{\s*hideBubbleLocator\(\);/);
});

/* ================= Mikey & JJ home integration (home card + shelf + published boundary) ================= */

test("home page exposes a third Mikey & JJ card into the series map", () => {
  const html = fs.readFileSync(new URL("./home.html", import.meta.url), "utf8");
  assert.match(html, /class="book-card" href="map\.html\?series=mikey-jj"/, "mikey-jj card must link to its map");
  assert.match(html, /assets\/mikey-jj\/zombie-school-adventure\/pages\/p01\.webp/, "card uses the published cover");
  assert.match(html, /10 本已上线 · 11 本专题素材已入库/, "truthful count copy");
  assert.match(html, /Mikey &amp; JJ 英文冒险/, "series title on card");
  // existing two series cards must stay intact
  assert.match(html, /class="book-card" href="map\.html"/, "Journey to the West card preserved");
  assert.match(html, /class="book-card" href="map\.html\?series=minecraft"/, "Minecraft card preserved");
  const cards = (html.match(/class="book-card"/g) || []).length;
  assert.equal(cards, 3, "exactly three equal-weight series cards");
});

test("shelf.js recognizes the mikey-jj series and renders only published books", () => {
  const source = fs.readFileSync(new URL("./shelf.js", import.meta.url), "utf8");
  assert.match(source, /params\.get\("series"\) === "mikey-jj"/, "series must be recognised");
  assert.match(source, /storybooks-mikey-jj\/catalog\.json/, "mikey-jj shelf reads its own catalog");
  assert.match(source, /storybook\.html\?series=mikey-jj&book=\$\{itemId\}/, "mikey-jj cards link into the reader");
  assert.match(source, /mikey-jj:\$\{itemId\}/, "mikey-jj progress keys are namespaced");
  assert.match(source, /"Mikey & JJ 英文冒险"/, "shelf title configured");
  // jttw / minecraft behaviour must stay intact
  assert.match(source, /catalogUrl: "\/data\/storybooks\/catalog\.json"/, "jttw catalog untouched");
  assert.match(source, /storybook\.html\?series=minecraft&book=\$\{itemId\}/, "minecraft links untouched");
});

test("mikey-jj published catalog lists all matched books and skips book 4 without dead links", () => {
  const cat = JSON.parse(fs.readFileSync(new URL("../data/storybooks-mikey-jj/catalog.json", import.meta.url), "utf8"));
  assert.equal(cat.series, "mikey-jj");
  assert.equal(cat.count, 10);
  assert.equal(cat.published_count, 10);
  assert.equal(cat.source_count, 11);
  assert.deepEqual(cat.episodes.map((e) => e.book), [1, 2, 3, 5, 6, 7, 8, 9, 10, 11], "all matched books are listed and book 4 is skipped");
  cat.episodes.forEach((e) => {
    assert.ok(e.title && e.title.en && e.title.zh, `book ${e.book} title fields`);
    const cover = new URL("../" + e.cover, import.meta.url);
    assert.equal(fs.existsSync(cover), true, `book ${e.book} cover asset must exist`);
  });
  assert.equal(cat.episodes.some((e) => e.book === 4), false, "no dead book-4 entry");
});

test("published-next navigation follows the catalog's non-contiguous book numbers", () => {
  [1, 2].forEach((b) => {
    const data = JSON.parse(fs.readFileSync(new URL(`../data/storybooks-mikey-jj/book${b}.json`, import.meta.url), "utf8"));
    assert.equal(data.series_count, 11, `book${b} series size stays truthful`);
    assert.equal(data.published_count, 2, `book${b} must declare the published boundary`);
  });
  const source = fs.readFileSync(new URL("./storybook.js", import.meta.url), "utf8");
  assert.match(source, /loadPublishedBookIds/, "reader must load the published catalog before building next navigation");
  assert.match(source, /nextPublishedBookId\(ep\)/, "reader must resolve the next actual published book");
  assert.match(source, /publishedBookIds/, "reader must keep a catalog-derived published id list");
});

/* ================= Mikey & JJ speaking bubble (Water House page 1, 6 -> 11 atomic units) ================= */

const WH_P1_EXPECTED = [
  "Warning!",
  "The sea level is rising.",
  "The world will flood!",
  "This is a disaster!",
  "We must build shelters immediately.",
  "The news was terrible.",
  "The ice was melting fast.",
  "I will build a tower on sturdy pillars.",
  "I will build a raft.",
  "It will float on the waves!",
  "They had to work quickly to save themselves.",
];

test("Water House page 1 is split into exactly 11 atomic speaking-bubble sentences", () => {
  const data = JSON.parse(fs.readFileSync(new URL("../data/storybooks-mikey-jj/book2.json", import.meta.url), "utf8"));
  const p1 = data.pages[0];
  assert.equal(p1.sentences.length, 11, "page 1 must expose exactly 11 atomic sentences");
  p1.sentences.forEach((s, i) => {
    assert.match(s.id, /^b2-p01-s\d{2}$/, `s${i + 1} stable id`);
    assert.equal(s.text_en, WH_P1_EXPECTED[i], `s${i + 1} exact atomic text`);
    assert.ok(s.speaker && ["mikey", "jj", "narrator", "system"].includes(s.speaker.id), `s${i + 1} speaker.id`);
    assert.ok(s.speaker.label && s.speaker.label.length > 0, `s${i + 1} speaker.label`);
    const b = s.bubble || {};
    for (const k of ["x", "y", "w", "h"]) {
      assert.ok(Number.isFinite(b[k]) && b[k] >= 0 && b[k] <= 1, `s${i + 1} bubble.${k} in 0..1`);
    }
    assert.ok(b.w > 0 && b.h > 0, `s${i + 1} bubble size`);
    assert.ok(Array.isArray(s.words) && s.words.length >= 1, `s${i + 1} words[]`);
    let prev = 0;
    s.words.forEach((w, wi) => {
      assert.ok(w.start_ms >= 0 && w.end_ms >= w.start_ms, `s${i + 1} w${wi} monotonic`);
      assert.ok(w.start_ms >= prev, `s${i + 1} w${wi} ordered`);
      assert.ok(w.end_ms <= s.end_ms - s.start_ms + 60, `s${i + 1} w${wi} inside clip`);
      prev = w.end_ms;
    });
    assert.match(s.audio, /water-house-adventure\/sentences\/page-01-sentence-\d{2}\.mp3/, `s${i + 1} clip path`);
    const clip = new URL("../assets/mikey-jj/water-house-adventure/sentences/" + s.audio.split("/").pop(), import.meta.url);
    assert.equal(fs.existsSync(clip), true, `s${i + 1} clip exists`);
    assert.ok(fs.statSync(clip).size > 1024, `s${i + 1} clip not empty`);
  });
});

test("speaking-bubble consumer contract: DOM, JS entrypoints, TTS hook and sb-mj-scoped CSS", () => {
  const html = fs.readFileSync(new URL("./storybook.html", import.meta.url), "utf8");
  assert.match(html, /id="sb-speaking-bubble"/, "in-image bubble layer must exist");
  assert.match(html, /id="sb-autoplay-unlock"/, "one-time autoplay unlock button must exist");
  assert.match(html, /id="sb-word-audio"/, "independent word audio element must exist");
  assert.ok(html.indexOf("media.js") < html.indexOf("storybook.js"), "media.js must load before storybook.js");

  const source = fs.readFileSync(new URL("./storybook.js", import.meta.url), "utf8");
  for (const fn of ["playCurrentSentence", "renderSpeakingBubble", "syncBubbleWords", "speakGlossaryWord"]) {
    assert.match(source, new RegExp(`function ${fn}\\s*\\(`), `${fn}() must exist`);
  }
  assert.match(source, /WalaMedia\.ttsUrl\(/, "word audio must reuse WalaMedia.ttsUrl");
  assert.match(source, /generation/, "quick sentence switching must be generation-guarded");
  assert.match(source, /hidden/, "bubble hide path must exist");

  const css = fs.readFileSync(new URL("./storybook.css", import.meta.url), "utf8");
  assert.match(css, /body\.sb-mj[^}]*#sb-speaking-bubble|body\.sb-mj[^}]*\.sb-speaking-bubble/, "bubble CSS must be scoped to body.sb-mj");
});

test("REPAIR r4: natural ended keeps 600ms linger; playing resets naturalEnd; manual pause immediate", () => {
  const source = fs.readFileSync(new URL("./storybook.js", import.meta.url), "utf8");
  // 浏览器先发 pause、后发 ended：pause 分支必须直接检查 audio.ended（自然结束时即 true）
  const pauseBlock = source.slice(source.indexOf('audio.addEventListener("pause"'), source.indexOf('audio.addEventListener("timeupdate"'));
  assert.match(pauseBlock, /audio\.ended/, "pause must check audio.ended (natural pause arrives before ended event)");
  assert.match(pauseBlock, /hideSpeakingBubble\(\{ immediate: true \}\)/, "manual pause keeps immediate hide");
  // 新播放（playing）必须复位 naturalEnd，防止快速重播污染此后的手动暂停语义
  const playingBlock = source.slice(source.indexOf('audio.addEventListener("playing"'), source.indexOf('audio.addEventListener("pause"'));
  assert.match(playingBlock, /naturalEnd\s*=\s*false/, "new playback must reset naturalEnd");
  // ended 仍标记自然结束并走 600ms 延时淡出
  const endedBlock = source.slice(source.indexOf('audio.addEventListener("ended"'), source.indexOf('audio.addEventListener("playing"'));
  assert.match(endedBlock, /naturalEnd\s*=\s*true/, "ended flags natural end");
  assert.match(endedBlock, /hideSpeakingBubble\(\)/, "ended keeps the delayed 600ms hide path");
});

test("Water House whole book is exactly 54 atomic speaking-bubble sentences", () => {
  const data = JSON.parse(fs.readFileSync(new URL("../data/storybooks-mikey-jj/book2.json", import.meta.url), "utf8"));
  const counts = data.pages.map((p) => p.sentences.length);
  assert.deepEqual(counts, [11, 6, 6, 6, 6, 5, 4, 4, 3, 3], "per-page counts");
  const total = counts.reduce((a, b) => a + b, 0);
  assert.equal(total, 54, "whole book must be exactly 54");
  const ids = new Set();
  data.pages.forEach((p) => {
    p.sentences.forEach((s, i) => {
      assert.match(s.id, /^b2-p\d{2}-s\d{2}$/, `${p.page_no} s${i + 1} id`);
      assert.equal(ids.has(s.id), false, `duplicate id ${s.id}`);
      ids.add(s.id);
      assert.ok(s.speaker && ["mikey", "jj", "narrator", "system"].includes(s.speaker.id), `${s.id} speaker`);
      const b = s.bubble || {};
      for (const k of ["x", "y", "w", "h"]) assert.ok(b[k] >= 0 && b[k] <= 1, `${s.id} bubble.${k}`);
      assert.ok(b.w > 0 && b.h > 0, `${s.id} bubble size`);
      assert.ok(Array.isArray(s.words) && s.words.length >= 1, `${s.id} words`);
      let prev = 0;
      s.words.forEach((w) => {
        assert.ok(w.start_ms >= prev && w.end_ms >= w.start_ms, `${s.id} words monotonic`);
        assert.ok(w.end_ms <= s.end_ms - s.start_ms + 60, `${s.id} words inside clip`);
        prev = w.end_ms;
      });
      assert.match(s.audio, /water-house-adventure\/sentences\/page-\d{2}-sentence-\d{2}\.mp3/, `${s.id} audio`);
      const clip = new URL("../assets/mikey-jj/water-house-adventure/sentences/" + s.audio.split("/").pop(), import.meta.url);
      assert.equal(fs.existsSync(clip), true, `${s.id} clip exists`);
      assert.ok(fs.statSync(clip).size > 1024, `${s.id} clip not empty`);
      const compound = /[.!?]+(?=\s+[A-Z])/.test(s.text_en);
      assert.equal(compound, false, `${s.id} must be a single atomic sentence: ${s.text_en}`);
    });
  });
});

test("mobile speaking bubble min-width is at least 136px", () => {
  const css = fs.readFileSync(new URL("./storybook.css", import.meta.url), "utf8");
  let found = false;
  const re = /body\.sb-mj \.sb-speaking-bubble\s*\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(css)) !== null) {
    const block = m[1];
    if (block.includes("min-width")) {
      const mw = block.match(/min-width:\s*([\d.]+)px/);
      if (mw && parseFloat(mw[1]) >= 136) found = true;
    }
  }
  assert.ok(found, "a body.sb-mj .sb-speaking-bubble rule must declare min-width >= 136px");
});

test("REPAIR r6: every Water House bubble fits inside the 390px image width", () => {
  const data = JSON.parse(fs.readFileSync(new URL("../data/storybooks-mikey-jj/book2.json", import.meta.url), "utf8"));
  const IMG_W = 366;   // 390 viewport - panel padding (image rect width)
  const LIMIT = 368;   // image right edge + 2px tolerance
  const violations = [];
  let total = 0;
  data.pages.forEach((p) => {
    p.sentences.forEach((s) => {
      total += 1;
      const b = s.bubble || {};
      const raw = (b.w || 0) * IMG_W;
      const width = Math.min(Math.max(Math.min(raw, IMG_W * 0.48), 136), 358);
      const right = (b.x || 0) * IMG_W + width;
      if (right > LIMIT) violations.push(`${s.id} right=${right.toFixed(1)}`);
    });
  });
  assert.equal(total, 54, "geometry contract covers all 54 sentences");
  assert.deepEqual(violations, [], `390px mobile bubbles must fit inside the image: ${violations.join(", ")}`);
});

test("CONTINUE r7: Zombie School is exactly 64 atomic speaking-bubble sentences", () => {
  const data = JSON.parse(fs.readFileSync(new URL("../data/storybooks-mikey-jj/book1.json", import.meta.url), "utf8"));
  const counts = data.pages.map((p) => p.sentences.length);
  assert.deepEqual(counts, [7, 6, 7, 7, 8, 7, 6, 6, 4, 6], "per-page counts (REPAIR r8 locked pagination)");
  const total = counts.reduce((a, b) => a + b, 0);
  assert.equal(total, 64, "book1 must be exactly 64");
  // p1 original two clauses (REPAIR r8)
  assert.equal(data.pages[0].sentences[5].text_en, "Maybe it is a holiday?", "p1 s6 original text");
  assert.equal(data.pages[0].sentences[6].text_en, "Or maybe everyone is hiding for a surprise party?", "p1 s7 original text");
  // p2 first short bubble is one playback unit (REPAIR r8)
  assert.equal(data.pages[1].sentences[0].text_en, "Look outside! Zombies!", "p2 s1 single playback unit");
  const ids = new Set();
  data.pages.forEach((p) => {
    const terms = new Set();
    p.sentences.forEach((s, i) => {
      assert.match(s.id, /^b1-p\d{2}-s\d{2}$/, `${p.page_no} s${i + 1} id`);
      assert.equal(ids.has(s.id), false, `duplicate ${s.id}`);
      ids.add(s.id);
      assert.ok(s.speaker && ["mikey", "jj", "narrator", "system"].includes(s.speaker.id), `${s.id} speaker`);
      const b = s.bubble || {};
      for (const k of ["x", "y", "w", "h"]) assert.ok(b[k] >= 0 && b[k] <= 1, `${s.id} bubble.${k}`);
      assert.ok(b.w > 0 && b.h > 0, `${s.id} bubble size`);
      assert.ok(Array.isArray(s.words) && s.words.length >= 1, `${s.id} words`);
      let prev = 0;
      s.words.forEach((w) => {
        assert.ok(w.start_ms >= prev && w.end_ms >= w.start_ms, `${s.id} words monotonic`);
        assert.ok(w.end_ms <= s.end_ms - s.start_ms + 60, `${s.id} words inside clip`);
        prev = w.end_ms;
      });
      assert.match(s.audio, /zombie-school-adventure\/sentences\/page-\d{2}-sentence-\d{2}\.mp3/, `${s.id} audio`);
      const clip = new URL("../assets/mikey-jj/zombie-school-adventure/sentences/" + s.audio.split("/").pop(), import.meta.url);
      assert.equal(fs.existsSync(clip), true, `${s.id} clip exists`);
      assert.ok(fs.statSync(clip).size > 1024, `${s.id} clip not empty`);
      // REPAIR r8: b1-p02-s01 is the locked single short bubble "Look outside! Zombies!"
      if (s.id !== "b1-p02-s01") {
        const compound = /[.!?]+(?=\s+[A-Z])/.test(s.text_en);
        assert.equal(compound, false, `${s.id} must be a single atomic sentence: ${s.text_en}`);
      }
      (s.glossary || []).forEach((g) => terms.add(g.term));
    });
    assert.ok(terms.size >= 2 && terms.size <= 4, `p${p.page_no} must carry 2-4 key words, got ${terms.size}`);
  });
  const wh = JSON.parse(fs.readFileSync(new URL("../data/storybooks-mikey-jj/book2.json", import.meta.url), "utf8"));
  assert.equal(wh.pages.reduce((a, p) => a + p.sentences.length, 0), 54, "Water House must stay 54");
  assert.equal(total + 54, 118, "both books = 118");
});

test("CONTINUE r7: every Zombie School bubble fits inside the 390px image width", () => {
  const data = JSON.parse(fs.readFileSync(new URL("../data/storybooks-mikey-jj/book1.json", import.meta.url), "utf8"));
  const IMG_W = 366, LIMIT = 368;
  const violations = [];
  data.pages.forEach((p) => p.sentences.forEach((s) => {
    const b = s.bubble || {};
    const raw = (b.w || 0) * IMG_W;
    const width = Math.min(Math.max(Math.min(raw, IMG_W * 0.48), 136), 358);
    const right = (b.x || 0) * IMG_W + width;
    if (right > LIMIT) violations.push(`${s.id} right=${right.toFixed(1)}`);
  }));
  assert.deepEqual(violations, [], `390px zombie bubbles must fit: ${violations.join(", ")}`);
});

test("CONTINUE r7: exact visual speaker blueprint (Codex panel audit)", () => {
  const data = JSON.parse(fs.readFileSync(new URL("../data/storybooks-mikey-jj/book1.json", import.meta.url), "utf8"));
  const expect = {
    "b1-p01-s01": "jj", "b1-p01-s02": "jj", "b1-p01-s03": "mikey", "b1-p01-s04": "jj",
    "b1-p01-s05": "jj", "b1-p01-s06": "mikey", "b1-p01-s07": "mikey",
    "b1-p02-s01": "jj", "b1-p02-s02": "mikey", "b1-p02-s03": "jj", "b1-p02-s04": "jj",
    "b1-p02-s05": "mikey", "b1-p02-s06": "mikey",
    "b1-p03-s01": "jj", "b1-p03-s02": "jj", "b1-p03-s03": "jj", "b1-p03-s04": "mikey",
    "b1-p03-s05": "mikey", "b1-p03-s06": "jj", "b1-p03-s07": "mikey",
    "b1-p04-s01": "jj", "b1-p04-s02": "mikey", "b1-p04-s03": "mikey", "b1-p04-s04": "mikey",
    "b1-p04-s05": "mikey", "b1-p04-s06": "jj", "b1-p04-s07": "jj",
    "b1-p05-s01": "jj", "b1-p05-s02": "jj", "b1-p05-s03": "jj", "b1-p05-s04": "mikey",
    "b1-p05-s05": "mikey", "b1-p05-s06": "mikey", "b1-p05-s07": "mikey", "b1-p05-s08": "jj",
    "b1-p06-s01": "jj", "b1-p06-s02": "jj", "b1-p06-s03": "jj", "b1-p06-s04": "mikey",
    "b1-p06-s05": "jj", "b1-p06-s06": "jj", "b1-p06-s07": "mikey",
    "b1-p07-s01": "jj", "b1-p07-s02": "jj", "b1-p07-s03": "mikey", "b1-p07-s04": "mikey",
    "b1-p07-s05": "jj", "b1-p07-s06": "jj",
    "b1-p08-s01": "jj", "b1-p08-s02": "jj", "b1-p08-s03": "mikey", "b1-p08-s04": "mikey",
    "b1-p08-s05": "jj", "b1-p08-s06": "jj",
    "b1-p09-s01": "system", "b1-p09-s02": "jj", "b1-p09-s03": "jj", "b1-p09-s04": "jj",
    "b1-p10-s01": "mikey", "b1-p10-s02": "mikey", "b1-p10-s03": "jj", "b1-p10-s04": "mikey",
    "b1-p10-s05": "jj", "b1-p10-s06": "jj",
  };
  const systems = [], narrators = [];
  data.pages.forEach((p) => p.sentences.forEach((s) => {
    assert.equal(s.speaker.id, expect[s.id], `${s.id} speaker must match the visual audit`);
    if (s.speaker.id === "system") systems.push(s.id);
    if (s.speaker.id === "narrator") narrators.push(s.id);
  }));
  assert.deepEqual(systems, ["b1-p09-s01"], "only the Zombie Principal translate may be system");
  assert.deepEqual(narrators, [], "no narrator assignments in this visual audit");
  // annotations-book1 stays in sync and does not touch Water House annotations
  const ann = JSON.parse(fs.readFileSync(new URL("../data/storybooks-mikey-jj/speaking-annotations-book1.json", import.meta.url), "utf8"));
  assert.equal(Object.keys(ann.annotations).length, 64, "zombie annotations = 64");
  const whAnn = JSON.parse(fs.readFileSync(new URL("../data/storybooks-mikey-jj/speaking-annotations.json", import.meta.url), "utf8"));
  assert.equal(Object.keys(whAnn.annotations).length, 54, "Water House annotations must stay 54 untouched");
});

test("REPAIR r9: every word of all 118 sentences stays inside its clip", () => {
  let words = 0;
  const violations = [];
  for (const book of [1, 2]) {
    const data = JSON.parse(fs.readFileSync(new URL(`../data/storybooks-mikey-jj/book${book}.json`, import.meta.url), "utf8"));
    data.pages.forEach((p) => p.sentences.forEach((s) => {
      const dur = s.end_ms - s.start_ms;
      s.words.forEach((w) => {
        words += 1;
        if (w.end_ms > dur) violations.push(`${s.id} ${w.text} end=${w.end_ms} > dur=${dur}`);
      });
    }));
  }
  assert.equal(words >= 100, true, "sanity: word data present");
  assert.deepEqual(violations, [], `all 118-sentence words must fit their clip: ${violations.join(", ")}`);
});

test("minecraft focus overlay pilot was rolled back", () => {
  const html = fs.readFileSync(new URL("./storybook.html", import.meta.url), "utf8");
  const source = fs.readFileSync(new URL("./storybook.js", import.meta.url), "utf8");
  const css = fs.readFileSync(new URL("./storybook.css", import.meta.url), "utf8");
  const data = JSON.parse(fs.readFileSync(new URL("../data/storybooks-minecraft/book1.json", import.meta.url), "utf8"));
  assert.doesNotMatch(html, /sb-focus-overlay/);
  assert.doesNotMatch(html, /sb-focus-dock/);
  assert.doesNotMatch(html, /sb-focus-toggle/);
  assert.equal(data.pages[0].focus_units, undefined);
  assert.equal(data.pages[0].sentences.length, 3);
  assert.match(source, /function speakGlossaryWord/);
  assert.match(css, /body\.sb-mc #sb-text/);
});

test("minecraft sentence caption words are individually tappable and duration-proportional", () => {
  const html = fs.readFileSync(new URL("./storybook.html", import.meta.url), "utf8");
  const source = fs.readFileSync(new URL("./storybook.js", import.meta.url), "utf8");
  const css = fs.readFileSync(new URL("./storybook.css", import.meta.url), "utf8");
  const caption = source.slice(
    source.indexOf("function tokenizeCaptionWords"),
    source.indexOf("function setTalking"),
  );
  assert.match(caption, /class="sb-sentence-word"/);
  assert.match(caption, /role="button"/);
  assert.match(caption, /tabindex="0"/);
  assert.match(caption, /朗读 /);
  assert.match(caption, /keydown/);
  assert.match(caption, /Enter/);
  assert.match(caption, /speakGlossaryWord\(term,\s*zh,\s*node\)/);
  assert.match(source, /function syncSentenceWordHighlight/);
  assert.match(source, /is-word-active/);
  assert.match(source, /is-word-done/);
  assert.match(source, /is-word-wait/);
  assert.match(source, /BookPlayStorybookUI\.wordHighlightIndex/);
  assert.match(source, /currentMs:/);
  const glossaryFn = source.slice(
    source.indexOf("async function speakGlossaryWord"),
    source.indexOf("function seekToUnit"),
  );
  assert.match(glossaryFn, /WalaMedia\.ttsUrl\(/);
  assert.match(glossaryFn, /if \(zh(?: && okEn === true)?\) await play\(zh, "zh-CN"\)/);
  assert.doesNotMatch(glossaryFn, /play\(zh \|\| term,\s*"zh-CN"\)/);
  assert.doesNotMatch(html, /sb-focus-overlay|sb-focus-dock|sb-focus-toggle/);
  assert.match(css, /#sb-text \.sb-sentence-word:focus-visible/);
  assert.match(css, /is-word-active/);
  assert.doesNotMatch(css, /#sb-focus-dock|#sb-focus-overlay|#sb-focus-toggle/);
});

test("minecraft right-rail word cards reuse speakGlossaryWord via click and keyboard", () => {
  const html = fs.readFileSync(new URL("./storybook.html", import.meta.url), "utf8");
  const source = fs.readFileSync(new URL("./storybook.js", import.meta.url), "utf8");
  const css = fs.readFileSync(new URL("./storybook.css", import.meta.url), "utf8");
  const cards = source.slice(
    source.indexOf("function renderGlossaryCards"),
    source.indexOf("function renderPage"),
  );
  assert.match(cards, /card\.className = "sb-word-card"/);
  assert.match(cards, /role", "button"/);
  assert.match(cards, /tabIndex = 0/);
  assert.match(cards, /▶ 点读/);
  assert.match(cards, /speakGlossaryWord\(g\.term,\s*g\.zh,\s*card\)/);
  assert.match(cards, /keydown/);
  assert.match(cards, /Enter/);
  assert.match(source, /ev\.target\.closest\("\.sb-word-card"\)/);
  const glossaryFn = source.slice(
    source.indexOf("async function speakGlossaryWord"),
    source.indexOf("function seekToUnit"),
  );
  assert.match(glossaryFn, /WalaMedia\.ttsUrl\(/);
  assert.match(glossaryFn, /request\.series === "minecraft" && useSentenceMode\(\)/);
  assert.match(glossaryFn, /if \(speakable\(\)\) \{\s*showSpeakingBubble\(\)/s);
  assert.doesNotMatch(html, /sb-focus-overlay|sb-focus-dock|sb-focus-toggle/);
  assert.match(css, /body\.sb-mc \.sb-word-card:focus-visible/);
  assert.match(css, /sb-word-play/);
  assert.doesNotMatch(css, /#sb-focus-dock|#sb-focus-overlay|#sb-focus-toggle/);
});

test("Mikey & JJ sentence words ship offline Edge TTS clips and reviewed glossary audio", () => {
  const manifestUrl = new URL("../assets/mikey-jj/vocab/index.json", import.meta.url);
  assert.equal(fs.existsSync(manifestUrl), true, "vocab index must be published");
  const manifest = JSON.parse(fs.readFileSync(manifestUrl, "utf8"));
  assert.equal(manifest.series, "mikey-jj");
  assert.equal(manifest.voice.en, "en-US-JennyNeural");
  assert.equal(manifest.voice.zh, "zh-CN-XiaoxiaoNeural");
  const entries = Object.values(manifest.terms || {});
  const phraseEntries = Object.values(manifest.phrases || {});
  assert.equal(manifest.scope, "all-sentence-words");
  const dataRoot = new URL("../data/storybooks-mikey-jj/", import.meta.url);
  const expected = new Map();
  const expectedTokens = new Set();
  const expectedDefinitions = new Set();
  for (const name of fs.readdirSync(dataRoot)) {
    if (!/^book\d+\.json$/.test(name)) continue;
    const data = JSON.parse(fs.readFileSync(new URL(name, dataRoot), "utf8"));
    for (const page of data.pages || []) {
      for (const sentence of page.sentences || []) {
        for (const glossary of sentence.glossary || []) {
          const term = String(glossary.term || "").trim().replace(/\s+/g, " ");
          const zh = String(glossary.zh || "").trim().replace(/\s+/g, " ");
          if (term && zh) {
            expected.set(term.toLowerCase(), zh);
            expectedDefinitions.add(zh);
          }
        }
        for (const token of String(sentence.text_en || "").match(/[A-Za-z]+(?:['’][A-Za-z]+)?(?:-[A-Za-z]+)*|[0-9]+/g) || []) {
          expectedTokens.add(token.toLowerCase().replace(/’/g, "'"));
        }
      }
    }
  }
  assert.equal(manifest.stats.unique_terms, entries.length);
  assert.equal(manifest.stats.token_occurrences, entries.reduce((sum, entry) => sum + Number(entry.count || 0), 0));
  assert.deepEqual(new Set(entries.map((entry) => entry.term.toLowerCase())), expectedTokens);
  const indexedGlossary = new Set([...entries, ...phraseEntries].map((entry) => entry.term.toLowerCase()));
  for (const term of expected.keys()) {
    assert.equal(indexedGlossary.has(term), true, `${term} glossary term must be indexed`);
  }
  const definitions = manifest.definitions || {};
  assert.deepEqual(new Set(Object.keys(definitions)), expectedDefinitions, "all Chinese definitions must be indexed");
  const zhPaths = new Set();
  [...entries, ...phraseEntries].forEach((entry) => {
    assert.match(entry.audio_en, /^assets\/mikey-jj\/vocab\/en\/[\w-]+\.mp3$/);
    const en = new URL(`../${entry.audio_en}`, import.meta.url);
    assert.equal(fs.existsSync(en), true, `${entry.term} English clip exists`);
    assert.ok(fs.statSync(en).size > 1000, `${entry.term} English clip is non-empty`);
    if (entry.audio_zh) {
      assert.match(entry.audio_zh, /^assets\/mikey-jj\/vocab\/zh\/[\da-f]+\.mp3$/);
      zhPaths.add(entry.audio_zh);
      const zh = new URL(`../${entry.audio_zh}`, import.meta.url);
      assert.equal(fs.existsSync(zh), true, `${entry.term} Chinese clip exists`);
      assert.ok(fs.statSync(zh).size > 1000, `${entry.term} Chinese clip is non-empty`);
    }
  });
  Object.entries(definitions).forEach(([definition, path]) => {
    assert.match(path, /^assets\/mikey-jj\/vocab\/zh\/[\da-f]+\.mp3$/);
    const clip = new URL(`../${path}`, import.meta.url);
    assert.equal(fs.existsSync(clip), true, `${definition} Chinese definition clip exists`);
    assert.ok(fs.statSync(clip).size > 1000, `${definition} Chinese definition clip is non-empty`);
    zhPaths.add(path);
  });
  assert.equal(zhPaths.size, expectedDefinitions.size, "Chinese clips are deduplicated by definition");
});

test("Mikey & JJ word playback prefers static clips and keeps WalaMedia fallback", () => {
  const source = fs.readFileSync(new URL("./storybook.js", import.meta.url), "utf8");
  assert.match(source, /loadMikeyVocabAudioIndex/);
  assert.match(source, /loadMikeyQuizAudioIndex/);
  assert.match(source, /assets\/mikey-jj\/quiz\/index\.json/);
  assert.match(source, /fetch\("\.\.\/assets\/mikey-jj\/vocab\/index\.json"/);
  assert.match(source, /staticVocabAudio\(text, lang\)/);
  const glossaryFn = source.slice(
    source.indexOf("async function speakGlossaryWord"),
    source.indexOf("function seekToUnit"),
  );
  assert.match(glossaryFn, /WalaMedia\.ttsUrl\(/, "online TTS remains a fallback");
  assert.match(glossaryFn, /fallbackTried/);
  assert.match(glossaryFn, /tryPlay\(staticUrl \|\| fallbackUrl\(\)/);
});

test("completion card uses a series-specific character action with a safe fallback", () => {
  const source = fs.readFileSync(new URL("./storybook.js", import.meta.url), "utf8");
  assert.match(source, /sb-completion-companion/);
  assert.match(source, /mikey-jj\/characters\/mikey\/transparent\/celebrate\.png/);
  assert.match(source, /minecraft\/characters\/duo\/transparent\/celebrate\.png/);
  assert.match(source, /mikey-jj\/characters\/duo\/transparent\/rescue\.png/);
  assert.match(source, /minecraft\/characters\/alex\/transparent\/rescue\.png/);
});
