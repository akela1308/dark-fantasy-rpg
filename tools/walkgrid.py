#!/usr/bin/env python3
"""Сетка ходьбы (клетка 24 мировых px, карта 1672x941 -> 70x40).

python3 tools/walkgrid.py build [карта ...]       собрать src/data/walkgrid.json из tools/walkgrid_specs.json
python3 tools/walkgrid.py render <карта> <out.jpg> [--plain] [--bright=1.8] [--shot=кадр_из_игры.png]
        картинка карты с маской, выходами, спавнами и NPC (для проверки глазами). --plain: только сетка с подписями

Разметка в walkgrid_specs.json: по каждой карте список операций по порядку,
  ["+", [[x,y], ...]]   открыть клетки, центр которых внутри многоугольника (мировые координаты)
  ["-", [[x,y], ...]]   закрыть
  ["+r", x, y, w, h] / ["-r", x, y, w, h]   то же прямоугольником
  "zones"                начать с прямоугольников walk из maps.json (иначе всё закрыто)
Дальше маску правят в игре: ?dev=1, E, M (кисть, ластик, заливка), P выгружает JSON.
"""
import json
import os
import sys

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CELL, W, H = 24, 1672, 941
COLS, ROWS = -(-W // CELL), -(-H // CELL)
MAPS = os.path.join(ROOT, "src/data/maps.json")
GRIDS = os.path.join(ROOT, "src/data/walkgrid.json")
SPECS = os.path.join(ROOT, "tools/walkgrid_specs.json")
OLD = {  # старые карты Максима: фон по bgKey (LoadingScene.OLD_MAP_IMAGES)
    "map_map1": "maps/map1_v2.png", "map_tavern_map": "maps/tavern_map_v2.png", "map_tavern_inside": "maps/tavern_inside.png",
    "map_mountains_map": "maps/mountains_map.png", "map_swamp_map": "maps/swamp_map.png", "map_forest1": "maps/forest1.png",
    "map_elf_boloto": "maps/elf_boloto.png", "map_elf_boloto1": "maps/elf_boloto1.png", "map_road_boloto": "maps/road_boloto.png",
    "map_kingthrone": "maps/kingthrone.png", "map_road_to_village": "maps/road_to_village.png", "map_gate": "maps/gate.png",
    "map_village": "maps/village.png",
}


def load(p):
    with open(p, encoding="utf-8") as f:
        return json.load(f)


def centers():
    for r in range(ROWS):
        for c in range(COLS):
            yield r, c, c * CELL + CELL / 2, r * CELL + CELL / 2


def in_poly(x, y, pts):
    inside = False
    j = len(pts) - 1
    for i in range(len(pts)):
        xi, yi = pts[i]
        xj, yj = pts[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def from_zones(zones):
    g = [[0] * COLS for _ in range(ROWS)]
    for r, c, x, y in centers():
        if any(z["x"] <= x <= z["x"] + z["w"] and z["y"] <= y <= z["y"] + z["h"] for z in zones):
            g[r][c] = 1
    return g


def build_one(cfg, ops):
    g = [[0] * COLS for _ in range(ROWS)]
    for op in ops:
        if op == "zones":
            g = from_zones(cfg.get("walk") or [])
            continue
        kind = op[0]
        if kind in ("+r", "-r"):
            x0, y0, w, h = op[1:5]
            pts = [[x0, y0], [x0 + w, y0], [x0 + w, y0 + h], [x0, y0 + h]]
        else:
            pts = op[1]
        val = 1 if kind[0] == "+" else 0
        for r, c, x, y in centers():
            if in_poly(x, y, pts):
                g[r][c] = val
    return g


def encode(g):
    return {"cell": CELL, "cols": COLS, "rows": ["".join("1" if v else "0" for v in row) for row in g]}


def decode(grid):
    return [[1 if ch == "1" else 0 for ch in row[:COLS].ljust(COLS, "0")] for row in grid["rows"]]


def cmd_build(names):
    maps, specs = load(MAPS), load(SPECS)
    grids = load(GRIDS) if os.path.exists(GRIDS) else {}
    for name in names or [k for k in specs if not k.startswith("_")]:
        grids[name] = encode(build_one(maps[name], specs[name]))
        print("сетка", name, sum(r.count("1") for r in grids[name]["rows"]), "клеток")
    with open(GRIDS, "w", encoding="utf-8") as f:
        f.write("{\n" + ",\n".join(
            f'  {json.dumps(k)}: {{"cell": {v["cell"]}, "cols": {v["cols"]}, "rows": [\n    '
            + ",\n    ".join(json.dumps(r) for r in v["rows"]) + "\n  ]}"
            for k, v in sorted(grids.items())) + "\n}\n")


def background(cfg, shot=None):
    if shot:  # кадр из игры (с пропсами и NPC), снятый в 1280x720
        return Image.open(shot).convert("RGB").resize((W, H), Image.LANCZOS)
    rel = cfg.get("image") if cfg.get("image") and cfg.get("bgKey") not in OLD else OLD.get(cfg.get("bgKey"))
    return Image.open(os.path.join(ROOT, "public", rel)).convert("RGB").resize((W, H), Image.LANCZOS)


def cmd_render(name, out, plain=False, bright=1.0, shot=None):
    maps = load(MAPS)
    cfg = maps[name]
    grids = load(GRIDS) if os.path.exists(GRIDS) else {}
    g = decode(grids[name]) if name in grids else from_zones(cfg.get("walk") or [])
    img = background(cfg, shot)
    if bright != 1.0:
        from PIL import ImageEnhance
        img = ImageEnhance.Contrast(ImageEnhance.Brightness(img).enhance(bright)).enhance(1.15)
    img = img.convert("RGBA")
    ov = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(ov)
    try:
        font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 13)
    except OSError:
        font = ImageFont.load_default()
    if not plain:
        for r, c, x, y in centers():
            x0, y0 = c * CELL, r * CELL
            if g[r][c]:
                d.rectangle([x0 + 1, y0 + 1, x0 + CELL - 2, y0 + CELL - 2], fill=(60, 255, 100, 70))
            else:
                d.rectangle([x0 + 1, y0 + 1, x0 + CELL - 2, y0 + CELL - 2], fill=(255, 40, 40, 38))
    for c in range(COLS + 1):
        d.line([c * CELL, 0, c * CELL, H], fill=(255, 255, 255, 60 if c % 4 else 140), width=1)
    for r in range(ROWS + 1):
        d.line([0, r * CELL, W, r * CELL], fill=(255, 255, 255, 60 if r % 4 else 140), width=1)
    for c in range(0, COLS, 4):
        for r in range(0, ROWS, 4):
            d.text((c * CELL + 2, r * CELL + 1), f"{c * CELL},{r * CELL}", fill=(255, 255, 120, 230), font=font,
                   stroke_width=2, stroke_fill=(0, 0, 0, 255))
    exits = list(cfg.get("exits") or []) + ([cfg["tavernEntry"]] if cfg.get("tavernEntry") else [])
    for e in exits:
        z = e["zone"]
        d.rectangle([z["x"], z["y"], z["x"] + z["w"], z["y"] + z["h"]], outline=(255, 170, 30, 255), width=3)
        d.text((z["x"] + 4, z["y"] + 3), "-> " + e["toMap"], fill=(255, 200, 80, 255), font=font, stroke_width=2,
               stroke_fill=(0, 0, 0, 255))
    for sid, p in (cfg.get("spawnPoints") or {}).items():
        d.ellipse([p["x"] - 7, p["y"] - 7, p["x"] + 7, p["y"] + 7], fill=(50, 200, 255, 255), outline=(0, 0, 0, 255))
        d.text((p["x"] + 9, p["y"] - 8), sid, fill=(120, 220, 255, 255), font=font, stroke_width=2, stroke_fill=(0, 0, 0, 255))
    for n in cfg.get("npcs") or []:
        d.polygon([(n["x"], n["y"] - 12), (n["x"] - 8, n["y"] + 4), (n["x"] + 8, n["y"] + 4)], fill=(255, 100, 200, 255))
        d.text((n["x"] + 9, n["y"] - 8), n.get("name", n.get("id", "")), fill=(255, 160, 220, 255), font=font,
               stroke_width=2, stroke_fill=(0, 0, 0, 255))
    Image.alpha_composite(img, ov).convert("RGB").save(out, quality=82)
    print(out)


if __name__ == "__main__":
    a = sys.argv[1:]
    if not a:
        print(__doc__)
    elif a[0] == "build":
        cmd_build(a[1:])
    elif a[0] == "render":
        b = next((float(x.split("=")[1]) for x in a if x.startswith("--bright=")), 1.0)
        shot = next((x.split("=", 1)[1] for x in a if x.startswith("--shot=")), None)
        cmd_render(a[1], a[2], "--plain" in a, b, shot)
