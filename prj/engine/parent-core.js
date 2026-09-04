"use strict";

/* 亲子互动卡纯逻辑：从 dialogue_stories 书数据自动生成家长问答卡。
 * 两类卡：
 *   pattern —— 句型卡（来自 patterns，归一化后与 nodes[].text_en 匹配；命中带插图与原声切片，未命中降级）
 *   picture —— 指图卡（节点 vocab 前 2 个且词在 page_words 中、节点有插图；全集 ≤10 张）
 * 严格无对错语义：本模块不产生判定、分数或奖励，只产出"家长问句 + 素材"。
 */
(function expose(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.WalaParentCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function parentCoreFactory() {
  const MAX_PICTURE_CARDS = 10;
  const VOCAB_PER_NODE = 2;
  const PICTURE_QUESTION = (term, zh) => `家长问：${zh}（${term}）在哪里？指给爸爸妈妈看`;
  const PATTERN_QUESTION = "家长问：这幅画里发生了什么？请孩子用英语说一说";

  function normalizeText(value) {
    return String(value == null ? "" : value)
      .replace(/[\u2018\u2019]/g, "'")
      .toLowerCase()
      .replace(/[“”‘’'".,!?！？：:、，。·()（）[\]【】]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function patternCard(pattern, nodes) {
    const textEn = String((pattern && pattern.pattern) || "").trim();
    if (!textEn) return null;
    const needle = normalizeText(textEn);
    const hit = nodes.find((node) => node && normalizeText(node.text_en).includes(needle)) || null;
    const from = hit ? Number(hit.audio_start) : NaN;
    const to = hit ? Number(hit.audio_end) : NaN;
    const hasClip = hit && Number.isFinite(from) && Number.isFinite(to) && to > from;
    return {
      type: "pattern",
      term: String((pattern && pattern.term) || "").trim(),
      zh: String((pattern && pattern.zh) || "").trim(),
      textEn,
      textZh: hit ? String(hit.text_zh || "").trim() : "",
      illustration: hit && hit.illustration ? String(hit.illustration) : "",
      audio: hasClip ? { from, to } : null,
      question: PATTERN_QUESTION,
    };
  }

  function buildParentCards(book) {
    const source = book && typeof book === "object" ? book : {};
    const nodes = Array.isArray(source.nodes) ? source.nodes : [];
    const patterns = Array.isArray(source.patterns) ? source.patterns : [];
    const cards = [];

    patterns.forEach((pattern) => {
      const card = patternCard(pattern, nodes);
      if (card) cards.push(card);
    });

    const seen = new Set();
    let pictureCount = 0;
    for (const node of nodes) {
      if (pictureCount >= MAX_PICTURE_CARDS) break;
      if (!node || !node.illustration) continue;
      const pageWords = new Set((Array.isArray(node.page_words) ? node.page_words : [])
        .map((word) => String((word && word.term) || "").trim())
        .filter(Boolean));
      const vocab = (Array.isArray(node.vocab) ? node.vocab : []).slice(0, VOCAB_PER_NODE);
      for (const entry of vocab) {
        if (pictureCount >= MAX_PICTURE_CARDS) break;
        const term = String((entry && entry.term) || "").trim();
        const key = term.toLowerCase();
        if (!term || seen.has(key) || !pageWords.has(term)) continue;
        seen.add(key);
        const zh = String((entry && entry.zh) || "").trim();
        cards.push({
          type: "picture",
          term,
          zh,
          textEn: "",
          textZh: "",
          illustration: String(node.illustration),
          audio: null,
          question: PICTURE_QUESTION(term, zh || term),
        });
        pictureCount += 1;
      }
    }
    return cards;
  }

  return {
    MAX_PICTURE_CARDS,
    VOCAB_PER_NODE,
    normalizeText,
    buildParentCards,
  };
});
