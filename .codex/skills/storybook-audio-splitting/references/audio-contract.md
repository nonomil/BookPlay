# Storybook audio contract

This contract is the shared shape for future episodes. The current Mikey & JJ books are the reference implementation.

## Annotation record

Each book JSON sentence and its speaking annotation use the same stable key:

```json
{
  "id": "b1-p03-s04",
  "text_en": "Grab them!",
  "zh": "把它们拿上！",
  "speaker": {"id": "mikey", "label": "MIKEY"},
  "bubble": {"x": 0.378, "y": 0.125, "w": 0.220, "h": 0.049, "tail": "bottom", "variant": "dialogue"},
  "start_ms": 33510,
  "end_ms": 34620,
  "audio": "assets/mikey-jj/zombie-school-adventure/sentences/page-03-sentence-04.mp3",
  "words": [
    {"text": "Grab", "start_ms": 0, "end_ms": 420},
    {"text": "them", "start_ms": 420, "end_ms": 1110}
  ],
  "glossary": [{"term": "grab", "ipa": "ɡræb", "pos": "V", "zh": "抓住；拿取"}]
}
```

Rules:

- `id` is `b<book>-p<page two digits>-s<sentence two digits>` and is unique within the book.
- `start_ms`/`end_ms` are absolute positions in the source narration. A page's units are ordered, non-overlapping, and use the real voice boundary.
- `words` are offsets inside the derived clip. Require `0 <= start_ms <= end_ms <= end_ms - start_ms` for the sentence and monotonically increasing word order. A zero-length final word is valid when the audio encoder's duration is exact.
- `speaker.id` is one of `mikey`, `jj`, `narrator`, `system`. The label is visible UI text. Use `system` sparingly and document why it has no character owner.
- Bubble coordinates are normalized to the page image's contained rectangle. `tail: none` is for captions; dialogue bubbles need the visible tail direction. On a 390px viewport the rendered bubble must remain inside the 366px image width after the reader's min-width rule.
- A page has 2–4 unique glossary terms when vocabulary is requested. Terms carry English, IPA, part of speech, and Chinese meaning; assign a term to its first natural page only.

## Commands

Validate a new book's annotation table:

```powershell
python -X utf8 prj/tools/mikey_jj_sentence_pipeline.py validate `
  --annotations prj/data/storybooks-mikey-jj/speaking-annotations-book1.json `
  --exempt-compound b1-p02-s01
```

Slice clips from the immutable source:

```powershell
python -X utf8 prj/tools/mikey_jj_sentence_pipeline.py slice `
  --annotations prj/data/storybooks-mikey-jj/speaking-annotations-book1.json `
  --audio "书籍资料库\Mikey & JJ 英文冒险\audio\Zombie School Adventure.mp3" `
  --out prj/assets/mikey-jj/zombie-school-adventure/sentences
```

Then run `scripts/validate_audio_book.py` against the book JSON and annotation file. The project validator is intentionally read-only; it reports missing clips, timing violations, glossary counts, geometry overflow, and optional ffmpeg decode failures without changing source or generated files.

## Evidence required for acceptance

Record the command exit code and counts for:

1. annotation validation and the reusable validator;
2. Node reader tests;
3. every generated MP3 decoded by the locked ffmpeg;
4. each page sampled in the real 8810 reader at desktop and mobile sizes;
5. at least one word click showing English → Chinese → sentence resume, and one natural-ended bubble linger check.

Do not call an episode complete while any one of these is only inferred from a transcript or a DSH report.
