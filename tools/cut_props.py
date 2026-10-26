"""Вырезание объектов-перекрывателей из карты (деревья, фонари, колодец...) в отдельные PNG с прозрачностью.

python3 tools/cut_props.py [map ...]   (по умолчанию все карты из tools/map_props_spec.json)

Спецификация tools/map_props_spec.json:
  { "<map>": { "image": "public/maps/map1.png",
               "objects": [ { "id": "obelisk", "box": [x0,y0,x1,y1], "base": 640,
                              "fg": [[x0,y0,x1,y1], ...],     # точно объект (необязательно)
                              "bg": [[x0,y0,x1,y1], ...],     # точно фон (необязательно)
                              "method": "grabcut" | "box" | "dark",  # dark: порог по яркости внутри рамки
                              "thr": 0.0 } ] } }
Координаты в пикселях карты 1672x941, base это y нижнего края объекта (где он касается земли).
Маска: GrabCut по рамке (всё вне рамки фон), закрытие дыр, сглаженный край 1 px.
Выход: public/maps/props/<map>/<id>.png (кроп по рамке), public/maps/gen/props_build.json
(записи props для maps.json: key, src, x, y, originX, originY, depth по основанию),
превью для глаз: assets/generated/_maps_review/props/<map>.jpg (объекты на пурпурном и тест с фигурой героя).
"""
import json, os, subprocess, sys
import numpy as np
import cv2
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SPEC = os.path.join(ROOT, "tools/map_props_spec.json")
OUT = os.path.join(ROOT, "public/maps/props")
BUILD = os.path.join(ROOT, "public/maps/gen/props_build.json")
PREV = os.path.join(ROOT, "assets/generated/_maps_review/props")
HERO = os.path.join(ROOT, "public/maps/characters/hero.png")
NBDIR = os.path.join(ROOT, "assets/generated/_maps_raw/props")
PY = os.environ.get("MAPS_PY", sys.executable)
ASPECTS = [(1, 1), (3, 4), (4, 3), (2, 3), (3, 2), (9, 16), (16, 9), (4, 5), (5, 4)]


def nb_window(box, W=1672, H=941, margin=30):
    """Окно вокруг рамки с запасом, подогнанное под допустимое соотношение сторон."""
    x0, y0, x1, y1 = box
    w, h = x1 - x0 + 2 * margin, y1 - y0 + 2 * margin
    best = min(ASPECTS, key=lambda a: abs(np.log((w / h) / (a[0] / a[1]))))
    r = best[0] / best[1]
    if w / h < r: w = round(h * r)
    else: h = round(w / r)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    wx0 = int(round(cx - w / 2)); wy0 = int(round(cy - h / 2))
    wx0 = max(0, min(W - w, wx0)); wy0 = max(0, min(H - h, wy0))
    return (wx0, wy0, wx0 + w, wy0 + h), f"{best[0]}:{best[1]}"


