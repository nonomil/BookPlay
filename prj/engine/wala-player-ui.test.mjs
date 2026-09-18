import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(dir, "wala.html"), "utf8");
const css = fs.readFileSync(path.join(dir, "wala.css"), "utf8");
const sentenceMarkRule = css.match(/\.w-sent-mark svg\s*\{[^}]*\}/)?.[0] || "";
const js = fs.readFileSync(path.join(dir, "wala.js"), "utf8");
const storageJs = fs.readFileSync(path.join(dir, "storage.js"), "utf8");

const fails = [];
const check = (ok, msg) => { if (!ok) fails.push(msg); };

check(!/>\s*再听一遍\s*</.test(html) && !html.includes(">再听一遍<"), "html must not show 再听一遍");
check(!js.includes(">再听一遍<") && !js.includes("再听一遍"), "js must not contain 再听一遍");

check(/#w-en \.w-word\.w-on\s*\{[^}]*color:\s*#2b2320/.test(css.replace(/\s+/g, " ")),
  "karaoke on-state must keep body color #2b2320");
check(/#w-en \.w-term\.w-on\s*\{[^}]*color:\s*#c2830a/.test(css.replace(/\s+/g, " ")),
  "vocab gold must stay gold while karaoke is on");

check(!html.includes('id="w-speak"'), "toolbar/combined #w-speak must be removed");
check(!html.includes('id="w-sent-play"'), "trailing combined #w-sent-play must be removed");
check(!html.includes("w-sent-line"), "combined w-sent-line wrapper must be gone");

check(html.includes('id="w-sidecards-on"') && html.includes('id="w-sidecards-off"'),
  "settings must expose a side word-card on/off toggle");
check(js.includes("storage.readSideCards()") && js.includes("storage.writeSideCards"),
  "side word-card visibility must use the storage contract");
check(/passMode !== "study"/.test(js),
  "story mode must keep the side vocabulary rail hidden so it cannot compete with the plot");
check(/Math\.min\(2,\s*sideCardLimit\(\)\)/.test(js),
  "the context rail must cap itself at two words even in the maximum study level");
const sideWordRendererStart = js.indexOf("function renderSideWord(");
const sideWordRendererEnd = js.indexOf("function bumpStat(", sideWordRendererStart);
const sideWordRenderer = sideWordRendererStart >= 0 && sideWordRendererEnd > sideWordRendererStart
  ? js.slice(sideWordRendererStart, sideWordRendererEnd) : "";
check(sideWordRenderer.includes("vcard-context") && sideWordRenderer.includes("aria-label=\"听单词和中文\""),
  "side vocabulary cues must use the compact context-card renderer and an accessible speaker control");
check(sideWordRenderer && !sideWordRenderer.includes("vbadge") && !sideWordRenderer.includes("vdef"),
  "context cards must not repeat the large badge and long definition from the detail card");
const contextSpeakerStart = css.indexOf("#w-cards .vcard-context .vspk");
const contextSpeakerEnd = contextSpeakerStart >= 0 ? css.indexOf("}", contextSpeakerStart) : -1;
const contextSpeakerRule = contextSpeakerStart >= 0 && contextSpeakerEnd > contextSpeakerStart
  ? css.slice(contextSpeakerStart, contextSpeakerEnd + 1) : "";
check(/min-height:\s*0/.test(contextSpeakerRule) && /aspect-ratio:\s*1\s*\/\s*1/.test(contextSpeakerRule),
  "compact vocabulary speaker buttons must override TV min-height and keep a true circle");
const contextCardStart = css.indexOf(".vcard-context {");
const contextCardEnd = contextCardStart >= 0 ? css.indexOf("}", contextCardStart) : -1;
const contextCardRule = contextCardStart >= 0 && contextCardEnd > contextCardStart
  ? css.slice(contextCardStart, contextCardEnd + 1) : "";
check(/padding:\s*0\.2rem\s+0\.36rem\s*!important/.test(contextCardRule),
  "context vocabulary cards must use the shorter vertical padding");
check(html.includes('id="w-vocab-peek"') && /role="dialog"/.test(html),
  "the player must expose a lightweight vocabulary detail layer");
