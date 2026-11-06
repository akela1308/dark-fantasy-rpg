"""Очереди запаса Veo (06.11, конец доступа): python3 tools/stock_queue.py -> assets/generated/_stock/q_*.json
b дыры в боевых наборах, c новые движения отряда, e эффекты на чёрном, g живые фоны боя и карт, h живые портреты.
Роликам и новым персонажам нужны кадры Nano Banana: tools/stock_images.py."""
import glob, json, os, re, sys
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import night_roster as N
from edge_regen import wide
GEN = N.BASE; GAME = N.GAME; ST = f"{GEN}/_stock"
os.makedirs(ST, exist_ok=True)
NOFX = " No visual effects, no flashes, no trails, no glow, no particles."
ROOM = " The camera is far back: the whole figure, with raised arms and weapons, stays fully inside the frame at all times, with empty green space above the head."
KEEP = " The figure keeps exactly the same body, the same face and the same limbs for the whole clip."


def hands(slug):
    for f in sorted(glob.glob(f"{GEN}/{slug}/clips*/*_op.json")):
        m = re.search(r"HANDS CANON:.*?(?:never .*?weapons?\.|\.\s)", json.load(open(f))["prompt"])
        if m: return " " + m.group(0).strip()
    return ""


def base(slug):
    for n in ("k_battle", "k_idle"):
        if os.path.exists(f"{GEN}/{slug}/{n}.png"): return wide(f"{slug}/{n}.png", 0.72)
    raise SystemExit("нет базы " + slug)


def job(name, first, prompt, last=None, sec=4, n=2, raw=False):
    j = dict(name=name, first=first, prompt=prompt, sec=sec, n=n)
    if last: j["last"] = last
    if raw: j["raw"] = True
    return j


# b. Дыры: у этих бойцов нет основных анимаций
GAPS = {"assassin": ("human", ["attack", "hit"]), "drowned": ("monster", ["attack"]), "kikimora": ("monster", ["attack"]),
        "kobold": ("human", ["death", "victory"]), "mountain_king": ("heavy", ["hit", "death", "victory"]), "shield": ("heavy", ["hit"]),
        "vurdalak": ("monster", ["attack"]), "winter_girl": ("caster", ["hit", "victory"]), "winter_monster": ("monster", ["victory"]),
        "winter_queen": ("caster", ["attack", "death", "victory"])}
b = []
for s, (k, ans) in GAPS.items():
    f = base(s); h = hands(s)
    for a in ans:
        p = {"attack": N.ATTACK[k], "hit": N.HIT, "death": N.DEATH, "victory": N.VICTORY}[a]
        b.append(job(f"{s}/clips/{a}_s", f, p + h + KEEP + NOFX + ROOM, last=f if a in ("attack", "hit") else None))

# c. Новые движения отряда: для навыков и поздних уровней
PARTY = ["duelist", "brawler", "healer", "holt", "shield", "til", "bandit_archer", "recruit", "archer_guard", "swamp_elf"]
MOVES = {
 "dodge": ("One quick evasive move: leans and sidesteps back to the left, avoiding a blow from the right, then returns to the same ready stance. Feet end where they started.", True),
 "guard": ("Braces and parries a heavy blow coming from the right with the weapon, the body absorbs the impact, then returns to the same ready stance.", True),
 "getup": ("Is knocked down onto the ground by a blow from the right, then struggles back up with effort and returns to the same ready stance.", True),
 "wounded": ("Badly wounded: sinks down to one knee with a pained face, leans forward, breathes heavily and stays down on one knee until the end of the clip.", False),
 "focus": ("Prepares for battle: plants the feet, closes the eyes for a moment, breathes in deeply, tightens the grip, opens the eyes and looks to the right. Returns to the same ready stance.", True),
 "taunt": ("A contemptuous challenge to the enemy on the right: jerks the chin up and makes one short threatening gesture with the free hand or the weapon, then returns to the same ready stance.", True),
}
c = []
for s in PARTY:
    f = base(s) if s != "duelist" else "duelist/k_idle_w.png"; h = hands(s)
    for a, (p, back) in MOVES.items():
        c.append(job(f"{s}/clips/{a}_s", f, p + h + KEEP + NOFX + ROOM, last=f if back else None))

