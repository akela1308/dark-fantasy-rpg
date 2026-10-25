"""Лист проверки готовых листов: все кадры, фон по очереди светлый и тёмно-красный.
python3 tools/night_qa.py out.jpg name [name ...]
name: <slug>_<anim>_v<N> (ищется в public/sprites/battle и public/maps/characters/anim)"""
import sys, os, json, math
from PIL import Image, ImageDraw
PUB = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public"))
out, names = sys.argv[1], sys.argv[2:]
TH, W = int(os.environ.get("TH", 120)), 1980
blocks = []
for n in names:
    for d in ("sprites/battle", "maps/characters/anim"):
        if os.path.exists(f"{PUB}/{d}/{n}.json"): break
    else:
        print("нет", n); continue
    m = json.load(open(f"{PUB}/{d}/{n}.json")); sh = Image.open(f"{PUB}/{d}/{n}.webp").convert("RGBA")
    fw, fh, c, N = m["frameWidth"], m["frameHeight"], m["cols"], m["frames"]
    tw = int(fw * TH / fh); per = max(1, W // tw); rows = math.ceil(N / per)
    b = Image.new("RGB", (W, rows * TH + 20), "white"); dr = ImageDraw.Draw(b)
    dr.text((4, 4), f"{d.split('/')[-1]}/{n}  {N} frames  hit={m.get('hitFrame')}", fill="black")
    for i in range(N):
        fr = sh.crop(((i % c) * fw, (i // c) * fh, (i % c) * fw + fw, (i // c) * fh + fh)).resize((tw, TH))
        bg = (232, 228, 215) if (i // per + i) % 2 == 0 else (70, 12, 14)
        t = Image.new("RGBA", (tw, TH), bg + (255,)); t.alpha_composite(fr)
        x, y = (i % per) * tw, 20 + (i // per) * TH
        b.paste(t.convert("RGB"), (x, y)); dr.text((x + 2, y + 2), str(i), fill=(255, 255, 255) if bg[0] < 100 else (0, 0, 0))
    blocks.append(b)
h = sum(b.height for b in blocks); o = Image.new("RGB", (W, h), "black"); y = 0
for b in blocks: o.paste(b, (0, y)); y += b.height
o.save(out, quality=80); print(out, o.size)