check(/function openVocabPeek\(/.test(js) && /function hideVocabPeek\(/.test(js),
  "vocabulary detail layer must have explicit open and close handlers");
check(/w-vocab-peek[\s\S]*再学一次/.test(js),
  "vocabulary detail layer must offer a replay action without leaving the current episode");
check(/renderEnText[\s\S]*openVocabPeek/.test(js) && /renderSideWord[\s\S]*openVocabPeek/.test(js),
  "both inline words and compact context cues must open the same detail layer");
check(/role=\"button\"/.test(js) && /tabindex=\"0\"/.test(js),
  "inline vocabulary terms must expose a focusable button contract for TV and keyboard users");
check(/addEventListener\("keydown"[\s\S]*inspectTerm/.test(js),
  "inline vocabulary terms must open the detail layer with Enter or Space");

const finishStart = js.indexOf("function finishEpisode()");
const endQuizStart = js.indexOf("function startEndQuiz()", finishStart);
const finishBody = finishStart >= 0 && endQuizStart > finishStart ? js.slice(finishStart, endQuizStart) : "";
check(finishBody && !finishBody.includes("lesson.html") && !/<a\b/.test(finishBody),
  "finish bubble must not contain an inline knowledge-consolidation link");
check(finishBody && /saveProgress\(false\)[\s\S]*setAvatar\(false\)/.test(finishBody),
  "finishing an episode must leave story preparation resumable until lesson pass");
check(/let episodeFinished\s*=\s*false/.test(js), "player must track the completed-episode state");
check(/episodeFinished[\s\S]*lesson-words\.html\?ep=/.test(js),
  "next-page action must navigate to the current episode word study after completion");
check(js.includes("lesson-words.html"),
  "player knowledge-consolidation entry must open the independent word study page");

const enPlayIdx = html.indexOf('id="w-en-play"');
const enIdx = html.indexOf('id="w-en"');
const zhPlayIdx = html.indexOf('id="w-zh-play"');
const zhIdx = html.indexOf('id="w-zh"');
check(enPlayIdx > enIdx, "EN replay mark #w-en-play must sit after #w-en at the sentence end");
check(zhPlayIdx > zhIdx, "ZH playback mark #w-zh-play must sit after #w-zh at the sentence end");
check(html.includes('title="重放原片"') && html.includes('aria-label="重放原片"'),
  "EN button must say 重放原片");
check(html.includes('title="播放中文"') && html.includes('aria-label="播放中文"'),
  "ZH button must say 播放中文");

check(/\.w-sent-mark[\s\S]*min-width:\s*40px/.test(css) && /\.w-sent-mark[\s\S]*min-height:\s*40px/.test(css),
  "sentence marks must be at least 40px tap targets");
check(/\.w-sent-mark svg\s*\{\s*width:\s*16px/.test(css.replace(/\s+/g, " ")),
  "sentence mark icons must use a compact 16px visual size");

check(js.includes("function playZhSentence"), "js must define playZhSentence");
check(/function playZhSentence[\s\S]*zhItems/.test(js), "ZH button path must use zhItems");
check(/function playZhSentence[\s\S]*text_zh/.test(js), "ZH button path must use text_zh");
check(!js.includes("function playSentenceAudio"), "old combined playSentenceAudio must be gone");
check(/w-en-play[\s\S]*playCurrentSentence|enPlay[\s\S]*playCurrentSentence/.test(js),
  "EN button must call playCurrentSentence");
check(/w-zh-play[\s\S]*playZhSentence|zhPlay[\s\S]*playZhSentence/.test(js),
  "ZH button must call playZhSentence");
check(/zhRow[\s\S]*hidden|el\.zhRow[\s\S]*hidden/.test(js),
  "EN-only mode must hide the ZH row");

const avatarStart = js.indexOf("function setAvatar(");
const toolsStart = js.indexOf("/* ---------- 工具 ---------- */", avatarStart);
const avatarRenderer = avatarStart >= 0 && toolsStart > avatarStart ? js.slice(avatarStart, toolsStart) : "";
check(avatarRenderer && avatarRenderer.includes("resolveCompanionStage") && !avatarRenderer.includes("illustration"),
  "subtitle avatar must resolve the current companion stage, never a scene illustration");
check(/function setAvatar\(talking\)/.test(js),
  "avatar renderer must only depend on companion stage and talking state");
check(/window\.BookPlayCompanion[\s\S]*deriveCompanionStage/.test(js),
  "player avatar must reuse the shared companion stage resolver");
check(/assets\/companions\/white-dragon\/stages\/mysterious-egg\.png/.test(js),
  "player must have the dragon egg as the initial fallback art");
check(/w-avatar[^>]*href="companion\.html\?series=jttw"/.test(html),
  "the companion portrait must link to the pet room");
check(!html.includes('../assets/cast/narrator/idle.png'),
  "the initial avatar must not be a narrator portrait");
check(!js.includes("avatarCropPosition") && !js.includes("objectPosition"),
  "subtitle avatar must not crop the current video illustration");
check(/setAvatar\(false\)/.test(js) && /setAvatar\(true\)/.test(js),
  "rendered and playing nodes must update the same companion avatar");
check(/const WALKING_CAST = Object\.freeze/.test(js)
  && /wukong:[\s\S]*tang:[\s\S]*bajie:[\s\S]*shawujing:/.test(js),
  "player avatar must expose a reusable walking cast");
check(/guanyin:[\s\S]*redboy:[\s\S]*ironfan:[\s\S]*bullking:[\s\S]*dragonking:[\s\S]*whitedragonhorse:[\s\S]*subodhi:[\s\S]*jadeemperor:[\s\S]*yellowwind:[\s\S]*whitebone:/.test(js),
  "player avatar cast must include story-specific supporting characters");
check(/whitebone:[\s\S]*blackwind:[\s\S]*zhenyuan:[\s\S]*hundredflowers:[\s\S]*goldenhorn:[\s\S]*liondemon:/.test(js),
  "player avatar cast must include the middle and late-arc story leads");
check(/liondemon:[\s\S]*tigerimmortal:[\s\S]*yellowbrows:[\s\S]*powerdemon:[\s\S]*spiderdemon:[\s\S]*centipededemon:/.test(js),
  "player avatar cast must include the cart, yellow-brows, power, spider and centipede leads");
check(/function resolveEpisodeWalker\(/.test(js)
  && /episodeWalkerEpisode === ep/.test(js)
  && /resolveEpisodeWalker\(\)/.test(js),
  "episode avatar selection must be cached for the whole episode");
check(/titleAliases:\s*\[\["the monkey",\s*8\]/.test(js)
  && /titleAliases:\s*\[\["the dragon in the river",\s*9\]/.test(js)
  && /titleAliases:\s*\[\["lady whitebone",\s*9\]/.test(js),
  "episode avatar selection must recognize exact story-title leads");
check(/role\.titleAliases\s*\|\|\s*\[\][\s\S]*weight \* 100/.test(js),
  "exact title evidence must outweigh generic character word counts");
check(/jttw-player-walkers\/wukong\/wukong-walk\.gif/.test(js)
  && /jttw-player-walkers\/tang\/tang-walk\.gif/.test(js)
  && /jttw-player-walkers\/bajie\/bajie-walk\.gif/.test(js)
  && /jttw-player-walkers\/shawujing\/shawujing-walk\.gif/.test(js)
  && /jttw-player-walkers\/(guanyin|redboy|ironfan|bullking|dragonking|whitedragonhorse|subodhi|jadeemperor|yellowwind|whitebone)\/[a-z-]+-walk\.gif/.test(js),
  "avatar renderer must load transparent looping GIFs for the main and story-specific characters");
check(/jttw-player-walkers\/(blackwind|zhenyuan|hundredflowers|goldenhorn|liondemon)\/[a-z-]+-walk\.gif/.test(js),
  "avatar renderer must load the added middle and late-arc character GIFs");
check(/jttw-player-walkers\/(tigerimmortal|yellowbrows|powerdemon|spiderdemon|centipededemon)\/[a-z-]+-walk\.gif/.test(js),
  "avatar renderer must load the cart-to-centipede character GIFs");
check(js.includes('["the monks and the cart", 8]')
  && js.includes('["the magic cloth", 10]')
  && js.includes('["fire smoke and sand", 9]')
  && js.includes('["the three young women", 9]')
  && js.includes('["many eyes", 10]'),
  "episode avatar selection must recognize the five newly added story-title leads");
check(/dataset\.walker/.test(js) && /主角：/.test(js),
  "avatar must expose the selected episode protagonist to assistive labels and diagnostics");
check(/img\.onerror\s*=/.test(js) && /fallbackSrc/.test(js) && /classList\.remove\("has-face"\)/.test(js),
  "missing episode GIFs must fall back to the companion stage instead of showing a broken image");
check(html.indexOf("companion-core.js") >= 0 && html.indexOf("wala.js") > html.indexOf("companion-core.js"),
  "player must load the shared companion resolver before wala.js");

check(/\.w-frame\s*\{[^}]*aspect-ratio:\s*16\s*\/\s*9/.test(css),
  "the media frame must preserve the 16:9 picture area instead of filling a tall viewport");
check(/<div class="w-frame">\s*<img[^>]*id="w-img"[^>]*>\s*<video[^>]*id="w-video"[^>]*><\/video>\s*<div id="w-cards-left"><\/div>\s*<div id="w-cards"><\/div>\s*<div id="w-vocab-peek"[^>]*><\/div>\s*<div class="w-dock">/.test(html),
  "word cards and subtitle dock must be anchored inside the visible media frame");
check(/<video id="w-video" playsinline preload="none">/.test(html),
  "handheld video must not probe Range duration via preload=metadata");
check(!/backdrop-filter/.test(css),
  "Servo ignores blur; speech and chrome must use opaque fills instead of backdrop-filter");
check(/\.w-speech\s*\{[^}]*background:\s*rgba\(253,\s*252,\s*247,\s*0\.96\)/.test(css),
  "subtitles must stay readable on video without relying on blur");
const arrowRule = css.match(/\.w-arrow\s*\{[^}]*\}/)?.[0] || "";
const avatarRule = css.match(/\.w-avatar\s*\{[^}]*\}/)?.[0] || "";
check(/aspect-ratio:\s*1\s*\/\s*1/.test(arrowRule),
  "navigation circles must keep a 1:1 aspect ratio under flex pressure");
check(/aspect-ratio:\s*1\s*\/\s*1/.test(avatarRule),
  "speaker avatar must keep a 1:1 aspect ratio under flex pressure");
check(/\.w-frame\s*>\s*img\s*,\s*\.w-frame\s*>\s*video/.test(css),
  "media sizing must target only the frame's direct media elements");
check(!/\.w-frame\s+img\s*,\s*\.w-frame\s+video/.test(css),
  "media sizing must not capture the nested speaker avatar image");

const sideCardRule = css.match(/#w-cards,\s*\n#w-cards-left\s*\{[^}]*\}/)?.[0] || "";
check(/top:\s*12px/.test(sideCardRule) && !/transform:\s*translateY\(-50%\)/.test(sideCardRule),
  "side word cards must align to the top edge instead of vertical centering");
check(/width:\s*min\(196px,\s*18vw\)/.test(sideCardRule),
  "side word cards must use the compact width");
check(!/#w-cards\s+\.vcard\.vtone-|#w-cards-left\s+\.vcard\.vtone-/.test(css),
  "side word cards must not add colored tone borders");
check(/\.w-dock\s*\{[^}]*left:\s*clamp\(12px,\s*2vw,\s*32px\)[^}]*transform:\s*none/.test(css),
  "subtitle dock must stay independently anchored to the frame's left edge");
check(!js.includes("w-dock-edge") && !js.includes("dock: document.querySelector(\".w-dock\")"),
  "subtitle dock positioning must not be coupled to side-card visibility");

// Subtitle navigation shares the first text row: the controls stay beside the
// sentence instead of consuming a separate line above it.
check(/<div class="w-bubble-row">[\s\S]*class="w-inline-nav w-inline-nav-prev"[\s\S]*id="w-prev"[\s\S]*class="w-texts"[\s\S]*class="w-inline-nav w-inline-nav-next"[\s\S]*id="w-next"/.test(html),
  "subtitle arrows must share the first text row at its left and right edges");
check(!/<div class="w-dock">\s*<button[^>]*id="w-prev"/.test(html),
  "previous arrow must not sit outside the speech panel");
check(!/<\/div>\s*<button[^>]*id="w-next"/.test(html),
  "next arrow must not sit outside the speech panel");
check(/\.w-dock\s*\{[^}]*justify-content:\s*flex-start/.test(css),
  "subtitle dock must align from the left instead of centering the panel");
check(/\.w-bubble-row\s*\{[^}]*display:\s*grid[^}]*grid-template-columns:/.test(css),
  "subtitle row must reserve non-overlapping arrow columns beside the text");
check(/\.w-texts\s*\{[^}]*text-align:\s*left/.test(css),
  "subtitle text column must remain left aligned from the portrait");
check(/\.w-speech\s*\{[^}]*flex:\s*0\s+1\s+auto[^}]*width:\s*fit-content[^}]*max-width:\s*100%[^}]*min-width:\s*max\(0px,\s*calc\(50vw/.test(css),
  "speech panel must remain left aligned while reserving a readable half-screen lane");
check(/\.w-bubble\s*\{[^}]*position:\s*relative/.test(css),
  "speech bubble must anchor corner navigation controls");
check(/\.w-inline-nav\s*\{[^}]*display:\s*contents/.test(css),
  "subtitle arrow wrappers must participate in the same grid row without overlays");
check(!/\.w-inline-nav\s*\{[^}]*position:\s*absolute/.test(css),
  "subtitle arrows must not be absolutely overlaid on the sentence");
check(/\.w-bubble\s*\{[^}]*max-height:\s*min\(32vh,\s*280px\)[^}]*overflow-y:\s*auto/.test(css),
  "long subtitles must scroll inside a bounded bubble");
check(/#w-en\s*\{[^}]*width:\s*fit-content[^}]*max-width:\s*100%[^}]*text-align:\s*left/.test(css),
  "English subtitle must use only the necessary width and stay left aligned");
check(/#w-zh\s*\{[^}]*width:\s*fit-content[^}]*max-width:\s*100%[^}]*text-align:\s*left/.test(css),
  "Chinese subtitle must use only the necessary width and stay left aligned");
check(/#w-cards[\s\S]*\.vterm[^}]*font-size:\s*1\.06rem[^}]*line-height:\s*1\.12/.test(css),
  "side word terms must be larger while keeping compact line spacing");
check(/#w-cards[\s\S]*\.vzh-off[^}]*font-size:\s*0\.88rem[^}]*line-height:\s*1\.16/.test(css),
  "side word translations must use compact line spacing");
check(/\.w-speech\s*\{[^}]*min-width:\s*max\(0px,\s*calc\(50vw/.test(css),
  "portrait plus speech panel must reserve at least half the usable screen on desktop");
check(/\.w-sent-row\s*\{[^}]*justify-content:\s*flex-start/.test(css),
  "sentence rows must stay left aligned while the playback mark sits at the end");
check(/\.w-sent-row\s*\{[^}]*width:\s*fit-content[^}]*max-width:\s*100%/.test(css),
  "sentence rows must size to their content so playback marks sit beside the sentence end");
check(/\.w-sent-mark svg\s*\{\s*width:\s*16px[^}]*height:\s*16px/.test(sentenceMarkRule.replace(/\s+/g, " ")),
  "subtitle play and replay icons must be visually smaller");
check(/\.w-sent-mark\s*\{[^}]*background:\s*rgba\(16,\s*12,\s*9,\s*0\.16\)/.test(css),
  "subtitle play and replay controls must use the neutral arrow style instead of yellow fill");
check(/\.w-arrow\s*\{[^}]*width:\s*clamp\(24px,\s*1\.8vw,\s*28px\)/.test(css),
  "subtitle arrow squares must be compact");

check(js.includes("字幕框右上角的 ▶"),
  "episode completion hint must point to the new right-arrow control");

check(html.includes('id="w-break-card"') && html.includes('id="w-listen-panel"'),
  "player must expose the break prompt and listen-mode panel");
check(html.includes('id="w-listen-exit"') && html.includes('id="w-listen-loops"'),
  "listen mode must expose exit and bounded loop controls");
check(html.includes('id="w-listen-done"') && html.includes('id="w-listen-again"'),
  "listen mode must expose a lightweight end card and replay action");
check(html.includes('study-session.js') && html.includes('listen-mode.js'),
  "player must load the pure study-session and listen-mode modules before wala.js");
check(/mode=listen/.test(js) && /normalizeListenOptions/.test(js),
  "player must recognize the listen query mode and normalize its options");
check(/function showListenDone\(/.test(js) && /function continueListenAfterSentence\(/.test(js),
  "listen mode must have explicit loop completion and sentence-advance handlers");
check(/function exitListenMode[\s\S]*history\.replaceState/.test(js),
  "exiting listen mode must remove the listen query so refresh returns to learning mode");
check(/const term = termAt\(node, tok\.text\)/.test(js) && /const gloss = annotOn \? glossOf\(bare, node\) : ""/.test(js),
  "audio-only listening must keep inline vocabulary annotations available");
check(/bookplay_study_session_v1/.test(storageJs) || /STUDY_SESSION/.test(storageJs),
  "active study time must use a versioned storage key");
check(js.includes('el.listen.href = `wala.html?ep=${e.episode}&mode=listen'),
  "map listen entry must stay inside the Wala player route");
const listenEntryStart = js.indexOf("function enterListenMode");
const listenEntryEnd = js.indexOf("function exitListenMode", listenEntryStart);
const listenEntry = listenEntryStart >= 0 && listenEntryEnd > listenEntryStart
  ? js.slice(listenEntryStart, listenEntryEnd) : "";
check(listenEntry && !listenEntry.includes("saveProgress(true)"),
  "listen mode must not mark an episode complete through saveProgress(true)");
check(listenEntry && !listenEntry.includes("startEndQuiz"),
  "listen mode must not enter the quiz path");
check(/study-session|listen-mode/.test(html) && html.indexOf("wala.js") > html.indexOf("listen-mode.js"),
  "pure listen/session modules must load before the player integration");

if (fails.length) {
  console.error("FAIL\n" + fails.map((f) => " - " + f).join("\n"));
  process.exit(1);
}
console.log("PASS wala player UI contracts");
