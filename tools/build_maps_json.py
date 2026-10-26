"""Сборка данных карт из сгенерированного: картинка _pick, зоны ходьбы, спавны, пропсы-перекрыватели.

python3 tools/build_maps_json.py            собрать public/maps/gen/maps_build.json (src/data/maps.json не трогается)
python3 tools/build_maps_json.py --apply    применить к src/data/maps.json ТОЛЬКО поля image, walk, spawnPoints, props
                                            (только когда в REVISION_PROGRESS.md есть готовый Блок Г; иначе отказ)
  --only a,b   ограничить список карт
  --force      применить без проверки Блока Г (не использовать ночью)

Источники:
  public/maps/gen/<id>_pick.png              картинка (выбор Максима или лучший по баллу)
  public/maps/gen/zones/<id>.zones.json      зоны (prefill_zones.py или выгрузка редактора MapEditor, клавиша P)
  public/maps/gen/props_build.json           перекрыватели (tools/cut_props.py), для старых и новых карт
Правила слияния:
  image: ставится, если у карты нет своей картинки или стоит заглушка _placeholder.png;
  walk: ставится для новых карт (у старых зоны живут в WalkableZones.js и не трогаются);
  spawnPoints: добавляются недостающие и обновляются только сгенерированные (не трогаются чужие, кроме заглушек
               у новых карт, если их точка вне зон ходьбы);
  props: записи с occluder: true заменяются целиком, остальные (мебель Контента) сохраняются.
"""
import json, os, re, sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SPEC = os.path.expanduser("~/Documents/Claude/Projects/Mortis/РЕВИЗИЯ_2026-10/world/maps_spec.json")
MAPS_JSON = os.path.join(ROOT, "src/data/maps.json")
GEN = os.path.join(ROOT, "public/maps/gen")
OUT = os.path.join(GEN, "maps_build.json")
PROGRESS = os.path.join(ROOT, "REVISION_PROGRESS.md")


def inside(walk, p):
    return any(z["x"] <= p["x"] <= z["x"] + z["w"] and z["y"] <= p["y"] <= z["y"] + z["h"] for z in walk)


def build(only=None):
    spec = json.load(open(SPEC))
    props = json.load(open(os.path.join(GEN, "props_build.json"))) if os.path.exists(os.path.join(GEN, "props_build.json")) else {}
    res = {}
    for loc in spec["locations"]:
        lid = loc["id"]
        if only and lid not in only:
            continue
        e = {}
        png = os.path.join(GEN, f"{lid}_pick.png"); jpg = os.path.join(GEN, f"{lid}_pick.jpg")
        if os.path.exists(png):
            # игре JPG (PNG 2-3 МБ, а LoadingScene грузит все карты сразу); пересобирается, если PNG новее
            if not os.path.exists(jpg) or os.path.getmtime(jpg) < os.path.getmtime(png):
                Image.open(png).convert("RGB").save(jpg, quality=88, optimize=True)
            e["image"] = f"maps/gen/{lid}_pick.jpg"
        zp = os.path.join(GEN, "zones", f"{lid}.zones.json")
        if os.path.exists(zp) and loc["status"] == "new":
            z = json.load(open(zp))
            e["walk"] = z["walk"]
            e["spawnPoints"] = z["spawnPoints"]
            e["_zonesAuto"] = bool(z.get("auto"))
        if lid in props:
            e["props"] = props[lid]
        if e:
            res[lid] = e
    # старые карты не из спецификации (например, swamp_map), если для них есть пропсы
    for lid, pr in props.items():
        if lid not in res and (not only or lid in only):
            res[lid] = {"props": pr}
    return res


def block_g_ready():
    if not os.path.exists(PROGRESS):
        return False
    for line in open(PROGRESS, encoding="utf-8"):
        if re.search(r"[Бб]лок\s*Г", line) and "ГОТОВО" in line:
            return True
    return False


def apply(build_data, force=False):
    if not force and not block_g_ready():
        raise SystemExit("Блок Г ещё не готов (нет строки в REVISION_PROGRESS.md): maps.json не трогаю.")
    maps = json.load(open(MAPS_JSON))
    changed = []
    for lid, b in build_data.items():
        if lid not in maps:
            continue
        m = maps[lid]
        if "image" in b and (not m.get("image") or "_placeholder" in str(m.get("image"))):
            m["image"] = b["image"]; changed.append(f"{lid}.image")
        if "walk" in b:
            m["walk"] = b["walk"]; changed.append(f"{lid}.walk")
        if "spawnPoints" in b:
            sp = m.setdefault("spawnPoints", {})
            walk = m.get("walk") or []
            for k, v in b["spawnPoints"].items():
                if k not in sp or (walk and not inside(walk, sp[k])):
                    sp[k] = v; changed.append(f"{lid}.spawnPoints.{k}")
        if "props" in b:
            keep = [p for p in m.get("props", []) if not p.get("occluder")]
            m["props"] = keep + b["props"]; changed.append(f"{lid}.props")
    json.dump(maps, open(MAPS_JSON, "w"), ensure_ascii=False, indent=2)
    open(MAPS_JSON, "a").write("\n")
    return changed


def main():
    a = sys.argv[1:]
    only = set(a[a.index("--only") + 1].split(",")) if "--only" in a else None
    data = build(only)
    json.dump(data, open(OUT, "w"), ensure_ascii=False, indent=1)
    print("собрано:", len(data), "карт ->", OUT)
    if "--apply" in a:
        ch = apply(data, "--force" in a)
        print("применено:", len(ch)); print("\n".join(ch))


if __name__ == "__main__":
    main()
