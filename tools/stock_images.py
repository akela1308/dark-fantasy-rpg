"""Запас Veo: стартовые кадры Nano Banana для роликов и новых персонажей (06.11).
python3 tools/stock_images.py img       кадры в _stock/cine/*.png и <slug>/k_battle.png
python3 tools/stock_images.py queue     очереди _stock/q_f.json и _stock/q_i.json
Готовые файлы не перезаписываются."""
import json, os, subprocess, sys
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import night_roster as N
GEN = N.BASE; GAME = N.GAME; ST = f"{GEN}/_stock"; C = os.path.dirname(os.path.abspath(__file__)) + "/veo_client.py"
BG = "Flat solid pure chroma green background (#00FF00), the same green everywhere, no shadow, no floor, no effects, no glow, no text, no watermark, no other objects or characters."
STYLE = ("Dark fantasy game art, painterly oil painting, old darkened icon and Disciples II mood, late autumn of a dying empire, cold wet earth, faded banners, "
         "almost monochrome muted palette with one small warm accent of candle or fire light. No text, no letters, no logos, no UI.")
HERO = f"{GEN}/duelist/k_idle.png"
STY_REF = [f"{GAME}/public/battle/Forest_Road.jpg"]
# id: (кадр, движение в ролике, опорные картинки)
CINE = {
 "title": ("A vast ruined gothic arch on a foggy road at night under a pale moon, a lone cloaked traveller far away walking toward it, torches on the ruins.", "Very slow push-in. Fog drifts, torch flames flicker, the traveller walks slowly.", STY_REF),
 "intro1": ("A dying imperial capital seen from afar at dusk, huge cold palace towers, black smoke, faded eagle banners hanging limp.", "Slow pan to the right, smoke drifts, banners stir.", []),
 "intro2": ("Close view of a sealed imperial letter on a dark wooden table, cracked red wax seal, a gloved hand reaching for it, one candle.", "The gloved hand slowly picks up the letter, the candle flickers.", STY_REF),
 "intro3": ("A lone gaunt duelist in a dark worn leather coat with a rapier at his hip walks away from the camera along an empty rain-wet road through dead forest.", "He walks slowly into the distance, rain falls, slow camera follow.", [HERO] + STY_REF),
 "intro4": ("An abandoned border post at a forest road, a broken gate, a rotted wanted poster, crows on the fence, grey morning fog.", "Slow push-in, crows take off, fog drifts.", STY_REF),
 "intro5": ("A tavern with a crooked sign of a lame elk by a muddy road at night, warm light from small windows, rain.", "Slow push-in toward the door, rain falls, the window light flickers.", STY_REF),
 "seal1": ("An ancient forest altar of black stone with a half-buried iron ring seal, candles burning low, mist, carved forgotten names.", "Slow push-in, the candles gutter, a thin crack of pale light crawls over the seal.", STY_REF),
 "seal2": ("A man's hand with a dark iron ring, pale cold light seeping from under the skin, fingers trembling, darkness around.", "The hand slowly closes into a fist, the pale light pulses once.", STY_REF),
 "ch_swamp": ("A drowned village in a black swamp, a church steeple rising from still water, dead willows, pale will-o-wisps far away.", "Very slow pan, wisps drift, ripples on the water.", STY_REF),
 "ch_mountains": ("A narrow mountain pass with huge dwarven gates carved in grey rock, heavy snow clouds, a tiny line of travellers.", "Slow push-in, clouds move, snow blows from the ridges.", STY_REF),
 "ch_north": ("A frozen lake under a pale sky, a dead ice city on the far shore, a lone dark figure of the party crossing the ice in a snowstorm.", "Slow push-in, wind blows the snow across the ice.", STY_REF),
 "ch_throne": ("An enormous cold throne hall, an empty iron throne, tall dying candles, torn banners, snow falling through a broken roof.", "Very slow push-in toward the throne, candles flicker, snow falls.", STY_REF),
 "korvin": ("A forest bandit camp at night, a scarred captain in a dark hood sits by the fire with a knife, men with crossbows in the shadows.", "Slow push-in, the fire flickers, he slowly looks up at the camera.", STY_REF),
 "moroz": ("A towering old man of ice in a white fur robe standing on a frozen lake in a blizzard, an ice staff, eyes pale.", "Slow push-in, the blizzard swirls, he slowly raises his head.", STY_REF),
 "queen": ("A pale queen of winter on a throne of ice, a crown of frost, a dark empty hall, cold mist on the floor.", "Slow push-in, the mist moves, she slowly opens her eyes.", STY_REF),
 "battle_win": ("A battered party of three silhouettes stands on a misty battlefield at dawn, dead bodies around, weapons lowered, crows circling.", "Slow pull-back, crows circle, mist drifts.", STY_REF),
 "defeat": ("A fallen rapier and an empty pistol lying in the mud in the rain, a dead hand beside them, a raven lands nearby.", "Rain falls, the raven lands and tilts its head, very slow push-in.", STY_REF),
 "end_law": ("A new iron road gate with a raised banner at dawn, soldiers marching, a tired duelist in the foreground watching them.", "Slow pull-back, the banner moves, the sun rises through the fog.", [HERO] + STY_REF),
 "end_debt": ("An old tavern table with coins, a torn contract and a knife stuck through it, candle nearly out.", "The candle slowly dies, smoke rises, very slow push-in.", STY_REF),
 "end_seal": ("A hooded figure with no face sits on a broken throne, the iron seal ring on the finger, all the names on the walls erased.", "Very slow push-in, pale light pulses in the ring, dust falls.", STY_REF),
 "end_road": ("A lone rider and a small party on a long empty road into a red autumn sunset, burned villages behind them.", "They ride slowly away, slow pull-back, wind in the grass.", STY_REF),
 "rest": ("A small campfire in a dark forest clearing, three bedrolls, a dented pot, the night around.", "The fire flickers, sparks rise, very slow push-in.", STY_REF),
 "tavern_life": ("Inside a low dark tavern, a heavy-set tavern keeper wipes a mug at the bar, drinkers at tables, a hearth.", "He slowly wipes the mug, the fire flickers, smoke drifts.", STY_REF),
 "worldmap": ("An old hand-drawn parchment map of a borderland with mountains, swamps and roads, a bronze compass, wax drops, on a dark table in candle light.", "Candle light flickers over the map, very slow pan.", STY_REF),
}
# slug: (стиль, описание, руки и оружие, вид атаки)
# Опора проступает в кадр: Хольт дорисовывает арбалет, Кикимора и медведь ветки и голову. Для этих слагов своя опора
CLEAN = " Only the items named here exist: no crossbow, no bow unless named, no floating branches, no second animal, no extra heads."
REF2 = {s: [f"{GEN}/{r}/k_battle.png"] for s, r in dict(road_commander="guard", ban_bearer="recruit", crown_captain="guard", tax_inquisitor="recruit",
        bone_miller="gallows_reader", bog_mother="troll_ugryum", ash_wolf="mangy_dog").items()}
