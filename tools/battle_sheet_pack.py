"""Готовый спрайт-лист (final/*_sheet.png + .json) -> уменьшенный лист для боя, не шире 4096 px.
python3 tools/battle_sheet_pack.py <src_prefix> <dst.png> [--scale 0.75] [--drop 21,23] [--clear-edge 2]
--drop: номера бракованных кадров, которые выкидываются.
--clear-edge N: стереть N px по краям кадра (тонкие линии-рамки, оставшиеся от видео).
--demagenta: обесцветить розово-пурпурный отлив на металле (клинок, ствол); рыжее дерево и кожу не трогает.
src_prefix: путь без _sheet.png, например assets/generated/duelist/final/idle
Рядом с dst пишется dst.json: frameWidth, frameHeight, frames, fps, cols.
Исходники не трогаются."""
import sys, json, math
import numpy as np
from PIL import Image


def demagenta(f):
    px = np.asarray(f).astype(np.float32)
    r, g, b = px[..., 0], px[..., 1], px[..., 2]
    pink = (r - g > 25) & (b - g > 5) & (px[..., 3] > 0)
    lum = 0.3 * r + 0.59 * g + 0.11 * b
    for ch in range(3):
        px[..., ch][pink] = lum[pink]
    return Image.fromarray(px.clip(0, 255).astype(np.uint8), "RGBA")

MAX_W = 4096

a = sys.argv[1:]
scale = 0.75
if "--scale" in a:
    i = a.index("--scale"); scale = float(a[i + 1]); del a[i:i + 2]
drop = set()
if "--drop" in a:
    i = a.index("--drop"); drop = {int(x) for x in a[i + 1].split(",")}; del a[i:i + 2]
edge = 0
if "--clear-edge" in a:
    i = a.index("--clear-edge"); edge = int(a[i + 1]); del a[i:i + 2]
demag = "--demagenta" in a
if demag: a.remove("--demagenta")
src, dst = a[0], a[1]

meta = json.load(open(f"{src}_sheet.json"))
fw, fh, n, cols = meta["frameWidth"], meta["frameHeight"], meta["frames"], meta["cols"]
sheet = Image.open(f"{src}_sheet.png").convert("RGBA")

keep = [i for i in range(n) if i not in drop]
n = len(keep)
nw, nh = round(fw * scale), round(fh * scale)
ncols = min(n, MAX_W // nw)
nrows = math.ceil(n / ncols)
out = Image.new("RGBA", (ncols * nw, nrows * nh), (0, 0, 0, 0))
for k, i in enumerate(keep):
    f = sheet.crop(((i % cols) * fw, (i // cols) * fh, (i % cols) * fw + fw, (i // cols) * fh + fh))
    f = f.resize((nw, nh), Image.LANCZOS)
    if demag:
        f = demagenta(f)
    if edge:
        clear = Image.new("RGBA", (nw, nh), (0, 0, 0, 0))
        clear.paste(f.crop((edge, edge, nw - edge, nh - edge)), (edge, edge))
        f = clear
    out.paste(f, ((k % ncols) * nw, (k // ncols) * nh))
out.save(dst, optimize=True)
json.dump({"frameWidth": nw, "frameHeight": nh, "frames": n, "fps": meta.get("fps", 24), "cols": ncols},
          open(dst.rsplit(".", 1)[0] + ".json", "w"))
print(dst, out.size, f"{nw}x{nh}", n, "frames")
