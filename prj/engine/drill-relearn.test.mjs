import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const js = fs.readFileSync(path.join(dir, "drill.js"), "utf8");
const walaJs = fs.readFileSync(path.join(dir, "wala.js"), "utf8");
const html = fs.readFileSync(path.join(dir, "drill.html"), "utf8");

const fails = [];
const check = (ok, msg) => { if (!ok) fails.push(msg); };

check(/qs\.push\(\{[\s\S]*episode:\s*Number\(ep\.episode/.test(js),
  "quiz questions must retain their source episode for relearning");
check(/quiz_after/.test(js) && /quizReviewTarget|resolveQuizReview/.test(js),
  "failed quiz relearning must resolve the exact quiz_after scene");
check(/function quizAnswer[\s\S]*q-feedback[\s\S]*再学一次/.test(js),
  "an incorrect plot quiz answer must expose a 再学一次 action");
check(/再学一次[\s\S]*mode.*study|mode.*study[\s\S]*再学一次/.test(js),
  "relearning navigation must enter study mode");
check(/subtitle.*enzh|readMode.*enzh/.test(js) && /sidecards.*1|sideCards.*true/.test(js),
  "relearning navigation must force bilingual subtitles and side cards");
check(/searchParams\.set\(["']return["']/.test(js),
  "relearning navigation must carry a return URL to the current quiz");
check(/node_id|nodeId/.test(js) && /searchParams\.set\(["']node["']/.test(js),
  "relearning navigation must carry the matched scene node");
check(/q-feedback|quiz-feedback/.test(js) || /q-feedback|quiz-feedback/.test(html),
  "quiz markup must reserve a feedback area without advancing the failed question");
check(/sessionStorage[\s\S]*RESUME_KEY|RESUME_KEY[\s\S]*sessionStorage/.test(js),
  "relearning navigation must preserve the in-progress quiz counters across return");
check(/reviewContext/.test(walaJs) && /function saveProgress\(done\)\s*\{\s*if \(reviewContext\) return/.test(walaJs),
  "relearning context must not write normal episode progress");

check(/function wordReturnUrl/.test(js) && /wordId/.test(js),
  "word relearning must preserve the current word question for return");
check(/function openWordRelearn[\s\S]*new URL\(["']wala\.html/.test(js),
  "word relearning must navigate to the normal full-screen player");
check(/function openWordRelearn[\s\S]*searchParams\.set\(["']mode["'],\s*["']study/.test(js),
  "word relearning must enter intensive study mode");
check(/function openWordRelearn[\s\S]*searchParams\.set\(["']subtitle["'],\s*["']enzh/.test(js)
  && /function openWordRelearn[\s\S]*searchParams\.set\(["']sidecards["'],\s*["']1/.test(js),
  "word relearning must force bilingual subtitles and study word cards");
check(/function openWordRelearn[\s\S]*searchParams\.set\(["']annot["'],\s*["']1/.test(js)
  && /function openWordRelearn[\s\S]*searchParams\.set\(["']node["']/.test(js),
  "word relearning must force annotated captions and jump to the matched scene");
check(/w-relearn[\s\S]*openWordRelearn\(w(?:,\s*rb)?\)/.test(js),
  "the word relearn button must use full-screen navigation instead of the modal preview");
check(/params\.get\(["']annot["']\)/.test(walaJs),
  "the full-screen player must accept an annotated-caption query override");

if (fails.length) {
  console.error("FAIL\n" + fails.map((f) => " - " + f).join("\n"));
  process.exit(1);
}
console.log("PASS drill relearn contracts");
