"""Генерация карт локаций по world/maps_spec.json через Nano Banana Pro (tools/veo_client.py image).

python3 tools/gen_maps.py [--ids a,b,c] [--group road|swamp|interiors|north|all] [--variants 3] [--par 3] [--dry]

Для каждой локации со статусом new собирает промпт: описание из спецификации + хвост стиля по типу
(style / interiorStyle / caveStyle) + региональная палитра + правила функциональной карты (12_ПЛАН, раздел 3)
+ правило отдельных объектов переднего плана (16_ПОПРАВКИ, пункт 5) + указания по выходам.
Референсы: 2-3 существующие карты региона из public/maps/.
Сырые 2K кладутся в assets/generated/_maps_raw/<id>_vN.png, ресайз 1672x941 в public/maps/gen/<id>_vN.png.
Уже готовые варианты не перегенерируются. Лог: assets/generated/_maps_raw/gen.log.
"""
import json, os, subprocess, sys, threading, time
from concurrent.futures import ThreadPoolExecutor
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SPEC = os.path.expanduser("~/Documents/Claude/Projects/Mortis/РЕВИЗИЯ_2026-10/world/maps_spec.json")
RAW = os.path.join(ROOT, "assets/generated/_maps_raw")
GEN = os.path.join(ROOT, "public/maps/gen")
MAPS = os.path.join(ROOT, "public/maps")
PY = os.environ.get("MAPS_PY", sys.executable)
W, H = 1672, 941

# Порядок по 15, этап 5: кольцо Дороги (глава 1), Болото, интерьеры главы 1, Север (и Горы главы 2)
GROUPS = {
    "road": ["south_post", "three_pillars", "old_mill", "burned_hamlet", "dead_road", "gallows_hill",
             "village_fields", "forest_camp", "forest_altar", "forest_deep", "ravine"],
    "swamp": ["drowned_village", "swamp_obelisk"],
    "interiors": ["mill_inside", "hermit_cave", "ruin_crypt", "tavern_cellar", "hangman_hut", "hunters_lodge",
                  "ravine_cave", "gatehouse", "chapel_inside", "elder_house", "smithy", "old_barn",
                  "drowned_church", "bear_den", "le_house"],
    "north": ["winter_forest", "frozen_lake", "ice_shrine", "winter_grad_gate", "grad_square", "grad_tavern",
              "queens_hall", "grad_alley", "north_road", "old_outpost", "outpost_inside", "north_frontier",
              "copper_mine", "mine_deep", "dwarf_gate", "dwarf_hall"],
}

# Референсы по региону и типу (только public/maps, без чужих паков)
REFS = {
    ("Юг", "outdoor"): ["map1.png", "tavern_map.png", "road_to_village.png"],
    ("Дорога", "outdoor"): ["map1.png", "tavern_map.png", "road_to_village.png"],
    ("Лес", "outdoor"): ["forest1.png", "road_to_village.png", "map1.png"],
    ("Деревня", "outdoor"): ["village.png", "gate.png", "road_to_village.png"],
    ("Болото", "outdoor"): ["swamp_map.png", "road_boloto.png", "elf_boloto1.png"],
    ("Горы", "outdoor"): ["mountains_map.png", "kingthrone.png"],
    ("Север", "outdoor"): ["mountains_map.png", "forest1.png", "gate.png"],
}
INTERIOR_REFS = ["tavern_inside.png"]
REGION_EXTRA = {"Горы": ["kingthrone.png"], "Север": ["gate.png"], "Болото": ["swamp_map.png"],
                "Деревня": ["village.png"], "Лес": ["forest1.png"], "Юг": ["map1.png"], "Дорога": ["map1.png"]}

# Хвост палитры региона (в спецификации одного поля style_tails нет, хвост собран по 09_МИР)
REGION_TAIL = {
    "Юг": "Late autumn borderland, pine woods, mud, grey sky at dusk.",
    "Дорога": "Late autumn imperial road country, old stone, mud, bare trees, cold dusk.",
    "Лес": "Black Forest: dark dense firs and old oaks, moss, roots, very little sky.",
    "Деревня": "Poor walled village of timber and stone, thatch roofs, autumn mud, cold blue dusk.",
    "Болото": "Swamp: black still water, reeds, dead trees, green-grey mist, wooden boardwalks.",
    "Горы": "Mountain pass of grey granite and copper-tinted rock, dwarven stonework, cold wind.",
    "Север": "Deep winter north: snow, ice, frozen firs, pale blue light, breathless cold.",
}

