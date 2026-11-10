"""Незаметный стык двух клипов цепочки Veo: новый клип начинается заметно резче (Veo заново отрисовывает стартовый кадр).
python3 tools/trailer_join.py a.mp4 b.mp4 out.mp4 [--fade 0.25] [--frames 36]
Первые кадры b смягчаются до резкости конца a, затем короткий наплыв изображения и звука."""
import os, shutil, subprocess, sys, tempfile
import numpy as np
from PIL import Image
from trailer_soft import sharp, soften

def run(*a): subprocess.run(a, check=True, stderr=subprocess.DEVNULL, stdout=subprocess.DEVNULL)
def opt(n, d):
    return float(sys.argv[sys.argv.index(n) + 1]) if n in sys.argv else d

def main():
    a, b, out = sys.argv[1:4]
    fade, n = opt("--fade", 0.25), int(opt("--frames", 36))
    t = tempfile.mkdtemp()
    try:
        run("ffmpeg", "-y", "-sseof", "-0.3", "-i", a, f"{t}/a%03d.png")
        tail = sorted(f for f in os.listdir(t) if f.startswith("a"))[-5:]
        target = np.mean([sharp(Image.open(f"{t}/{f}")) for f in tail])
        run("ffmpeg", "-y", "-i", b, f"{t}/b%05d.png")
        fs = sorted(f for f in os.listdir(t) if f.startswith("b"))
        for i, f in enumerate(fs[:n]):
            soften(Image.open(f"{t}/{f}").convert("RGB"), target).save(f"{t}/{f}")
        dur = float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", a]))
        run("ffmpeg", "-y", "-i", a, "-framerate", "24", "-i", f"{t}/b%05d.png", "-i", b,
            "-filter_complex", f"[0:v]format=yuv420p,settb=1/24,fps=24[x];[1:v]format=yuv420p,settb=1/24,fps=24[y];[x][y]xfade=transition=fade:duration={fade}:offset={dur - fade:.3f}[v];[0:a][2:a]acrossfade=d={fade}[au]",
            "-map", "[v]", "-map", "[au]", "-c:v", "libx264", "-crf", "14", "-preset", "slow", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "256k", out)
        print("ok", out, "резкость конца a", round(target))
    finally:
        shutil.rmtree(t)

main()
