"""Автоматические объекты-перекрыватели для сгенерированных карт (поправка 5, для новых карт).

python3 tools/auto_occluders.py id [id ...]

1) Nano Banana получает всю картинку карты (public/maps/gen/<id>_pick.png) и красит в зелёный всё, кроме
   стоящих объектов (деревья, столбы, фонари, колодец, телега, углы домов, ограды). Кэш: assets/generated/_maps_raw/occ/<id>_nb.png
2) Маска совмещается с картой (масштаб и сдвиг), делится на связные куски.
3) Кусок остаётся, если он может закрыть героя: пересекается с телом героя (130 px над ногами) в зонах ходьбы
   (public/maps/gen/zones/<id>.zones.json) и его основание ниже каких-то точек этих зон (герой может зайти за него).
   Слишком широкие куски (лес стеной, дома целиком шире 520 px) пропускаются.
4) PNG: public/maps/props/<id>/occ_N.png, записи props в public/maps/gen/props_build.json (замена записей этой карты).
Пиксели всегда с оригинальной карты, от Nano Banana берётся только маска.
"""
import json, os, subprocess, sys
import numpy as np
import cv2
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
from cut_props import align_mask  # noqa: E402

GEN = os.path.join(ROOT, "public/maps/gen")
CACHE = os.path.join(ROOT, "assets/generated/_maps_raw/occ")
BUILD = os.path.join(GEN, "props_build.json")
PY = os.environ.get("MAPS_PY", sys.executable)
W, H = 1672, 941
HERO_H = 130

PROMPT = ("Edit the attached game map. Keep ONLY the tall standing objects that a person could walk behind: "
          "individual trees and their trunks, bare dead trees, lantern posts, poles, signposts, gallows, pillars, "
          "statues, the well, carts, fences and the front corners of buildings, exactly as they are: the same position, "
          "the same size, the same pixels, do not redraw or move anything. Replace EVERYTHING else (the road, ground, mud, "
          "grass, water, flat rocks, floor, the distant background forest and sky, roofs far away) with flat uniform pure "
          "chroma green #00FF00. Keep the whole picture frame and composition unchanged.")


def nb(lid):
    os.makedirs(CACHE, exist_ok=True)
    out = os.path.join(CACHE, f"{lid}_nb.png")
    if not os.path.exists(out):
        r = subprocess.run([PY, os.path.join(ROOT, "tools/veo_client.py"), "image", PROMPT, out,
                            os.path.join(GEN, f"{lid}_pick.png"), "--aspect", "16:9", "--nostyle", "--size", "2K"],
                           capture_output=True, text=True, timeout=900)
        if r.returncode != 0 or not os.path.exists(out):
            raise SystemExit(f"NB fail {lid}: {(r.stderr + r.stdout)[-300:]}")
    return out


def run(lid):
    src = np.asarray(Image.open(os.path.join(GEN, f"{lid}_pick.png")).convert("RGB").resize((W, H)))
    g = np.asarray(Image.open(nb(lid)).convert("RGB").resize((W, H), Image.LANCZOS)).astype(np.int16)
    green = (g[..., 1] > 140) & (g[..., 1] - np.maximum(g[..., 0], g[..., 2]) > 50)
    m = (~green).astype(np.uint8) * 255
    # совмещение: картинка целиком, масштаб близок к 1
    m = align_mask(src, g.astype(np.uint8), m, lid, np.linspace(0.97, 1.03, 7)) if m.mean() < 200 else m
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))
    m = cv2.erode(m, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3)))
    zones = json.load(open(os.path.join(GEN, "zones", f"{lid}.zones.json")))["walk"]
    body = np.zeros((H, W), bool)          # где может оказаться тело героя
    feet = np.full(W, -1)                   # самая верхняя точка ног в каждой колонке
    for z in zones:
        body[max(0, z["y"] - HERO_H):z["y"] + z["h"], max(0, z["x"] - 30):z["x"] + z["w"] + 30] = True
        xs = slice(z["x"], z["x"] + z["w"])
        f = feet[xs]; feet[xs] = np.where((f < 0) | (f > z["y"]), z["y"], f)
    n, lab, st, _ = cv2.connectedComponentsWithStats(m, 8)
    os.makedirs(os.path.join(ROOT, "public/maps/props", lid), exist_ok=True)
    props, k = [], 0
    img = Image.fromarray(src).convert("RGBA")
    for i in range(1, n):
        x, y, w, h, area = st[i]
        if area < 350 or h < 45 or w > 520 or y + h < 120:
            continue
        comp = lab == i
        if not (comp & body).any():
            continue
        base = int(y + h - 1)
        col_feet = feet[x:x + w]
        if not ((col_feet >= 0) & (col_feet < base - 8)).any():
            continue                         # герой не может встать выше основания: всегда впереди, слой не нужен
        k += 1
        a = (comp[y:y + h, x:x + w] * 255).astype(np.uint8)
        a = cv2.GaussianBlur(a, (3, 3), 0)
        crop = img.crop((x, y, x + w, y + h)); crop.putalpha(Image.fromarray(a))
        name = f"occ_{k}"
        crop.save(os.path.join(ROOT, "public/maps/props", lid, name + ".png"), optimize=True)
        props.append({"key": f"prop_{lid}_{name}", "src": f"maps/props/{lid}/{name}.png", "x": int(x), "y": base,
                      "originX": 0, "originY": round((base - y) / h, 4), "occluder": True, "auto": True})
    build = json.load(open(BUILD)) if os.path.exists(BUILD) else {}
    build[lid] = props
    json.dump(build, open(BUILD, "w"), ensure_ascii=False, indent=1)
    print(lid, len(props), "перекрывателей")


if __name__ == "__main__":
    for lid in sys.argv[1:]:
        run(lid)
