"use strict";

/* 亲子互动卡纯逻辑（方向 B：与知识巩固题型零重叠，全部看图驱动）：
 *   picture   看图识字 —— 台词里的词典名词 + 对应视频帧，孩子指图认词（最简单）
 *   spell     看图拼词 —— 帧图 + 打乱的字母片，拼出画面上的关键词
 *   readMatch 读句选图 —— 家长读英文句，孩子从 3 张剧照里选出对应画面
 * 与知识巩固分工：巩固管"文字题目考试"，亲子页管"看图游戏"；此处无判分、无奖励语义。
 */
(function expose(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.WalaParentCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function parentCoreFactory() {
  // Keep the original ten-foot parent page contract (up to 15 picture cards)
  // while also appending the newer spell/readMatch interactions below.
  const MAX_PICTURE_CARDS = 4;
  const MAX_SPELL_CARDS = 2;
  const MAX_READMATCH_CARDS = 3;
  const FRAME_DIR = "assets/adv_video_frames";
  const SPELL_MIN_WORD_LENGTH = 4;
  const READMATCH_MIN_WORDS = 4;
  const READMATCH_MAX_WORDS = 10;
  const PICTURE_QUESTION = (term, zh) => `家长问：${zh}（${term}）在哪里？指给爸爸妈妈看`;
  const PATTERN_QUESTION = "家长问：句子里缺了哪个词？一起读一读，再指给爸爸妈妈看";
  const SPELL_QUESTION = "看图拼单词：把下面的字母排成正确的顺序";
  const READMATCH_QUESTION = "家长读句子，孩子选出对应的画面";

  /* 不可指图的抽象词/数词/关系词：词典词性是 n. 但画面里"指不出来"；
   * 另含数据误标为 n. 的形容词（interesting/surprised 等）。 */
  const PICTURE_BLOCKLIST = new Set([
    "one", "two", "three", "ten", "first", "second", "third", "hundred",
    "back", "stop", "help", "change", "end", "show", "cause", "walk",
    "trouble", "idea", "name", "job", "age", "minute", "line", "world",
    "note", "rule", "secret", "message", "lesson", "together", "nearby", "alongside",
    "interesting", "surprised", "amazing", "excited", "worried", "tired",
  ]);

  function normalizeText(value) {
    return String(value == null ? "" : value)
      .replace(/[\u2018\u2019]/g, "'")
      .toLowerCase()
      .replace(/[“”‘’'".,!?！？：:、，。·()（）[\]【】]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function framePath(ep, nodeId) {
    const safe = String(nodeId || "").replace(/[^A-Za-z0-9_-]/g, "_");
    if (!safe) return "";
    return `${FRAME_DIR}/ep${Math.max(1, parseInt(ep, 10) || 1)}/${safe}.jpg`;
  }

  function wordCount(textEn) {
    return normalizeText(textEn).split(" ").filter(Boolean).length;
  }

  /* 收集"可在画面中指认"的名词候选：单词、名词（script_lexicon 或 vocab pos）、
   * 出现在本节点台词中、不在停用词表。返回 [{term, zh, nodeIndex, frame, illustration}]。 */
  function collectNounCandidates(source, lexicon) {
    const nodes = Array.isArray(source.nodes) ? source.nodes : [];
    const candidates = [];
    const seen = new Set();
    nodes.forEach((node, nodeIndex) => {
      if (!node || !node.illustration) return;
      const text = normalizeText(node.text_en);
      const nodeId = String(node.node_id || "");
      if (!text || !nodeId) return;
      const vocabInfo = new Map();
      for (const entry of Array.isArray(node.vocab) ? node.vocab : []) {
        const term = String((entry && entry.term) || "").trim().toLowerCase();
        if (!term) continue;
        const pos = String((entry && entry.pos) || "").trim();
        const zh = String((entry && entry.zh) || "").trim();
        if (pos || zh) vocabInfo.set(term, { pos, zh });
      }
      for (const raw of text.split(" ")) {
        const word = raw.replace(/[^a-z']/g, "");
        const key = word.toLowerCase();
        if (word.length < 2 || PICTURE_BLOCKLIST.has(key) || seen.has(key)) continue;
        const own = vocabInfo.get(key);
        const pos = (own && own.pos) || String((lexicon[key] && lexicon[key].pos) || "").trim();
        if (!pos.startsWith("n")) continue;
        const zh = (own && own.zh) || String((lexicon[key] && lexicon[key].zh) || "").trim();
        seen.add(key);
        candidates.push({
          term: word,
          zh,
          nodeIndex,
          frame: framePath(source.episode, nodeId),
          illustration: String(node.illustration || ""),
        });
      }
    });
    return candidates;
  }

  /* 确定性打乱：轮转一位，保证与原顺序不同（除非全同字符） */
  function rotateLetters(word) {
    const letters = String(word).split("");
    if (letters.length < 2) return letters;
    return letters.slice(1).concat(letters[0]);
  }

  function buildParentCards(book) {
    const source = book && typeof book === "object" ? book : {};
    const lexicon = source.script_lexicon && typeof source.script_lexicon === "object"
      ? source.script_lexicon
      : {};
    const nodes = Array.isArray(source.nodes) ? source.nodes : [];
    const cards = [];
    const nouns = collectNounCandidates(source, lexicon);

    /* ① 看图识字（最简单） */
    nouns.slice(0, MAX_PICTURE_CARDS).forEach((candidate) => {
      cards.push({
        type: "picture",
        term: candidate.term,
        zh: candidate.zh,
        illustration: candidate.illustration,
        frame: candidate.frame,
        question: PICTURE_QUESTION(candidate.term, candidate.zh || candidate.term),
      });
    });

    /* ② 看图拼词（≥4 字母、未用过的名词） */
    const usedTerms = new Set(cards.map((c) => c.term.toLowerCase()));
    nouns.forEach((candidate) => {
      if (cards.filter((c) => c.type === "spell").length >= MAX_SPELL_CARDS) return;
      const key = candidate.term.toLowerCase();
      if (candidate.term.length < SPELL_MIN_WORD_LENGTH || usedTerms.has(key)) return;
      usedTerms.add(key);
      cards.push({
        type: "spell",
        term: candidate.term,
        zh: candidate.zh,
        illustration: candidate.illustration,
        frame: candidate.frame,
        letters: rotateLetters(candidate.term.toLowerCase()),
        question: SPELL_QUESTION,
      });
    });

    /* ③ 读句选图（4-10 词短句分散取句；本句帧为正确项 + 两张其他剧照干扰） */
    const readable = [];
    nodes.forEach((node, nodeIndex) => {
      if (!node || !node.text_en || !node.illustration) return;
      const words = wordCount(node.text_en);
      if (words < READMATCH_MIN_WORDS || words > READMATCH_MAX_WORDS) return;
      readable.push({ node, nodeIndex });
    });
    let matchCount = 0;
    for (let i = 0; i < readable.length && matchCount < MAX_READMATCH_CARDS; i += 1) {
      const { node } = readable[i];
      const correctFrame = framePath(source.episode, node.node_id);
      const distractors = [];
      for (let stride = 1; distractors.length < 2 && stride <= readable.length; stride += 1) {
        const other = readable[(i + stride) % readable.length];
        if (!other) break;
        const frame = framePath(source.episode, other.node.node_id);
        if (frame === correctFrame || distractors.includes(frame)) continue;
        distractors.push(frame);
      }
      if (distractors.length < 2) continue;
      cards.push({
        type: "readMatch",
        sentence: String(node.text_en || "").trim(),
        sentenceZh: String(node.text_zh || "").trim(),
        frame: correctFrame,
        options: [correctFrame, ...distractors],
        question: READMATCH_QUESTION,
      });
      matchCount += 1;
    }

    return cards;
  }

  return {
    MAX_PICTURE_CARDS,
    MAX_SPELL_CARDS,
    MAX_READMATCH_CARDS,
    PICTURE_BLOCKLIST,
    FRAME_DIR,
    normalizeText,
    framePath,
    buildParentCards,
  };
});
