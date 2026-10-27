"""Исправление bodyHeight у боевых листов, которые night_cut.py ужал, чтобы лист влез в 4096 px.
Кадры уменьшались (×0.92 за шаг), а bodyHeight оставался 300, поэтому персонаж в стойке (длинный лист)
выглядел ниже, чем в ударе, и рос на 9-29% при смене анимации.
Ужатый лист узнаётся так: у того же персонажа есть лист с теми же пропорциями кадра, но выше.
Либо рамка другая, но высота ровно в 0.92^n раз меньше самой высокой (шаг ужатия night_cut).
Тогда bodyHeight = bodyHeight * H / H_полный. Правит .json листов и src/data/animations.json.
python3 tools/fix_body_height.py [--dry]"""
import json, glob, re, os, sys, collections, math
GAME = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
dry = "--dry" in sys.argv
by_slug = collections.defaultdict(list)
for f in glob.glob(GAME + "/public/sprites/battle/*_v*.json"):
    m = re.match(r"(.+)_([a-z0-9]+)_v(\d+)\.json$", os.path.basename(f))
    if m:
        by_slug[m.group(1)].append((f, json.load(open(f))))
fixed = {}
for slug, items in by_slug.items():
    for f, j in items:
        asp = j["frameWidth"] / j["frameHeight"]
        if j.get("bodyFixed"):
            continue
        peers = [p for _, p in items if abs(p["frameWidth"] / p["frameHeight"] - asp) < 0.02 and p["frameHeight"] > j["frameHeight"] * 1.01]
        if not peers:
            # Рамка другая, но лист всё равно мог ужаться: высота ровно в 0.92^n раз меньше самой высокой
            top = max(p["frameHeight"] for _, p in items)
            r = j["frameHeight"] / top
            n = round(math.log(r) / math.log(0.92)) if r < 0.99 else 0
            if n < 1 or abs(r - 0.92 ** n) > 0.006:
                continue
            peers = [{"frameHeight": top}]
        full = max(p["frameHeight"] for p in peers)
        bh = round(j["bodyHeight"] * j["frameHeight"] / full, 1)
        print(f"{os.path.basename(f)}: кадр {j['frameHeight']} из {full}, bodyHeight {j['bodyHeight']} -> {bh}")
        j["bodyHeight"], j["bodyFixed"] = bh, True
        fixed[j["file"]] = bh
        if not dry:
            json.dump(j, open(f, "w"))
anim_path = GAME + "/src/data/animations.json"
anims = json.load(open(anim_path))
n = 0
for uid, cfg in anims.items():
    for a in cfg["anims"].values():
        if a.get("file") in fixed:
            a["bodyHeight"] = fixed[a["file"]]; n += 1
if not dry:
    json.dump(anims, open(anim_path, "w"), ensure_ascii=False, indent=1)
print("листов", len(fixed), "записей animations.json", n)
