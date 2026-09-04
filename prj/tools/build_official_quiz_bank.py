# -*- coding: utf-8 -*-
"""EP1 official quiz bank rebuild (TDD, local-only).

Parses the official quiz PDF for episode 1 (5 questions per episode), checks
question/choice fidelity against content/dialogue_stories/ep1.json, and
rebuilds every answer from the episode's own dialogue nodes with
quote-level answer_evidence. The old heuristic answers are never treated as
truth; evidence must resolve to a verbatim node quote.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[2]
QUIZ_PDF = ROOT / "data" / "测试题" / "08 英文测试题108集全.Journey to the West-quiz.pdf"
STORY_DIR = ROOT / "content" / "dialogue_stories"
OUT_BANK = ROOT / "content" / "lesson_guides" / "official-quiz-bank.json"
REPORTS_DIR = ROOT / "content" / "lesson_guides" / "reports"

EP_HEAD = re.compile(r"Journey to the West\s+(\d+)\s*:", re.I)
PAGE_NO = re.compile(r"^\s*\d+\s*/\s*\d+\s*$")
Q_NO = re.compile(r"^(\d+)\.\s*(.*)$")
OPT = re.compile(r"^([ABC])\.\s*(.*)$", re.I)

HAS_LATIN = re.compile(r"[A-Za-z]")
SMART = str.maketrans({"“": '"', "”": '"', "‘": "'", "’": "'", "—": "-", "–": "-"})
STOPWORDS = {
    "the", "a", "an", "and", "or", "but", "of", "to", "in", "on", "at", "for",
    "with", "from", "by", "as", "if", "so", "than", "then", "there", "here",
    "he", "she", "it", "i", "you", "we", "they", "me", "him", "her", "us",
    "them", "his", "her", "its", "their", "our", "my", "your", "this", "that",
    "these", "those", "will", "would", "shall", "should", "can", "could",
    "may", "might", "must", "be", "been", "being", "am", "is", "are", "was",
    "were", "do", "does", "did", "have", "has", "had", "what", "who", "whom",
    "which", "why", "when", "where", "how", "not", "no", "yes", "very", "up",
    "down", "out", "off", "over", "under", "all", "any", "more", "most",
    "other", "own", "same", "too", "also", "just", "only", "s", "t", "d", "ll",
    "re", "ve", "about", "into", "through", "during", "before", "after",
    "against", "between", "among", "along", "across", "around", "behind",
}

# content verbs that can carry the question's intent; rare tokens (node
# frequency <= 3) are added dynamically by question_verbs()
AUX_VERBS = {
    "be", "am", "is", "are", "was", "were", "have", "has", "had", "do", "does",
    "did", "can", "could", "will", "would", "may", "might", "must", "shall",
    "should", "come", "become", "go", "make", "take", "get", "give", "see",
    "say", "find", "want", "jump", "win", "leave", "run", "walk", "climb",
    "eat", "drink", "play", "live", "put", "open", "split", "break", "roar",
    "flow", "follow", "reach", "move", "speak", "call", "ask", "answer", "sit",
    "stand", "turn", "look", "hear", "listen", "feel", "think", "know", "tell",
    "show", "bring", "send", "hold", "keep", "let", "read", "write", "learn",
    "teach", "work", "help", "stop", "start", "begin", "try", "wish", "laugh",
    "smile", "cry", "shout", "sleep", "wake", "swim", "ride", "sing", "dance",
    "draw", "cut", "catch", "throw", "pull", "push", "carry", "wear", "sell",
    "buy", "pay", "choose", "pick", "watch",
}
# irregular forms -> base verb (covers common past-tense inflection)
IRREG = {
    "had": "have", "came": "come", "became": "become", "found": "find",
    "made": "make", "said": "say", "went": "go", "saw": "see", "told": "tell",
    "knew": "know", "thought": "think", "left": "leave", "got": "get",
    "gave": "give", "took": "take", "won": "win", "stood": "stand",
    "sat": "sit", "ran": "run", "swam": "swim", "drank": "drink", "ate": "eat",
    "slept": "sleep", "woke": "wake", "heard": "hear", "paid": "pay",
    "felt": "feel", "did": "do", "was": "be", "were": "be", "is": "be",
    "are": "be", "has": "have",
}


def normalize_text(s: str) -> str:
    s = unicodedata.normalize("NFKC", (s or "").replace("\xa0", " "))
    s = s.translate(SMART)
    return re.sub(r"\s+", " ", s).strip().lower()


def tokens(s: str) -> set[str]:
    return {w for w in re.findall(r"[a-z0-9']+", normalize_text(s)) if w not in STOPWORDS and len(w) > 1}


def token_present(node_tokens: set[str], token: str) -> bool:
    if token in node_tokens:
        return True
    if len(token) <= 3:
        return False
    return any(t.startswith(token) or token.startswith(t) for t in node_tokens if len(t) > 3)


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


_HEADING_CACHE: dict[str, dict[int, int]] = {}


def _heading_pages(pdf_path: Path) -> dict[int, int]:
    """First page (1-based) of every episode heading, cached per PDF."""
    key = str(pdf_path)
    cached = _HEADING_CACHE.get(key)
    if cached is not None:
        return cached
    reader = PdfReader(str(pdf_path))
    heads: dict[int, int] = {}
    for pno, page in enumerate(reader.pages, start=1):
        for raw in (page.extract_text() or "").splitlines():
            hm = EP_HEAD.search(normalize_text(raw))
            if hm:
                heads.setdefault(int(hm.group(1)), pno)
    _HEADING_CACHE[key] = heads
    return heads


def parse_episode_quiz(pdf_path: str | Path, episode: int) -> list[dict]:
    """Return up to 5 questions for one episode: {number, q, choices, page}."""
    if not 1 <= episode <= 108:
        raise SystemExit(f"BLOCKED: episode out of range (got {episode})")
    reader = PdfReader(str(pdf_path))
    questions: list[dict] = []
    cur: dict | None = None
    pending_qno: int | None = None
    started = False
    start_page = _heading_pages(Path(pdf_path)).get(episode, 1)
    for pno in range(start_page, len(reader.pages) + 1):
        page = reader.pages[pno - 1]
        for raw in (page.extract_text() or "").splitlines():
            t = normalize_text(raw)
            if not t or PAGE_NO.match(t):
                continue
            head = EP_HEAD.search(t)
            if head:
                ep = int(head.group(1))
                if ep == episode:
                    started = True
                elif started:
                    # next episode heading ends this episode's scope
                    return questions
                continue
            if not started:
                continue
            qm = Q_NO.match(t)
            om = OPT.match(t)
            if qm and not om:
                n = int(qm.group(1))
                body = qm.group(2).strip()
                # source PDF numbers episodes 1-55 as 1-5 and 56-108 as 6-10;
                # either block means "this episode's five questions"
                if 1 <= n <= 5 or 6 <= n <= 10:
                    if body:
                        cur = {"number": n, "q": body, "choices": [], "page": pno}
                        questions.append(cur)
                    else:
                        pending_qno = n
                    continue
            if pending_qno is not None:
                if HAS_LATIN.search(t) and not om:
                    cur = {"number": pending_qno, "q": t, "choices": [], "page": pno}
                    questions.append(cur)
                    pending_qno = None
                    continue
            if om and cur:
                idx = "ABC".index(om.group(1).upper())
                body = om.group(2).strip()
                while len(cur["choices"]) < 3:
                    cur["choices"].append("")
                if body:
                    cur["choices"][idx] = body
                continue
            if cur is not None:
                if not any(cur["choices"]):
                    cur["q"] = re.sub(r"\s+", " ", (cur["q"] + " " + t)).strip()
                else:
                    for i in range(2, -1, -1):
                        if cur["choices"][i]:
                            cur["choices"][i] = re.sub(r"\s+", " ", (cur["choices"][i] + " " + t)).strip()
                            break
    return questions


def _score_option(question: dict, option: str, nodes: list[tuple[str, str]]) -> tuple[float, list[str], str]:
    """Score one option against dialogue nodes -> (score, node_ids, match_kind)."""
    infos = _node_infos(nodes)
    verbs = question_verbs(question, infos)
    return _option_score(question, option, infos, verbs)


def _node_infos(nodes: list[tuple[str, str]]) -> list[dict]:
    infos = []
    for nid, text in nodes:
        nt = normalize_text(text)
        if nt:
            infos.append({"node_id": nid, "text": nt, "tokens": tokens(text)})
    return infos


def _phrase_candidates(option: str) -> set[str]:
    ph = {normalize_text(option)}
    m = re.match(r"^(he|she|it|i|you|we|they)\s+(.+)$", normalize_text(option))
    if m:
        ph.add(m.group(2))
    return ph


def question_verbs(question: dict, infos: list[dict]) -> set[str]:
    """Verb-like or rare question tokens (the answer-intent vocabulary)."""
    qt = tokens(question["q"])
    freq: dict[str, int] = {}
    for tok in qt:
        freq[tok] = sum(1 for info in infos if token_present(info["tokens"], tok))
    return {tok for tok in qt if tok in AUX_VERBS or freq.get(tok, 0) <= 3}


def verb_present(info: dict, verb: str) -> bool:
    if token_present(info["tokens"], verb):
        return True
    # node token is an irregular form whose base equals the target verb
    return any(IRREG.get(t) == verb for t in info["tokens"])


def _option_score(question: dict, option: str, infos: list[dict], verbs: set[str]) -> tuple[float, list[str], str]:
    """Best single node: exact option tokens + verb co-occurrence (verb needs opt hit)."""
    opt_toks = tokens(option)
    best_score = 0.0
    best_ids: list[str] = []
    for info in infos:
        opt_hit = sum(1 for tok in opt_toks if tok in info["tokens"])
        if opt_hit == 0:
            continue
        vhit = sum(1 for v in verbs if verb_present(info, v))
        s = float(opt_hit) + 3.0 * float(vhit)
        if s > best_score:
            best_score, best_ids = s, [info["node_id"]]
        elif s == best_score:
            best_ids.append(info["node_id"])
    if best_score > 0:
        return best_score, best_ids, "token_verb"
    return 0.0, [], ""


def rebuild_answers(questions: list[dict], story: dict) -> list[dict]:
    """Attach evidence-backed answers; never consult the old heuristic answer."""
    raw_nodes = [(n["node_id"], n.get("text_en") or "") for n in story.get("nodes", [])]
    infos = _node_infos(raw_nodes)
    old_map = {normalize_text(q["q"]): q for q in story.get("official_quiz", [])}
    out: list[dict] = []
    for q in questions:
        verbs = question_verbs(q, infos)

        # Tier 1: exactly one option whose phrase is verbatim in a node that
        # also carries the question's intent verb (guards "the ocean" style
        # distractor mentions that answer no question intent).
        tier1: dict[int, list[str]] = {}
        for idx, opt in enumerate(q["choices"]):
            phrases = _phrase_candidates(opt)
            hits = []
            for info in infos:
                if any(p and p in info["text"] for p in phrases):
                    if not verbs or any(verb_present(info, v) for v in verbs):
                        hits.append(info["node_id"])
            if hits:
                tier1[idx] = hits
        if len(tier1) == 1:
            idx = next(iter(tier1))
            winner_score, runner_score = 6.0, 0.0
            winner_ids = tier1[idx]
            kind = "verbatim"
        else:
            # Tier 2: option tokens must appear in a node with the intent verb.
            scored = [_option_score(q, opt, infos, verbs) for opt in q["choices"]]
            ranked = sorted(
                [(s, ids, i) for i, (s, ids, _) in enumerate(scored)],
                key=lambda x: -x[0],
            )
            winner_score, winner_ids, idx = ranked[0]
            runner_score = ranked[1][0] if len(ranked) > 1 else 0.0
            kind = "token_verb"

        margin = winner_score - runner_score
        confidence = round(winner_score / (winner_score + runner_score + 1e-9), 3)
        verified = winner_score >= 4.0 and margin >= 2.0
        # negation questions ("not/except/false") distort token evidence and
        # belong to the semantic-judgment queue per locked decisions
        negation = bool(re.search(r"\bnot\b|\bexcept\b|\bfalse\b", q["q"], re.I))
        if negation:
            verified = False
        answer = idx if winner_score > 0 and verified else -1
        status = "machine_verified" if verified else "needs_review"
        evidence = []
        for nid in winner_ids:
            for node in story["nodes"]:
                if node["node_id"] == nid:
                    evidence.append({"node_id": nid, "quote": node.get("text_en") or ""})
                    break
        old = old_map.get(normalize_text(q["q"]))
        zh_aligned = False
        if old is None:
            # same-ordinal fallback: translation lists are generated in
            # PDF question order; name transliterations (e.g. Subodhi vs
            # 菩提祖师) can differ between story text and the quiz PDF.
            olds = story.get("official_quiz", [])
            if 1 <= q["number"] <= len(olds):
                old = olds[q["number"] - 1]
                zh_aligned = True
        row = {
            "number": q["number"],
            "q": q["q"],
            "q_zh": (old or {}).get("q_zh", ""),
            "choices": q["choices"],
            "choices_zh": (old or {}).get("choices_zh", [""] * len(q["choices"])),
            "page": q["page"],
            "answer": answer,
            "answer_evidence": evidence,
            "confidence": confidence,
            "match_kind": kind,
            "review_status": status,
            "old_answer": (old or {}).get("answer"),
            "zh_aligned": zh_aligned,
        }
        out.append(row)
    return out


def _rebuild_episode(ep: int) -> list[dict]:
    """Parse + rebuild one episode's questions, tagged with its episode."""
    questions = parse_episode_quiz(QUIZ_PDF, ep)
    story_path = STORY_DIR / f"ep{ep}.json"
    if not story_path.is_file():
        raise FileNotFoundError(f"dialogue story missing: {story_path}")
    story = json.loads(story_path.read_text(encoding="utf-8"))
    rebuilt = rebuild_answers(questions, story)
    for q in rebuilt:
        q["episode"] = ep
    return rebuilt