HU = [f"{GEN}/holt/k_battle.png"]; MO = [f"{GEN}/kikimora/k_battle.png", f"{GEN}/forest_bear/k_battle.png"]
CH = {
 "pechatnik": (HU, "a gaunt imperial seal-keeper in a long dark grey robe, ink-stained fingers, belts with wax seal stamps and rolled scrolls", "a heavy bronze seal stamp on a chain in the front hand, a closed ledger in the rear hand", "caster"),
 "road_commander": (HU, "a veteran road commander of about 50, worn half-plate over a faded blue-grey surcoat, a grey cropped beard, a scar over the eye", "a broad short sword in the front hand, a small signal horn hanging at the belt, the rear hand empty", "human"),
 "exile_smith": (HU, "a huge exiled blacksmith, burned leather apron over bare scarred arms, a branded forehead, singed beard", "a long forge hammer held with both hands", "heavy"),
 "ban_bearer": (HU, "a tall thin figure wrapped in strips of cloth covered in forbidden script, a black iron collar, a hidden lower face, tired pale eyes", "one black iron chain wrapped around the front forearm, the rear hand holds a sealed iron box", "caster"),
 "trail_huntress": (HU, "a lean huntress of about 35 in a mud-coloured hooded cloak, wolf-fur shoulders, weathered face, a quiver at the hip", "a short hunting bow in the front hand, an arrow in the rear hand", "archer"),
 "crown_soldier": (HU, "a soldier of the Eastern Crown, dented kettle helmet, blue-grey padded coat with a faded crown badge, tired eyes", "a spear held with both hands", "human"),
 "crown_captain": (HU, "a captain of the Eastern Crown in polished but dented plate, a torn blue-grey cloak, a hard clean-shaven face", "a longsword in the front hand, a small round shield on the rear arm", "human"),
 "tax_inquisitor": (HU, "a cold thin tax inquisitor in a long black coat with silver buttons, a flat hat, a ledger on a chain at his belt", "a thin iron rod in the front hand, the rear hand holds a lantern", "caster"),
 "plague_monk": (HU, "a plague monk in a filthy brown habit, a beaked leather mask, a bell at the rope belt", "a censer on a chain in the front hand, the rear hand empty", "caster"),
 "gallows_bride": (MO, "a dead bride in a rotting grey wedding dress, a noose around the neck, long wet black hair over the face", "no weapon, long pale nails on both hands", "monster"),
 "barrow_king": (MO, "a tall barrow king, a dried corpse in rusted ancient scale armor, a corroded crown, hollow eyes with a dim blue light", "a huge notched bronze sword held with both hands", "heavy"),
 "bog_mother": (MO, "a giant swollen bog hag covered in moss, leeches and reeds, a wide toothless mouth, long arms", "no weapon, huge webbed hands", "monster"),
 "bone_miller": (MO, "a hunched skeletal miller covered in white flour dust, sacks tied to his back", "a long wooden mill paddle held with both hands", "heavy"),
 "ice_wight": (MO, "a frozen dead soldier with ice growing from the armor, frost beard, blue-white skin", "a broken frozen sword in the front hand, the rear hand empty", "human"),
 "stone_ancestor": (MO, "a dwarf ancestor statue come to life, rough grey stone body with carved runes, moss in the cracks", "a stone war hammer held with both hands", "heavy"),
 "ash_wolf": (MO, "a huge starving wolf made of ash and embers, cracks of dull orange in the fur", None, "beast"),
 "black_stag": (MO, "a gigantic black stag with dead-tree antlers hung with rags and bones, white eyes", None, "beast"),
}
MOVES = lambda k: ("power" if k in ("human", "heavy", "monster", "beast") else "cast2")


