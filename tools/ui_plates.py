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
    """Шипы посередине сторон убираются: вся середина каждой кромки заменяется растянутой полоской чистой кромки
    (NineSlice растягивает именно середину, поэтому на кнопке любой ширины кромка ровная, без швов)."""
    w, h = im.size
    out = im.copy()
    cx0, cx1 = int(w * 0.16), int(w * 0.84)      # середина верхней и нижней кромки
    cy0, cy1 = int(h * 0.22), int(h * 0.78)      # середина боковых кромок
    eh, ew = int(h * 0.2), int(w * 0.09)         # глубина кромок
    sx = int(w * 0.24)                           # чистый столбик кромки
    sy = int(h * 0.3)                            # чистая строка кромки
    for y0, y1 in ((0, eh), (h - eh, h)):
        strip = im.crop((sx, y0, sx + 6, y1)).resize((cx1 - cx0, y1 - y0))
        out.paste(strip, (cx0, y0))
    for x0, x1 in ((0, ew), (w - ew, w)):
        strip = im.crop((x0, sy, x1, sy + 6)).resize((x1 - x0, cy1 - cy0))
        out.paste(strip, (x0, cy0))
    return out


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
    # v2: ровная кромка без шипов (button_v3.png), её и использует игра
    b = key(f"{G}/button_v3.png"); b.resize((640, round(b.height * 640 / b.width))).save(f"{ROOT}/public/ui/plate_button_v2.png", optimize=True)
    save(key(f"{G}/label.png"), "label", 600)
