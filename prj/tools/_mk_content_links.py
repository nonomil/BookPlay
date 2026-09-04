# -*- coding: utf-8 -*-
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
prj = root / "prj"
content = root / "content"
pairs = [
    (prj / "data", content),
    (prj / "assets", content / "assets"),
]
for link, target in pairs:
    if link.exists():
        print("already", link)
        continue
    cmd = f'mklink /J "{link}" "{target}"'
    r = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    print(cmd)
    print(r.stdout or r.stderr)
    print("rc", r.returncode)
print("ep1 json", (prj / "data" / "dialogue_stories" / "ep1.json").exists())
print("ep1 mp4", (prj / "assets" / "video" / "ep1.mp4").exists())
