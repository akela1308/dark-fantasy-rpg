"""Перегенерации Veo для _new50: python3 tools/new50_retry.py slug clip "дополнение к промпту" -> добавляет задание <clip>_rN в _new50/queue_retry.json."""
import json, os, sys, glob
GEN = os.path.dirname(os.path.dirname(os.path.abspath(__file__))) + "/assets/generated"
q = json.load(open(GEN + "/_new50/queue.json")); rp = GEN + "/_new50/queue_retry.json"
rq = json.load(open(rp)) if os.path.exists(rp) else []
slug, clip, extra = sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else ""
base = next(j for j in q if j["name"] == f"../{slug}/clips/{clip}")
names = {j["name"] for j in rq}
n = 2
while f"../{slug}/clips/{clip}_r{n}" in names: n += 1
j = dict(base); j["name"] = f"../{slug}/clips/{clip}_r{n}"; j["prompt"] = (extra + " " + base["prompt"]).strip()
rq.append(j); json.dump(rq, open(rp, "w"), ensure_ascii=False, indent=1); print(j["name"], len(rq), "retries")
