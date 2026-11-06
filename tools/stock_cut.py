"""Нарезка одобренных клипов запаса Veo в боевые листы. python3 tools/stock_cut.py good.json
good.json: {"<slug>|<clipname>": вариант}. Поля рамки берутся из спеки стойки персонажа, база кадра *_w.png."""
import json, os, re, subprocess, sys, tempfile
from concurrent.futures import ThreadPoolExecutor
from edge_regen import GEN, wide
FRAMES = {"hit": 14, "death": 30, "dodge": 22, "guard": 22, "enter": 36, "roar": 36}
HIT = {"attack", "attack2"}


def job(item):
    (slug, clip), v = item
    anim = re.sub(r"_s2?$", "", clip)
    src = f"{slug}/clips/{clip}_v{v}.mp4"
    pub = f"{GEN}/../../public/sprites/battle"
    vers = [int(m.group(1)) for f in os.listdir(pub) if (m := re.fullmatch(rf"{re.escape(slug)}_{anim}_v(\d+)\.json", f))]
    ver = max(vers, default=0) + 1
    base = "duelist/k_idle_w.png" if slug == "duelist" else wide(f"{slug}/k_battle.png", 0.72) if os.path.exists(f"{GEN}/{slug}/k_battle.png") else wide(f"{slug}/k_idle.png", 0.72)
    sp = dict(slug=slug, anim=anim, base=base, body=300, ver=ver, left=1.25, right=1.45, top=0.95,
              segments=[{"clip": src, "from": 0, "to": 95, "frames": FRAMES.get(anim, 29)}])
    if anim in HIT: sp["hit"] = "auto"
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as t: json.dump(sp, t)
    r = subprocess.run([sys.executable, os.path.dirname(os.path.abspath(__file__)) + "/night_cut.py", t.name], capture_output=True, text=True)
    os.unlink(t.name)
    return (r.stdout.strip().splitlines() or [""])[-1][:120] if r.returncode == 0 else f"ОШИБКА {slug} {anim}: {r.stderr[-200:]}"


if __name__ == "__main__":
    good = {tuple(k.split("|")): v for k, v in json.load(open(sys.argv[1])).items()}
    with ThreadPoolExecutor(6) as ex:
        for l in ex.map(job, good.items()): print(l, flush=True)
