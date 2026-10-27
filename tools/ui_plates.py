"""Плашки интерфейса (правка 27.10: без нарисованных кодом прямоугольников) из assets/generated/_ui27/*.png.
python3 tools/ui_plates.py   ->  public/ui/plate_parchment_v1.png, plate_button_v1.png, plate_label_v1.png
Зелёный фон вырезается, картинка обрезается по рамке. У кнопки шипы посередине сторон заменяются соседним
куском кромки, чтобы плашку можно было растягивать (NineSlice). Пергамент приглушён под тёмный стиль."""
import os
import numpy as np
from PIL import Image, ImageEnhance, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def key(path):
    a = np.array(Image.open(path).convert("RGB")).astype(int)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    green = (g > 120) & (g > r + 45) & (g > b + 45)
    spill = (g > r + 15) & (g > b + 15) & ~green
    a[..., 1] = np.where(spill, np.maximum(r, b), g)
    im = Image.fromarray(np.dstack([a.astype("uint8"), np.where(green, 0, 255).astype("uint8")]), "RGBA")
    im.putalpha(im.split()[3].filter(ImageFilter.MinFilter(3)))
    return im.crop(im.getbbox())


def despike(im):
    a = np.array(im)
    h, w = a.shape[:2]
    bw, bh = int(w * 0.09), int(h * 0.12)   # полуширина зоны шипа и глубина кромки
    cx, cy = w // 2, h // 2
    src_x, src_y = int(w * 0.3), int(h * 0.3)
    for rows in (slice(0, bh), slice(h - bh, h)):   # верх и низ: копия кромки слева от центра
        a[rows, cx - bw:cx + bw] = a[rows, src_x - bw:src_x + bw]
    for cols in (slice(0, bh), slice(w - bh, w)):   # бока: копия кромки выше центра
        a[cy - bw:cy + bw, cols] = a[src_y - bw:src_y + bw, cols]
    return Image.fromarray(a, "RGBA")


def save(im, name, width):
    im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    p = f"{ROOT}/public/ui/plate_{name}_v1.png"
    im.save(p, optimize=True)
    print(p, im.size)


if __name__ == "__main__":
    G = f"{ROOT}/assets/generated/_ui27"
    p = key(f"{G}/parchment.png")
    rgb = ImageEnhance.Brightness(ImageEnhance.Color(p.convert("RGB")).enhance(0.8)).enhance(0.78)
    rgb.putalpha(p.split()[3]); save(rgb, "parchment", 720)
    save(despike(key(f"{G}/button.png")), "button", 560)
    save(key(f"{G}/label.png"), "label", 600)
