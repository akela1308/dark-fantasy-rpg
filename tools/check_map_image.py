"""Грубая проверка сгенерированных карт и выбор лучшего варианта.

python3 tools/check_map_image.py [--ids a,b] [--no-pick] [--sheets]

Для каждого public/maps/gen/<id>_vN.png:
  - размер 1672x941;
  - у каждого края с выходом есть светлая проходимая полоса (окно 220 px светлее медианы карты);
  - центральная ось не перегорожена тёмным пятном (доля очень тёмных пикселей в центре);
  - низ (120 px под UI) спокойный (мало мелких деталей);
  - для интерьеров: в центре большой спокойный пол.
Балл 0..100. Лучший копируется в <id>_pick.png (остальные остаются). Итог: public/maps/gen/scores.json.
--sheets: контактные листы по регионам в assets/generated/_maps_review/<регион>.jpg с id, вариантом и баллом.
"""
import glob, json, os, re, shutil, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SPEC = os.path.expanduser("~/Documents/Claude/Projects/Mortis/РЕВИЗИЯ_2026-10/world/maps_spec.json")
GEN = os.path.join(ROOT, "public/maps/gen")
REVIEW = os.path.join(ROOT, "assets/generated/_maps_review")
W, H = 1672, 941
EDGE = 140      # глубина полосы у края
WIN = 220       # ширина окна прохода

REGION_SLUG = {"Юг": "south", "Дорога": "road", "Лес": "forest", "Деревня": "village", "Болото": "swamp",
               "Горы": "mountains", "Север": "north"}


def lum(im):
    a = np.asarray(im.convert("L"), dtype=np.float32) / 255.0
    return a


def best_window(profile, win):
    if len(profile) <= win:
        return float(profile.mean())
    c = np.convolve(profile, np.ones(win) / win, mode="valid")
    return float(c.max())


