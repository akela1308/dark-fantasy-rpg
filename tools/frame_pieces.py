"""Куски рамки окна (этап 6) из готической рамки с черепами public/ui/panel_frame.png (2400x640).

python3 tools/frame_pieces.py [--preview out.jpg]

Пишет public/ui/frame_gothic_v1.png: углы, повторяемые планки (верх, низ, лево, право), медальон-череп
и заливку из середины dialog_frame.png. Координаты кусков в атласе: FRAME_PIECES ниже и в src/ui/Frame.js.
"""
import json, os, sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = f"{ROOT}/public/ui/panel_frame.png"
FILL = f"{ROOT}/public/ui/dialog_frame.png"
OUT = f"{ROOT}/public/ui/frame_gothic_v1.png"

# куски исходника: имя -> (x, y, w, h) в panel_frame.png
CUTS = {
    "tl": (0, 0, 330, 250), "tr": (2070, 0, 330, 250),
    "bl": (0, 390, 330, 250), "br": (2070, 390, 330, 250),
    "top": (850, 0, 267, 170), "bottom": (850, 470, 267, 170),
    "left": (0, 250, 230, 140), "right": (2170, 250, 230, 140),
    "medal": (1085, 0, 230, 200),
}


def build():
    src = Image.open(SRC).convert("RGBA")
    pieces = {k: src.crop((x, y, x + w, y + h)) for k, (x, y, w, h) in CUTS.items()}
    pieces["fill"] = Image.open(FILL).convert("RGBA").crop((200, 110, 456, 270))
    # упаковка в строки шириной до 1100
    W, x, y, rowh, rects = 1100, 0, 0, 0, {}
    for k, im in pieces.items():
        if x + im.width > W:
            x, y, rowh = 0, y + rowh + 2, 0
        rects[k] = (x, y, im.width, im.height)
        x += im.width + 2
        rowh = max(rowh, im.height)
    atlas = Image.new("RGBA", (W, y + rowh), (0, 0, 0, 0))
    for k, (px, py, w, h) in rects.items():
        atlas.paste(pieces[k], (px, py))
    atlas.save(OUT, optimize=True)
    print(OUT, atlas.size)
    print(json.dumps(rects))
    return atlas, rects


def preview(atlas, rects, out, k=0.3, sizes=((760, 540), (420, 220), (980, 300))):
    sheet = Image.new("RGB", (1300, 1300), (60, 60, 60))
    oy = 10
    for (w, h) in sizes:
        im = compose(atlas, rects, w, h, k)
        sheet.paste(im, (10, oy), im)
        oy += h + 20
    sheet.crop((0, 0, 1300, oy)).save(out, quality=88)
    print(out)


def compose(atlas, rects, w, h, k):
    """То же, что рисует Frame.js: заливка, планки плиткой, углы, медальон."""
    g = lambda n: atlas.crop((rects[n][0], rects[n][1], rects[n][0] + rects[n][2], rects[n][1] + rects[n][3]))
    sc = lambda im: im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    fill = sc(g("fill")) if False else g("fill").resize((256, 160))
    inset = round(40 * k)
    for yy in range(inset, h - inset, fill.height):
        for xx in range(inset, w - inset, fill.width):
            out.alpha_composite(fill.crop((0, 0, min(fill.width, w - inset - xx), min(fill.height, h - inset - yy))), (xx, yy))
    tl, tr, bl, br = (sc(g(n)) for n in ("tl", "tr", "bl", "br"))
    top, bot, lef, rig = (sc(g(n)) for n in ("top", "bottom", "left", "right"))
    for xx in range(tl.width, w - tr.width, top.width):
        out.alpha_composite(top.crop((0, 0, min(top.width, w - tr.width - xx), top.height)), (xx, 0))
        out.alpha_composite(bot.crop((0, 0, min(bot.width, w - br.width - xx), bot.height)), (xx, h - bot.height))
    for yy in range(tl.height, h - bl.height, lef.height):
        out.alpha_composite(lef.crop((0, 0, lef.width, min(lef.height, h - bl.height - yy))), (0, yy))
        out.alpha_composite(rig.crop((0, 0, rig.width, min(rig.height, h - br.height - yy))), (w - rig.width, yy))
    out.alpha_composite(tl, (0, 0)); out.alpha_composite(tr, (w - tr.width, 0))
    out.alpha_composite(bl, (0, h - bl.height)); out.alpha_composite(br, (w - br.width, h - br.height))
    m = sc(g("medal")); out.alpha_composite(m, ((w - m.width) // 2, 0))
    return out


if __name__ == "__main__":
    atlas, rects = build()
    if "--preview" in sys.argv:
        preview(atlas, rects, sys.argv[sys.argv.index("--preview") + 1])
