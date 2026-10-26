"""Заготовка зон ходьбы, точек выходов и спавнов по шаблону ходьбы из world/maps_spec.json.

python3 tools/prefill_zones.py [--ids a,b] [--force]

Шаблоны (13_ПРОМПТ, шаг 2): diagonal (шесть зон от выхода к выходу), y_fork (развилка: рукава от центра к трём выходам),
x_cross (четыре рукава), ring (восемь зон кольцом плюс отводы к выходам), room (пол с отступом 180 px от стен),
corridor (цепочка из пяти от входа внизу).
Якоря выходов: центр зоны выхода из src/data/maps.json, если поток Код её уже положил, иначе сторона из спецификации.
Каждая зона дороги сдвигается по вертикали (до ±90 px) туда, где на картинке светлее: дорога на картах светлее обочин.
Картинка: public/maps/gen/<id>_pick.png (если нет, зоны ставятся по шаблону без подгонки).
Выход: public/maps/gen/zones/<id>.zones.json в формате редактора (walk, exits, spawnPoints).
Уже существующие файлы не перезаписываются без --force (их мог поправить редактор).
"""
import heapq, json, math, os, sys
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SPEC = os.path.expanduser("~/Documents/Claude/Projects/Mortis/РЕВИЗИЯ_2026-10/world/maps_spec.json")
MAPS_JSON = os.path.join(ROOT, "src/data/maps.json")
GEN = os.path.join(ROOT, "public/maps/gen")
OUTDIR = os.path.join(GEN, "zones")
W, H = 1672, 941
UI_BOTTOM = 120  # низ под интерфейс

SIDE_ANCHOR = {
    "west": (40, 600), "east": (1632, 520), "north": (836, 230), "south": (836, H - UI_BOTTOM - 20),
    "north-east": (1560, 260), "north-west": (110, 280), "south-east": (1560, H - UI_BOTTOM - 30),
    "south-west": (110, H - UI_BOTTOM - 30),
    "door": (836, 420), "entrance": (836, 400), "hatch": (1150, 640), "stairs": (1250, 420),
    "up": (836, 260), "down": (836, 260),
}
INTERIOR_DOOR = (836, H - 70)   # вход внизу по центру (12_ПЛАН, правило 2)


def lum_map(lid):
    p = os.path.join(GEN, f"{lid}_pick.png")
    if not os.path.exists(p):
        return None
    return np.asarray(Image.open(p).convert("L").resize((W, H)), dtype=np.float32) / 255.0


def clampz(z):
    x = max(0, min(W - 20, z["x"])); y = max(0, min(H - 20, z["y"]))
    w = max(20, min(W - x, z["w"])); h = max(20, min(H - y, z["h"]))
    return {"x": int(x), "y": int(y), "w": int(w), "h": int(h)}


def fit_y(L, z, rng=90, step=10):
    """Сдвинуть зону по вертикали к самому светлому положению (дорога светлее обочины)."""
    if L is None:
        return z
    best, by = -1, z["y"]
    for dy in range(-rng, rng + 1, step):
        y = z["y"] + dy
        if y < 120 or y + z["h"] > H - 30:
            continue
        m = float(L[y:y + z["h"], z["x"]:z["x"] + z["w"]].mean())
        m -= abs(dy) * 0.0004   # мягкий штраф за уход от шаблона
        if m > best:
            best, by = m, y
    return {**z, "y": by}


def chain(a, b, n, L, bw=300, bh=150):
    """n зон-прямоугольников от точки a к точке b, с перекрытием, каждая подогнана к светлой дороге."""
    zs = []
    for i in range(n):
        t = i / max(1, n - 1)
        cx, cy = a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t
        z = clampz({"x": cx - bw / 2, "y": cy - bh / 2, "w": bw, "h": bh})
        zs.append(clampz(fit_y(L, z)))
    return zs


def anchors(loc, cfg):
    """{to: (x, y)} центр зоны выхода: из maps.json, если есть, иначе по стороне."""
    res = {}
    by_to = {e.get("toMap"): e for e in (cfg or {}).get("exits", []) if e.get("zone")}
    for e in loc["exits"]:
        if e["to"] in by_to:
            z = by_to[e["to"]]["zone"]
            res[e["to"]] = (z["x"] + z["w"] / 2, z["y"] + z["h"] / 2, e["side"], z)
        else:
            if loc["kind"] != "outdoor" and e["side"] in ("door", "entrance", "hatch"):
                ax, ay = INTERIOR_DOOR
            else:
                ax, ay = SIDE_ANCHOR.get(e["side"], (836, 470))
            res[e["to"]] = (ax, ay, e["side"], None)
    return res


