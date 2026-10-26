"""Базовые позы для всех из _night/base_jobs.json, 4 потока, пропускает готовые.
python3 tools/night_base.py [slug ...]"""
import json, os, sys, subprocess
from concurrent.futures import ThreadPoolExecutor
BASE = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets", "generated"))
C = os.path.join(os.path.dirname(os.path.abspath(__file__)), "veo_client.py")
jobs = json.load(open(BASE + "/_night/base_jobs.json"))
only = set(sys.argv[1:])
def run(j):
    out = os.path.join(BASE, j["out"])
    if os.path.exists(out) or (only and j["slug"] not in only): return
    os.makedirs(os.path.dirname(out), exist_ok=True)
    cmd = [sys.executable, C, "image", j["prompt"], out, j["ref"]] + (["--aspect", j["aspect"]] if j.get("aspect") else [])
    r = subprocess.run(cmd, capture_output=True, text=True)
    print(j["out"], (r.stdout + r.stderr).strip()[-200:], flush=True)
with ThreadPoolExecutor(3) as ex: list(ex.map(run, jobs))
