"""Оценка клипов-переходов: насколько движение прямое (без лишних жестов) и где оно заканчивается.
python3 tools/clip_score.py clip1.mp4 clip2.mp4 ..."""
import sys, subprocess, numpy as np
def frames(p):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", p, "-vf", "scale=160:90,format=gray", "-f", "rawvideo", "-"], capture_output=True).stdout
    return np.frombuffer(raw, np.uint8).reshape(-1, 90, 160).astype(np.float32)
for p in sys.argv[1:]:
    f = frames(p); d = np.abs(np.diff(f, axis=0)).mean((1, 2)); direct = np.abs(f[-1] - f[0]).mean() + 1e-3
    to_end = np.abs(f - f[-1]).mean((1, 2))
    # первый кадр, после которого до конца почти ничего не меняется
    end = len(f) - 1
    for i in range(len(f)):
        if to_end[i:].max() < max(1.2, 0.08 * to_end[0]): end = i; break
    # начало движения
    start = int(np.argmax(np.abs(f - f[0]).mean((1, 2)) > max(0.8, 0.05 * direct)))
    print(f"{p} detour={d.sum()/direct:.2f} start={start} end={end} n={len(f)}")
