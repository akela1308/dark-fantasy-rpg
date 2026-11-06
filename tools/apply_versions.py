"""Обновляет src/data/animations.json до старших версий листов, не трогая привязки навыков (actions), имена и записи вручную.
night_manifest.py пересобирает файл целиком и теряет то, что добавлено руками, поэтому после перенарезки запускается этот скрипт,
затем python3 tools/shrink_sheets.py battle --k 0.6.  python3 tools/apply_versions.py [--dry]"""
import glob, json, os, re, sys
GAME = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
P = f"{GAME}/src/data/animations.json"
UNIT = {"duelist": "hero_duelist", "brawler": "companion_brawler", "healer": "companion_healer", "shield": "companion_shield", "swamp_elf": "swamp_elf_battle"}
a = json.load(open(P)); best = {}
for f in glob.glob(f"{GAME}/public/sprites/battle/*_v*.json"):
    m = re.match(r"(.+)_([a-z0-9]+)_v(\d+)\.json$", os.path.basename(f))
    if m and best.get((m[1], m[2]), (0,))[0] < int(m[3]): best[(m[1], m[2])] = (int(m[3]), f)
n = 0
for (slug, anim), (ver, f) in best.items():
    uid = UNIT.get(slug, slug)
    if uid not in a or anim.startswith(("amb", "map")): continue
    e = a[uid]["anims"].get(anim)
    if e is None:   # новая анимация запаса Veo
        e = a[uid]["anims"][anim] = {"file": ""}
        if anim in ("death", "victory"): e["hold"] = True
    cur = re.search(r"_v(\d+)(_s\d+)?\.(webp|png)$", e["file"] or "")
    if cur and int(cur[1]) >= ver: continue
    meta = json.load(open(f))
    for k in ("file", "frameWidth", "frameHeight", "frames", "fps", "originX", "originY", "bodyHeight"):
        if k in meta: e[k] = meta[k]
    e["key"] = f"{slug}_{anim}_v{ver}"
    if meta.get("hitFrame") is not None: e["hitFrame"] = meta["hitFrame"]
    elif "hitFrame" in e: e["hitFrame"] = min(e["hitFrame"], meta["frames"] - 1)
    n += 1
print("обновлено", n)
if "--dry" not in sys.argv: json.dump(a, open(P, "w"), ensure_ascii=False, indent=1)
