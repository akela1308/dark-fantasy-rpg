"""Нарезка клипов _new50: выбор варианта по clip_score (меньше detour) и night_batch.
python3 tools/new50_cut.py slug[:clip[=var][+drop=[..]]] ...   (без clip: все готовые клипы персонажа, ещё не нарезанные)
Версия листа: следующая свободная (статичный бой = idle_v1, поэтому стойка боя от v2)."""
import json, os, re, subprocess, sys, glob
GAME = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GEN = GAME + "/assets/generated"
PY = "/private/tmp/claude-501/-Users-maksimilin-Desktop-Dark-Fantasy-dark-fantasy-rpg/08e99c92-16e2-400d-afe8-537c481027df/scratchpad/nbenv/bin/python"
R = {c["slug"]: c for c in json.load(open(GEN + "/_new50/roster.json"))}
ANIM = {"bidle": ("battle", "idle"), "attack": ("battle", "attack"), "hit": ("battle", "hit"), "death": ("battle", "death"),
        "victory": ("battle", "victory"), "idle": ("map", "mapidle"), "amb1": ("map", "mapamb1")}


def next_ver(slug, clip):
    tgt, anim = ANIM[clip.split("_r")[0]]
    d = f"{GAME}/public/sprites/battle" if tgt == "battle" else f"{GAME}/public/maps/characters/anim"
    vs = [int(m.group(1)) for f in glob.glob(f"{d}/{slug}_{anim}_v*.json") if (m := re.search(r"_v(\d+)\.json$", f))]
    return max(vs + [0]) + 1


def done(slug, clip):
    return os.path.exists(f"{GEN}/_new50/cut/{slug}_{clip}")


def pick(slug, clip):
    vs = [v for v in (1, 2) if os.path.exists(f"{GEN}/{slug}/clips/{clip}_v{v}.mp4")]
    if len(vs) < 2: return vs[0] if vs else None
    out = subprocess.run(["python3", GAME + "/tools/clip_score.py"] + [f"{GEN}/{slug}/clips/{clip}_v{v}.mp4" for v in vs], capture_output=True, text=True).stdout
    sc = [float(re.search(r"detour=([\d.]+)", l).group(1)) for l in out.splitlines()]
    return vs[sc.index(min(sc))]


lines = []
for a in sys.argv[1:]:
    slug, _, rest = a.partition(":")
    reqs = []
    if rest:
        clip, *extra = rest.split("+")
        clip, _, var = clip.partition("=")
        reqs.append((clip, int(var) if var else None, extra))
    else:
        reqs = [(c, None, []) for c in R[slug]["veo"] if not done(slug, c)]
    for clip, var, extra in reqs:
        var = var or pick(slug, clip)
        if not var: continue
        rec = f"{GEN}/_new50/cut/{slug}_{clip}"
        if os.path.exists(rec):   # повторная нарезка своего же свежего листа: та же версия, старые файлы убрать
            ver = int(re.search(r"ver=(\d+)", open(rec).read()).group(1)); tgt, anim = ANIM[clip.split("_r")[0]]
            d = f"{GAME}/public/sprites/battle" if tgt == "battle" else f"{GAME}/public/maps/characters/anim"
            for ext in ("webp", "json", "png"):
                if os.path.exists(f"{d}/{slug}_{anim}_v{ver}.{ext}"): os.remove(f"{d}/{slug}_{anim}_v{ver}.{ext}")
            import shutil; shutil.rmtree(f"{GEN}/{slug}/final/{anim}_v{ver}", ignore_errors=True)
        else:
            ver = next_ver(slug, clip)
        if not any(e.startswith("keepall=") for e in extra): extra = extra + ["keepall=true"]   # отдельные куски (оружие на земле, кадило) не выбрасывать
        if R[slug]["style"] == "beast" and not any(e.startswith("left=") for e in extra):
            extra = extra + ["left=1.6", "right=1.6"]   # зверь в профиль шире роста: рамку шире, иначе хвост и морду режет
        lines.append(f"{slug} {clip} {var} ver={ver} " + " ".join(extra))
        os.makedirs(GEN + "/_new50/cut", exist_ok=True)
        open(f"{GEN}/_new50/cut/{slug}_{clip}", "w").write(f"var={var} ver={ver} {' '.join(extra)}\n")
print("\n".join(lines))
if lines:
    subprocess.run([PY, GAME + "/tools/night_batch.py"] + [l.strip() for l in lines], cwd=GEN)
