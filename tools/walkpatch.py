#!/usr/bin/env python3
"""Разметка карты отдельным файлом-заплаткой (этапы 2, 3, 5 для всех карт): проверка, картинка, применение.

python3 tools/walkpatch.py check <заплатка.json> [--render out.jpg] [--bright=1.6]
python3 tools/walkpatch.py apply <заплатка.json> ...      записать в maps.json, tools/walkgrid_specs.json, собрать сетку

Заплатка (все поля, кроме map и walk, необязательны):
{
  "map": "forest_camp",
  "walk": ["zones" | ["+", [[x,y],...]] | ["-", [[x,y],...]] | ["+r",x,y,w,h] | ["-r",x,y,w,h], ...],
  "exits":  { "<toMap>": [x, y, w, h] },        # новая зона выхода (по карте назначения); "tavernEntry" для tavernEntry
  "spawns": { "<id>": [x, y] },                 # новая точка спавна
  "doorPx": 150,                                 # высота нарисованной двери (или человека) в мировых px, для масштаба
  "occluders": [ { "id", "box": [x0,y0,x1,y1], "base", "desc" } ],   # что вырезать перекрывателем (tools/cut_props.py)
  "notes": "что видно на картинке и что решено"
}
Координаты мировые: карта 1672×941, клетка ходьбы 24 px. Проверки: спавны на проходимых клетках и связаны,
у каждого выхода есть проходимая клетка той же области, зона выхода не меньше 84×84 мировых px (64 экранных),
не под HUD (src/data/ui.json, hud), выход с края касается края карты.
"""
import copy, json, os, sys
from collections import deque

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import walkgrid as WG

ROOT = WG.ROOT
UI = os.path.join(ROOT, "src/data/ui.json")
MIN_ZONE = 84
EDGE = 6


def load_patch(p):
    patch = json.load(open(p, encoding="utf-8"))
    maps = WG.load(WG.MAPS)
    cfg = copy.deepcopy(maps[patch["map"]])
    for to, z in (patch.get("exits") or {}).items():
        x, y, w, h = z
        targets = cfg.get("exits", []) + ([cfg["tavernEntry"]] if cfg.get("tavernEntry") else [])
        found = [e for e in cfg.get("exits", []) if e["toMap"] == to]
        if to == "tavernEntry" and cfg.get("tavernEntry"):
            found = [cfg["tavernEntry"]]
        if not found:
            raise SystemExit(f"нет выхода в {to} на карте {patch['map']}: есть {[e['toMap'] for e in targets]}")
        for e in found:
            e["zone"] = {"x": x, "y": y, "w": w, "h": h}
            e.pop("auto", None)
    for sid, (x, y) in (patch.get("spawns") or {}).items():
        cfg.setdefault("spawnPoints", {})[sid] = {"x": x, "y": y}
    return patch, maps, cfg


def comps(g):
    R, C = len(g), len(g[0])
    comp = [[-1] * C for _ in range(R)]
    n = 0
    for r in range(R):
        for c in range(C):
            if g[r][c] and comp[r][c] < 0:
                dq = deque([(r, c)]); comp[r][c] = n
                while dq:
                    a, b = dq.popleft()
                    for dr in (-1, 0, 1):
                        for dc in (-1, 0, 1):
                            y, x = a + dr, b + dc
                            if (dr or dc) and 0 <= y < R and 0 <= x < C and g[y][x] and comp[y][x] < 0:
                                # без срезания углов, как в Pathfinding.js
                                if dr and dc and not (g[a][x] and g[y][b]):
                                    continue
                                comp[y][x] = n; dq.append((y, x))
                n += 1
    return comp


