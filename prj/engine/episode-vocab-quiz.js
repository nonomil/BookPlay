"use strict";

(function exposeEpisodeVocabQuiz(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else if (root) root.BookPlayEpisodeVocabQuiz = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function episodeVocabQuizFactory() {
  const DEFAULT_PASS_RATE = 0.7;
  const LEGACY_CHINESE_TO_EN = Object.freeze({
    "把朋友留下": "leave a friend behind",
    "保护": "protect",
    "堡垒": "fortress",
    "操场上的滑梯": "playground slide",
    "传送门": "portal",
    "摧毁": "destroy",
    "搭木桥": "build a wooden bridge",
    "打架": "fight",
    "大海": "ocean",
    "待在家里睡觉": "stay home and sleep",
    "弹跳": "bounce",
    "荡": "swing",
    "钓鱼竿": "fishing rod",
    "洞穴": "cave",
    "发生了一场地震": "there was an earthquake",
    "返回": "return",
    "放弃任务": "give up the mission",
    "放学回家": "go home after school",
    "光": "light",
    "海鸥抢走了房子": "seagulls stole the house",
    "海平面上升，世界将被洪水淹没": "sea levels rose and the world was flooded",
    "害怕的": "scared",
    "航行": "sail",
    "毫毛；头发": "hair",
    "河": "river",
    "猴子": "monkey",
    "后门": "back door",
    "胡萝卜": "carrot",
    "激光枪": "laser gun",
    "金苹果和蜘蛛": "golden apples and spiders",
    "巨大的": "huge",
    "课后留校": "detention",
    "龙卷风": "tornado",
    "旅程": "journey",
    "面包": "bread",
    "陌生商人": "wandering trader",
    "木筏被海水吞没": "the raft was swallowed by the sea",
    "南瓜": "pumpkin",
    "苹果": "apple",
    "瀑布": "waterfall",
    "骑马": "ride a horse",
    "企鹅一家团聚": "the penguin family reunited",
    "铅笔": "pencil",
    "让僵尸变大": "make the zombies bigger",
    "山": "mountain",
    "山洞": "cave",
    "伤害僵尸": "hurt the zombies",
    "生意": "business",
    "使用人体大炮": "use a human cannon",
    "收成": "harvest",
    "书本和铅笔": "books and pencils",
    "他的木筏": "his raft",
    "他的晚餐": "his dinner",
    "他的钥匙": "his keys",
    "他们在水世界里活了下来": "they survived in the water world",
    "探索": "explore",
    "逃脱": "escape",
    "体育比赛": "sports game",
    "危险的": "dangerous",
    "屋顶的直升机": "helicopter on the roof",
    "下了一场大雪": "it snowed heavily",
    "吓跑蜘蛛": "scare away the spider",
    "小溪": "stream",
    "校长": "principal",
    "新鲜的鱼": "fresh fish",
    "熊": "bear",
    "学校放假了": "school was closed for a holiday",
    "学校假期": "school holiday",
    "学校食堂": "school cafeteria",
    "寻找金苹果": "look for the golden apple",
    "寻找企鹅妈妈": "look for the penguin mother",
    "寻找一艘船": "look for a ship",
    "寻找一所学校": "look for a school",
    "烟花": "fireworks",
    "沿着": "along",
    "眼睛": "eyes",
    "钥匙和地图": "keys and a map",
    "一个地下避难所": "an underground shelter",
    "一楼教室": "classroom on the first floor",
    "一起": "together",
    "一艘船": "a ship",
    "一艘潜水艇": "a submarine",
    "一箱金苹果": "a box of golden apples",
    "一只简易木筏": "a simple raft",
    "一只猫": "a cat",
    "一座石柱高塔": "a stone pillar tower",
    "一座学校": "a school",
    "勇敢的": "brave",
    "勇敢面对冒险": "face the adventure bravely",
    "用大炮轰": "blast with a cannon",
    "用弓箭射": "shoot with a bow and arrow",
    "用秘密武器的电击": "shock with a secret weapon",
    "用平底锅砸": "hit with a frying pan",
    "游泳": "swim",
    "右边的门": "the door on the right",
    "雨伞": "umbrella",
    "跃入": "leap",
    "战斗": "battle",
    "只有鲨鱼活了下来": "only the shark survived",
    "治疗药水": "healing potion",
    "治愈人类": "heal humans",
    "中间的门": "the middle door",
    "左边的门": "the door on the left",
    "JJ 的塔": "JJ's tower",
    "TNT 和喷溅药水": "TNT and splash potions",
  });
  const LEGACY_EN_TO_ZH = Object.freeze({
    "What does “detention” mean?": "detention 是什么意思？",
    "Where do Mikey and JJ need to go to escape the zombies?": "Mikey 和 JJ 需要去哪里躲避僵尸？",
    "What did the science teacher leave on the desk?": "科学老师把什么留在桌上？",
    "Which door do the footprints lead to?": "脚印通向哪扇门？",
    "What does healing magic do to zombies?": "治疗魔法对僵尸有什么作用？",
    "What is happening at the start of the story?": "故事开始时发生了什么？",
    "What does Mikey build to stay safe in the water?": "Mikey 建造什么来保证在水中安全？",
    "What did the birds steal from Mikey?": "鸟儿从 Mikey 那里偷走了什么？",
    "How did JJ stop the shark?": "JJ 是如何阻止鲨鱼的？",
    "What happens at the end of the story?": "故事结尾发生了什么？",
    "Why do Mikey and JJ go to Snow Mountain?": "Mikey 和 JJ 为什么去雪山？",
    "What food does the penguin prefer?": "企鹅喜欢什么食物？",
    "How do they cross the broken bridge?": "他们如何越过断桥？",
    "What does JJ use to wake Mikey?": "JJ 用什么叫醒 Mikey？",
    "What do they find at the top?": "他们在山顶发现了什么？",
    "Which word is a key word from this story?": "这个故事中的重点词是哪一个？",
    "Who helps solve the problem?": "谁帮助解决了问题？",
    "What should a good reader do?": "一个好的读者应该怎么做？",
    "How does the adventure end?": "冒险最后如何结束？",
  });

  function hasCjk(value) {
    return /[\u3400-\u9fff]/.test(String(value || ""));
  }

  function legacyPrompt(value) {
    const source = String(value || "").trim();
    const match = source.match(/^「\s*([^」]+?)\s*」\s*是什么意思[？?]\s*$/);
    return match ? 'What does "' + match[1] + '" mean?' : source;
  }

  function legacyChoice(value) {
    const source = String(value == null ? "" : value).trim();
    return LEGACY_CHINESE_TO_EN[source] || source;
  }

  function legacyPromptZh(value) {
    const source = String(value || "").trim();
    if (LEGACY_EN_TO_ZH[source]) return LEGACY_EN_TO_ZH[source];
    const challenge = source.match(/^What is the key challenge in (.+)\?$/);
    return challenge ? challenge[1] + "中的关键挑战是什么？" : "";
  }

  function normalizeTerm(value) {
    return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
  }

  function gradeRules(grade) {
    const level = Number(grade) || 1;
    if (level <= 2) return { min: 3, max: 5, types: ["listen-choice", "meaning-choice"] };
    if (level <= 4) return { min: 5, max: 9, types: ["meaning-choice", "listen-choice", "context-fill"] };
    return { min: 7, max: 14, types: ["meaning-choice", "context-fill", "listen-choice", "shadow"] };
  }

  function questionCount(grade, intensity = "standard") {
    const level = Number(grade) || 1;
    const counts = level <= 2
      ? { light: 3, standard: 4, challenge: 5 }
      : level <= 4
        ? { light: 5, standard: 7, challenge: 9 }
        : { light: 7, standard: 10, challenge: 14 };
    return counts[intensity] || counts.standard;
  }

  function questionTerm(question, context = {}) {
    const source = String(question && (question.term || question.prompt_en || question.q) || "");
    if (question && question.term) return normalizeTerm(question.term);
    const match = source.match(/[「“\"']([^」”\"']+)[」”\"']/);
    if (match) return normalizeTerm(match[1]);
    // Some authored questions are comprehension questions rather than
    // explicit "what does X mean" cards.  When the caller supplies the
    // episode's real glossary pool, bind the longest term that is actually
    // present in the prompt.  Never invent a term outside that pool.
    const pool = Array.isArray(context.targetTerms) ? context.targetTerms : [];
    const lower = source.toLowerCase();
    return pool
      .map(normalizeTerm)
      .filter(Boolean)
      .filter((term) => lower.includes(term.toLowerCase()))
      .sort((a, b) => b.length - a.length)[0] || "";
  }

  function hashSeed(seed) {
    let hash = 2166136261;
    for (const char of String(seed || "storybook")) {
      hash ^= char.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function nextRandom(value) {
    return (Math.imul(value, 1664525) + 1013904223) >>> 0;
  }

  function normalizeQuestion(question, index, type, context = {}) {
    if (!question || (!Array.isArray(question.choices) && !Array.isArray(question.choices_en))) return null;
    const display = quizDisplay(question);
    const choices = display.choicesEn;
    const rawChoicesZh = Array.isArray(question.choices_zh) ? question.choices_zh : [];
    const answer = Number(question.answer);
    if (!choices.length || !Number.isInteger(answer) || answer < 0 || answer >= choices.length) return null;
    const authoredEvidence = Boolean(
      question.term
      || question.source_sentence_id
      || (Array.isArray(question.source_sentence_ids) && question.source_sentence_ids.length)
      || question.scene_id
      || question.concept_id
    );
    // Legacy packs may still be displayed, but an authored source must not be
    // turned into a guessed vocabulary term (for example, helicopter in a
    // comprehension prompt).  The migration validator owns that evidence.
    const term = authoredEvidence ? normalizeTerm(question.term) : questionTerm(question, context);
    const normalized = {
      id: String(question.id || `question-${index + 1}`),
      type: String(question.type || type || "meaning-choice"),
      source_sentence_id: String(question.source_sentence_id || ""),
      prompt_en: display.promptEn,
      prompt_zh: display.promptZh,
      choices,
      answer,
      audio: question.audio || null,
      explanation: String(question.explanation || ""),
    };
    const choicesZh = rawChoicesZh.length
      ? choices.map((_, choiceIndex) => String(rawChoicesZh[choiceIndex] == null ? "" : rawChoicesZh[choiceIndex]).trim())
      : display.choicesZh;
    if (choicesZh.some(Boolean)) normalized.choices_zh = choicesZh;
    // Keep the legacy object shape stable for old consumers/tests while
    // carrying the richer evidence fields whenever the authored data has
    // them or a caller could resolve them from the episode context.
    if (term) normalized.term = term;
    if (!normalized.audio) delete normalized.audio;
    if (question.source_text_en) normalized.source_text_en = String(question.source_text_en);
    if (Array.isArray(question.source_sentence_ids) && question.source_sentence_ids.length) {
      normalized.source_sentence_ids = question.source_sentence_ids.map((value) => String(value)).filter(Boolean);
    }
    if (question.scene_id) normalized.scene_id = String(question.scene_id);
    if (question.concept_id) normalized.concept_id = String(question.concept_id);
    return normalized;
  }

  // Keep the learner-facing quiz contract explicit: English is the primary
  // surface; Chinese is data for the opt-in hint only.
  function quizDisplay(question) {
    const source = question && typeof question === "object" ? question : {};
    const originalChoices = Array.isArray(source.choices) ? source.choices : [];
    const explicitEnglish = Array.isArray(source.choices_en) ? source.choices_en : null;
    const choicesEn = (explicitEnglish || originalChoices)
      .map((choice) => String(choice == null ? "" : choice).trim())
      .map((choice) => explicitEnglish ? choice : legacyChoice(choice))
      .filter(Boolean);
    const rawChoicesZh = Array.isArray(source.choices_zh)
      ? source.choices_zh
      : originalChoices.map((choice) => hasCjk(choice) ? choice : "");
    const promptSource = String(source.prompt_en || source.q || "").trim();
    const promptZhSource = source.prompt_zh || source.q_zh
      || (hasCjk(source.prompt_en) ? source.prompt_en : (hasCjk(source.q) ? source.q : legacyPromptZh(promptSource)));
    return {
      promptEn: (hasCjk(promptSource) ? legacyPrompt(promptSource) : promptSource).trim(),
      promptZh: String(promptZhSource || "").trim(),
      choicesEn,
      choicesZh: choicesEn.map((_, index) => String(rawChoicesZh[index] == null ? "" : rawChoicesZh[index]).trim()),
    };
  }

  function buildEpisodeQuiz(questions, { grade = 1, intensity = "light", seed = "storybook", targetTerms = [] } = {}) {
    const rules = gradeRules(grade);
    const normalized = (Array.isArray(questions) ? questions : [])
      .map((question, index) => normalizeQuestion(question, index, rules.types[index % rules.types.length], { targetTerms }))
      .filter(Boolean);
    let random = hashSeed(seed);
    const order = normalized.map((_, index) => index);
    for (let i = order.length - 1; i > 0; i -= 1) {
      random = nextRandom(random);
      const j = random % (i + 1);
      [order[i], order[j]] = [order[j], order[i]];
    }
    // Keep the first implementation short and predictable: use the minimum
    // grade-appropriate count, capped by the available authored questions.
    // Later adaptive drills may raise this toward rules.max.
    const count = Math.min(normalized.length, Math.max(rules.min, Math.min(rules.max, questionCount(grade, intensity))));
    return order.slice(0, count).map((index, position) => ({
      ...normalized[index],
      type: normalized[index].type || rules.types[position % rules.types.length],
    }));
  }

  function answerIndex(value) {
    if (value && typeof value === "object") return Number(value.choice);
    return Number(value);
  }

  function scoreEpisodeQuiz(questions, answers, { passRate = DEFAULT_PASS_RATE } = {}) {
    const items = (Array.isArray(questions) ? questions : []).map((question, index) => normalizeQuestion(question, index, "meaning-choice")).filter(Boolean);
    const source = answers && typeof answers === "object" ? answers : {};
    const mastered = [];
    const wrong = [];
    const wrongIds = [];
    let correct = 0;
    items.forEach((item) => {
      const ok = answerIndex(source[item.id]) === item.answer;
      if (ok) {
        correct += 1;
        if (item.term && !mastered.includes(item.term)) mastered.push(item.term);
      } else {
        wrongIds.push(item.id);
        if (item.term && !wrong.includes(item.term)) wrong.push(item.term);
      }
    });
    const total = items.length;
    const percent = total ? Math.round((correct / total) * 100) : 0;
    return {
      total,
      correct,
      percent,
      passed: total > 0 && correct / total >= Number(passRate),
      mastered_terms: mastered,
      wrong_terms: wrong,
      wrong_ids: wrongIds,
    };
  }

  return { DEFAULT_PASS_RATE, gradeRules, questionCount, questionTerm, quizDisplay, buildEpisodeQuiz, scoreEpisodeQuiz };
}));
