---
name: animation-video-compression
description: Use when compressing flat 2D animation episodes, comparing 720p or 540p previews, or preparing smaller application data packs; not for static-image optimization.
---

# Animation Video Compression

Use the project script instead of assembling ad-hoc FFmpeg commands:

```powershell
python .codex/skills/animation-video-compression/scripts/compress_animation.py file `
  --input content/assets/video/ep48.mp4 `
  --output data/视频压缩测试/ep48.optimized.mp4 `
  --encoder nvenc
```

For a proportional 960×540 preview from a 1280×720 source, add `--height 540`. NVENC keeps scaling on the GPU and uses Lanczos interpolation:

```powershell
python .codex/skills/animation-video-compression/scripts/compress_animation.py file `
  --input content/assets/video/ep48.mp4 `
  --output data/视频压缩测试/ep48.540p.mp4 `
  --height 540 `
  --encoder nvenc
```

`--height` accepts only a positive even height no larger than the source and preserves the source aspect ratio with an even output width. Omitting it preserves the original resolution.

The project-approved baseline was visually accepted on EP48, one of the highest-motion episodes:

- H.264 High Profile, 1280×720, source 15 fps preserved.
- NVIDIA NVENC preset `p7`, HQ tune, VBR CQ 29.
- Target capped at 750 kbit/s, peak 1100 kbit/s, 2200 kbit buffer.
- Sources below the cap use an adaptive target of about 72% of their existing video bitrate, with a 350 kbit/s floor, so already-small episodes are not inflated.
- AAC audio copied without transcoding.
- Two-second maximum keyframe interval.
- MP4 fast-start enabled.

Do not lower the default frame rate. These episodes contain many held frames, which H.264 already stores cheaply; dropping from 15 to 12 fps saved only about 1–5% in tests while degrading fast action.

## Required safeguards

- Never use the source path as the output path.
- Never overwrite an existing output unless the user explicitly authorizes `--overwrite`.
- Write trials and batch results under `data/` or another ignored staging directory. Do not add MP4, audio, images, ZIP, APK, or other media to Git.
- Preserve original source videos. Batch conversion produces a parallel directory; integration into `content/assets/video` or a data pack is a separate authorized step.
- Keep H.264 as the default. Do not switch the only distributable copy to HEVC or AV1 without device-compatibility testing and explicit approval.
- If GPU use was explicitly requested, pass `--encoder nvenc`; do not silently fall back to CPU.

The script promotes its temporary output only after all of these checks pass:

- output is smaller than input;
- duration differs by no more than one source frame or 50 ms;
- resolution matches the source or the requested target height, and frame rate matches the source;
- audio packet payload SHA-256 matches the source;
- `moov` precedes `mdat`;
- maximum keyframe gap is approximately two seconds.

## Batch conversion

Convert only canonical episode files matching `ep<digits>.mp4`; temporary files such as `ep1.faststart.tmp.mp4` are excluded:

```powershell
python .codex/skills/animation-video-compression/scripts/compress_animation.py batch `
  --input-dir content/assets/video `
  --output-dir data/视频压缩结果 `
  --encoder nvenc `
  --report data/视频压缩结果/compression-report.json
```

Review the report and visually inspect at least EP1, EP48, EP79, and EP108 before changing packaging inputs. Pay special attention to EP48 near 260 seconds, where motion and dust effects are most demanding. Verify the application's “再学一次” seek-and-return behavior against the staged videos before release packaging.

When comparing a new preset, change only one factor at a time and retain EP48 as the worst-case visual gate. Prefer raising bitrate or lowering CQ for action artifacts; preserve audio and 15 fps.