def exit_zone(ax, ay, side):
    if side in ("west",):
        return clampz({"x": 0, "y": ay - 80, "w": 70, "h": 160})
    if side in ("east",):
        return clampz({"x": W - 70, "y": ay - 80, "w": 70, "h": 160})
    if side in ("north", "up", "down") and ay < 300:
        return clampz({"x": ax - 90, "y": max(120, ay - 40), "w": 180, "h": 70})
    if side == "south":
        return clampz({"x": ax - 90, "y": H - UI_BOTTOM - 40, "w": 180, "h": 70})
    return clampz({"x": ax - 80, "y": ay - 45, "w": 160, "h": 90})


def inward(ax, ay, d=130):
    cx, cy = W / 2, H * 0.55
    v = (cx - ax, cy - ay); n = math.hypot(*v) or 1
    return int(ax + v[0] / n * d), int(ay + v[1] / n * d)


CELL = 24


def roadness(L):
    """Оценка «дорожности» по клеткам CELL: светлее и глаже соседей = дорога/пол."""
    gy, gx = np.gradient(L)
    E = np.hypot(gx, gy)
    ny, nx = H // CELL, W // CELL
    Lc = L[:ny * CELL, :nx * CELL].reshape(ny, CELL, nx, CELL).mean(axis=(1, 3))
    Ec = E[:ny * CELL, :nx * CELL].reshape(ny, CELL, nx, CELL).mean(axis=(1, 3))
    r = (Lc - np.median(Lc)) / (Lc.std() + 1e-6) - 0.8 * (Ec - np.median(Ec)) / (Ec.std() + 1e-6)
    return r


def dijkstra(cost, a, b):
    ny, nx = cost.shape
    dist = np.full(cost.shape, np.inf); prev = {}
    dist[a] = 0; pq = [(0.0, a)]
    while pq:
        d, u = heapq.heappop(pq)
        if u == b:
            break
        if d > dist[u]:
            continue
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if not dy and not dx:
                    continue
                v = (u[0] + dy, u[1] + dx)
                if 0 <= v[0] < ny and 0 <= v[1] < nx:
                    nd = d + cost[v] * (1.414 if dy and dx else 1)
                    if nd < dist[v]:
                        dist[v] = nd; prev[v] = u; heapq.heappush(pq, (nd, v))
    path = [b]
    while path[-1] != a and path[-1] in prev:
        path.append(prev[path[-1]])
    return path


