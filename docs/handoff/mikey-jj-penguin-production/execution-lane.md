# Execution lane

1. Run `Test-DshContractRevision.ps1` from the task card, then the environment canary and the locked Node route baseline. Stop on any failure.
2. Read only the task card, recent-context, handoff manifest, project audio skill/contract, book1/book2 schema, Penguin PDF/pages/audio, existing sentence pipeline, reader files and environment manifest.
3. In this task's `evidence/` and `work/`, run OCR as an aid and faster-whisper VAD + no-VAD. Visually verify every page's bubble order, tail, speaker and reading direction; do not infer speaker by alternating sides.
4. Deliver page 1 first: `book3.json`, `speaking-annotations-book3.json`, at least one genuine MP3 under `prj/assets/mikey-jj/penguin-adventure/sentences/`, and a formal book=3 route check. Write `evidence/first-artifact.json`.
5. After Controller confirms the first artifact, finish pages 2-10, 2-4 glossary terms per page, all independent sentence clips and a five-question fullscreen quiz. Preserve exact page text and punctuation.
6. Run annotation validation, `validate_audio_book.py` with `--decode-audio`, Node tests, and locked ffmpeg decode. Then sample the formal 8810 reader at 1280x720 and 390x844, including autoplay, speaking bubble, word click EN→ZH→resume, natural-end linger and quiz overlay.
7. Write task `result.json` with paths, counts, commands, exit codes, unresolved items and claim ceiling. Do not queue the next book until Penguin is independently accepted by Controller.

Stop on missing page, uncertain speaker, ambiguous timing, missing clip, word overflow, mobile overflow, test failure or any attempt to touch book1/book2/Slime Jail/shared CSS/JS outside the allowlist.