# e. Эффекты на чёрном: в игре накладываются режимом ADD
black = "_stock/black.png"
Image.new("RGB", (1280, 720), (0, 0, 0)).save(f"{GEN}/{black}")
FX = {"fire_burst": "a burst of orange fire erupts in the center and burns out", "fire_loop": "a steady campfire flame burning in the center, seamless",
 "torch_loop": "a single torch flame flickering in the center", "candle_loop": "a single small candle flame trembling in the center",
 "embers": "orange embers rise and drift upward across the frame", "ash": "grey ash falls slowly across the whole frame",
 "smoke_puff": "a puff of grey gunpowder smoke expands from the center and dissipates", "smoke_loop": "thin grey smoke rises slowly from the bottom center",
 "muzzle": "one short muzzle flash with a jet of sparks to the right, then thin smoke", "dust_hit": "a burst of brown dust and small stones from an impact on the ground",
 "blood_spray": "a spray of dark red blood droplets flies to the right from the center and falls", "blood_splat": "dark red blood splashes outward from the center",
 "slash_arc": "one pale steel-colored curved slash streak sweeps across the center and fades", "slash_heavy": "one wide heavy arc of pale light and dust sweeps down through the center and fades",
 "sparks": "a short burst of bright metal sparks from the center, as from steel striking steel", "bell_wave": "one pale circular shockwave expands from the center and fades",
 "heal_motes": "warm golden motes of light slowly rise from the bottom and fade", "herb_mist": "a soft pale green mist swirls in the center and fades",
 "poison": "a sickly yellow-green vapor rolls out from the center and fades", "curse": "thin black smoke tendrils with dull red edges curl outward from the center and fade",
 "ghost_hands": "pale ghostly hands of mist reach up from the bottom and dissolve", "frost_burst": "a burst of ice crystals and white frost expands from the center and fades",
 "ice_shards": "sharp ice shards fly from the left to the right and vanish", "snow_loop": "snowflakes fall steadily across the whole frame, wind from the left",
 "rain_loop": "thin rain streaks fall across the whole frame", "fog_loop": "a slow low bank of pale fog drifts from left to right along the bottom",
 "leaves": "dry dark leaves blow across the frame from left to right", "crows": "several black crows fly across the frame from left to right",
 "bats": "a small swarm of black bats flutters across the frame", "flies": "a small swarm of black flies circles in the center",
 "seal_crack": "a thin crack of pale light spreads across the center like a breaking wax seal, then fades", "wax_drip": "dark red wax drips slowly down from the top center"}
e = [job(f"_stock/fx/{k}", black, f"Pure black background, nothing else in the frame. {v}. Hand-painted dark fantasy game effect, muted natural colors, locked camera. No text.", sec=4, raw=True) for k, v in FX.items()]

# g. Живые фоны: тот же кадр в начале и в конце, двигается только среда
AIR = ("A living painting, a seamless loop. The camera is locked off and absolutely still. The painted image, its composition, buildings, rocks and trees "
       "stay exactly the same. Only the atmosphere moves very gently: {a}. No people appear, no new objects, no cuts.")
BG = {"Boloto_battle": "swamp fog drifts, water ripples", "Boloto_battle1": "swamp fog drifts, water ripples", "Forest_Battle": "fog drifts between the trees, leaves stir",
 "Forest_Road": "fog drifts along the road, branches sway", "Grad_battle": "snow falls, torches flicker", "KingThrone_battle": "torches and candles flicker, dust floats in the light",
 "KingThrone_battle2": "torches and candles flicker, dust floats in the light", "Mountain_battle": "clouds drift, snow blows off the ridges", "Plane": "grass sways, clouds drift",
 "Tavern_battle": "hearth fire and candles flicker, smoke drifts", "Tavern_battle2": "hearth fire and candles flicker, smoke drifts", "Tavern_battle3": "hearth fire and candles flicker, smoke drifts",
 "Tavern_battle4": "hearth fire and candles flicker, smoke drifts", "Village_battle1": "smoke rises from chimneys, grass sways", "Village_battle2": "smoke rises from chimneys, grass sways",
 "Village_battle3": "smoke rises from chimneys, grass sways", "Winter_Forest": "snow falls, branches tremble", "Winter_Grad": "snow falls, torches flicker"}
