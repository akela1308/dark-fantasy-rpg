"""Сборка анимации из кусков Veo-клипов: вырезка зелёного фона, общая рамка персонажа, ускорение,
лист WebP для игры и листы проверки.

python3 tools/night_cut.py spec.json
spec: {"slug": "brawler", "anim": "attack", "base": "brawler/k_battle.png",
       "segments": [{"clip": "brawler/clips/attack_v1.mp4", "from": 0, "to": 95, "frames": 26}],
       "loop": false, "warm": false, "drop": [], "target": "battle"|"map", "body": 300, "ver": 1}
Пути от assets/generated. from/to: номера кадров клипа (24 к/с), frames: сколько кадров взять (равномерно).
Рамка (общая для всех анимаций персонажа) считается по базовой позе, поэтому ноги во всех анимациях
стоят в одной точке, а масштаб одинаковый.
Выход:
  assets/generated/<slug>/final/<anim>_v<ver>/NNN.png   кадры
  public/sprites/battle/<slug>_<anim>_v<ver>.webp + .json (target=battle)
  public/maps/characters/anim/<slug>_<anim>_v<ver>.webp + .json (target=map)
  assets/generated/_night/qa/<slug>_<anim>_v<ver>_light.jpg / _red.jpg  (все кадры крупно)
В .json: frameWidth, frameHeight, frames, fps, cols, originX, originY, bodyHeight."""
import json, os, sys, subprocess, tempfile, glob, math
import numpy as np
from PIL import Image, ImageDraw
import cv2

GEN = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets", "generated"))
PUB = os.path.abspath(os.path.join(GEN, "..", "..", "public"))
MAX_W = 4096
TMPS = []   # временные папки кадров, удаляются в конце


def key(im):
    """Зелёный фон -> прозрачность (та же логика, что в sprite_cut.py) без удаления вспышек."""
    f = np.asarray(im.convert("RGB")).astype(np.float32)
    r, g, b = f[..., 0], f[..., 1], f[..., 2]
    mx = np.maximum(r, b)
    greenish = (g - mx > 20) & (g > 1.35 * mx + 5)
    n, lab, stats, _ = cv2.connectedComponentsWithStats(greenish.astype(np.uint8), connectivity=4)
    bgmask = np.zeros_like(greenish)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]])).tolist())
    bright = (g > 150) & (g - mx > 90)
    for i in range(1, n):
        comp = lab == i
        if i in border or (stats[i, cv2.CC_STAT_AREA] > 60 and bright[comp].mean() > 0.6):
            bgmask |= comp
    dark = (r + g + b) < 20
    bgmask[:, dark.mean(0) > 0.98] = True
    bgmask[dark.mean(1) > 0.98, :] = True        # чёрные полосы сверху/снизу
    bgmask[:3, :] = True; bgmask[-3:, :] = True    # тонкая рамка по краю видео
    bgmask[:, :3] = True; bgmask[:, -3:] = True
    alpha = (~bgmask).astype(np.float32)
    edge = cv2.dilate(bgmask.astype(np.uint8), np.ones((3, 3), np.uint8)).astype(bool) & ~bgmask
    soft = np.clip(1 - ((g - mx) - 20) / 80, 0, 1)
    alpha[edge] = np.minimum(alpha[edge], np.maximum(soft[edge], 0.35))
    # вспышки выстрела (жёлто-белые) убираем: их рисует игра
    flash = (r > 190) & (g > 160) & (b < 0.8 * g) & ((r + g + b) > 520)
    alpha[flash] = 0
    solid = (alpha > 0.5).astype(np.uint8)
    n2, lab2, st2, _ = cv2.connectedComponentsWithStats(solid, connectivity=8)
    if n2 > 1:
        keep = 1 + int(np.argmax(st2[1:, cv2.CC_STAT_AREA]))
        main = cv2.dilate((lab2 == keep).astype(np.uint8), np.ones((9, 9), np.uint8)).astype(bool)
        alpha[~main] = 0
    g2 = np.minimum(g, mx + 6)
    return np.dstack([r, g2, b, alpha * 255]).clip(0, 255).astype(np.uint8)


