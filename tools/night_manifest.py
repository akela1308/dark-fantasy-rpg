"""Собирает src/data/animations.json из готовых листов public/sprites/battle/<slug>_<anim>_v<N>.json
(берётся старшая версия). Ручные записи (старые листы Дуэлянта) сохраняются из MANUAL.
python3 tools/night_manifest.py"""
import json, os, re, glob
GAME = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
UNIT = {"duelist": "hero_duelist", "brawler": "companion_brawler", "healer": "companion_healer",
        "shield": "companion_shield", "swamp_elf": "swamp_elf_battle"}
# действие юнита -> анимация (basic = обычная атака, остальное id скиллов)
SKILLS = {
 "hero_duelist": {"basic": "slash", "rapier_strike": "lunge", "pistol_shot": "shot", "aimed_shot": "shot"},
 "companion_brawler": {"heavy_strike": "power"}, "companion_shield": {"heavy_strike": "power"},
 "companion_healer": {"bandage": "cast2"},
}
MANUAL = {"hero_duelist": {
 "idle":  {"key": "duelist_idle",  "file": "sprites/battle/duelist_idle_v1.png",  "frameWidth": 315, "frameHeight": 315, "frames": 96, "fps": 24, "loop": True, "originX": 0.370, "originY": 0.987, "bodyHeight": 304},
 "lunge": {"key": "duelist_lunge", "file": "sprites/battle/duelist_lunge_v1.png", "frameWidth": 563, "frameHeight": 315, "frames": 29, "fps": 24, "originX": 0.441, "originY": 0.987, "bodyHeight": 304, "hitFrame": 12},
 "shot":  {"key": "duelist_shot",  "file": "sprites/battle/duelist_shot_v1.png",  "frameWidth": 327, "frameHeight": 315, "frames": 36, "fps": 24, "originX": 0.353, "originY": 0.987, "bodyHeight": 304, "hitFrame": 17, "muzzle": {"x": 238, "y": 52}},
}}
HIT_DEFAULT = {"slash": 17}
REJECTED = {("duelist", "salute")}   # брак, в игру не идёт (см. ОТЧЁТ_УТРО.md)
out = {}
best = {}
for f in glob.glob(GAME + "/public/sprites/battle/*_v*.json"):
    m = re.match(r"(.+)_([a-z0-9]+)_v(\d+)\.json$", os.path.basename(f))
    if not m: continue
    slug, anim, ver = m.group(1), m.group(2), int(m.group(3))
    if slug == "duelist" and anim in ("idle", "lunge", "shot"): continue
    if (slug, anim) in REJECTED: continue
    if best.get((slug, anim), (0,))[0] < ver: best[(slug, anim)] = (ver, f)
for (slug, anim), (ver, f) in sorted(best.items()):
    uid = UNIT.get(slug, slug)
    meta = json.load(open(f))
    e = {k: meta[k] for k in ("file", "frameWidth", "frameHeight", "frames", "fps", "originX", "originY", "bodyHeight") if k in meta}
    e["key"] = f"{slug}_{anim}_v{ver}"
    if anim == "idle": e["loop"] = True
    hf = meta.get("hitFrame") or HIT_DEFAULT.get(anim)
    if hf is None and anim in ("attack", "power", "cast2"): hf = int(meta["frames"] * 0.45)
    if hf is not None: e["hitFrame"] = hf
    if anim in ("death", "victory"): e["hold"] = True
    out.setdefault(uid, {"anims": {}})["anims"][anim] = e
for uid, anims in MANUAL.items():
    out.setdefault(uid, {"anims": {}})["anims"].update(anims)
for uid, cfg in out.items():
    a = cfg["anims"]
    if "idle" not in a: continue
    acts = {}
    if "attack" in a: acts["basic"] = "attack"
    acts.update({k: v for k, v in SKILLS.get(uid, {}).items() if v in a})
    cfg["actions"] = acts
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import night_roster
NAMES = {UNIT.get(c["slug"], c["slug"]): c["name"] for c in night_roster.R}
NAMES["hero_duelist"] = "Падший Дуэлянт"
for uid, cfg in out.items():
    cfg["name"] = NAMES.get(uid, uid)
ready = {u: c for u, c in out.items() if "idle" in c["anims"]}
json.dump(ready, open(GAME + "/src/data/animations.json", "w"), ensure_ascii=False, indent=1)
print({u: sorted(c["anims"]) for u, c in ready.items()})
