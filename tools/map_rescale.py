"""Перекадрирование карты под постоянный рост героя (этап 5): новая картинка с новым номером
и пересчёт всех координат карты.

python3 tools/map_rescale.py <карта> <f> [--center x,y] [--bg black|<картинка-фон>] [--src <исходник>] [--dry]

f > 1: карта нарисована слишком издалека (герой великоват). Вырезается участок 1/f карты вокруг center
       (мировые px, по умолчанию центр) из 2K-исходника и растягивается на всю карту.
f < 1: карта нарисована слишком близко (герой мелкий). Старая картинка уменьшается в f раз и кладётся
       в центр (или со сдвигом center) на фон: black (интерьер в темноте) или готовую картинку-фон
       (дорисованные края, outpaint). Края старой картинки мягко растворяются в фоне.
Пересчитываются: spawnPoints, exits/tavernEntry, walk, npcs (только позиция, рост людей не меняется),
props (позиция и размер), encounters, bookPickups, inspectables и прочие записи с x/y,
разметка в tools/walkgrid_specs.json (потом python3 tools/walkgrid.py build <карта>).
Картинка: public/maps/gen/<карта>_k<N>.jpg (N следующий свободный), image в maps.json меняется на неё.
"""
import json, os, sys, glob, re
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
W, H = 1672, 941
MAPS = f"{ROOT}/src/data/maps.json"
SPECS = f"{ROOT}/tools/walkgrid_specs.json"


def load(p):
    return json.load(open(p, encoding="utf-8"))


def raw_source(name, cfg):
    """2K-исходник выбранного варианта (из _maps_raw), иначе текущая картинка карты."""
    cur = Image.open(f"{ROOT}/public/{cfg['image']}").convert("RGB").resize((344, 193))
    best = None
    for f in glob.glob(f"{ROOT}/assets/generated/_maps_raw/{name}_v[0-9].png"):
        im = Image.open(f).convert("RGB")
        d = sum(abs(a - b) for a, b in zip(im.resize((344, 193)).tobytes(), cur.tobytes())) / (344 * 193 * 3)
        if best is None or d < best[0]:
            best = (d, f)
    return best[1] if best and best[0] < 8 else f"{ROOT}/public/{cfg['image']}"


def main(a):
    name, f = a[0], float(a[1])
    opt = lambda k, d=None: a[a.index(k) + 1] if k in a else d
    cx, cy = map(float, opt("--center", f"{W / 2},{H / 2}").split(","))
    maps = load(MAPS)
    cfg = maps[name]
    if f >= 1:
        ww, wh = W / f, H / f
        x0 = min(max(cx - ww / 2, 0), W - ww)
        y0 = min(max(cy - wh / 2, 0), H - wh)
        T = lambda x, y: ((x - x0) * f, (y - y0) * f)
        src = opt("--src") or raw_source(name, cfg)
        im = Image.open(src).convert("RGB")
        sx, sy = im.width / W, im.height / H
        out = im.crop((round(x0 * sx), round(y0 * sy), round((x0 + ww) * sx), round((y0 + wh) * sy))).resize((W, H), Image.LANCZOS)
    else:
        ox = cx - W * f / 2
        oy = cy - H * f / 2
        T = lambda x, y: (ox + x * f, oy + y * f)
        old = Image.open(f"{ROOT}/public/{cfg['image']}").convert("RGB")
        bg = opt("--bg", "black")
        out = Image.new("RGB", (W, H), (0, 0, 0)) if bg == "black" else Image.open(bg).convert("RGB").resize((W, H), Image.LANCZOS)
        small = old.resize((round(W * f), round(H * f)), Image.LANCZOS)
        # Края уменьшенной картинки растворяются в фоне (полоса 4% размера)
        feather = max(6, round(min(small.size) * 0.04))
        mask = Image.new("L", small.size, 0)
        mask.paste(255, (feather, feather, small.width - feather, small.height - feather))
        mask = mask.filter(ImageFilter.GaussianBlur(feather / 2))
        out.paste(small, (round(ox), round(oy)), mask)
    print(f"{name}: f={f} преобразование (0,0)->{tuple(round(v) for v in T(0, 0))}, ({W},{H})->{tuple(round(v) for v in T(W, H))}")
    if "--dry" in a:
        return

    def xy(o):
        o["x"], o["y"] = (round(v) for v in T(o["x"], o["y"]))

    def rect(z):
        x, y = T(z["x"], z["y"])
        z.update(x=round(x), y=round(y), w=round(z["w"] * f), h=round(z["h"] * f))

    for p in cfg.get("spawnPoints", {}).values(): xy(p)
    for e in cfg.get("exits", []) + ([cfg["tavernEntry"]] if cfg.get("tavernEntry") else []):
        z = e["zone"]
        edge = [z["x"] <= 6, z["y"] <= 6, z["x"] + z["w"] >= W - 6, z["y"] + z["h"] >= H - 6]
        rect(z)
        # Выход с края остаётся на краю новой картинки, полосой не уже 76 px
        if edge[0]: z["w"] = max(76, z["x"] + z["w"]) if z["x"] < 0 else z["w"]; z["x"] = 0 if edge[0] else z["x"]
        if edge[2]: z["x"] = min(z["x"], W - 76); z["w"] = W - z["x"]
        if edge[1]: z["h"] = max(76, z["y"] + z["h"]) if z["y"] < 0 else z["h"]; z["y"] = 0
        if edge[3]: z["y"] = min(z["y"], H - 76); z["h"] = H - z["y"]
        z["x"], z["y"] = max(0, z["x"]), max(0, z["y"])
        z["w"], z["h"] = min(z["w"], W - z["x"]), min(z["h"], H - z["y"])
    for z in cfg.get("walk") or []: rect(z)
    for p in cfg.get("props", []):
        xy(p)
        if "height" not in p:
            path = f"{ROOT}/public/{p['src']}" if p.get("src") else None
            if path and os.path.exists(path):
                p["height"] = Image.open(path).height
        if "height" in p:
            p["height"] = round(p["height"] * f)
    for key in ("npcs", "encounters", "bookPickups", "inspectables", "torches", "lanterns", "campfires", "pipeSmoke", "foregrounds"):
        for o in cfg.get(key) or []:
            if isinstance(o, dict) and "x" in o and "y" in o: xy(o)
            for w in (o.get("waypoints") or []) if isinstance(o, dict) else []: xy(w)
    # новая картинка с новым номером
    n = 2
    while os.path.exists(f"{ROOT}/public/maps/gen/{name}_k{n}.jpg"): n += 1
    rel = f"maps/gen/{name}_k{n}.jpg"
    out.save(f"{ROOT}/public/{rel}", quality=90)
    cfg["image"] = rel
    cfg.setdefault("rescale", []).append({"f": f, "center": [cx, cy], "from": cfg.get("bgKey")})
    open(MAPS, "w", encoding="utf-8").write(json.dumps(maps, ensure_ascii=False, indent=2) + "\n")
    # ручная разметка ходьбы
    specs = load(SPECS)
    if name in specs:
        new = []
        for op in specs[name]:
            if op == "zones":
                new.append(op)
            elif op[0] in ("+r", "-r"):
                x, y = T(op[1], op[2]); new.append([op[0], round(x), round(y), round(op[3] * f), round(op[4] * f)])
            else:
                new.append([op[0], [[round(v) for v in T(px, py)] for px, py in op[1]]])
        specs[name] = new
        open(SPECS, "w").write(json.dumps(specs, ensure_ascii=False, indent=1) + "\n")
    print("картинка", rel)


if __name__ == "__main__":
    main(sys.argv[1:])
