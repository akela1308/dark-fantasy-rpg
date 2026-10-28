"""Сжатая проверка листов карты: каждый N-й кадр всех mapidle/mapamb1 персонажей в одну картинку.
python3 tools/new50_grid.py out.jpg anim step slug ..."""
import sys, os, glob
from PIL import Image, ImageDraw
GEN = os.path.dirname(os.path.dirname(os.path.abspath(__file__))) + "/assets/generated/"
out, anim, step = sys.argv[1], sys.argv[2], int(sys.argv[3]); rows = []
for slug in sys.argv[4:]:
    d = sorted(glob.glob(f"{GEN}{slug}/final/{anim}_v*"))
    if not d: continue
    fs = sorted(glob.glob(d[-1] + "/*.png"))[::step]
    ims = [Image.open(f) for f in fs]; H = 120
    ims = [i.resize((max(1, int(i.width * H / i.height)), H)) for i in ims]
    W = sum(i.width for i in ims) + 110; r = Image.new("RGB", (W, H), (70, 20, 20)); x = 110
    ImageDraw.Draw(r).text((2, 50), slug, fill=(255, 255, 255))
    for i in ims: r.paste(i, (x, 0), i); x += i.width
    rows.append(r)
o = Image.new("RGB", (max(r.width for r in rows), 122 * len(rows)))
for k, r in enumerate(rows): o.paste(r, (0, k * 122))
o.save(out, quality=80); print(o.size)
