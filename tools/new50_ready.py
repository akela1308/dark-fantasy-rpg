"""Список персонажей _new50, у которых готовы все клипы набора (battle или map), но они ещё не нарезаны.
python3 tools/new50_ready.py [battle|map]"""
import json, os, sys
GEN = os.path.dirname(os.path.dirname(os.path.abspath(__file__))) + "/assets/generated"
part = sys.argv[1] if len(sys.argv) > 1 else "battle"
want = {"battle": ["bidle", "attack", "hit", "death", "victory"], "map": ["idle", "amb1"]}[part]
for c in json.load(open(GEN + "/_new50/roster.json")):
    cl = [v for v in c["veo"] if v in want]
    if cl and all(os.path.exists(f"{GEN}/{c['slug']}/clips/{v}_v1.mp4") for v in cl) and not any(os.path.exists(f"{GEN}/_new50/cut/{c['slug']}_{v}") for v in cl):
        print(c["slug"])