SIDE = {
    "east": "the road leaves the picture at the right side",
    "west": "the road leaves the picture at the left side",
    "north": "a path leads away into the distance at the far top side",
    "south": "the road continues out of the picture at the near bottom side",
    "north-east": "a path leaves at the far right corner",
    "north-west": "a path leaves at the far left corner",
    "south-east": "a path leaves at the near right corner",
    "south-west": "a path leaves at the near left corner",
    "door": "a clearly visible building door at the edge of the walkable ground, wide enough for a person",
    "entrance": "a dark cave or crypt entrance, wide and readable, at the edge of the walkable ground",
    "hatch": "a wooden cellar hatch on the ground at the edge of the walkable area",
    "stairs": "a wooden staircase along a side wall",
    "up": "a passage or ladder going up at the far end",
    "down": "a dark shaft or stairs going down at the far end",
}

FUNCTIONAL = (
    "FUNCTIONAL GAME MAP RULES: the walkable ground (road, floor or lit passage) is readable at first glance, "
    "200-300 px wide, and NOTHING stands on it; everything that stands is along the edges. "
    "The same camera and scale as the reference maps "
    "(a person is about 130 px tall on a 1672x941 map, openings and bridges wider than 150 px). "
    "One or two light sources only, the light marks the way. "
    "No people, no animals, no creatures, no text, no letters, no signs with writing, no UI, no frame. "
    "The bottom 120 px of the image is calm, low-detail ground (UI goes there). "
    "Tall foreground objects (trees, lantern posts, poles, fences, well, cart, building corners) stand as separate, "
    "clearly outlined objects with visible bases on the ground, never on the road axis, so the hero can walk behind and in front of them. "
)
REF_NOTE = ("Game location map for a 2D RPG. MATCH THE ATTACHED REFERENCE MAPS EXACTLY in camera, scale, palette and rendering: "
            "high overhead view looking down at the ground at about 55 degrees, like a classic isometric RPG map; "
            "NO SKY and NO HORIZON at all, the ground fills the whole picture edge to edge; the world is seen from far away, "
            "so objects are small (a tree about 200-300 px tall, a house about 400 px wide on a 1672x941 picture); "
            "very dark night palette, desaturated sepia brown and grey-green, almost monochrome, finely detailed painterly texture, "
            "only small warm points of lantern light. Do not copy the layout or objects of the references. Paint a NEW location: ")
CAMERA_FIX = ("Top-down view angled about 30 degrees, horizon in the upper third", "High overhead view, no sky, no horizon")
INTERIOR_NOTE = ("Cutaway isometric room exactly like the attached tavern interior reference: the back wall and the left wall are visible, "
                 "the front walls are removed like a dollhouse, the room fills about 85 percent of the picture width, "
                 "a large EMPTY plank or stone floor in the middle (at least 900 by 400 px), furniture only along the walls, "
                 "the entrance is a doorway in the left wall near the front corner of the floor, as in the reference; "
                 "no free-standing door in the middle of the floor; everything outside the room is pure black. "
                 "Do not copy the reference furniture or layout. ")
CAVE_NOTE = ("Underground location seen from the same high overhead angle and scale as the attached tavern interior reference, "
             "the space fills most of the picture, the entrance at the BOTTOM CENTER edge, one clearly lit passable floor path "
             "200-300 px wide winding through dark rock walls; everything outside the rock is pitch black. ")

lock = threading.Lock()
slow_until = [0.0]
slow_lock = threading.Lock()


def log(msg):
    line = time.strftime("%H:%M:%S ") + msg
    with lock:
        print(line, flush=True)
        open(os.path.join(RAW, "gen.log"), "a").write(line + "\n")


def build_prompt(spec, loc):
    kind = loc["kind"]
    tail = {"outdoor": spec["style"], "interior": spec["interiorStyle"], "cave": spec["caveStyle"]}[kind]
    tail = tail.replace(*CAMERA_FIX)
    exits = "; ".join(SIDE.get(e["side"], e["side"]) for e in loc["exits"])
    note = REF_NOTE + (INTERIOR_NOTE if kind == "interior" else CAVE_NOTE if kind == "cave" else "")
    return (note + loc["prompt"] + " Exits (do not write any words on the picture): " + exits + ". " + ("" if kind == "interior" else REGION_TAIL.get(loc["region"], "") + " ")
            + FUNCTIONAL + tail)