g = [job(f"_stock/bg/battle_{k}", os.path.relpath(f"{GAME}/public/battle/{k}.jpg", GEN), AIR.format(a=v), last=os.path.relpath(f"{GAME}/public/battle/{k}.jpg", GEN), sec=8, raw=True) for k, v in BG.items()]
MAPS = {"forest1": "fog and branches", "tavern_map": "chimney smoke and lantern flames", "tavern_inside": "hearth fire and candles", "elf_boloto": "swamp fog and water ripples",
 "road_boloto": "fog and water ripples", "mountains_map": "clouds and blowing snow", "kingthrone": "torches and dust", "village": "chimney smoke and grass", "south_post": "fog and a brazier flame",
 "three_pillars": "chimney smoke and fog", "old_mill": "water and grass", "burned_hamlet": "thin smoke and ash", "dead_road": "fog and crows' shadows of clouds", "gallows_hill": "wind in the grass and clouds",
 "forest_camp": "campfire smoke", "forest_altar": "fog and candle flames", "forest_deep": "fog and branches", "ravine": "fog and water", "drowned_village": "fog and water ripples",
 "swamp_map": "swamp fog", "copper_mine": "lamp flames and dust", "dwarf_hall": "forge fire and dust", "winter_forest": "falling snow", "frozen_lake": "blowing snow", "ice_shrine": "cold mist",
 "winter_grad_gate": "snow and torches", "grad_square": "snow and torches", "queens_hall": "candles and cold mist", "north_road": "blowing snow", "north_frontier": "blowing snow and torn banners"}
cfg = json.load(open(f"{GAME}/src/data/maps.json"))
for k, v in MAPS.items():
    c0 = cfg[k]; im = c0.get("image") or c0.get("background") or c0.get("bg") or c0.get("mapImage") or k
    hits = glob.glob(f"{GAME}/public/maps/**/{os.path.basename(str(im)).split('.')[0]}.*", recursive=True) or glob.glob(f"{GAME}/public/maps/gen/{k}_pick.jpg")
    if not hits: print("нет картинки", k, im); continue
    rel = os.path.relpath(hits[0], GEN)
    g.append(job(f"_stock/bg/map_{k}", rel, AIR.format(a=v), last=rel, sec=8, raw=True))

# h. Живые портреты для диалогов: портрет на тёмном поле 16:9, после нарезки кадрируется назад в квадрат
PORT = ("adventurer agna_v2 bandit_commander cat cleaning_girl companion_brawler companion_healer cult_priest drunkman dwarf dwarf_smith guard halvar herbalist hero_duelist holt "
        "jester kikimora leshy likho lyo_v2 mavka merc_captain moroz mountain_king poludnitsa ryzh shopkeeper swamp_elder_elf swamp_elf_girl swamp_knight tavernman til vodyanoy wanderer "
        "whisperer widow winter_queen yrka reader").split()
os.makedirs(f"{ST}/pad", exist_ok=True)
h = []
for s in PORT:
    im = Image.open(f"{GAME}/public/portraits/{s}.png").convert("RGB").resize((720, 720), Image.LANCZOS)
    c0 = Image.new("RGB", (1280, 720), im.resize((1, 1)).getpixel((0, 0))); c0.paste(im, (280, 0)); c0.save(f"{ST}/pad/{s}.png")
    h.append(job(f"_stock/portrait/{s}", f"_stock/pad/{s}.png", "A living portrait, locked camera, the head stays in the same place and the same size. The person breathes, blinks twice slowly, the mouth moves a little as if speaking quietly, a slight turn of the eyes. Same painted style, same face, same light. No text.", last=f"_stock/pad/{s}.png", raw=True))

for n, q in (("b", b), ("c", c), ("e", e), ("g", g), ("h", h)):
    if not os.path.exists(f"{ST}/q_{n}.json"): json.dump(q, open(f"{ST}/q_{n}.json", "w"), ensure_ascii=False, indent=1)
    print(n, len(q), "заданий", round(sum(j["sec"] * j["n"] * 0.4 for j in q)), "$")

