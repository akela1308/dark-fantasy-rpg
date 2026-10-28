"""Контактный лист ростера _new50: python3 tools/new50_sheet.py <file: k_idle|k_battle|portrait|base|all> <out.jpg> [cols]
base: k_idle если есть, иначе k_battle. all: на каждого персонажа карта + бой + портрет в одной ячейке."""
import json, os, sys
from PIL import Image, ImageDraw, ImageFont
GEN = os.path.dirname(os.path.dirname(os.path.abspath(__file__))) + "/assets/generated"
R = json.load(open(GEN + "/_new50/roster.json"))
what, out = sys.argv[1], sys.argv[2]; cols = int(sys.argv[3]) if len(sys.argv) > 3 else 10
try: font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Unicode.ttf", 16)
except Exception: font = ImageFont.load_default()
def files(c):
    d = f"{GEN}/{c['slug']}/"
    if what == "base": return [d + ("k_idle.png" if os.path.exists(d + "k_idle.png") else "k_battle.png")]
    if what == "all": return [d + f for f in ("k_idle.png", "k_battle.png", "portrait.png") if os.path.exists(d + f)]
    return [d + what + ".png"] if os.path.exists(d + what + ".png") else []
cells = []
for i, c in enumerate(R):
    fs = files(c)
    if not fs: continue
    H = 300; ims = []
    for f in fs:
        im = Image.open(f).convert("RGB")
        if im.width > im.height * 1.3: im = im.crop((im.width // 5, 0, im.width * 4 // 5, im.height))
        ims.append(im.resize((max(1, int(im.width * H / im.height)), H)))
    w = sum(x.width for x in ims); cell = Image.new("RGB", (w, H + 24), (40, 30, 30)); x = 0
    for im in ims: cell.paste(im, (x, 24)); x += im.width
    ImageDraw.Draw(cell).text((4, 2), f"{i+1}. {c['slug']} {c['name']}", fill=(255, 255, 255), font=font)
    cells.append(cell)
cw = max(c.width for c in cells); rows = (len(cells) + cols - 1) // cols
sheet = Image.new("RGB", (cw * cols, 324 * rows), (20, 20, 20))
for k, c in enumerate(cells): sheet.paste(c, ((k % cols) * cw, (k // cols) * 324))
sheet.save(out, quality=82); print(out, sheet.size)
