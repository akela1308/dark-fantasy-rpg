"""Вырезать светлый/однотонный фон вокруг рамки портрета (этап 6): новая версия <имя>_v2.png рядом.

python3 tools/portrait_cutbg.py agna lyo [--thresh 40]
Заливка от краёв картинки по похожему цвету, края смягчаются на 1 px.
"""
import sys
from PIL import Image, ImageDraw, ImageFilter

ROOT = __file__.rsplit("/tools/", 1)[0]


def cut(name, thresh=40):
    src = Image.open(f"{ROOT}/public/portraits/{name}.png").convert("RGBA")
    rgb = src.convert("RGB")
    w, h = rgb.size
    key = (255, 0, 255)
    seeds = [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)] + [(x, 0) for x in range(0, w, 16)] + [(x, h - 1) for x in range(0, w, 16)] \
        + [(0, y) for y in range(0, h, 16)] + [(w - 1, y) for y in range(0, h, 16)]
    for p in seeds:
        if rgb.getpixel(p) != key:
            ImageDraw.floodfill(rgb, p, key, thresh=thresh)
    px = rgb.load()
    sp = src.convert("RGB").load()
    bg = src.convert("RGB").getpixel((0, 0))
    band = int(min(w, h) * 0.2)   # в просветах орнамента рамки (внешняя полоса) фон тоже убирается
    m = Image.new("L", (w, h), 255)
    mp = m.load()
    for y in range(h):
        for x in range(w):
            if px[x, y] == key:
                mp[x, y] = 0
            elif min(x, y, w - 1 - x, h - 1 - y) < band and sum(abs(a - b) for a, b in zip(sp[x, y], bg)) < thresh * 2:
                mp[x, y] = 0
    m = m.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.7))
    a = Image.composite(src.split()[3], Image.new("L", (w, h), 0), m)
    out = src.copy()
    out.putalpha(a)
    path = f"{ROOT}/public/portraits/{name}_v2.png"
    out.save(path, optimize=True)
    print(path, f"{100 * sum(1 for v in m.tobytes() if v < 128) / (w * h):.0f}% фона убрано")


if __name__ == "__main__":
    a = sys.argv[1:]
    t = int(a[a.index("--thresh") + 1]) if "--thresh" in a else 40
    for n in [x for x in a if not x.startswith("--") and not x.isdigit()]:
        cut(n, t)
