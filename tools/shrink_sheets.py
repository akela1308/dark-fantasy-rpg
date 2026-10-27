#!/usr/bin/env python3
"""Уменьшенные копии листов анимаций (этап 8, видеопамять).

python3 tools/shrink_sheets.py battle [--k 0.6]   листы боя из src/data/animations.json
python3 tools/shrink_sheets.py map [--k 0.5]      листы NPC на карте из src/data/map_animations.json

Каждый кадр уменьшается отдельно (размер кадра целый, сетка не плывёт), лист пишется рядом с новым именем
<имя>_s<проценты>.webp, старый файл не трогается. В JSON меняются file, key, frameWidth, frameHeight, bodyHeight:
игра масштабирует фигуру по bodyHeight, поэтому рост на экране прежний. Кадры остаются крупнее показа
(в бою тело ~150 px на экране при bodyHeight ~180 после 0.6).
Повторный запуск пропускает уже уменьшенные записи. tools/night_manifest.py пересобирает JSON из исходных
листов: после него этот скрипт нужно запустить снова.
"""
import json, os, sys
from concurrent.futures import ProcessPoolExecutor
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUB = os.path.join(ROOT, "public")


def shrink(job):
    a, k, tag = job
    src = os.path.join(PUB, a["file"])
    base, ext = os.path.splitext(a["file"])
    rel = f"{base}_{tag}.webp"
    dst = os.path.join(PUB, rel)
    fw, fh, n = a["frameWidth"], a["frameHeight"], a["frames"]
    nw, nh = max(1, round(fw * k)), max(1, round(fh * k))
    if not os.path.exists(dst):
        im = Image.open(src).convert("RGBA")
        cols = im.width // fw
        ncols = max(1, min(cols, 4096 // nw))
        rows = -(-n // ncols)
        out = Image.new("RGBA", (ncols * nw, rows * nh), (0, 0, 0, 0))
        for i in range(n):
            fr = im.crop(((i % cols) * fw, (i // cols) * fh, (i % cols + 1) * fw, (i // cols + 1) * fh))
            out.paste(fr.resize((nw, nh), Image.LANCZOS), ((i % ncols) * nw, (i // ncols) * nh))
        out.save(dst, "WEBP", quality=88, method=4)
    return a["key"], rel, nw, nh


def run(kind, k):
    path = os.path.join(ROOT, "src/data/animations.json" if kind == "battle" else "src/data/map_animations.json")
    data = json.load(open(path, encoding="utf-8"))
    tag = f"s{round(k * 100)}"
    entries = []
    if kind == "battle":
        for cfg in data.values():
            entries += list(cfg.get("anims", {}).values())
    else:
        for cfg in data.values():
            entries += [a for a in [cfg.get("idle"), *(cfg.get("ambient") or [])] if a]
    todo = [a for a in entries if not a["key"].endswith(f"_{tag}") and os.path.exists(os.path.join(PUB, a["file"]))]
    print(kind, "листов:", len(todo))
    with ProcessPoolExecutor() as ex:
        res = list(ex.map(shrink, [(a, k, tag) for a in todo]))
    by_key = {r[0]: r[1:] for r in res}
    for a in todo:
        rel, nw, nh = by_key[a["key"]]
        s = nw / a["frameWidth"]
        a["file"], a["key"] = rel, f"{a['key']}_{tag}"
        a["frameWidth"], a["frameHeight"] = nw, nh
        if a.get("bodyHeight"):
            a["bodyHeight"] = round(a["bodyHeight"] * s, 1)
        if isinstance(a.get("muzzle"), dict):   # точка вспышки выстрела в px кадра
            a["muzzle"] = {kk: round(v * s, 1) if kk in ("x", "y") else v for kk, v in a["muzzle"].items()}
    open(path, "w", encoding="utf-8").write(json.dumps(data, ensure_ascii=False, indent=1))
    print("готово", path)


if __name__ == "__main__":
    a = sys.argv[1:]
    k = float(a[a.index("--k") + 1]) if "--k" in a else (0.6 if a[0] == "battle" else 0.5)
    run(a[0], k)
