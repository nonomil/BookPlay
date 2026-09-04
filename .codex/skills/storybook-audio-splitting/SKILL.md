---
name: storybook-audio-splitting
description: Split storybook narration into evidence-backed sentence clips with word timing, bilingual vocabulary, and playback-ready annotations; use for new Mikey & JJ episodes or any matching storybook audio import in this project.
---

# Storybook Audio Splitting

Use this skill when a page-image/PDF storybook has a narration MP3 (or an MP4 from which an MP3 may be derived) and the reader must play one sentence at a time. The deliverable is data and clips consumed by `prj/engine/storybook.html`, not a transcript sitting outside the reader.

Read [references/audio-contract.md](references/audio-contract.md) before changing data or writing a new episode generator.

## Fixed workflow

1. Preserve source media. Treat an existing MP3 in `书籍资料库` as immutable input; if the only source is MP4, derive a project-local MP3 under `prj/data/storybooks-mikey-jj/source-audio/` and record the source path. Never overwrite files in `书籍资料库` or use `tmp` as a staging directory. With the locked ffmpeg, the extraction shape is:

   ```powershell
   & $ffmpeg -y -i $sourceMp4 -vn -c:a libmp3lame -q:a 2 $derivedMp3
   ```

   Keep the derived file outside `prj/assets/.../sentences/`; sentence clips are generated outputs, not source audio.
2. Establish page order from the PDF/images and run OCR only as an aid. Visually inspect every page's bubble text, tail, character position, and reading order. `JJ` is the red human character and `Mikey` is the green turtle in the current series, but speaker labels must come from visible evidence; never infer them by alternating left/right or by story semantics. Use `narrator` for a caption and `system` only for an unowned voice (for example a zombie principal).
3. Define stable atomic playback units. Split at the real spoken boundary, not at arbitrary word counts. Preserve the visible punctuation and page/bubble order. A short bubble containing two exclamations may remain one unit only when the source page and audio clearly make it one utterance; list its stable id in the sentence pipeline's `--exempt-compound` and in the reusable validator's `--exempt-compound-id`, then explain the exception in the episode notes. Do not silently merge or rewrite text to make validation pass.
4. Create or update annotations with ids `b<book>-p<page two digits>-s<sentence two digits>`, source `start_ms`/`end_ms`, `speaker`, normalized `bubble`, Chinese translation, and sentence-local `words`. Keep unrelated page ids stable when repairing one episode.
5. Slice independent MP3s with the existing entry point:

   ```powershell
   python -X utf8 prj/tools/mikey_jj_sentence_pipeline.py slice `
     --annotations prj/data/storybooks-mikey-jj/speaking-annotations-book1.json `
     --audio "书籍资料库\Mikey & JJ 英文冒险\audio\Zombie School Adventure.mp3" `
     --out prj/assets/mikey-jj/zombie-school-adventure/sentences
   ```

   The output name must be `page-XX-sentence-NN.mp3`; the source remains untouched. Use the locked ffmpeg listed by the environment manifest, or pass the project-approved executable explicitly when the runner supports it.

   For the already-intaken Mikey & JJ books, use the deterministic batch entry
   point so extraction and slicing stay tied to the exact video/book mapping:

   ```powershell
   python -X utf8 prj/tools/mikey_jj_audio_import.py run
   ```

   It processes only exact basename matches, writes derived MP3s under
   `prj/data/storybooks-mikey-jj/source-audio/`, regenerates the sentence clips,
   records `audio-manifest.json`, and removes clips for book units explicitly
   marked `audio: null` (visual-only effects must not become fake speech).
   For Mikey & JJ glossary point-read, run the companion Edge TTS generator
   after the book JSONs are final:

   ```powershell
   python -X utf8 prj/tools/mikey_jj_vocab_audio.py
   ```

   It deduplicates glossary terms across published books, writes English
   `en-US-JennyNeural` clips and Chinese `zh-CN-XiaoxiaoNeural` definition
   clips under `prj/assets/mikey-jj/vocab/`, and emits
   `prj/assets/mikey-jj/vocab/index.json` with browser-facing `assets/...`
   paths. Use `--index-only` when audio files are already present and only
   the manifest needs rebuilding; never put the repository-local `prj/`
   prefix in runtime URLs.

   For Minecraft levelled readers, the sentence caption is the point-read
   surface rather than only the key-word cards. Generate one deterministic
   English clip for every token in all five published books, plus Chinese
   clips only for definitions already reviewed in the sentence annotations:

   ```powershell
   python -X utf8 prj/tools/minecraft_vocab_audio.py
   ```

   The command writes `prj/assets/minecraft/vocab/index.json` with
   `scope: all-sentence-words`, `assets/minecraft/vocab/en/*.mp3`, and the
   reviewed-definition `zh/*.mp3`. It must not fabricate a Chinese
   translation for a token whose annotation has no approved glossary entry;
   the reader keeps `/api/tts` as the runtime fallback when a definition is
   supplied later.
6. Validate before browser work. Run the annotation pipeline, the reusable validator in `scripts/validate_audio_book.py`, the Node reader tests, and ffmpeg decode for every generated sentence and vocabulary clip. A word's local end must be no greater than its sentence clip duration; fix the source timing record rather than hiding the error in the player. The reader must prefer a published Mikey & JJ or Minecraft static `audio_en`/`audio_zh` pair and fall back to `/api/tts` only when a static file is missing or fails to decode.
7. Verify the real consumer at `http://127.0.0.1:8810/engine/storybook.html`, in both 1280×720 and 390×844. Sample at least one sentence per page and one vocabulary click. Confirm page/sentence changes autoplay the new clip, the enlarged bubble appears only while either sentence or word audio plays, the correct speaker/tail is shown, active words advance monotonically, word playback is English → Chinese → sentence resume, and quiz remains a full-screen overlay. Check `document.documentElement.scrollWidth <= clientWidth` on mobile.

## Reuse for later episodes

Keep one annotation file per book when a book's data is independent; do not overwrite Water House's `speaking-annotations.json` while adding Zombie School or a later episode. Add a new source-specific generator under the task work directory only when it makes regeneration deterministic, and include that generator in the environment fingerprint. Keep the reader/player changes series-scoped (`body.sb-mj`) unless a separate regression proves a shared change is required.

Current file map:

- Zombie School (book 1): `prj/data/storybooks-mikey-jj/speaking-annotations-book1.json`
- Water House (book 2, legacy filename): `prj/data/storybooks-mikey-jj/speaking-annotations.json`
- New books: use `speaking-annotations-book<NN>.json`; never repurpose either existing file.

The book JSON and annotation JSON are both required inputs to validation. If a legacy filename must remain for reader compatibility, document the mapping in the episode manifest instead of silently overwriting it.

When the user asks DSH to execute, reuse the existing related owner through `dsh-execute`; pass only the current episode slice, exact paths, and its acceptance checks. Do not create a clean session merely because the episode is long. The default execution permission is `workspace-write`; request `danger-full-access` only when the user explicitly asks for elevated access.

## Stop conditions

Stop at the first unresolved source-of-truth conflict: missing page image, uncertain speaker, ambiguous audio boundary, missing clip, non-monotonic word timing, mobile bubble overflow, or a pipeline/test failure. Report the exact id, path, command, and smallest next decision; do not compensate with guessed text, fabricated timestamps, or a player-side fallback.
