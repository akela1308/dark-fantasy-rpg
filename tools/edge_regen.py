"""Перегенерация клипов Veo, где фигура или оружие обрезаны краем видео (Д13).
Причина обрезки: в базовом кадре фигура занимает почти всю высоту, поднятому оружию некуда уйти.
Здесь базовый кадр уменьшается на зелёном поле (копия k_*_w.png, исходник не меняется), промпт берётся из _op.json клипа.

python3 tools/edge_regen.py queue list.json out_queue.json [--k 0.72]
list.json: [{"slug", "anim"}]. Берутся все клипы из спеки _night/specs/<slug>_<anim>.json, задание <клип>_w."""
import json, os, re, sys
from PIL import Image
GEN = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets", "generated"))
ROOM = (" The camera is further back: the whole figure, with raised arms and weapons, stays fully inside the frame "
        "at all times, with empty green space above the head.")


def norm(p, stem):
    """Путь из _op.json: он бывает от assets/generated, от папки очереди или от папки клипа."""
    d = os.path.dirname(stem)
    for c in (os.path.join(d, p), os.path.join(d, "x", p), p, p[3:] if p.startswith("../") else p):
        c = os.path.normpath(c)
        if os.path.exists(f"{GEN}/{c}"): return c
    raise SystemExit(f"нет кадра {p} для {stem}")


def wide(rel, k):
    """Копия базового кадра: фигура меньше в k раз, ноги у прежней нижней кромки, по центру."""
    root, ext = os.path.splitext(rel); out = f"{root}_w{ext}"
    if os.path.exists(f"{GEN}/{out}"): return out
    im = Image.open(f"{GEN}/{rel}").convert("RGB"); w, h = im.size
    bg = im.resize((1, 1), box=(0, 0, 8, 8)).getpixel((0, 0))
    sm = im.resize((int(w * k), int(h * k)), Image.LANCZOS)
    c = Image.new("RGB", (w, h), bg); c.paste(sm, ((w - sm.width) // 2, h - sm.height))
    c.save(f"{GEN}/{out}")
    return out


def queue(items, k):
    jobs, seen = [], set()
    for it in items:
        spec = json.load(open(f"{GEN}/_night/specs/{it['slug']}_{it['anim']}.json"))
        for seg in spec["segments"]:
            stem = re.sub(r"_v\d+\.mp4$", "", seg["clip"])
            if stem in seen: continue
            seen.add(stem)
            op = json.load(open(f"{GEN}/{stem}_op.json"))
            j = dict(name=f"{stem}_w", first=wide(norm(op["img"], stem), k), prompt=op["prompt"] + ROOM, sec=op.get("sec", 4), n=2)
            if op.get("last"): j["last"] = wide(norm(op["last"], stem), k)
            jobs.append(j)
    return jobs


if __name__ == "__main__":
    a = sys.argv[1:]
    k = float(a[a.index("--k") + 1]) if "--k" in a else 0.72
    if a[0] == "queue":
        js = queue(json.load(open(a[1])), k)
        json.dump(js, open(a[2], "w"), ensure_ascii=False, indent=1); print(len(js), "заданий")


def touches(clip):
    """Сколько из 12 проверочных кадров видео задевает край. Меньше = вариант лучше."""
    import cv2, numpy as np, night_cut as NC
    cap = cv2.VideoCapture(clip); n = int(cap.get(7)); bad = 0
    for i in np.linspace(0, n - 1, 12).astype(int):
        cap.set(1, int(i)); ok, f = cap.read()
        if not ok: continue
        m = np.asarray(NC.key(Image.fromarray(cv2.resize(f, (1280, 720))[..., ::-1])))[..., 3] > 60
        ys, xs = np.nonzero(m)
        if len(ys) and (ys.min() <= 6 or xs.min() <= 6 or xs.max() >= 1273): bad += 1
    cap.release()
    return bad


def recut(it):
    """Новая версия листа из клипа _w: лучший вариант по краю, базовый кадр _w (рост фигуры пересчитывается сам)."""
    import glob, subprocess, tempfile
    slug, anim = it["slug"], it["anim"]
    spec = json.load(open(f"{GEN}/_night/specs/{slug}_{anim}.json"))
    root, ext = os.path.splitext(spec["base"]); w = f"{root}_w{ext}"
    if not os.path.exists(f"{GEN}/{w}"): wide(spec["base"], 0.72)
    spec["base"] = w; score = 0
    for seg in spec["segments"]:
        stem = re.sub(r"_v\d+\.mp4$", "", seg["clip"])
        vs = {v: touches(f"{GEN}/{stem}_w_v{v}.mp4") for v in (1, 2) if os.path.exists(f"{GEN}/{stem}_w_v{v}.mp4")}
        if not vs: return f"{slug}_{anim}: нет клипа"
        v = min(vs, key=vs.get); seg["clip"] = f"{stem}_w_v{v}.mp4"; score += vs[v]
    vers = [int(m.group(1)) for f in glob.glob(f"{GEN}/../../public/sprites/battle/{slug}_{anim}_v*.json") if (m := re.search(r"_v(\d+)\.json$", f))]
    spec.update(ver=max(vers, default=0) + 1, top=max(spec.get("top", 0.22), 0.95), left=max(spec.get("left", 0.85), 1.25), right=max(spec.get("right", 1.0), 1.45))
    spec.pop("overwrite", None)
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as t: json.dump(spec, t)
    r = subprocess.run([sys.executable, os.path.dirname(os.path.abspath(__file__)) + "/night_cut.py", t.name], capture_output=True, text=True)
    os.unlink(t.name)
    json.dump(spec, open(f"{GEN}/_night/specs/{slug}_{anim}_w.json", "w"), ensure_ascii=False)
    return (f"край {score}: " + (r.stdout.strip().splitlines() or [""])[-1]) if r.returncode == 0 else f"{slug}_{anim}: ОШИБКА {r.stderr[-300:]}"


if __name__ == "__main__" and sys.argv[1] == "cut":
    from concurrent.futures import ProcessPoolExecutor
    with ProcessPoolExecutor(6) as ex:
        for line in ex.map(recut, json.load(open(sys.argv[2]))): print(line, flush=True)
