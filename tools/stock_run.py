"""Параллельный запуск заданий Veo с общим потолком расходов (запас перед концом доступа, 06.11).
python3 tools/stock_run.py queue.json [--par 12] [--cap 2000]
queue.json: [{"name", "first", "last", "prompt", "sec", "n", "aspect"}], пути от assets/generated.
Готовое пропускается, можно запускать повторно. Расход копится в _regen/spent.txt (сек × варианты × 0,40 $).
Отказ фильтра или ошибка пишется в <name>_err.txt, задание не повторяется. Стоп: файл _regen/STOP."""
import fcntl, json, os, subprocess, sys, threading, time
from concurrent.futures import ThreadPoolExecutor
GEN = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets", "generated"))
C = os.path.join(os.path.dirname(os.path.abspath(__file__)), "veo_client.py")
LOG = f"{GEN}/_regen/spent.txt"; STOP = f"{GEN}/_regen/STOP"
lock = threading.Lock()


def spent():
    try: return float(open(LOG).read() or 0)
    except (OSError, ValueError): return 0.0


def charge(usd, cap):
    with lock, open(LOG + ".lock", "w") as l:
        fcntl.flock(l, fcntl.LOCK_EX)   # счётчик общий для нескольких запусков
        s = spent()
        if s + usd > cap: return False
        t = LOG + f".{os.getpid()}"
        open(t, "w").write(f"{s + usd:.2f}"); os.replace(t, LOG)
        return True


def run(j, cap):
    name = j["name"]
    if os.path.exists(f"{name}_v1.mp4") or os.path.exists(f"{name}_err.txt") or os.path.exists(STOP): return
    os.makedirs(os.path.dirname(name), exist_ok=True)
    sec, n = j.get("sec", 4), j.get("n", 2)
    if not os.path.exists(f"{name}_op.json"):
        if not charge(sec * n * 0.4, cap): print("ПОТОЛОК", name, flush=True); return
        cmd = [sys.executable, C, "vsubmit", j["first"], j["prompt"], name, "--sec", str(sec), "--n", str(n), "--aspect", j.get("aspect", "16:9")]
        if j.get("last"): cmd += ["--last", j["last"]]
        if j.get("raw"): cmd += ["--raw"]
        r = subprocess.run(cmd, capture_output=True, text=True)
        if r.returncode: open(f"{name}_err.txt", "w").write(r.stdout + r.stderr); print("ОШИБКА", name, (r.stdout + r.stderr)[-200:], flush=True); return
    for _ in range(90):
        time.sleep(15)
        r = subprocess.run([sys.executable, C, "vpoll", name], capture_output=True, text=True)
        if r.returncode: open(f"{name}_err.txt", "w").write(r.stdout + r.stderr); print("ОШИБКА", name, (r.stdout + r.stderr)[-200:], flush=True); return
        if os.path.exists(f"{name}_v1.mp4"): print("ok", name, f"{spent():.0f}$", flush=True); return
    print("ДОЛГО", name, flush=True)


if __name__ == "__main__":
    a = sys.argv[1:]
    par = int(a[a.index("--par") + 1]) if "--par" in a else 12
    cap = float(a[a.index("--cap") + 1]) if "--cap" in a else 2000
    jobs = json.load(open(a[0])); os.chdir(GEN)
    with ThreadPoolExecutor(par) as ex: list(ex.map(lambda j: run(j, cap), jobs))
    left = [j["name"] for j in jobs if not os.path.exists(j["name"] + "_v1.mp4")]
    print("готово", len(jobs) - len(left), "из", len(jobs), "осталось", left[:20], f"потрачено {spent():.0f}$", flush=True)