def align_mask(src, nb, m, tag="", scales=None):
    """NB часто перерисовывает объект по центру и в другом масштабе. Ищем масштаб и сдвиг,
    при которых NB-объект лучше всего ложится на исходник (SQDIFF по маске), и переносим маску туда."""
    ys, xs = np.nonzero(m)
    if len(xs) < 30:
        return m
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    T = cv2.cvtColor(nb[y0:y1, x0:x1].astype(np.uint8), cv2.COLOR_RGB2GRAY).astype(np.float32)
    TM = (m[y0:y1, x0:x1] > 0).astype(np.float32)
    S = cv2.cvtColor(src.astype(np.uint8), cv2.COLOR_RGB2GRAY).astype(np.float32)
    # выровнять яркость: NB часто осветляет
    best = (np.inf, None)
    for sc in (scales if scales is not None else np.linspace(0.45, 1.6, 47)):
        tw, th = int(T.shape[1] * sc), int(T.shape[0] * sc)
        if tw < 8 or th < 8 or tw > S.shape[1] or th > S.shape[0]:
            continue
        Ts = cv2.resize(T, (tw, th)); Ms = (cv2.resize(TM, (tw, th)) > 0.5).astype(np.float32)
        Tn = (Ts - Ts[Ms > 0].mean()) / (Ts[Ms > 0].std() + 1e-3) * S.std() + S.mean()
        r = cv2.matchTemplate(S, Tn.astype(np.float32), cv2.TM_SQDIFF, mask=Ms)
        r = r / max(1.0, Ms.sum())
        v, _, loc, _ = cv2.minMaxLoc(r)
        if v < best[0]:
            best = (v, (loc, tw, th, Ms))
    if best[1] is None:
        return m
    (lx, ly), tw, th, Ms = best[1]
    out = np.zeros_like(m)
    out[ly:ly + th, lx:lx + tw] = (Ms * 255).astype(np.uint8)
    print(f"  совмещение {tag}: масштаб {tw / T.shape[1]:.2f}, сдвиг ({lx - x0},{ly - y0})", flush=True)
    return out


