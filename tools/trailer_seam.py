"""Сгладить стык внутри клипа, продлённого Veo: рывок на один кадр и скачок резкости. Звук Veo выбрасывается.
python3 tools/trailer_seam.py in.mp4 out.mp4 --at 8.0 [--at 15.0] [--win 2.0]"""
import os, shutil, subprocess, sys, tempfile
import numpy as np
from PIL import Image
sys.argv, ARGS = sys.argv[:1] + sys.argv[1:3], sys.argv[3:]
from trailer_soft import sharp, soften

def run(*a): subprocess.run(a, check=True, stderr=subprocess.DEVNULL, stdout=subprocess.DEVNULL)

def main():
    src, out = sys.argv[1:3]
    ats = [float(ARGS[i + 1]) for i, x in enumerate(ARGS) if x == "--at"]
    win = float(ARGS[ARGS.index("--win") + 1]) if "--win" in ARGS else 2.0
    t = tempfile.mkdtemp()
    try:
        run("ffmpeg", "-y", "-i", src, f"{t}/%05d.png")
        fs = sorted(os.listdir(t))
        path = lambda i: f"{t}/{fs[i]}"
        for at in ats:
            k = round(at * 24)   # первый кадр нового куска
            target = np.mean([sharp(Image.open(path(i))) for i in range(k - 8, k)])
            for i in range(k, min(k + round(win * 24), len(fs))):
                soften(Image.open(path(i)).convert("RGB"), target).save(path(i))
            # рывок на один кадр: мягкое усреднение по времени в пределах ±3 кадров, сила спадает от стыка
            frames = {i: np.asarray(Image.open(path(i)).convert("RGB"), float) for i in range(k - 5, k + 5)}
            w = np.array([1, 2, 3, 2, 1], float); w /= w.sum()
            for i in range(k - 3, k + 3):
                avg = sum(w[j] * frames[i + j - 2] for j in range(5))
                a = 1 - abs(i - k + 0.5) / 4
                Image.fromarray(np.uint8((a * avg + (1 - a) * frames[i]).round())).save(path(i))
        run("ffmpeg", "-y", "-framerate", "24", "-i", f"{t}/%05d.png", "-c:v", "libx264", "-crf", "14", "-preset", "slow", "-pix_fmt", "yuv420p", out)
        print("ok", out)
    finally:
        shutil.rmtree(t)

main()
