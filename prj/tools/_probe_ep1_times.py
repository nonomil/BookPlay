# -*- coding: utf-8 -*-
import subprocess
from pathlib import Path
import imageio_ffmpeg

ff = imageio_ffmpeg.get_ffmpeg_exe()
out = Path(r"G:\Game\BookPlay书戏\demo\data\align\ep1\probe_frames")
out.mkdir(parents=True, exist_ok=True)
src = Path(r"G:\Game\BookPlay书戏\data\03.外挂英文字幕（无字幕）高清视频\【Journey to the West】001 The Monkey.mp4")
old = Path(r"G:\Game\BookPlay书戏\data\Journey to the West西游记 中英双字幕版108集视频\西游记英文版【中英字幕】01.mp4")

for label, p in [("new", src), ("old", old)]:
    r = subprocess.run([ff, "-i", str(p)], capture_output=True)
    err = r.stderr.decode("utf-8", "replace")
    for ln in err.splitlines():
        if "Duration" in ln or "Video:" in ln:
            print(label, ln.strip())

times = ["11.1", "16", "21.8", "22.3", "28"]
for t in times:
    dest = out / f"t{t.replace('.', '_')}.jpg"
    subprocess.run(
        [ff, "-y", "-ss", t, "-i", str(src), "-frames:v", "1", "-q:v", "4", str(dest)],
        capture_output=True,
    )
    print("frame", dest.name, dest.exists(), dest.stat().st_size if dest.exists() else 0)
