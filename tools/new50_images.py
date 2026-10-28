"""Базовые позы и портреты Nano Banana для ростера _new50.
python3 tools/new50_images.py A|B [slug ...]   (A: первая фигура; B: боевая поза от карты + портреты)
Запуск через $PY (nbenv). Существующие файлы не перезаписывает (новая версия = удалить или --force)."""
import json, os, sys, subprocess
from concurrent.futures import ThreadPoolExecutor
GAME = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GEN = GAME + "/assets/generated"
PORTRAIT_REF = "/Users/maksimilin/Desktop/Dark Fantasy/арты/Таверна/TavernMan_portair.png"
REFS = {"human_map": [GAME + "/public/maps/characters/guard.png"],
        "human_battle": [GEN + "/holt/k_battle.png"],
        "beast": [GEN + "/mangy_dog/k_battle.png"],
        "monster": [GEN + "/kikimora/k_battle.png", GEN + "/forest_bear/k_battle.png"]}
BG = "Flat solid pure chroma green background (#00FF00), the same green everywhere, no shadow, no floor, no effects, no glow, no text, no watermark, no other objects or characters."
R = json.load(open(GEN + "/_new50/roster.json"))


def new_line(c):
    if c["style"] == "beast":
        return "A NEW original animal, NOT the animal in the reference: copy only the hand-painted art style, rendering and level of detail. Realistic anatomy, an ordinary animal, not a monster."
    if c["style"] == "monster":
        return "A NEW original creature for a dark fantasy game, NOT the creature in the reference images: copy only the hand-painted art style, rendering, lighting and level of detail. Slavic folklore, the fear is in the pose and the light, not in the teeth."
    return "A NEW original character, NOT the person in the reference image: copy only the painting style, rendering, lighting and proportions. Grounded late medieval borderland clothes, worn cloth, old leather, dull metal, muted colors, ordinary realistic face."


def jobs(phase):
    out = []
    for c in R:
        s = c["slug"]; d = f"{GEN}/{s}"; beast = c["style"] == "beast"
        if phase == "A":
            if c["map"]:
                pose = c["mapPose"] or "standing"
                if beast:
                    p = (f"{new_line(c)} {c['desc']}. EXACTLY one, {pose}, calm, side view facing the RIGHT side of the image. "
                         f"Full body visible, nothing cut off, about 60% of the image height, feet near the bottom. {BG}")
                    out.append((s, "k_idle.png", p, REFS["beast"], "4:3"))
                else:
                    p = (f"{new_line(c)} {c['desc']}. Exactly one figure, full body, {pose}, calm, three-quarter view, facing slightly to the right. "
                         f"Whole figure visible, nothing cut off, about 80% of the image height, feet near the bottom. {BG}")
                    out.append((s, "k_idle.png", p, REFS["monster" if c["style"] == "monster" else "human_map"], "3:4"))
            elif c["battle"]:
                out.append((s, "k_battle.png", battle_new(c), REFS["beast" if beast else "monster" if c["style"] == "monster" else "human_battle"], "16:9"))
        else:
            if c["map"] and c["battle"] and os.path.exists(f"{d}/k_idle.png"):
                out.append((s, "k_battle.png", battle_edit(c), [f"{d}/k_idle.png"], "16:9"))
            base = f"{d}/k_idle.png" if c["map"] else f"{d}/k_battle.png"
            if os.path.exists(base):
                who = "animal" if beast else "creature" if c["style"] == "monster" else "character"
                head = "the head and neck" if beast else "head and shoulders"
                p = (f"A NEW portrait, NOT the person in the first reference: copy only the ornate dark gothic metal frame with the lion head on top "
                     f"and the round medallion at the bottom, dark background, warm candle light on the face, painterly style, restrained emotion. "
                     f"Inside the frame: {head} of the {who} from the second reference (same face, hair, clothes and colors: {c['desc']}), facing slightly to the right. "
                     f"Outside the frame: flat plain white background. No text.")
                out.append((s, "portrait.png", p, [PORTRAIT_REF, base], "1:1"))
    return out


def battle_new(c):
    beast = c["style"] == "beast"
    if beast:
        return (f"{new_line(c)} {c['desc']}. EXACTLY one, standing on four legs, side view, facing the RIGHT side of the image, head lowered, "
                f"teeth bared, ready to attack, never on hind legs. Full body visible, about 60% of the image height, paws near the bottom. {BG}")
    return (f"{new_line(c)} {c['desc']}. EXACTLY ONE figure, full body visible, nothing cut off, centered, about 75% of the image height, the feet near the bottom. "
            f"Pose: a ready combat stance, three-quarter view, the face, the chest and the toes turned to the RIGHT side of the image. "
            f"WEAPONS: {c['weapons']}. The front hand is the hand on the right side of the image. {BG}")


def battle_edit(c):
    if c["style"] == "beast":
        return (f"Edit of the reference image: the same animal (same fur, colors, marks and size). Pose: standing on four legs, side view, facing the RIGHT side "
                f"of the image, head lowered, teeth bared, ready to attack, never on hind legs. Exactly one, full body, about 60% of the image height. {BG}")
    return (f"Edit of the reference image. Exactly one figure, the exact same character as in the reference: same face, hair, body, clothes, colors and items. "
            f"Full body visible, nothing cut off, centered, about 75% of the image height, the feet near the bottom. Pose: a ready combat stance, three-quarter view. "
            f"The character faces the RIGHT side of the image: the face, the chest and the toes are turned to the right. WEAPONS: {c['weapons']}. "
            f"The front hand is the hand on the right side of the image. {BG}")


def run(j):
    s, fn, p, refs, aspect = j
    out = f"{GEN}/{s}/{fn}"
    if os.path.exists(out) and "--force" not in sys.argv: return f"skip {s}/{fn}"
    os.makedirs(os.path.dirname(out), exist_ok=True)
    open(out.replace(".png", "_prompt.txt"), "w").write(p + "\nrefs: " + ", ".join(refs))
    size = "2K" if aspect == "16:9" else "1K"
    for _ in range(2):
        r = subprocess.run([sys.executable, GAME + "/tools/veo_client.py", "image", p, out, *refs, "--aspect", aspect, "--size", size], capture_output=True, text=True)
        if os.path.exists(out): return f"ok {s}/{fn}"
    return f"FAIL {s}/{fn} {r.stdout[-200:]} {r.stderr[-300:]}"


if __name__ == "__main__":
    only = [a for a in sys.argv[2:] if not a.startswith("--")]
    js = [j for j in jobs(sys.argv[1]) if not only or j[0] in only]
    print(len(js), "jobs", flush=True)
    with ThreadPoolExecutor(6) as ex:
        for r in ex.map(run, js): print(r, flush=True)
