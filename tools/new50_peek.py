"""Полоска кадров клипов для выбора варианта: python3 tools/new50_peek.py out.jpg slug/clips/attack_v1.mp4 ... (12 кадров на клип)."""
import subprocess, sys, os
from PIL import Image
GEN = os.path.dirname(os.path.dirname(os.path.abspath(__file__))) + "/assets/generated/"
rows = []
for p in sys.argv[2:]:
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", GEN + p, "-vf", "fps=3,scale=192:108", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], capture_output=True).stdout
    n = len(raw) // (192 * 108 * 3)
    row = Image.new("RGB", (192 * 12, 108))
    for i in range(min(n, 12)):
        row.paste(Image.frombytes("RGB", (192, 108), raw[i * 192 * 108 * 3:(i + 1) * 192 * 108 * 3]), (i * 192, 0))
    rows.append(row)
o = Image.new("RGB", (192 * 12, 110 * len(rows)))
for k, r in enumerate(rows): o.paste(r, (0, k * 110))
o.save(sys.argv[1], quality=80)
