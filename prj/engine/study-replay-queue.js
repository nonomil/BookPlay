"use strict";

(function exposeStudyReplayQueue(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else if (root) root.BookPlayStudyReplayQueue = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function studyReplayQueueFactory() {
  function normalizeTerm(value) {
    return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
  }

  function unique(values, normalizer = (value) => String(value || "")) {
    const seen = new Set();
    return (Array.isArray(values) ? values : []).map(normalizer).filter((value) => {
      if (!value || seen.has(value)) return false;
      seen.add(value);
      return true;
    });
  }

  function pageNodes(page, pageIndex) {
    const pageNo = page && page.page_no != null ? page.page_no : pageIndex + 1;
    const image = page && page.image ? String(page.image) : null;
    const sentences = Array.isArray(page && page.sentences) ? page.sentences : [];
    if (!sentences.length) {
      const start = Number.isFinite(Number(page && page.start_ms))
        ? Number(page.start_ms)
        : Number.isFinite(Number(page && page.start_sec)) ? Number(page.start_sec) * 1000 : null;
      const end = Number.isFinite(Number(page && page.end_ms))
        ? Number(page.end_ms)
        : Number.isFinite(Number(page && page.end_sec)) ? Number(page.end_sec) * 1000 : null;
      return [{
        id: `p${String(pageNo).padStart(2, "0")}`,
        page_no: pageNo,
        image,
        text_en: String(page && page.text_en || ""),
        start_ms: start,
        end_ms: end,
        audio: page && page.audio ? page.audio : null,
        video: page && page.video ? page.video : null,
        glossary: Array.isArray(page && page.glossary) ? page.glossary : [],
      }];
    }
    return sentences.map((sentence, sentenceIndex) => ({
      id: String(sentence && sentence.id || `p${String(pageNo).padStart(2, "0")}-s${String(sentenceIndex + 1).padStart(2, "0")}`),
      page_no: pageNo,
      image,
      text_en: String(sentence && sentence.text_en || ""),
      start_ms: Number.isFinite(Number(sentence && sentence.start_ms))
        ? Number(sentence.start_ms)
        : Number.isFinite(Number(sentence && sentence.start_sec)) ? Number(sentence.start_sec) * 1000 : null,
      end_ms: Number.isFinite(Number(sentence && sentence.end_ms))
        ? Number(sentence.end_ms)
        : Number.isFinite(Number(sentence && sentence.end_sec)) ? Number(sentence.end_sec) * 1000 : null,
      audio: sentence && sentence.audio ? sentence.audio : (page && page.audio ? page.audio : null),
      video: sentence && sentence.video ? sentence.video : (page && page.video ? page.video : null),
      glossary: Array.isArray(sentence && sentence.glossary) ? sentence.glossary : [],
    }));
  }

  function deriveScenes(book, { maxNodes = 4 } = {}) {
    const nodes = (book && Array.isArray(book.pages) ? book.pages : [])
      .flatMap((page, index) => pageNodes(page, index));
    const groupSize = Math.max(1, Math.min(4, Number(maxNodes) || 4));
    const scenes = [];
    for (let i = 0; i < nodes.length; i += groupSize) {
      const group = nodes.slice(i, i + groupSize);
      if (!group.length) continue;
      const sentenceIds = group.map((node) => node.id);
      const starts = group.map((node) => node.start_ms).filter((value) => Number.isFinite(value));
      const ends = group.map((node) => node.end_ms).filter((value) => Number.isFinite(value));
      const audio = unique(group.map((node) => node.audio), (value) => String(value || "").trim());
      const targetTerms = unique(group.flatMap((node) => node.glossary.map((entry) => entry && entry.term)), normalizeTerm);
      const videoNode = group.find((node) => node.video && typeof node.video === "object");
      const pageNumbers = unique(group.map((node) => node.page_no), (value) => String(value));
      scenes.push({
        id: `scene-${sentenceIds.join("-")}`,
        page_no: group[0].page_no,
        source_pages: pageNumbers,
        image: group[0].image,
        sentence_ids: sentenceIds,
        target_terms: targetTerms,
        start_ms: starts.length ? Math.min(...starts) : null,
        end_ms: ends.length ? Math.max(...ends) : null,
        audio,
        ...(videoNode ? { video: videoNode.video } : {}),
        sentences: group.map((node) => ({
          id: node.id,
          text_en: node.text_en,
          start_ms: node.start_ms,
          end_ms: node.end_ms,
          audio: node.audio,
          glossary: node.glossary,
        })),
      });
    }
    return scenes;
  }

  function buildReplayQueue(scenes) {
    return (Array.isArray(scenes) ? scenes : []).filter((scene) => (
      scene && Array.isArray(scene.target_terms) && scene.target_terms.length > 0
    ));
  }

  function evidenceSentenceIds(question) {
    if (!question || typeof question !== "object") return [];
    const values = [];
    if (question.source_sentence_id) values.push(question.source_sentence_id);
    if (Array.isArray(question.source_sentence_ids)) values.push(...question.source_sentence_ids);
    return unique(values, (value) => String(value || "").trim());
  }

  function replayQueueForQuestions(scenes, questions) {
    const sourceIds = new Set();
    const sceneIds = new Set();
    const terms = new Set();
    (Array.isArray(questions) ? questions : []).forEach((question) => {
      evidenceSentenceIds(question).forEach((id) => sourceIds.add(id));
      if (question && question.scene_id) sceneIds.add(String(question.scene_id));
      if (question && question.term) terms.add(normalizeTerm(question.term));
    });
    if (!sourceIds.size && !sceneIds.size && !terms.size) return [];
    return (Array.isArray(scenes) ? scenes : []).filter((scene) => {
      if (!scene) return false;
      if (sceneIds.has(String(scene.id || ""))) return true;
      const sentenceIds = new Set((Array.isArray(scene.sentence_ids) ? scene.sentence_ids : []).map(String));
      if ([...sourceIds].some((id) => sentenceIds.has(id))) return true;
      const targetTerms = (Array.isArray(scene.target_terms) ? scene.target_terms : []).map(normalizeTerm);
      return [...terms].some((term) => targetTerms.includes(term));
    });
  }

  function validRange(start, end) {
    return Number.isFinite(Number(start)) && Number.isFinite(Number(end)) && Number(end) > Number(start);
  }

  function scenePlaybackPlan(scene) {
    const source = scene && scene.video;
    if (source && typeof source === "object" && source.src && validRange(source.start_ms, source.end_ms)) {
      return {
        kind: "video",
        src: String(source.src),
        start_ms: Number(source.start_ms),
        end_ms: Number(source.end_ms),
      };
    }
    const audio = unique(Array.isArray(scene && scene.audio) ? scene.audio : [scene && scene.audio], (value) => String(value || "").trim());
    return {
      kind: "still",
      image: scene && scene.image ? String(scene.image) : null,
      audio,
      start_ms: Number.isFinite(Number(scene && scene.start_ms)) ? Number(scene.start_ms) : null,
      end_ms: Number.isFinite(Number(scene && scene.end_ms)) ? Number(scene.end_ms) : null,
    };
  }

  function nextPendingScene(scenes, progress = {}) {
    const done = new Set([...(progress.completed_scene_ids || []), ...(progress.skipped_scene_ids || [])].map(String));
    return (Array.isArray(scenes) ? scenes : []).find((scene) => scene && !done.has(String(scene.id))) || null;
  }

  return { deriveScenes, buildReplayQueue, replayQueueForQuestions, scenePlaybackPlan, nextPendingScene };
}));