def build_bank_by_episodes(episodes: list[int]) -> tuple[dict, dict]:
    """Rebuild one bank holding `episodes` (each exactly 5 questions)."""
    if not episodes:
        raise SystemExit("BLOCKED: no episodes requested")
    if any(ep < 1 or ep > 108 for ep in episodes):
        raise SystemExit(f"BLOCKED: episode out of range ({episodes})")
    if len(set(episodes)) != len(episodes):
        raise SystemExit(f"BLOCKED: duplicate episodes ({episodes})")

    all_rows: list[dict] = []
    bank_questions: list[dict] = []
    per_episode = {}
    pages_hit: set[int] = set()
    for ep in sorted(episodes):
        rebuilt = _rebuild_episode(ep)
        bank_questions.extend(rebuilt)
        pages_hit.update(q["page"] for q in rebuilt)

        dist = {"A": 0, "B": 0, "C": 0}
        ep_rows = []
        for q in rebuilt:
            key = "ABC"[q["answer"]] if 0 <= q["answer"] <= 2 else "?"
            dist[key] = dist.get(key, 0) + 1
            rows = {
                "episode": ep,
                "number": q["number"],
                "question": q["q"],
                "answer": key,
                "old_answer": "ABC"[q["old_answer"]] if q["old_answer"] is not None else None,
                "old_answer_matches": bool(q["old_answer"] is not None and q["old_answer"] == q["answer"]),
                "confidence": q["confidence"],
                "match_kind": q["match_kind"],
                "review_status": q["review_status"],
                "evidence_nodes": [ev["node_id"] for ev in q["answer_evidence"]],
                "page": q["page"],
            }
            ep_rows.append(rows)
        all_rows.extend(ep_rows)
        per_episode[str(ep)] = {
            "distribution": dist,
            "verified": sum(1 for r in ep_rows if r["review_status"] == "machine_verified"),
            "needs_review": sum(1 for r in ep_rows if r["review_status"] == "needs_review"),
        }

    bank = {
        "schema_version": 2,
        "episodes": sorted(episodes),
        "source": {
            "kind": "official_quiz_pdf",
            "file": str(QUIZ_PDF),
            "sha256": sha256_file(QUIZ_PDF),
            "pages": sorted(pages_hit),
        },
        "questions": bank_questions,
        "review": {
            "episodes": per_episode,
            "distribution": _total_distribution(all_rows),
            "note": (
                "answers rebuilt from each episode's dialogue node quotes only; "
                "old heuristic answers were never used as truth"
            ),
        },
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
    report = {
        "schema_version": 2,
        "episodes": sorted(episodes),
        "source": bank["source"],
        "rows": all_rows,
        "distribution": bank["review"]["distribution"],
        "verified": sum(1 for r in all_rows if r["review_status"] == "machine_verified"),
        "needs_review": sum(1 for r in all_rows if r["review_status"] == "needs_review"),
        "generated_at": bank["generated_at"],
    }
    return bank, report


def _total_distribution(rows: list[dict]) -> dict:
    dist = {"A": 0, "B": 0, "C": 0}
    for r in rows:
        key = r["answer"]
        if key in dist:
            dist[key] += 1
        else:
            dist.setdefault(key, 0)
            dist[key] += 1
    return dist


def write_bank(episodes: list[int]) -> tuple[Path, Path]:
    bank, report = build_bank_by_episodes(episodes)
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    bank_path = OUT_BANK
    bank_path.write_text(json.dumps(bank, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    report_path = REPORTS_DIR / "quiz-answer-review.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return bank_path, report_path


def parse_episodes_arg(raw: str) -> list[int]:
    """'all' -> 1..108; '11' -> [11]; '1-10' -> [1..10]."""
    raw = raw.strip()
    if raw == "all":
        out = list(range(1, 109))
    elif "-" in raw:
        a, b = raw.split("-", 1)
        out = list(range(int(a), int(b) + 1))
    else:
        out = [int(raw)]
    if any(ep < 1 or ep > 108 for ep in out):
        raise SystemExit(f"BLOCKED: episode out of range ({raw})")
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--episode", type=int, default=None)
    ap.add_argument("--episodes", type=str, default=None)
    ap.add_argument("--all", action="store_true")
    args = ap.parse_args()
    if args.all:
        eps = list(range(1, 109))
    elif args.episodes:
        eps = parse_episodes_arg(args.episodes)
    elif args.episode:
        eps = [args.episode]
    else:
        eps = [1]
    bank_path, report_path = write_bank(eps)
    print(f"quiz bank -> {bank_path} (episodes {eps})")
    print(f"review    -> {report_path}")


if __name__ == "__main__":
    main()