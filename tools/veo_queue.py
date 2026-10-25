"""Очередь Veo: python3 tools/veo_queue.py queue.json [секунд_работы]
queue.json: [{"name":..,"first":..,"last":..,"prompt":..,"sec":4,"n":2}, ...] (пути от папки queue.json)
Держит не больше 4 активных операций, сам отправляет, опрашивает и скачивает. Можно запускать повторно."""
import json, os, sys, time, subprocess
q = sys.argv[1]; budget = float(sys.argv[2]) if len(sys.argv) > 2 else 165
os.chdir(os.path.dirname(os.path.abspath(q))); jobs = json.load(open(os.path.basename(q)))
C = os.path.join(os.path.dirname(os.path.abspath(__file__)), "veo_client.py")
HANDS = os.environ.get("HANDS", "")
t0 = time.time()
def done(j): return os.path.exists(j["name"] + "_v1.mp4")
def active(j): return os.path.exists(j["name"] + "_op.json") and not done(j)
while time.time() - t0 < budget:
    for j in jobs:
        if active(j):
            subprocess.run(["python3", C, "vpoll", j["name"]], capture_output=True)
    act = [j for j in jobs if active(j)]
    for j in jobs:
        if len(act) >= 4: break
        if not done(j) and not active(j):
            cmd = ["python3", C, "vsubmit", j["first"], j["prompt"] + " " + HANDS, j["name"], "--sec", str(j.get("sec", 4)), "--n", str(j.get("n", 2))]
            if j.get("last"): cmd += ["--last", j["last"]]
            r = subprocess.run(cmd, capture_output=True, text=True); print(r.stdout.strip() or r.stderr[-300:]); act.append(j)
    left = [j["name"] for j in jobs if not done(j)]
    if not left: break
    time.sleep(20)
print("готово:", [j["name"] for j in jobs if done(j)]); print("осталось:", [j["name"] for j in jobs if not done(j)])