# j. Боссы: появление, рёв, вторая атака; обычным врагам вторая атака; ходьба на карте
BOSS = {"leshy": "monster", "moroz": "caster", "likho": "monster", "winter_queen": "caster", "mountain_king": "heavy", "troll_ugryum": "heavy", "vodyanoy": "monster",
        "swamp_knight": "human", "frontier_beast": "monster", "bear_shatun": "beast", "whisperer": "caster", "bandit_commander": "human"}
FOES = {"bandit_brawler": "heavy", "bandit_knifeman": "human", "bandit_axewoman": "human", "bandit_poacher": "crossbow", "cult_zealot": "human", "cult_acolyte": "caster", "merc_pikeman": "human", "merc_captain": "human",
        "grey_wolf": "beast", "wild_dog": "beast", "drowned": "monster", "upyr": "monster", "wolfolak": "monster", "shade": "monster", "hanged": "monster", "grad_guard": "human", "grad_crossbowman": "crossbow", "stone_guard": "heavy", "dwarf": "heavy", "kobold": "human"}
j = []
A2 = {"human": "One single different attack to the right: a low thrust forward from below, a fast step in, then back into the same ready stance.", "heavy": "One single sweeping sideways swing at waist height to the right, the weight of the weapon carries the body, then back into the same ready stance.",
      "crossbow": "One single quick shot to the right from the hip, then back into the same ready stance.", "caster": "A different spell gesture: both hands sweep low from left to right, then back into the same ready stance. No glow, no particles.",
      "monster": "One single different attack to the right: a low bite or grab forward, then recovers back into the same stance.", "beast": "One single different attack to the right: rears up slightly and strikes down with the front, then steps back into the same stance."}
has = lambda s: os.path.exists(f"{GEN}/{s}/k_battle.png") or os.path.exists(f"{GEN}/{s}/k_idle.png")
for s, k in BOSS.items():
    if not has(s): print("нет", s); continue
    f = base(s); h = hands(s); tail = (" The creature keeps exactly the same body and shape for the whole clip." if k == "beast" else KEEP) + h + NOFX + ROOM
    j.append(job(f"{s}/clips/enter_s", f, "Entrance: the figure rises up from a crouch, slowly straightens to full height, lifts the head and looks to the right, ending in the ready stance." + tail, last=f))
    j.append(job(f"{s}/clips/roar_s", f, "A terrifying threat: throws the head back, roars with the whole body tense, then returns to the same stance." + tail, last=f))
    j.append(job(f"{s}/clips/attack2_s", f, A2[k] + tail, last=f))
for s, k in FOES.items():
    if not has(s): print("нет", s); continue
    f = base(s); tail = (" The animal keeps exactly the same body and shape for the whole clip." if k == "beast" else KEEP) + hands(s) + NOFX + ROOM
    j.append(job(f"{s}/clips/attack2_s", f, A2[k] + tail, last=f))
WALK = "holt til recruit agna cleaning_girl tavernman drunkman guard archer_guard herbalist peddler pilgrim peasant_woman fisherman plowman shepherd gravedigger shopkeeper wanderer beggar jester miller woodcutter widow".split()
os.makedirs(f"{ST}/pad", exist_ok=True)
for s in WALK:
    src = f"{GEN}/{s}/k_idle.png"
    if not os.path.exists(src): continue
    im = Image.open(src).convert("RGB"); w, h0 = im.size
    bgc = im.resize((1, 1), box=(0, 0, 8, 8)).getpixel((0, 0)); k = 560 / h0
    sm = im.resize((int(w * k), 560), Image.LANCZOS); c0 = Image.new("RGB", (1376, 768), bgc); c0.paste(sm, ((1376 - sm.width) // 2, 768 - 560 - 20))
    pad = f"_stock/pad/walk_{s}.png"; c0.save(f"{GEN}/{pad}")
    j.append(job(f"{s}/clips/walk_s", pad, N.WALK_PROMPT + " Hands and held items stay exactly as in the first frame. The whole figure stays inside the frame." + NOFX, last=pad))
json.dump(j, open(f"{ST}/q_j.json", "w"), ensure_ascii=False, indent=1)
print("j", len(j), "заданий", round(sum(x["sec"] * x["n"] * 0.4 for x in j)), "$")
