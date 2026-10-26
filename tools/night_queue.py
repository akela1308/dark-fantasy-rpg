"""Ночная очередь Veo для многих персонажей сразу.
python3 tools/night_queue.py assets/generated/_night/jobs.json [часов_работы]

jobs.json: [{"name": "brawler/clips/idle", "first": "brawler/k_idle.png", "last": "brawler/k_idle.png",
             "prompt": "...", "sec": 4, "n": 2}, ...]  (пути от assets/generated)
Файл перечитывается каждый круг: задания можно дописывать, пока очередь работает.
- не больше 4 активных запросов;
- общий лимит запросов LIMIT (считается по файлу _night/count.txt, включая прошлые запуски);
- ошибка Veo пишется в <name>_err.txt, задание больше не повторяется;
- каждая отправка и результат записываются в ЖУРНАЛ.md.
Остановить: создать файл _night/STOP."""
import json, os, sys, time, subprocess, datetime

LIMIT = 410   # ~1350 $ по поправке 16 вместе с картинками (Veo 4 с × 2 вар. ≈ 3,2 $)
BASE = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets", "generated"))
C = os.path.join(os.path.dirname(os.path.abspath(__file__)), "veo_client.py")
PY = sys.executable
jobs_path = os.path.abspath(sys.argv[1])
hours = float(sys.argv[2]) if len(sys.argv) > 2 else 8
os.chdir(BASE)
NIGHT = os.path.join(BASE, "_night")
COUNT = os.path.join(NIGHT, "count.txt")
JOURNAL = os.path.join(BASE, "ЖУРНАЛ.md")


def log(msg):
    t = datetime.datetime.now().strftime("%H:%M")
    with open(JOURNAL, "a") as f:
        f.write(f"- {t} {msg}\n")


def count():
    return int(open(COUNT).read().strip()) if os.path.exists(COUNT) else 0


def done(j): return os.path.exists(j["name"] + "_v1.mp4")
def failed(j): return os.path.exists(j["name"] + "_err.txt")
def active(j): return os.path.exists(j["name"] + "_op.json") and not done(j) and not failed(j)


t0 = time.time()
idle_since = None
while time.time() - t0 < hours * 3600 and not os.path.exists(os.path.join(NIGHT, "STOP")):
    try:
        jobs = json.load(open(jobs_path))
    except ValueError:
        time.sleep(2); continue
    for j in jobs:
        if active(j):
            r = subprocess.run([PY, C, "vpoll", j["name"]], capture_output=True, text=True)
            if r.returncode != 0 and "ошибка" in (r.stdout + r.stderr):
                open(j["name"] + "_err.txt", "w").write((r.stdout + r.stderr)[-1500:])
                log(f"ОШИБКА Veo `{j['name']}`: {(r.stdout + r.stderr).strip()[-200:]}")
            elif done(j):
                log(f"готово `{j['name']}` ({j.get('n', 2)} вар.)")
    act = [j for j in jobs if active(j)]
    for j in jobs:
        if len(act) >= 4: break
        if done(j) or failed(j) or active(j): continue
        if count() >= LIMIT:
            break
        os.makedirs(os.path.dirname(j["name"]) or ".", exist_ok=True)
        cmd = [PY, C, "vsubmit", j["first"], j["prompt"], j["name"], "--sec", str(j.get("sec", 4)), "--n", str(j.get("n", 2))]
        if j.get("last"): cmd += ["--last", j["last"]]
        r = subprocess.run(cmd, capture_output=True, text=True)
        n_req = count() + 1
        open(COUNT, "w").write(str(n_req))
        if "submitted" in r.stdout:
            log(f"Veo #{count()} `{j['name']}` {j.get('sec', 4)} с × {j.get('n', 2)}")
            act.append(j)
        else:
            open(j["name"] + "_err.txt", "w").write((r.stdout + r.stderr)[-1500:])
            log(f"ОШИБКА отправки `{j['name']}`: {(r.stdout + r.stderr).strip()[-200:]}")
    pending = [j for j in jobs if not done(j) and not failed(j)]
    if not pending or count() >= LIMIT and not act:
        idle_since = idle_since or time.time()
        if time.time() - idle_since > 3600: break
    else:
        idle_since = None
    time.sleep(15)
print("всего запросов:", count())
