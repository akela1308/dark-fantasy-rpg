"""Статичная фигура NPC для карты и портрет из assets/generated/<slug>/ (k_idle.png на зелёном, portrait.png на белом).

python3 tools/install_npc_art.py <slug> [--no-figure] [--no-portrait]
Фигура: public/maps/characters/<slug>_map_v1.png (зелёный фон вырезан, кроп по фигуре, высота 300 px).
Портрет: public/portraits/<slug>.png 512×512 с вырезанным фоном вокруг рамки (tools/portrait_cutbg.py).
Ключи текстур: map_<slug> и portrait_<slug> (LoadingScene грузит их по списку NPC_ART)."""
import os, sys
import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))


def figure(slug):
    im = np.array(Image.open(f"{ROOT}/assets/generated/{slug}/k_idle.png").convert("RGB")).astype(int)
    r, g, b = im[..., 0], im[..., 1], im[..., 2]
    green = (g > 140) & (g > r + 50) & (g > b + 50)
    spill = (g > r + 20) & (g > b + 20) & ~green
    im[..., 1] = np.where(spill, np.maximum(r, b), g)
    out = Image.fromarray(np.dstack([im.astype("uint8"), np.where(green, 0, 255).astype("uint8")]), "RGBA")
    out.putalpha(out.split()[3].filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.6)))
    out = out.crop(out.getbbox())
    out = out.resize((round(out.width * 300 / out.height), 300), Image.LANCZOS)
    p = f"{ROOT}/public/maps/characters/{slug}_map_v1.png"
    out.save(p, optimize=True)
    print(p, out.size)


def portrait(slug):
    import portrait_cutbg as pc
    dst = f"{ROOT}/public/portraits/{slug}.png"
    Image.open(f"{ROOT}/assets/generated/{slug}/portrait.png").convert("RGBA").resize((512, 512), Image.LANCZOS).save(dst)
    pc.cut(slug, 40)
    os.replace(f"{ROOT}/public/portraits/{slug}_v2.png", dst)


if __name__ == "__main__":
    a = sys.argv[1:]
    if "--no-figure" not in a: figure(a[0])
    if "--no-portrait" not in a: portrait(a[0])
