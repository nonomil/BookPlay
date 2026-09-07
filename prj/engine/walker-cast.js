"use strict";

/* 西游记走路伙伴共享模块：角色表与"按标题/台词选角"打分逻辑。
 * 数据原样抽取自 wala.js 的 WALKING_CAST（数据以 wala.js 为准，改动需同步）。
 * 供知识巩固页（lesson）与亲子互动卡（parent）按集选小人。
 * GIF 走 WALKING_CAST.gif，即数据包里的
 * assets/generated/jttw-player-walkers/<id>/<id>-walk.gif。
 */
(function expose(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.WalaWalkerCast = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function walkerCastFactory() {
  const WALKING_CAST = Object.freeze({
    wukong: Object.freeze({
      id: "wukong", nameZh: "孙悟空", nameEn: "Sun Wukong",
      gif: "assets/generated/jttw-player-walkers/wukong/wukong-walk.gif",
      atlas: "assets/generated/jttw-player-walkers/wukong/wukong-walk-action-atlas.png",
      titleAliases: [["the monkey", 8], ["the waterfall cave", 5], ["powerful sage", 7], ["peach garden", 5], ["trouble in heaven", 7], ["the bet", 5], ["wukong gets tricked", 8], ["sun kongwu", 8], ["two wukongs", 8], ["battle of the wukongs", 8]],
      aliases: [["悟空", 3], ["齐天大圣", 4], ["美猴王", 4], ["wukong", 3], ["sun wukong", 4], ["monkey king", 4], ["monkey", 0.25]],
    }),
    tang: Object.freeze({
      id: "tang", nameZh: "唐僧", nameEn: "Tang Monk",
      gif: "assets/generated/jttw-player-walkers/tang/tang-walk.gif",
      titleAliases: [["the true scriptures", 5], ["a promise to protect", 6], ["the robe", 5], ["the injured monk", 6], ["two tang monks", 7], ["the scared boy", 4], ["the sad king", 4], ["the tang monk and the river", 7], ["the thunderclap monastery", 6]],
      aliases: [["唐僧", 4], ["唐三藏", 4], ["玄奘", 4], ["tang monk", 4], ["tripitaka", 4], ["monk", 0.8]],
    }),
    bajie: Object.freeze({
      id: "bajie", nameZh: "猪八戒", nameEn: "Zhu Bajie",
      gif: "assets/generated/jttw-player-walkers/bajie/bajie-walk.gif",
      titleAliases: [["bajie takes a nap", 8], ["bajie tries to sleep", 8], ["the treasure in the well", 6], ["magnificent silk vests", 5], ["wind and fog", 5], ["bajie and the monster", 8], ["rewards", 3]],
      aliases: [["猪八戒", 4], ["八戒", 4], ["bajie", 4], ["zhu bajie", 4], ["pigsy", 3], ["pig", 0.8]],
    }),
    shawujing: Object.freeze({
      id: "shawujing", nameZh: "沙悟净", nameEn: "Sha Wujing",
      gif: "assets/generated/jttw-player-walkers/shawujing/shawujing-walk.gif",
      titleAliases: [["the monster in the river", 8], ["the river god", 5], ["the demon under the ice", 6]],
      aliases: [["沙悟净", 4], ["沙僧", 4], ["悟净", 4], ["wujing", 4], ["sha wujing", 4], ["sandy", 3]],
    }),
    guanyin: Object.freeze({
      id: "guanyin", nameZh: "观音", nameEn: "Guanyin",
      gif: "assets/generated/jttw-player-walkers/guanyin/guanyin-walk.gif",
      titleAliases: [["the monster's friend", 6], ["a very strange pill", 6], ["guanyin's vase", 8], ["the goldfish in the basket", 6], ["a question for buddha", 5], ["the star lord", 4]],
      aliases: [["观音菩萨", 5], ["观世音", 5], ["观音", 5], ["guanyin", 5], ["kuan yin", 5], ["goddess of mercy", 4], ["bodhisattva", 2]],
    }),
    redboy: Object.freeze({
      id: "redboy", nameZh: "红孩儿", nameEn: "Red Boy",
      gif: "assets/generated/jttw-player-walkers/redboy/redboy-walk.gif",
      titleAliases: [["red boy", 9], ["magic fire", 8], ["guanyin becomes angry", 6], ["an ocean from a vase", 7], ["the man in the canoe", 6]],
      aliases: [["红孩儿", 6], ["红孩", 6], ["red boy", 6], ["redboy", 6], ["fire child", 4], ["三昧真火", 3], ["samadhi fire", 3], ["magic fire", 2]],
    }),
    ironfan: Object.freeze({
      id: "ironfan", nameZh: "铁扇公主", nameEn: "Princess Iron Fan",
      gif: "assets/generated/jttw-player-walkers/ironfan/ironfan-walk.gif",
      titleAliases: [["the iron immortal", 8], ["the magic fan", 8], ["tricked again and again", 6]],
      aliases: [["铁扇公主", 6], ["铁扇", 6], ["芭蕉扇", 5], ["iron fan", 6], ["princess iron fan", 6], ["iron immortal", 6], ["banana leaf fan", 4], ["magic fan", 3]],
    }),
    bullking: Object.freeze({
      id: "bullking", nameZh: "牛魔王", nameEn: "Bull King",
      gif: "assets/generated/jttw-player-walkers/bullking/bullking-walk.gif",
      titleAliases: [["the mountain of flames", 7]],
      aliases: [["牛魔王", 6], ["牛魔", 6], ["大力牛魔王", 6], ["bull demon king", 6], ["bull king", 6], ["bull demon", 5], ["bull", 0.7]],
    }),
    dragonking: Object.freeze({
      id: "dragonking", nameZh: "东海龙王", nameEn: "East Sea Dragon King",
      gif: "assets/generated/jttw-player-walkers/dragonking/dragonking-walk.gif",
      atlas: "assets/generated/jttw-player-walkers/dragonking/dragonking-walk-action-atlas.png",
      titleAliases: [["the dragon king", 8], ["tea with a dragon", 6]],
      aliases: [["东海龙王", 7], ["龙王", 6], ["龙宫", 4], ["dragon king", 7], ["east sea dragon king", 7], ["dragon palace", 4], ["dragon", 0.35]],
    }),
    chaosdemon: Object.freeze({
      id: "chaosdemon", nameZh: "混世魔王", nameEn: "Demon of Chaos",
      gif: "assets/generated/jttw-player-walkers/chaosdemon/chaosdemon-walk.gif",
      atlas: "assets/generated/jttw-player-walkers/chaosdemon/chaosdemon-walk-action-atlas.png",
      titleAliases: [["the demon of chaos", 10]],
      aliases: [["混世魔王", 9], ["混世", 8], ["demon of chaos", 9], ["chaos demon", 9]],
    }),
    whitedragonhorse: Object.freeze({
      id: "whitedragonhorse", nameZh: "白龙马", nameEn: "White Dragon Horse",
      gif: "assets/generated/jttw-player-walkers/whitedragonhorse/whitedragonhorse-walk.gif",
      titleAliases: [["the dragon in the river", 9], ["help from a dragon", 7]],
      aliases: [["白龙马", 7], ["小白龙", 6], ["白龙", 5], ["white dragon horse", 7], ["dragon horse", 6], ["little white dragon", 5], ["bai long ma", 6]],
    }),
    subodhi: Object.freeze({
      id: "subodhi", nameZh: "菩提祖师", nameEn: "Patriarch Subhuti",
      gif: "assets/generated/jttw-player-walkers/subodhi/subodhi-walk.gif",
      atlas: "assets/generated/jttw-player-walkers/subodhi/subodhi-walk-action-atlas.png",
      titleAliases: [["secret formulas", 9], ["菩提祖师", 9]],
      aliases: [["菩提祖师", 7], ["菩提", 6], ["祖师", 3], ["subhuti", 7], ["patriarch subhuti", 7], ["master subhuti", 6]],
    }),
    jadeemperor: Object.freeze({
      id: "jadeemperor", nameZh: "玉皇大帝", nameEn: "Jade Emperor",
      gif: "assets/generated/jttw-player-walkers/jadeemperor/jadeemperor-walk.gif",
      titleAliases: [["a job in heaven", 6], ["the powerful sage", 4], ["help from heaven", 7]],
      aliases: [["玉皇大帝", 7], ["玉帝", 7], ["jade emperor", 7], ["emperor of heaven", 6], ["heavenly emperor", 6]],
    }),
    yellowwind: Object.freeze({
      id: "yellowwind", nameZh: "黄风大王", nameEn: "Yellow Wind King",
      gif: "assets/generated/jttw-player-walkers/yellowwind/yellowwind-walk.gif",
      titleAliases: [["the great king yellow wind", 9], ["powerful wind magic", 8]],
      aliases: [["黄风大王", 7], ["黄风怪", 7], ["黄风", 6], ["yellow wind king", 7], ["yellow wind demon", 6], ["yellow wind", 5]],
    }),
    whitebone: Object.freeze({
      id: "whitebone", nameZh: "白骨夫人", nameEn: "Lady White Bone",
      gif: "assets/generated/jttw-player-walkers/whitebone/whitebone-walk.gif",
      titleAliases: [["lady whitebone", 9], ["lady white bone", 9], ["whitebone", 9], ["white bone", 8]],
      aliases: [["白骨夫人", 7], ["白骨精", 7], ["white bone demon", 7], ["lady white bone", 7], ["white bone", 5], ["bone demon", 5]],
    }),
    blackwind: Object.freeze({
      id: "blackwind", nameZh: "黑风大王", nameEn: "Black Wind King",
      gif: "assets/generated/jttw-player-walkers/blackwind/blackwind-walk.gif",
      titleAliases: [["the black bear spirit", 8], ["the monster's friend", 8], ["a very strange pill", 8]],
      aliases: [["黑风大王", 7], ["黑风怪", 7], ["黑熊精", 7], ["黑熊", 6], ["black wind king", 7], ["black bear spirit", 7], ["black bear", 6], ["bear spirit", 5]],
    }),
    zhenyuan: Object.freeze({
      id: "zhenyuan", nameZh: "镇元大仙", nameEn: "Great Immortal Zhenyuan",
      gif: "assets/generated/jttw-player-walkers/zhenyuan/zhenyuan-walk.gif",
      titleAliases: [["the ginseng fruit", 8], ["the magic sleeve", 8], ["the frying pan", 7]],
      aliases: [["镇元大仙", 7], ["镇元子", 7], ["大仙", 4], ["great immortal", 7], ["zhenyuan", 7], ["ginseng immortal", 5]],
    }),
    hundredflowers: Object.freeze({
      id: "hundredflowers", nameZh: "百花羞公主", nameEn: "Princess Hundred Flowers",
      gif: "assets/generated/jttw-player-walkers/hundredflowers/hundredflowers-walk.gif",
      titleAliases: [["tricked by the princess", 9], ["a visit to the king", 7], ["tricked again", 8]],
      aliases: [["百花羞", 7], ["百花羞公主", 7], ["公主", 4], ["princess hundred flowers", 7], ["hundred flowers", 6], ["princess", 2]],
    }),
    goldenhorn: Object.freeze({
      id: "goldenhorn", nameZh: "金角大王", nameEn: "Golden Horn",
      gif: "assets/generated/jttw-player-walkers/goldenhorn/goldenhorn-walk.gif",
      titleAliases: [["the injured monk", 8], ["the magic gourd", 9], ["a trade", 8], ["a visit from laozi", 7]],
      aliases: [["金角大王", 7], ["金角", 7], ["golden horn", 7], ["gold horn", 6], ["golden horn demon", 7]],
    }),
    liondemon: Object.freeze({
      id: "liondemon", nameZh: "狮魔王", nameEn: "Lion Demon",
      gif: "assets/generated/jttw-player-walkers/liondemon/liondemon-walk.gif",
      titleAliases: [["the lion demon", 9], ["a problem for the lion demon", 9], ["the elephant demon", 7], ["the raptor demon", 7]],
      aliases: [["狮魔王", 7], ["狮子精", 7], ["青狮", 6], ["lion demon", 7], ["lion king", 6], ["elephant demon", 6], ["raptor demon", 6]],
    }),
    tigerimmortal: Object.freeze({
      id: "tigerimmortal", nameZh: "虎力大仙", nameEn: "Tiger Immortal",
      gif: "assets/generated/jttw-player-walkers/tigerimmortal/tigerimmortal-walk.gif",
      titleAliases: [["the monks and the cart", 8], ["the tiger immortal", 10], ["a guessing game", 8], ["the meditation contest", 8]],
      aliases: [["虎力大仙", 8], ["虎力", 7], ["tiger immortal", 8], ["tiger", 1.2]],
    }),
    yellowbrows: Object.freeze({
      id: "yellowbrows", nameZh: "黄眉怪", nameEn: "Yellow Brows",
      gif: "assets/generated/jttw-player-walkers/yellowbrows/yellowbrows-walk.gif",
      titleAliases: [["the magic cloth", 10], ["the melon field", 8]],
      aliases: [["黄眉怪", 8], ["黄眉大王", 8], ["黄眉", 7], ["yellow brows", 8], ["yellow brow", 7], ["yellow brows demon", 8]],
    }),
    powerdemon: Object.freeze({
      id: "powerdemon", nameZh: "大力妖王", nameEn: "Demon of Power",
      gif: "assets/generated/jttw-player-walkers/powerdemon/powerdemon-walk.gif",
      titleAliases: [["the sad king", 8], ["fire smoke and sand", 9], ["magic bells", 10]],
      aliases: [["大力妖王", 8], ["大力魔王", 8], ["demon of power", 9], ["power demon", 8]],
    }),
    spiderdemon: Object.freeze({
      id: "spiderdemon", nameZh: "蜘蛛精", nameEn: "Spider Spirit",
      gif: "assets/generated/jttw-player-walkers/spiderdemon/spiderdemon-walk.gif",
      titleAliases: [["the three young women", 9], ["the priest's plan", 8]],
      aliases: [["蜘蛛精", 8], ["蜘蛛妖", 8], ["spider spirit", 8], ["spider spirits", 8], ["spider demon", 8]],
    }),
    centipededemon: Object.freeze({
      id: "centipededemon", nameZh: "多目怪", nameEn: "Centipede Spirit",
      gif: "assets/generated/jttw-player-walkers/centipededemon/centipededemon-walk.gif",
      titleAliases: [["many eyes", 10]],
      aliases: [["多目怪", 9], ["蜈蚣精", 9], ["centipede spirit", 9], ["centipede demon", 9], ["demon lord of many eyes", 9], ["many eyes", 8]],
    }),
  });
  const EPISODE_OVERRIDES = Object.freeze({
    1: "wukong", 2: "wukong", 3: "subodhi", 4: "subodhi",
    5: "chaosdemon", 6: "dragonking", 7: "wukong",
  });

  function normalizeTitle(text) {
    return String(text || "")
      .toLocaleLowerCase()
      .replace(/[“”‘’'".,!?！？：:、，。·()（）\[\]【】]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function countAlias(text, alias) {
    const t = normalizeTitle(text);
    const a = normalizeTitle(alias);
    if (!t || !a) return 0;
    let count = 0;
    let idx = t.indexOf(a);
    while (idx !== -1) {
      count += 1;
      idx = t.indexOf(a, idx + a.length);
    }
    return count;
  }

  /* 按书数据（title + nodes 台词）为这一集选出主角小人。无匹配时回退悟空。 */
  function resolve(book, episode) {
    const source = book && typeof book === "object" ? book : {};
    const explicitId = Number.isFinite(Number(episode)) ? EPISODE_OVERRIDES[Number(episode)] : "";
    if (explicitId && WALKING_CAST[explicitId]) {
      return packedRole(WALKING_CAST[explicitId]);
    }
    const title = source.title && typeof source.title === "object" ? source.title : {};
    const titleSources = [title.zh, title.en]
      .filter(Boolean).map(normalizeTitle).filter(Boolean);
    const body = (Array.isArray(source.nodes) ? source.nodes : [])
      .map((node) => [node && node.text_en, node && node.text_zh, node && node.speaker]
        .filter(Boolean).join(" ")).join(" ");
    let best = null;
    let bestScore = -1;
    for (const role of Object.values(WALKING_CAST)) {
      let score = 0;
      for (const [alias, weight] of role.titleAliases || []) {
        const normalized = normalizeTitle(alias);
        if (titleSources.some((t) => t === normalized)) score += weight * 10000;
        else titleSources.forEach((t) => { score += countAlias(t, alias) * weight * 100; });
      }
      for (const [alias, weight] of role.aliases || []) {
        titleSources.forEach((t) => { score += countAlias(t, alias) * weight * 100; });
        score += countAlias(body, alias) * weight;
      }
      if (score > bestScore) { best = role; bestScore = score; }
    }
    return packedRole(best || WALKING_CAST.wukong);
  }

  function packedRole(role) {
    return {
      id: role.id,
      nameZh: role.nameZh,
      nameEn: role.nameEn,
      gif: role.gif,
      atlas: role.atlas || "",
    };
  }

  return { WALKING_CAST, resolve };
});