def cell_of(p):
    return (int(min(H // CELL - 1, max(0, p[1] // CELL))), int(min(W // CELL - 1, max(0, p[0] // CELL))))


def mask_to_rects(m):
    """Слить клетки маски в прямоугольники: горизонтальные отрезки по строкам, одинаковые соседние строки склеить."""
    rects = []
    ny, nx = m.shape
    open_runs = {}
    for y in range(ny + 1):
        runs = set()
        if y < ny:
            x = 0
            while x < nx:
                if m[y, x]:
                    x0 = x
                    while x < nx and m[y, x]:
                        x += 1
                    runs.add((x0, x))
                else:
                    x += 1
        for run in list(open_runs):
            if run not in runs:
                y0 = open_runs.pop(run)
                rects.append({"x": run[0] * CELL, "y": y0 * CELL, "w": (run[1] - run[0]) * CELL, "h": (y - y0) * CELL})
        for run in runs:
            open_runs.setdefault(run, y)
    return rects


def auto_walk(loc, L, pts):
    """Зоны ходьбы по картинке: пути наименьшей стоимости между выходами по светлой гладкой дороге."""
    r = roadness(L)
    ny, nx = r.shape
    cost = 1 + 8 / (1 + np.exp(2.0 * r))
    cost[(H - UI_BOTTOM) // CELL:, :] += 6          # низ под UI нежелателен
    if loc["kind"] != "outdoor":
        cost[L[:ny * CELL, :nx * CELL].reshape(ny, CELL, nx, CELL).mean(axis=(1, 3)) < 0.06] = 80  # чёрное вне комнаты
    # центр: самая «дорожная» клетка в центральной области
    c0, c1 = ny // 3, ny * 3 // 4; d0, d1 = nx // 4, nx * 3 // 4
    sub = r[c0:c1, d0:d1]
    hy, hx = np.unravel_index(np.argmax(sub), sub.shape)
    hub = (c0 + hy, d0 + hx)
    cells = [cell_of(p) for p in pts]
    m = np.zeros((ny, nx), bool)
    if loc["walkTemplate"] == "diagonal" and len(cells) >= 2:
        pairs = [(cells[0], cells[1])] + [(hub, c) for c in cells[2:]]
    else:
        pairs = [(hub, c) for c in cells]
    for a, b in pairs:
        for c in dijkstra(cost, a, b):
            m[c] = True
    # коридор: расширить путь на 3 клетки (около 170 px), но не в явную «не дорогу»
    rad = 3
    core = m.copy()
    grown = np.zeros_like(m)
    for y, x in zip(*np.nonzero(core)):
        grown[max(0, y - rad):y + rad + 1, max(0, x - rad + 1):x + rad] = True
    grown &= (r > -0.6) | core
    # дорастить по явной дороге ещё до 2 клеток
    good = r > 0.7
    for _ in range(2):
        nb = np.zeros_like(grown)
        nb[1:] |= grown[:-1]; nb[:-1] |= grown[1:]; nb[:, 1:] |= grown[:, :-1]; nb[:, :-1] |= grown[:, 1:]
        grown |= nb & good
    return mask_to_rects(grown)


def prefill(loc, cfg):
    L = lum_map(loc["id"])
    A = anchors(loc, cfg)
    pts = [(v[0], v[1]) for v in A.values()]
    t = loc["walkTemplate"]
    walk = []
    hub = (836, 560)
    if L is not None and t != "room" and pts:
        walk = auto_walk(loc, L, pts)
    elif t == "room":
        walk = [{"x": 180, "y": 300, "w": W - 360, "h": H - 300 - 150}]
        dx, dy = INTERIOR_DOOR
        walk.append({"x": dx - 90, "y": H - 170, "w": 180, "h": 150})
    elif t == "corridor":
        start = pts[0] if pts else INTERIOR_DOOR
        end = pts[1] if len(pts) > 1 else (836, 300)
        mid1 = (start[0] * 0.6 + 400 * 0.4, (start[1] + end[1]) / 2 + 60)
        mid2 = (end[0] * 0.6 + 1250 * 0.4, (start[1] + end[1]) / 2 - 40)
        walk = chain(start, mid1, 2, L, 280, 170) + chain(mid1, mid2, 2, L, 280, 170) + chain(mid2, end, 2, L, 280, 170)[1:]
    elif t == "diagonal":
        a, b = (pts + [(40, 620), (1632, 470)])[:2]
        walk = chain(a, b, 6, L)
        for p in pts[2:]:
            walk += chain(hub, p, 3, L, 260, 150)
    elif t in ("y_fork", "x_cross"):
        for p in pts:
            walk += chain(hub, p, 3, L, 280, 150)
        walk.append(clampz({"x": hub[0] - 170, "y": hub[1] - 100, "w": 340, "h": 200}))
    elif t == "ring":
        c, rx, ry = (836, 520), 520, 220
        for i in range(8):
            ang = i / 8 * 2 * math.pi
            cx, cy = c[0] + rx * math.cos(ang), c[1] + ry * math.sin(ang)
            walk.append(clampz(fit_y(L, clampz({"x": cx - 160, "y": cy - 70, "w": 320, "h": 140}), 50)))
        for p in pts:
            ang = math.atan2(p[1] - c[1], p[0] - c[0])
            edge = (c[0] + rx * math.cos(ang), c[1] + ry * math.sin(ang))
            walk += chain(edge, p, 2, L, 240, 140)
    exits, spawns = [], {}
    for to, (ax, ay, side, z) in A.items():
        ez = z or exit_zone(ax, ay, side)
        exits.append({"zone": ez, "toMap": to, "spawnId": f"from_{loc['id']}"})
        sx, sy = inward(ez["x"] + ez["w"] / 2, ez["y"] + ez["h"] / 2)
        spawns[f"from_{to}"] = {"x": sx, "y": sy}
        # зона ходьбы гарантированно касается выхода и спавна
        walk.append(clampz({"x": min(ez["x"], sx - 60), "y": min(ez["y"], sy - 50),
                            "w": abs(ez["x"] + ez["w"] / 2 - sx) + 120, "h": abs(ez["y"] + ez["h"] / 2 - sy) + 100}))
    if spawns:
        spawns["default"] = dict(next(iter(spawns.values())))
    walk = [z for z in walk if z["y"] + z["h"] <= H - 20 or z["y"] > H - 200]
    return {"map": loc["id"], "template": t, "walk": walk, "exits": exits, "spawnPoints": spawns, "npcs": [], "auto": True}


def main():
    a = sys.argv[1:]
    ids = set(a[a.index("--ids") + 1].split(",")) if "--ids" in a else None
    force = "--force" in a
    spec = json.load(open(SPEC))
    maps = json.load(open(MAPS_JSON))
    os.makedirs(OUTDIR, exist_ok=True)
    n = 0
    for loc in spec["locations"]:
        if loc["status"] != "new" or (ids and loc["id"] not in ids):
            continue
        out = os.path.join(OUTDIR, f"{loc['id']}.zones.json")
        if os.path.exists(out) and not force:
            continue
        z = prefill(loc, maps.get(loc["id"]))
        json.dump(z, open(out, "w"), ensure_ascii=False, indent=1)
        n += 1
        print(loc["id"], loc["walkTemplate"], len(z["walk"]), "зон,", len(z["exits"]), "выходов")
    print("готово:", n)


if __name__ == "__main__":
    main()