def edge_score(L, side, med):
    """Насколько у края есть светлая полоса шириной WIN (1.0 = заметно светлее медианы)."""
    h, w = L.shape
    if side in ("east", "west"):
        band = L[:, w - EDGE:] if side == "east" else L[:, :EDGE]
        prof = band.mean(axis=1)
        prof = prof[int(h * 0.15):h - 120]           # не небо и не UI-полоса
    elif side in ("north", "south", "up"):
        band = L[:EDGE + 60, :] if side in ("north", "up") else L[h - 120 - EDGE:h - 60, :]
        prof = band.mean(axis=0)
    elif "-" in side:
        v, hz = side.split("-")
        ys = slice(0, h // 2) if v == "north" else slice(h // 2, h - 60)
        xs = slice(w - EDGE * 2, w) if hz == "east" else slice(0, EDGE * 2)
        reg = L[ys, xs]
        prof = np.concatenate([reg.mean(axis=1), reg.mean(axis=0)])
    else:
        return None  # door/entrance/hatch/stairs/down: проверяется глазами
    m = best_window(prof, min(WIN, len(prof) // 2))
    return float(np.clip((m - med) / 0.08 + 0.5, 0, 1))


def detail(L):
    im = Image.fromarray((L * 255).astype(np.uint8))
    e = np.asarray(im.filter(ImageFilter.FIND_EDGES), dtype=np.float32) / 255.0
    return e


def score_image(path, loc):
    im = Image.open(path)
    notes = []
    s_size = 1.0 if im.size == (W, H) else 0.0
    if not s_size:
        notes.append(f"размер {im.size}")
    im = im.convert("RGB").resize((W, H))
    L = lum(im)
    med = float(np.median(L))
    E = detail(L)
    # края с выходами
    es = [edge_score(L, e["side"], med) for e in loc["exits"]]
    es = [x for x in es if x is not None]
    s_edges = float(np.mean(es)) if es else 0.7
    if es and min(es) < 0.35:
        notes.append("слабый выход у края")
    # центральная ось: доля очень тёмных пикселей в центральном прямоугольнике
    cy0, cy1, cx0, cx1 = int(H * 0.35), int(H * 0.72), int(W * 0.25), int(W * 0.75)
    C = L[cy0:cy1, cx0:cx1]
    dark_thr = max(0.04, np.percentile(L, 15))
    dark = float((C < dark_thr).mean())
    s_axis = float(np.clip(1 - dark / 0.35, 0, 1))
    if dark > 0.25:
        notes.append("тёмное пятно в центре")
    # низ спокойный
    bot = float(E[H - 120:, :].mean()); allm = float(E.mean()) + 1e-6
    s_bottom = float(np.clip(1.3 - bot / allm * 0.6, 0, 1))
    # интерьер: спокойный пол в центре
    if loc["kind"] == "interior":
        cen = float(E[int(H * 0.45):int(H * 0.8), int(W * 0.3):int(W * 0.7)].mean())
        s_floor = float(np.clip(1.4 - cen / allm * 0.8, 0, 1))
        total = 0.15 * s_size + 0.15 * s_edges + 0.25 * s_axis + 0.15 * s_bottom + 0.30 * s_floor
    else:
        s_floor = None
        total = 0.15 * s_size + 0.35 * s_edges + 0.30 * s_axis + 0.20 * s_bottom
    return {"score": round(total * 100), "edges": round(s_edges, 2), "axis": round(s_axis, 2),
            "bottom": round(s_bottom, 2), "floor": None if s_floor is None else round(s_floor, 2), "notes": notes}


def sheet(region, rows, out):
    cw, chh = 420, 236
    font = None
    for f in ("/System/Library/Fonts/Supplemental/Arial.ttf", "/Library/Fonts/Arial.ttf"):
        if os.path.exists(f):
            font = ImageFont.truetype(f, 15); break
    font = font or ImageFont.load_default()
    cols = 3
    hdr = 22
    canvas = Image.new("RGB", (cols * cw, len(rows) * (chh + hdr)), (20, 20, 20))
    d = ImageDraw.Draw(canvas)
    for r, (lid, variants, pick) in enumerate(rows):
        for c, (v, sc, path) in enumerate(variants[:cols]):
            x, y = c * cw, r * (chh + hdr)
            im = Image.open(path).convert("RGB").resize((cw - 4, chh - 4))
            canvas.paste(im, (x + 2, y + hdr))
            col = (255, 210, 90) if v == pick else (220, 220, 220)
            d.text((x + 4, y + 3), f"{lid}  v{v}  балл {sc}" + ("  PICK" if v == pick else ""), fill=col, font=font)
            if v == pick:
                d.rectangle([x + 1, y + hdr - 1, x + cw - 2, y + hdr + chh - 3], outline=(255, 210, 90), width=3)
    canvas.save(out, quality=82)


def main():
    a = sys.argv[1:]
    ids = None
    manual = {}
    if "--set" in a:   # --set forest_deep=v2,south_post=v3 : ручной выбор (сохраняется в scores.json)
        manual = dict(kv.split("=") for kv in a[a.index("--set") + 1].split(","))
    if "--ids" in a:
        ids = set(a[a.index("--ids") + 1].split(","))
    spec = json.load(open(SPEC))
    locs = {l["id"]: l for l in spec["locations"]}
    sp = os.path.join(GEN, "scores.json")
    allsc = json.load(open(sp)) if os.path.exists(sp) else {}
    found = {}
    for f in sorted(glob.glob(os.path.join(GEN, "*_v[0-9].png"))):
        m = re.match(r"(.+)_v(\d+)\.png$", os.path.basename(f))
        if m and m.group(1) in locs:
            found.setdefault(m.group(1), []).append((int(m.group(2)), f))
    for lid, vs in found.items():
        if ids and lid not in ids:
            continue
        res = {}
        for v, f in vs:
            try:
                res[f"v{v}"] = score_image(f, locs[lid])
            except OSError:
                print("ещё пишется:", f)
        if not res:
            continue
        best = max(res, key=lambda k: res[k]["score"])
        prev = allsc.get(lid, {})
        if lid in manual:
            prev["manual_pick"] = manual[lid]
        pick = prev.get("manual_pick") or best
        allsc[lid] = {"variants": res, "pick": pick, **({"manual_pick": prev["manual_pick"]} if prev.get("manual_pick") else {})}
        if "--no-pick" not in a:
            shutil.copyfile(os.path.join(GEN, f"{lid}_{pick}.png"), os.path.join(GEN, f"{lid}_pick.png"))
        print(lid, {k: r["score"] for k, r in res.items()}, "pick", pick, *(n for r in res.values() for n in r["notes"]))
    json.dump(allsc, open(sp, "w"), ensure_ascii=False, indent=1)
    if "--sheets" in a:
        os.makedirs(REVIEW, exist_ok=True)
        by_region = {}
        for lid in found:
            by_region.setdefault(locs[lid]["region"], []).append(lid)
        for reg, lids in by_region.items():
            rows = []
            for lid in lids:
                vs = sorted(found[lid])
                rows.append((lid, [(v, allsc[lid]["variants"][f"v{v}"]["score"], f) for v, f in vs],
                             int(allsc[lid]["pick"][1:])))
            out = os.path.join(REVIEW, f"maps_{REGION_SLUG.get(reg, reg)}.jpg")
            sheet(reg, rows, out)
            print("sheet", out)


if __name__ == "__main__":
    main()
