"""Эффекты из клипов запаса Veo (assets/generated/_stock/fx) в листы для боя: public/battle_fx/<имя>.webp + src/data/battle_fx.json.
Чёрный фон остаётся: в игре лист рисуется режимом ADD. python3 tools/fx_sheets.py"""
import json, os
import cv2, numpy as np
from PIL import Image
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = f"{ROOT}/assets/generated/_stock/fx"; OUT = f"{ROOT}/public/battle_fx"; SIZE = 200; N = 16
NAMES = ["slash_arc", "slash_heavy", "sparks", "blood_spray", "dust_hit", "heal_motes", "frost_burst", "poison", "curse", "smoke_puff", "muzzle", "bell_wave", "fire_burst"]
os.makedirs(OUT, exist_ok=True); meta = {}
for n in NAMES:
    cap = cv2.VideoCapture(f"{SRC}/{n}_v1.mp4"); total = int(cap.get(7)); fr = []
    for i in range(total):
        ok, f = cap.read()
        if ok: fr.append(cv2.resize(f, (1280, 720))[..., ::-1])
    cap.release()
    lum = np.array([f.max(2).astype(float).mean() for f in fr])
    live = np.nonzero(lum > max(1.2, lum.max() * 0.08))[0]; a, b = int(live[0]), int(live[-1])
    pick = np.linspace(a, b, N).astype(int)
    st = np.max([fr[i].max(2) for i in pick], axis=0) > 28   # общая рамка эффекта
    ys, xs = np.nonzero(st); cx, cy = (xs.min() + xs.max()) // 2, (ys.min() + ys.max()) // 2
    r = max(xs.max() - xs.min(), ys.max() - ys.min()) // 2 + 8; r = min(r, cx, cy, 1279 - cx, 719 - cy, 360)
    sheet = Image.new("RGB", (SIZE * 8, SIZE * 2))
    for k, i in enumerate(pick):
        c = Image.fromarray(fr[i][cy - r:cy + r, cx - r:cx + r]).resize((SIZE, SIZE), Image.LANCZOS)
        sheet.paste(c, ((k % 8) * SIZE, (k // 8) * SIZE))
    sheet.save(f"{OUT}/{n}.webp", "WEBP", quality=82, method=5)
    meta[n] = dict(file=f"battle_fx/{n}.webp", frameWidth=SIZE, frameHeight=SIZE, frames=N, fps=24)
    print(n, a, b, 2 * r, os.path.getsize(f"{OUT}/{n}.webp") // 1024, "кб", flush=True)
json.dump(meta, open(f"{ROOT}/src/data/battle_fx.json", "w"), ensure_ascii=False, indent=1)