def nb_mask(path, mp, o):
    """Маска объекта через Nano Banana: модель красит всё, кроме объекта, в зелёный. Кэш в NBDIR."""
    os.makedirs(NBDIR, exist_ok=True)
    win, aspect = nb_window(o["box"])
    tag = f"{mp}_{o['id']}"
    src = os.path.join(NBDIR, tag + "_src.png"); out = os.path.join(NBDIR, tag + "_nb.png")
    if o.get("nb_from"):   # взять форму у соседнего такого же объекта (табуреты): NB-картинка того, совмещение по месту
        out = os.path.join(NBDIR, f"{mp}_{o['nb_from']}_nb.png")
        fw, _ = nb_window(next(x for x in json.load(open(SPEC))[mp]["objects"] if x["id"] == o["nb_from"])["box"])
        g = Image.open(out).convert("RGB").resize((fw[2] - fw[0], fw[3] - fw[1]), Image.LANCZOS)
        a = np.asarray(g, dtype=np.int16)
        mw = (~((a[..., 1] > 150) & (a[..., 1] - np.maximum(a[..., 0], a[..., 2]) > 60))).astype(np.uint8) * 255
        src_win = np.asarray(Image.open(path).convert("RGB").crop(win))
        # шаблон меньше окна: ищем его внутри окна этого объекта
        ys, xs = np.nonzero(mw)
        T = np.asarray(g)[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
        TM = mw[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
        pad = np.zeros((win[3] - win[1], win[2] - win[0]), np.uint8)
        nbimg = np.zeros((win[3] - win[1], win[2] - win[0], 3), np.uint8)
        th, tw = min(T.shape[0], pad.shape[0]), min(T.shape[1], pad.shape[1])
        pad[:th, :tw] = TM[:th, :tw]; nbimg[:th, :tw] = T[:th, :tw]
        m_win = align_mask(src_win, nbimg, pad, tag, np.linspace(0.85, 1.2, 15))
        full = np.zeros((941, 1672), np.uint8)
        full[win[1]:win[3], win[0]:win[2]] = m_win
        box = np.zeros_like(full); x0, y0, x1, y1 = o["box"]; box[y0:y1, x0:x1] = 1
        return full * box
    if not os.path.exists(out):
        im = Image.open(path).convert("RGB").crop(win)
        sc = 1024 / max(im.size)
        im.resize((round(im.width * sc), round(im.height * sc)), Image.LANCZOS).save(src)
        prompt = ("Edit the attached image. Keep ONLY " + o["desc"] + " exactly as it is: the same position, the same size, "
                  "the same shape and the same pixels, do not redraw or move it. Replace EVERYTHING else (ground, road, grass, "
                  "bushes, walls, floor, sky, all other objects) with flat uniform pure chroma green #00FF00. "
                  "No shadow, no outline, no new details.")
        r = subprocess.run([PY, os.path.join(ROOT, "tools/veo_client.py"), "image", prompt, out, src,
                            "--aspect", aspect, "--nostyle", "--size", "1K"], capture_output=True, text=True, timeout=600)
        if r.returncode != 0 or not os.path.exists(out):
            raise SystemExit(f"NB fail {tag}: {(r.stderr + r.stdout)[-300:]}")
    g = Image.open(out).convert("RGB").resize((win[2] - win[0], win[3] - win[1]), Image.LANCZOS)
    a = np.asarray(g, dtype=np.int16)
    green = (a[..., 1] > 150) & (a[..., 1] - np.maximum(a[..., 0], a[..., 2]) > 60)
    m_win = (~green).astype(np.uint8) * 255
    m_win = align_mask(np.asarray(Image.open(path).convert("RGB").crop(win)), np.asarray(g), m_win, tag)
    full = np.zeros((941, 1672), np.uint8)
    full[win[1]:win[3], win[0]:win[2]] = m_win
    box = np.zeros_like(full); x0, y0, x1, y1 = o["box"]; box[y0:y1, x0:x1] = 1
    return full * box


def mask_for(img, o):
    x0, y0, x1, y1 = o["box"]
    h, w = img.shape[:2]
    method = o.get("method", "nb")
    if method == "nb":
        m = nb_mask(o["_path"], o["_map"], o)
        m = cv2.erode(m, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3)))  # край модели не идеален
    elif method == "rects":   # тонкие столбы: объединение прямоугольников по столбу, перекладине и фонарю
        m = np.zeros((h, w), np.uint8)
        for r in o["rects"]:
            m[r[1]:r[3], r[0]:r[2]] = 255
        m[o["base"] + 2:, :] = 0
        return cv2.GaussianBlur(m, (3, 3), 0)
    elif method == "box":
        m = np.zeros((h, w), np.uint8); m[y0:y1, x0:x1] = 255
        return m
    elif method == "dark":
        g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).astype(np.float32) / 255
        m = np.zeros((h, w), np.uint8)
        sub = g[y0:y1, x0:x1]
        thr = o.get("thr") or float(np.percentile(sub, 45))
        m[y0:y1, x0:x1] = (sub < thr).astype(np.uint8) * 255
    else:
        gm = np.full((h, w), cv2.GC_BGD, np.uint8)
        gm[y0:y1, x0:x1] = cv2.GC_PR_FGD
        # полоса по краю рамки скорее фон
        bw = 3
        gm[y0:y0 + bw, x0:x1] = cv2.GC_PR_BGD; gm[y0:y1, x0:x0 + bw] = cv2.GC_PR_BGD; gm[y0:y1, x1 - bw:x1] = cv2.GC_PR_BGD
        for r in o.get("bg", []):
            gm[r[1]:r[3], r[0]:r[2]] = cv2.GC_BGD
        for r in o.get("fg", []):
            gm[r[1]:r[3], r[0]:r[2]] = cv2.GC_FGD
        bgd = np.zeros((1, 65), np.float64); fgd = np.zeros((1, 65), np.float64)
        cv2.grabCut(img, gm, None, bgd, fgd, 6, cv2.GC_INIT_WITH_MASK)
        m = np.where((gm == cv2.GC_FGD) | (gm == cv2.GC_PR_FGD), 255, 0).astype(np.uint8)
        for r in o.get("bg", []):
            m[r[1]:r[3], r[0]:r[2]] = 0
    # ниже основания объекта ничего нет (иначе перекроет ноги героя, стоящего впереди)
    m[o["base"] + 2:, :] = 0
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, k)
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3)))
    # оставить только связные куски, касающиеся крупнейшего (убирает мусор)
    n, lab, st, _ = cv2.connectedComponentsWithStats(m, 8)
    if n > 2:
        keep = [i for i in range(1, n) if st[i, cv2.CC_STAT_AREA] >= max(40, 0.03 * st[1:, cv2.CC_STAT_AREA].max())]
        m = np.isin(lab, keep).astype(np.uint8) * 255
    m = cv2.GaussianBlur(m, (3, 3), 0)
    return m