def refs_for(loc):
    if loc["kind"] == "outdoor":
        names = REFS.get((loc["region"], "outdoor"), ["map1.png", "tavern_map.png"])
    else:
        names = INTERIOR_REFS + REGION_EXTRA.get(loc["region"], [])[:1]
    return [os.path.join(MAPS, n) for n in names if os.path.exists(os.path.join(MAPS, n))][:3]


def fit(src, dst):
    im = Image.open(src).convert("RGB")
    w, h = im.size
    tw = round(h * W / H)
    if tw <= w:
        x0 = (w - tw) // 2; im = im.crop((x0, 0, x0 + tw, h))
    else:
        th = round(w * H / W); y0 = (h - th) // 2; im = im.crop((0, y0, w, y0 + th))
    tmp = dst[:-4] + ".tmp.png"
    im.resize((W, H), Image.LANCZOS).save(tmp, optimize=True)
    os.replace(tmp, dst)  # атомарно: проверка не увидит недописанный файл
    return (w, h)


def one(spec, loc, v):
    lid = loc["id"]
    out_raw = os.path.join(RAW, f"{lid}_v{v}.png")
    out = os.path.join(GEN, f"{lid}_v{v}.png")
    if os.path.exists(out):
        return "skip"
    prompt = build_prompt(spec, loc)
    refs = refs_for(loc)
    for attempt in range(3):
        with slow_lock:
            slow = time.time() < slow_until[0]
        if slow:
            with lock:  # деградация до 1 запроса: сериализуем через общий замок
                r = subprocess.run([PY, os.path.join(ROOT, "tools/veo_client.py"), "image", prompt, out_raw, *refs,
                                    "--aspect", "16:9", "--nostyle"], capture_output=True, text=True, timeout=600)
        else:
            r = subprocess.run([PY, os.path.join(ROOT, "tools/veo_client.py"), "image", prompt, out_raw, *refs,
                                "--aspect", "16:9", "--nostyle"], capture_output=True, text=True, timeout=600)
        if r.returncode == 0 and os.path.exists(out_raw):
            size = fit(out_raw, out)
            log(f"ok {lid}_v{v} raw={size[0]}x{size[1]}")
            return "ok"
        err = (r.stderr + r.stdout)[-300:].replace("\n", " ")
        log(f"fail {lid}_v{v} try{attempt + 1}: {err}")
        if "429" in err:
            with slow_lock:
                slow_until[0] = time.time() + 1800
            time.sleep(60)
        else:
            time.sleep(10)
    return "fail"


def main():
    a = sys.argv[1:]
    def opt(n, d):
        if n in a:
            i = a.index(n); v = a[i + 1]; del a[i:i + 2]; return v
        return d
    ids = opt("--ids", None); group = opt("--group", "all")
    nv = int(opt("--variants", "3")); par = int(opt("--par", "3")); dry = "--dry" in a
    spec = json.load(open(SPEC))
    locs = {l["id"]: l for l in spec["locations"]}
    if ids:
        blocks = [ids.split(",")]
    elif group == "all":
        blocks = list(GROUPS.values())
    else:
        blocks = [GROUPS[g] for g in group.split(",")]
    order = sum(blocks, [])
    os.makedirs(RAW, exist_ok=True); os.makedirs(GEN, exist_ok=True)
    if dry:
        for lid in order:
            print(lid, refs_for(locs[lid])); print(build_prompt(spec, locs[lid])); print()
        return
    # варианты по кругу: сначала v1 всем в группе, потом v2, v3 (чтобы раньше было что смотреть)
    jobs = [(locs[lid], v) for b in blocks for v in range(1, nv + 1) for lid in b if locs[lid]["status"] == "new"]
    log(f"start {len(jobs)} jobs par={par}")
    with ThreadPoolExecutor(par) as ex:
        res = list(ex.map(lambda j: one(spec, *j), jobs))
    log("done " + json.dumps({k: res.count(k) for k in set(res)}))


if __name__ == "__main__":
    main()
