"""Ленты кадров для выбора варианта клипа. python3 tools/night_strip.py out.jpg [--n 12] clip1.mp4 clip2.mp4 ...
К каждой ленте подписывается detour (меньше = меньше лишнего движения, как в clip_score.py)."""
import sys, subprocess
import numpy as np
from PIL import Image, ImageDraw
a = sys.argv[1:]; out = a.pop(0); n = 12
if "--n" in a: i = a.index("--n"); n = int(a[i + 1]); del a[i:i + 2]
rows = []
for p in a:
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", p, "-vf", "scale=320:180", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], capture_output=True).stdout
    f = np.frombuffer(raw, np.uint8).reshape(-1, 180, 320, 3)
    g = f.mean(3); d = np.abs(np.diff(g, axis=0)).mean((1, 2)).sum() / (np.abs(g[-1] - g[0]).mean() + 1e-3)
    loop = np.abs(g[-1] - g[0]).mean()
    idx = np.linspace(0, len(f) - 1, n).round().astype(int)
    strip = Image.new("RGB", (n * 160, 196), "white"); dr = ImageDraw.Draw(strip)
    for k, i in enumerate(idx):
        strip.paste(Image.fromarray(f[i][:, 60:260]).resize((160, 180)), (k * 160, 16))
    dr.text((4, 2), f"{p.split('generated/')[-1]}  detour={d:.1f}  loopdiff={loop:.1f}  frames={len(f)}", fill="black")
    rows.append(strip)
sheet = Image.new("RGB", (n * 160, 196 * len(rows)), "white")
for i, r in enumerate(rows): sheet.paste(r, (0, i * 196))
sheet.save(out, quality=80)
