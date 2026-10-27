"""Перенарезка боевых анимаций, где фигура или оружие упираются в край кадра листа (оружие срезано).
Ищет такие листы (как edges.py плейтеста), берёт спеку из assets/generated/_night/specs/, расширяет
поле рамки с той стороны, где упирается, и режет новой версией (старый лист не трогается).
python3 tools/recut_margins.py [--list] [--par 4] [--only slug_anim,...]
Потом: python3 tools/night_manifest.py (берёт старшую версию) и python3 tools/fix_body_height.py."""
import json, os, re, sys, glob, subprocess, tempfile
from concurrent.futures import ThreadPoolExecutor
from PIL import Image

GAME = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
GEN = f"{GAME}/assets/generated"
UNIT = {"duelist": "hero_duelist", "brawler": "companion_brawler", "healer": "companion_healer",
        "shield": "companion_shield", "swamp_elf": "swamp_elf_battle"}
INV = {v: k for k, v in UNIT.items()}
GROW = {"T": ("top", 0.22, 0.55), "L": ("left", 0.85, 1.25), "R": ("right", 1.0, 1.45), "B": ("bottom", 0.03, 0.25)}


def clipped():
    anims = json.load(open(f"{GAME}/src/data/animations.json"))
    out = []
    for uid, c in anims.items():
        for n, a in c["anims"].items():
            if n.startswith("amb"): continue
            im = Image.open(f"{GAME}/public/{a['file']}").getchannel("A")
            fw, fh = a["frameWidth"], a["frameHeight"]; cols = im.width // fw
            sides = set()
            for i in range(a["frames"]):
                x, y = (i % cols) * fw, (i // cols) * fh
                bb = im.crop((x, y, x + fw, y + fh)).point(lambda v: 255 if v > 40 else 0).getbbox()
                if not bb: continue
                if bb[0] <= 1: sides.add("L")
                if bb[1] <= 1: sides.add("T")
                if bb[2] >= fw - 1: sides.add("R")
                if bb[3] >= fh - 1: sides.add("B")
            if sides: out.append((uid, n, sorted(sides)))
    return out


def next_ver(slug, anim):
    vs = [int(m.group(1)) for f in glob.glob(f"{GAME}/public/sprites/battle/{slug}_{anim}_v*.json")
          if (m := re.search(r"_v(\d+)\.json$", f))]
    return max(vs, default=0) + 1


def job(item):
    uid, anim, sides = item
    slug = INV.get(uid, uid)
    sp = f"{GEN}/_night/specs/{slug}_{anim}.json"
    if not os.path.exists(sp): return f"{slug}_{anim}: нет спеки"
    spec = json.load(open(sp))
    for s in sides:
        k, dflt, new = GROW[s]
        spec[k] = max(spec.get(k, dflt), new)
    spec["ver"] = next_ver(slug, anim); spec.pop("overwrite", None)
    if spec.get("hit") is None and anim in ("attack", "power", "slash", "lunge", "shot", "cast2"):
        spec["hit"] = "auto"
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as t:
        json.dump(spec, t)
    r = subprocess.run([sys.executable, f"{GAME}/tools/night_cut.py", t.name], capture_output=True, text=True)
    os.unlink(t.name)
    return (r.stdout.strip().splitlines() or [""])[-1] if r.returncode == 0 else f"{slug}_{anim}: ОШИБКА {r.stderr.strip()[-300:]}"


if __name__ == "__main__":
    a = sys.argv[1:]
    items = clipped()
    if "--only" in a:
        only = set(a[a.index("--only") + 1].split(","))
        items = [i for i in items if f"{INV.get(i[0], i[0])}_{i[1]}" in only]
    if "--list" in a:
        for i in items: print(i)
        print(len(items)); sys.exit()
    par = int(a[a.index("--par") + 1]) if "--par" in a else 4
    with ThreadPoolExecutor(par) as ex:
        for line in ex.map(job, items): print(line, flush=True)