def clean(a, warm):
    """Сиреневый/розовый отлив на металле и тёплых палитрах."""
    a = a.astype(np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    m = a[..., 3] > 0
    pink = (r - g > 25) & (b - g > 5) & m
    lum = 0.3 * r + 0.59 * g + 0.11 * b
    for ch in range(3):
        a[..., ch][pink] = lum[pink]
    if warm:
        a[..., 2] = np.where(m, np.minimum(a[..., 2], a[..., 1] + 2), a[..., 2])
    return a.clip(0, 255).astype(np.uint8)


def base_box(base_png, left=0.85, right=1.0, top=0.22):
    """Рамка персонажа в координатах видео 1280x720 по базовой позе."""
    im = Image.open(base_png).convert("RGB").resize((1280, 720), Image.LANCZOS)
    a = key(im)[..., 3] > 128
    ys, xs = np.nonzero(a)
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    bh, bw = y1 - y0, x1 - x0
    feet = np.nonzero(a[y1 - max(4, bh // 40):y1 + 1].any(0))[0]
    fx = (feet.min() + feet.max()) / 2
    # запас: справа больше (удары вперёд), слева на падение, сверху на поднятое оружие
    bx0 = max(0, int(fx - left * bh)); bx1 = min(1280, int(fx + right * bh))
    by0 = max(0, int(y0 - top * bh)); by1 = min(720, int(y1 + 0.03 * bh) + 2)
    return dict(box=[bx0, by0, bx1, by1], body=int(bh), feet_x=float(fx), feet_y=int(y1))


def frames_of(clip):
    tmp = tempfile.mkdtemp(prefix="nightcut_")
    TMPS.append(tmp)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", clip, "-vf", "scale=1280:720", f"{tmp}/%04d.png"], check=True)
    return sorted(glob.glob(f"{tmp}/*.png"))


def qa_sheet(frames, path, bg, per=8, scale=0.8):
    w, h = frames[0].size
    tw, th = int(w * scale), int(h * scale)
    rows = math.ceil(len(frames) / per)
    sheet = Image.new("RGBA", (per * tw, rows * (th + 16)), bg)
    d = ImageDraw.Draw(sheet)
    for i, f in enumerate(frames):
        x, y = (i % per) * tw, (i // per) * (th + 16)
        sheet.alpha_composite(f.resize((tw, th)), (x, y + 16))
        d.text((x + 3, y + 2), str(i), fill=(0, 0, 0) if bg[0] > 128 else (255, 255, 255))
    sheet.convert("RGB").save(path, quality=82)


def main(spec):
    slug, anim, ver = spec["slug"], spec["anim"], spec.get("ver", 1)
    bx = base_box(os.path.join(GEN, spec["base"]), spec.get("left", 0.85), spec.get("right", 1.0), spec.get("top", 0.22))
    x0, y0, x1, y1 = bx["box"]
    s = spec.get("body", 300) / bx["body"]
    W, H = int((x1 - x0) * s), int((y1 - y0) * s)
    out = []
    for seg in spec["segments"]:
        fl = frames_of(os.path.join(GEN, seg["clip"]))
        a, b = seg.get("from", 0), min(seg.get("to", len(fl) - 1), len(fl) - 1)
        n = seg.get("frames", b - a + 1)
        idx = [round(a + (b - a) * k / max(1, n - 1)) for k in range(n)] if n > 1 else [a]
        for i in idx:
            fr = key(Image.open(fl[i]))
            fr = clean(fr, spec.get("warm", False))
            out.append(Image.fromarray(fr, "RGBA").crop((x0, y0, x1, y1)).resize((W, H), Image.LANCZOS))
    if spec.get("loop") and len(out) > 2:
        out = out[:-1]                     # последний кадр совпадает с первым
    k = int(spec.get("xfade", 0))
    if k and len(out) > 2 * k:
        # мягкая склейка цикла: хвост плавно переходит в начало, потом хвост отбрасывается
        n = len(out)
        for i in range(k):
            t = (i + 1) / (k + 1)
            out[i] = Image.blend(out[n - k + i], out[i], t)
        out = out[:n - k]
    drop = set(spec.get("drop", []))
    out = [f for i, f in enumerate(out) if i not in drop]
    fdir = os.path.join(GEN, slug, "final", f"{anim}_v{ver}")
    os.makedirs(fdir, exist_ok=True)
    for i, f in enumerate(out):
        f.save(f"{fdir}/{i:03d}.png")
    cols = max(1, min(len(out), MAX_W // W))
    rows = math.ceil(len(out) / cols)
    while rows * H > MAX_W:            # лист не больше 4096 по любой стороне: уменьшаем кадры
        k = 0.92; W, H = int(W * k), int(H * k); s *= k
        out = [f.resize((W, H), Image.LANCZOS) for f in out]
        cols = max(1, min(len(out), MAX_W // W)); rows = math.ceil(len(out) / cols)
    sheet = Image.new("RGBA", (cols * W, rows * H), (0, 0, 0, 0))
    for i, f in enumerate(out):
        sheet.paste(f, ((i % cols) * W, (i // cols) * H))
    sub = "sprites/battle" if spec.get("target", "battle") == "battle" else "maps/characters/anim"
    os.makedirs(os.path.join(PUB, sub), exist_ok=True)
    name = f"{slug}_{anim}_v{ver}"
    dst = os.path.join(PUB, sub, name + ".webp")
    if os.path.exists(dst) and not spec.get("overwrite"):
        raise SystemExit(f"{dst} уже есть: новая версия через ver")
    sheet.save(dst, "WEBP", quality=88, method=5)
    meta = dict(frameWidth=W, frameHeight=H, frames=len(out), fps=spec.get("fps", 24), cols=cols,
                originX=round((bx["feet_x"] - x0) * s / W, 4), originY=round((bx["feet_y"] - y0) * s / H, 4),
                # кадры могли ужаться, чтобы лист влез в 4096: рост фигуры в px уменьшается вместе с ними
                bodyHeight=round(spec.get("body", 300) * s / (spec.get("body", 300) / bx["body"]), 1), bodyFixed=True,
                file=f"{sub}/{name}.webp",
                hitFrame=spec.get("hit"), hold=spec.get("hold", False), loop=bool(spec.get("loop")))
    json.dump(meta, open(os.path.join(PUB, sub, name + ".json"), "w"))
    if spec.get("hit") == "auto":
        # кадр удара: оружие/тело дальше всего вправо от ног
        ext = [np.nonzero(np.asarray(f)[..., 3].max(0) > 100)[0].max() if np.asarray(f)[..., 3].max() > 100 else 0 for f in out]
        spec["hit"] = int(np.argmax(ext))
    flags = []
    areas = [(np.asarray(f)[..., 3] > 128).sum() for f in out]
    for i in range(1, len(areas)):
        if areas[i - 1] and abs(areas[i] - areas[i - 1]) / areas[i - 1] > 0.18: flags.append(f"скачок силуэта {i}")
    for i, f in enumerate(out):
        a_ = np.asarray(f).astype(int); m = a_[..., 3] > 30
        gr = m & (a_[..., 1] > a_[..., 0] + 25) & (a_[..., 1] > a_[..., 2] + 25)
        if gr.sum() > 0.004 * max(1, m.sum()): flags.append(f"зелень {i}")
    if spec.get("loop"):
        d = np.abs(np.asarray(out[0]).astype(int) - np.asarray(out[-1]).astype(int))[..., 3].mean()
        if d > 6: flags.append(f"цикл не замкнут {d:.1f}")
    qa = os.path.join(GEN, "_night", "qa"); os.makedirs(qa, exist_ok=True)
    qa_sheet(out, f"{qa}/{name}_light.jpg", (232, 228, 215, 255))
    qa_sheet(out, f"{qa}/{name}_red.jpg", (70, 12, 14, 255), per=12, scale=0.5)
    meta["hitFrame"] = spec.get("hit") if spec.get("hit") != "auto" else None
    json.dump(meta, open(os.path.join(PUB, sub, name + ".json"), "w"))
    print(json.dumps(dict(name=name, frames=len(out), W=W, H=H, hit=spec.get("hit"), kb=os.path.getsize(dst) // 1024, flags=flags[:8]), ensure_ascii=False))


if __name__ == "__main__":
    import shutil
    try:
        main(json.load(open(sys.argv[1])))
    finally:
        for t in TMPS: shutil.rmtree(t, ignore_errors=True)