def img_jobs():
    out = []
    for k, (p, _, refs) in CINE.items():
        out.append((f"{ST}/cine/{k}.png", p + " " + STYLE, refs, "16:9"))
    for s, (refs, d, w, kind) in CH.items():
        new = ("A NEW original animal or creature, NOT the one in the references: copy only the hand-painted art style and level of detail." if w is None else
               "A NEW original character for a dark fantasy game, NOT the one in the reference: copy only the painting style, rendering, lighting and proportions.")
        pose = "a side view facing the RIGHT side of the image, a ready stance on all legs" if w is None else f"a ready fighting stance facing to the right, {w}"
        refs = REF2.get(s, refs)
        p = f"{new} {d}.{CLEAN if s in REF2 else ''} Exactly one figure, full body, {pose}. Whole figure visible, nothing cut off, the figure about 60% of the image height, centered, the feet near the bottom, lots of empty space above the head. {BG}"
        out.append((f"{GEN}/{s}/k_battle.png", p, refs, "16:9"))
    return out


def one(j):
    out, p, refs, asp = j
    if os.path.exists(out): return
    os.makedirs(os.path.dirname(out), exist_ok=True)
    r = subprocess.run([sys.executable, C, "image", p, out, *refs, "--aspect", asp], capture_output=True, text=True)
    print(os.path.basename(os.path.dirname(out)), os.path.basename(out), "ok" if os.path.exists(out) else (r.stdout + r.stderr)[-250:], flush=True)


def queues():
    f = [dict(name=f"_stock/cine/{k}_vid", first=f"_stock/cine/{k}.png", prompt=m + " Cinematic, the same painted style, the same light and characters, no cuts, no text.", sec=8, n=2, raw=True) for k, (_, m, _) in CINE.items() if os.path.exists(f"{ST}/cine/{k}.png")]
    i = []
    KEEP = " The figure keeps exactly the same body, the same face and the same limbs for the whole clip. The whole figure stays inside the frame, empty green space above the head. No visual effects, no flashes, no trails, no glow, no particles."
    for s, (_, d, w, kind) in CH.items():
        b = f"{s}/k_battle.png"
        if not os.path.exists(f"{GEN}/{b}"): continue
        beast = w is None; h = "" if beast else f" HANDS CANON: {w}; the front hand is the hand on the right side of the image. Never swap hands, never duplicate, drop or change the weapons."
        kk = kind if kind in N.SPECIAL else ("human" if kind == "archer" else kind)
        sp = N.SPECIAL.get(kk, ("power", N.ATTACK[kind]))[1]
        clips = {"bidle": ((N.IDLE_BEAST if beast else N.BIDLE), b), "attack": (N.ATTACK[kind], b), "hit": (N.HIT, b), "death": ((N.DEATH_BEAST if beast else N.DEATH), None),
                 "victory": ((N.VICTORY_BEAST if beast else N.VICTORY), None), MOVES(kind): (sp, b)}
        for c, (p, last) in clips.items():
            j = dict(name=f"{s}/clips/{c}", first=b, prompt=p + h + KEEP, sec=4, n=2)
            if last: j["last"] = last
            i.append(j)
    for n, q in (("f", f), ("i", i)):
        json.dump(q, open(f"{ST}/q_{n}.json", "w"), ensure_ascii=False, indent=1)
        print(n, len(q), round(sum(j["sec"] * j["n"] * 0.4 for j in q)), "$")


if __name__ == "__main__":
    if sys.argv[1] == "img":
        with ThreadPoolExecutor(8) as ex: list(ex.map(one, img_jobs()))
    else: queues()
