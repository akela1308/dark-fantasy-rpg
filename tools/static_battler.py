"""Неподвижный боец из базовой позы (для существ, у которых ещё нет анимаций Veo).
python3 tools/static_battler.py <slug> ...
Из assets/generated/<slug>/k_battle.png (зелёный фон) пишет лист из одного кадра
public/sprites/battle/<slug>_idle_v1.webp + .json; tools/night_manifest.py добавит его в animations.json.
Дыхание в игре даёт твин масштаба; удар, урон и смерть без листов играются общими эффектами."""
import json, os, sys
import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def cut(slug):
    a = np.array(Image.open(f"{ROOT}/assets/generated/{slug}/k_battle.png").convert("RGB")).astype(int)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    green = (g > 120) & (g > r + 45) & (g > b + 45)
    spill = (g > r + 15) & (g > b + 15) & ~green
    a[..., 1] = np.where(spill, np.maximum(r, b), g)
    im = Image.fromarray(np.dstack([a.astype("uint8"), np.where(green, 0, 255).astype("uint8")]), "RGBA")
    im.putalpha(im.split()[3].filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.6)))
    bb = im.getbbox()
    body = bb[3] - bb[1]
    k = 300 / body                       # рост фигуры 300 px, как у остальных листов
    im = im.crop(bb).resize((round((bb[2] - bb[0]) * k), 300), Image.LANCZOS)
    pad = 12
    fr = Image.new("RGBA", (im.width + 2 * pad, 300 + pad + 4), (0, 0, 0, 0))
    fr.paste(im, (pad, pad), im)
    base = f"sprites/battle/{slug}_idle_v1"
    fr.save(f"{ROOT}/public/{base}.webp", "WEBP", quality=88)
    meta = {"frameWidth": fr.width, "frameHeight": fr.height, "frames": 1, "fps": 1, "cols": 1,
            "originX": 0.5, "originY": round((pad + 300) / fr.height, 4), "bodyHeight": 300.0, "bodyFixed": True,
            "file": f"{base}.webp", "hitFrame": None, "hold": False, "loop": True, "static": True}
    json.dump(meta, open(f"{ROOT}/public/{base}.json", "w"))
    print(slug, fr.size)


if __name__ == "__main__":
    for s in sys.argv[1:]: cut(s)