def run(maps):
    spec = json.load(open(SPEC))
    build = json.load(open(BUILD)) if os.path.exists(BUILD) else {}
    os.makedirs(PREV, exist_ok=True)
    hero = Image.open(HERO).convert("RGBA")
    hero = hero.resize((round(hero.width * 130 / hero.height), 130))
    for mp in maps or spec.keys():
        s = spec[mp]
        path = os.path.join(ROOT, s["image"])
        img = cv2.imread(path)
        rgb = Image.open(path).convert("RGBA")
        os.makedirs(os.path.join(OUT, mp), exist_ok=True)
        props = []
        tiles = []
        for o in s["objects"]:
            o["_path"], o["_map"] = path, mp
            m = mask_for(img, o)
            x0, y0, x1, y1 = o["box"]
            crop = rgb.crop((x0, y0, x1, y1))
            a = Image.fromarray(m[y0:y1, x0:x1])
            crop.putalpha(a)
            bb = crop.getbbox()
            if not bb:
                print("пусто", mp, o["id"]); continue
            crop = crop.crop(bb)
            cx0, cy0 = x0 + bb[0], y0 + bb[1]
            fn = os.path.join(OUT, mp, o["id"] + ".png")
            crop.save(fn, optimize=True)
            base = o["base"]
            props.append({"key": f"prop_{mp}_{o['id']}", "src": f"maps/props/{mp}/{o['id']}.png",
                          "x": cx0, "y": base, "originX": 0,
                          "originY": round((base - cy0) / crop.height, 4), "occluder": True})
            # превью: объект на пурпурном | фон с героем за объектом | фон с героем перед объектом
            pad = 70
            bx0, by0 = max(0, cx0 - pad), max(0, cy0 - pad)
            bx1, by1 = min(1672, cx0 + crop.width + pad), min(941, base + 40)
            mag = Image.new("RGBA", crop.size, (255, 0, 255, 255)); mag.alpha_composite(crop)
            behind = rgb.crop((bx0, by0, bx1, by1)).copy()
            hx = cx0 + crop.width // 2 - hero.width // 2 - bx0
            behind.alpha_composite(hero, (hx, max(0, base - 25 - 130 - by0)))
            behind.alpha_composite(crop, (cx0 - bx0, cy0 - by0))
            front = rgb.crop((bx0, by0, bx1, by1)).copy()
            front.alpha_composite(crop, (cx0 - bx0, cy0 - by0))
            fy = min(front.height - 130, base + 15 - 130 - by0)
            front.alpha_composite(hero, (hx, max(0, fy)))
            tiles.append((o["id"], [mag, behind, front]))
        build[mp] = props
        # лист превью
        th = 260
        rows = []
        for oid, ims in tiles:
            sc = [im.resize((max(1, round(im.width * th / im.height)), th)) for im in ims]
            row = Image.new("RGB", (sum(i.width for i in sc) + 40, th + 20), (30, 30, 30))
            x = 0
            for i in sc:
                row.paste(i.convert("RGB"), (x, 20)); x += i.width + 20
            ImageDraw.Draw(row).text((4, 3), f"{mp}/{oid}  (пурпур | за объектом | перед)", fill=(255, 220, 120))
            rows.append(row)
        if rows:
            sheet = Image.new("RGB", (max(r.width for r in rows), sum(r.height for r in rows)), (30, 30, 30))
            y = 0
            for r in rows:
                sheet.paste(r, (0, y)); y += r.height
            sheet.save(os.path.join(PREV, f"{mp}.jpg"), quality=85)
        print(mp, len(props), "объектов")
    json.dump(build, open(BUILD, "w"), ensure_ascii=False, indent=1)


if __name__ == "__main__":
    run(sys.argv[1:])
