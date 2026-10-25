"""Пакетная нарезка по шаблонам. python3 tools/night_batch.py "slug clip var [ключ=значение ...]" ...
clip: idle | bidle | amb1.. | attack | hit | death | victory | power | reload | cast2
var: 1 или 2 (вариант Veo). Пример: "healer bidle 2" "kikimora attack 1 hit=14 to=70"
Шаблоны: стойки и бытовые на всю длину клипа (цикл), удары сжаты до ~1,3 с, урон ~0,7 с,
смерть ~1,2 с с задержкой на последнем кадре, победа ~1 с с задержкой.
Пишет общий лист проверки _night/qa/batch_<время>.jpg (все кадры каждой анимации на тёмно-красном)."""
import json, os, sys, subprocess, time
from PIL import Image

TOOLS = os.path.dirname(os.path.abspath(__file__))
GEN = os.path.abspath(os.path.join(TOOLS, "..", "assets", "generated"))
sys.path.insert(0, TOOLS)
import night_roster  # noqa: E402
MAPCH = {c["slug"] for c in night_roster.R if c.get("map")}

T = {
 "idle":    dict(frames=96, loop=True, left=0.6, right=0.75, target="map", base="k_idle", anim="mapidle"),
 "bidle":   dict(frames=96, loop=True, left=0.85, right=1.0, anim="idle", base="k_battle"),
 "amb":     dict(frames=72, left=0.7, right=0.9),
 "attack":  dict(frames=32, hit="auto"),
 "power":   dict(frames=40, hit="auto"),
 "cast2":   dict(frames=36, hit="auto"),
 "reload":  dict(frames=40),
 "hit":     dict(frames=16),
 "death":   dict(frames=30, left=1.5, right=1.3, hold=True),
 "victory": dict(frames=24, hold=True),
}


def spec_for(slug, clip, var, kv):
    t = dict(T["amb" if clip.startswith("amb") else clip])
    base = t.pop("base", None)
    if clip.startswith("amb"):
        base = "k_idle" if slug in MAPCH else "k_battle"
        t["target"] = "map" if slug in MAPCH else "battle"
        if slug in MAPCH: t["anim"] = "map" + clip     # карта: mapamb1.., бой: amb1..
    base = base or "k_battle"
    s = dict(slug=slug, anim=t.pop("anim", clip), base=f"{slug}/{base}.png", body=300 if t.get("target", "battle") == "battle" else 260)
    fr = t.pop("frames"); a = int(kv.pop("from", 0)); b = int(kv.pop("to", 95)); fr = int(kv.pop("frames", fr))
    s["segments"] = [dict(clip=f"{slug}/clips/{clip}_v{var}.mp4", **{"from": a, "to": b, "frames": fr})]
    if kv.pop("pingpong", None):   # туда и обратно: кадры a..b, потом обратно
        s["segments"] = [dict(clip=s["segments"][0]["clip"], **{"from": a, "to": b, "frames": fr // 2}),
                         dict(clip=s["segments"][0]["clip"], **{"from": b, "to": a, "frames": fr - fr // 2})]
    s.update(t)
    for k, v in kv.items():
        s[k] = json.loads(v) if v[:1] in "[{0123456789-tf" else v
    return s


def one(line):
    p = line.split(); slug, clip, var = p[0], p[1], p[2]
    kv = dict(x.split("=", 1) for x in p[3:])
    s = spec_for(slug, clip, var, kv)
    path = f"{GEN}/_night/specs/{slug}_{s['anim']}.json"
    json.dump(s, open(path, "w"), ensure_ascii=False)
    r = subprocess.run([sys.executable, f"{TOOLS}/night_cut.py", path], capture_output=True, text=True)
    out = (r.stdout + r.stderr).strip().splitlines()
    print(line, "->", out[-1] if out else "?", flush=True)
    q = f"{GEN}/_night/qa/{slug}_{s['anim']}_v{s.get('ver', 1)}_red.jpg"
    return q if os.path.exists(q) else None


def main(lines):
    from concurrent.futures import ThreadPoolExecutor
    with ThreadPoolExecutor(4) as ex:
        sheets = [q for q in ex.map(one, lines) if q]
    if sheets:
        ims = [Image.open(x) for x in sheets]
        for im in ims: im.thumbnail((2000, 2000))
        w = max(i.width for i in ims); h = sum(i.height + 6 for i in ims)
        o = Image.new("RGB", (w, h), "black"); y = 0
        for i in ims: o.paste(i, (0, y)); y += i.height + 6
        dst = f"{GEN}/_night/qa/batch_{time.strftime('%H%M%S')}.jpg"
        o.save(dst, quality=80); print("QA:", dst)


if __name__ == "__main__":
    main(sys.argv[1:])