def cell(x, y):
    return int(y // WG.CELL), int(x // WG.CELL)


def check(patch, cfg, g):
    errs = []
    comp = comps(g)
    R, C = len(g), len(g[0])
    op = lambda r, c: 0 <= r < R and 0 <= c < C and g[r][c]
    spawns = cfg.get("spawnPoints") or {}
    main = None
    for sid, p in spawns.items():
        r, c = cell(p["x"], p["y"])
        if not op(r, c):
            errs.append(f"спавн {sid} ({p['x']},{p['y']}) на закрытой клетке")
    good = [(sid, cell(p["x"], p["y"])) for sid, p in spawns.items() if op(*cell(p["x"], p["y"]))]
    ref = next((rc for sid, rc in good if sid == "default"), good[0][1] if good else None)
    if ref:
        main = comp[ref[0]][ref[1]]
    for sid, p in spawns.items():
        r, c = cell(p["x"], p["y"])
        if op(r, c) and comp[r][c] != main:
            errs.append(f"спавн {sid} не связан с остальными")
    hud = [tuple(v) for v in WG.load(UI).get("hud", [])]
    exits = cfg.get("exits", []) + ([cfg["tavernEntry"]] if cfg.get("tavernEntry") else [])
    for e in exits:
        z = e["zone"]
        cells = [(r, c) for r in range(R) for c in range(C) if g[r][c]
                 and z["x"] <= c * WG.CELL + 12 <= z["x"] + z["w"] and z["y"] <= r * WG.CELL + 12 <= z["y"] + z["h"]]
        if not cells:
            errs.append(f"выход → {e['toMap']}: в зоне нет проходимых клеток")
        elif main is not None and not any(comp[r][c] == main for r, c in cells):
            errs.append(f"выход → {e['toMap']}: недостижим от спавнов")
        if z["w"] < MIN_ZONE or z["h"] < MIN_ZONE:
            errs.append(f"выход → {e['toMap']}: зона {z['w']}×{z['h']} меньше {MIN_ZONE}×{MIN_ZONE}")
        for hx, hy, hw, hh in hud:
            if z["x"] < hx + hw and z["x"] + z["w"] > hx and z["y"] < hy + hh and z["y"] + z["h"] > hy:
                errs.append(f"выход → {e['toMap']}: зона под HUD [{hx},{hy},{hw},{hh}]")
        if e.get("auto"):
            errs.append(f"выход → {e['toMap']}: зона ещё автоматическая, поставь её по картинке")
    return errs


def build(patch, cfg):
    return WG.build_one(cfg, patch["walk"])


def cmd_check(path, out=None, bright=1.0):
    patch, maps, cfg = load_patch(path)
    g = build(patch, cfg)
    errs = check(patch, cfg, g)
    n = sum(map(sum, g))
    print(f"{patch['map']}: {n} проходимых клеток, " + ("ошибок нет" if not errs else f"ошибок {len(errs)}:"))
    for e in errs:
        print("  -", e)
    if out:
        grids = {patch["map"]: WG.encode(g)}
        render(patch["map"], cfg, grids, out, bright)
    return not errs


def render(name, cfg, grids, out, bright):
    # тот же рисунок, что walkgrid.py render, но с сеткой и конфигом из заплатки
    orig_load = WG.load
    maps = orig_load(WG.MAPS); maps[name] = cfg

    def fake(p):
        if p == WG.MAPS:
            return maps
        if p == WG.GRIDS:
            return grids
        return orig_load(p)
    WG.load = fake
    try:
        exists = os.path.exists
        os.path.exists = lambda p: True if p == WG.GRIDS else exists(p)
        WG.cmd_render(name, out, False, bright, None)
    finally:
        WG.load = orig_load
        os.path.exists = exists


def cmd_apply(paths):
    maps = WG.load(WG.MAPS)
    specs = WG.load(WG.SPECS)
    names = []
    for p in paths:
        patch, _, cfg = load_patch(p)
        g = build(patch, cfg)
        errs = check(patch, cfg, g)
        if errs:
            print("пропуск", patch["map"], errs); continue
        mp = patch["map"]
        maps[mp]["exits"] = cfg.get("exits", [])
        if cfg.get("tavernEntry"):
            maps[mp]["tavernEntry"] = cfg["tavernEntry"]
        maps[mp]["spawnPoints"] = cfg.get("spawnPoints", {})
        if patch.get("doorPx"):
            maps[mp]["doorPx"] = patch["doorPx"]
        specs[mp] = patch["walk"]
        names.append(mp)
    open(WG.MAPS, "w", encoding="utf-8").write(json.dumps(maps, ensure_ascii=False, indent=2) + "\n")
    open(WG.SPECS, "w", encoding="utf-8").write(json.dumps(specs, ensure_ascii=False, indent=1) + "\n")
    if names:
        WG.cmd_build(names)
    print("применено:", ", ".join(names))


if __name__ == "__main__":
    a = sys.argv[1:]
    if not a:
        print(__doc__)
    elif a[0] == "check":
        out = a[a.index("--render") + 1] if "--render" in a else None
        b = next((float(x.split("=")[1]) for x in a if x.startswith("--bright=")), 1.0)
        sys.exit(0 if cmd_check(a[1], out, b) else 1)
    elif a[0] == "apply":
        cmd_apply(a[1:])
