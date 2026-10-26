"""Собирает src/data/map_animations.json из листов public/maps/characters/anim/<slug>_<anim>_v<N>.json.
Ключ = spriteKey NPC в maps.json. idle = mapidle, ambient = mapamb1.. (старшие версии).
python3 tools/night_map_manifest.py"""
import json, os, re, glob
GAME = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
SPRITE = {  # spriteKey в maps.json -> папка персонажа
 "map_dog": "dog", "map_drunkman": "drunkman", "map_wanderer": "wanderer", "map_tavernman": "tavernman",
 "map_cleaning_girl_mop": "cleaning_girl", "map_cleaning_girl": "cleaning_girl",
 "map_dwarf_beer2": "dwarf_beer2", "map_dwarf_beer_drink": "dwarf_beer1", "map_dwarf_beer": "dwarf_beer1",
 "map_swamp_elf_girl": "swamp_elf_girl", "map_mountain_king": "mountain_king", "map_guard": "guard",
 "map_archer_guard": "archer_guard", "map_recruit": "recruit",
 # ключи новых NPC ревизии (поток «Код», К18): пока листа нет, в игре серый силуэт
 "map_agna": "agna", "map_ryzh": "ryzh", "map_le": "lyo", "map_cat": "cat", "map_til": "til",
 "map_adventurer": "wanderer",   # «Хольт сидит с трубкой» на карте: пока стойка Рована по тому же арту (К18)
 "map_bandit_warrior": "bandit_warrior_map", "map_bandit_archer": "bandit_archer_map",
 "map_wild_dog": "wild_dog", "map_grey_wolf": "grey_wolf", "map_boar": "boar", "map_mavka": "mavka",
 "map_drowned": "drowned", "map_kobold": "kobold",
 "map_companion_brawler": "brawler", "map_companion_healer": "healer",   # Ворнаг и Тая как NPC до найма
}
REJECTED = set()
best = {}
for f in glob.glob(GAME + "/public/maps/characters/anim/*_v*.json"):
    m = re.match(r"(.+)_(map[a-z0-9]+)_v(\d+)\.json$", os.path.basename(f))
    if not m: continue
    slug, anim, ver = m.group(1), m.group(2), int(m.group(3))
    if (slug, anim) in REJECTED: continue
    if best.get((slug, anim), (0,))[0] < ver: best[(slug, anim)] = (ver, f)
by_slug = {}
for (slug, anim), (ver, f) in sorted(best.items()):
    meta = json.load(open(f))
    e = {k: meta[k] for k in ("file", "frameWidth", "frameHeight", "frames", "fps", "originX", "originY", "bodyHeight")}
    e["key"] = f"{slug}_{anim}_v{ver}"
    by_slug.setdefault(slug, {})[anim] = e
out = {}
for key, slug in SPRITE.items():
    a = by_slug.get(slug, {})
    idle = a.get("mapidle") or a.get("stand")
    if not idle: continue
    out[key] = {"slug": slug, "idle": idle,
                "ambient": [a[k] for k in sorted(a) if k.startswith("mapamb")], "delay": [6000, 14000]}
json.dump(out, open(GAME + "/src/data/map_animations.json", "w"), ensure_ascii=False, indent=1)
print({k: [v["idle"]["key"]] + [x["key"] for x in v["ambient"]] for k, v in out.items()})
