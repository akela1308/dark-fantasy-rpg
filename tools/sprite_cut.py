"""Видео на зелёном фоне -> кадры с прозрачностью, спрайт-лист и превью GIF.
python3 tools/sprite_cut.py clip.mp4 out_prefix [--fps 24] [--h 400] [--start 0] [--end 99]"""
import subprocess, sys, os, glob, tempfile, json
import numpy as np
from PIL import Image

def opt(a, n, d):
    if n in a: i = a.index(n); v = a[i+1]; del a[i:i+2]; return v
    return d

a = sys.argv[1:]
fps = opt(a, "--fps", "24"); REF = opt(a, "--ref", None); WARM = "--warm" in a
if WARM: a.remove("--warm")
H = int(opt(a, "--h", "400")); ss = opt(a, "--start", "0"); to = opt(a, "--end", "99")
clip, prefix = a[0], a[1]
tmp = tempfile.mkdtemp()
subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", ss, "-to", to, "-i", clip, "-vf", f"fps={fps}", f"{tmp}/%04d.png"], check=True)

def key(im):
    """Вырезка зелёного фона без дыр в теле.
    1) фон: заметно зелёные пиксели (g сильно больше r и b);
    2) прозрачным делаем только тот фон, что связан с краем кадра, плюс крупные ярко-зелёные
       просветы внутри (настоящие дыры между ногами и рукой);
    3) тёмные зеленоватые пиксели внутри тела (отлив от фона в тенях) остаются непрозрачными
       и обесцвечиваются;
    4) край смягчается на 1 px, зелёный ореол убирается."""
    import cv2
    f = np.asarray(im.convert("RGB")).astype(np.float32)
    r, g, b = f[..., 0], f[..., 1], f[..., 2]
    mx = np.maximum(r, b)
    greenish = (g - mx > 20) & (g > 1.35 * mx + 5)
    gm = greenish.astype(np.uint8)
    n, lab, stats, _ = cv2.connectedComponentsWithStats(gm, connectivity=4)
    h, w = gm.shape
    bgmask = np.zeros_like(greenish)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]])).tolist())
    bright = (g > 150) & (g - mx > 90)
    for i in range(1, n):
        comp = lab == i
        if i in border:
            bgmask |= comp
        elif stats[i, cv2.CC_STAT_AREA] > 60 and bright[comp].mean() > 0.6:
            bgmask |= comp                     # настоящий просвет внутри силуэта
    bgmask |= ((r + g + b) < 12)  & (lab == 0) & False
    # чёрные поля по бокам кадра (если Veo их добавил)
    side = np.zeros_like(bgmask); dark = (r + g + b) < 20
    cols = dark.mean(0) > 0.98; side[:, cols] = True
    bgmask |= side
    alpha = (~bgmask).astype(np.float32)
    # мягкий край: на границе берём степень зелёности
    edge = cv2.dilate(bgmask.astype(np.uint8), np.ones((3, 3), np.uint8)).astype(bool) & ~bgmask
    soft = np.clip(1 - ((g - mx) - 20) / 80, 0, 1)
    alpha[edge] = np.minimum(alpha[edge], np.maximum(soft[edge], 0.35))
    # убрать зелёный отлив у всех оставшихся пикселей
    # вспышка выстрела: яркие жёлто-белые пиксели убираем (вспышку делает игра)
    flash = (r > 190) & (g > 160) & (b < 0.8 * g) & ((r + g + b) > 520)
    alpha[flash] = 0
    # оставить только основной силуэт: отлетающий дым и пятна отдельно от тела удаляются
    solid = (alpha > 0.5).astype(np.uint8)
    n2, lab2, st2, _ = cv2.connectedComponentsWithStats(solid, connectivity=8)
    if n2 > 1:
        keep = 1 + int(np.argmax(st2[1:, cv2.CC_STAT_AREA]))
        main = cv2.dilate((lab2 == keep).astype(np.uint8), np.ones((5, 5), np.uint8)).astype(bool)
        alpha[~main] = 0
    g2 = np.minimum(g, mx + 6)
    out = np.dstack([r, g2, b, alpha * 255]).clip(0, 255).astype(np.uint8)
    return Image.fromarray(out, "RGBA")

frames = [key(Image.open(p)) for p in sorted(glob.glob(f"{tmp}/*.png"))]

def fix_color(fr, ref_stats):
    """Убирает сиреневый отлив (Veo) у тёплых палитр и подгоняет цвет под исходную картинку персонажа."""
    a = np.asarray(fr).astype(np.float32); m = a[..., 3] > 128
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    if WARM:
        b2 = np.minimum(b, g + 2); a[..., 2] = np.where(m, b2, b)
    if ref_stats is not None:
        px = a[m][:, :3]; mu, sd = px.mean(0), px.std(0) + 1e-3
        rmu, rsd = ref_stats
        a[..., :3] = np.where(m[..., None], (a[..., :3] - mu) / sd * rsd + rmu, a[..., :3])
    return Image.fromarray(a.clip(0, 255).astype(np.uint8), "RGBA")

ref_stats = None
if REF:
    rf = np.asarray(key(Image.open(REF))).astype(np.float32); rm = rf[..., 3] > 128
    if WARM: rf[..., 2] = np.minimum(rf[..., 2], rf[..., 1] + 2)
    ref_stats = (rf[rm][:, :3].mean(0), rf[rm][:, :3].std(0))
if WARM or REF:
    frames = [fix_color(f, ref_stats) for f in frames]
box = None
for fr in frames:
    bb = fr.getchannel("A").point(lambda v: 255 if v > 128 else 0).getbbox()
    if bb: box = bb if box is None else (min(box[0], bb[0]), min(box[1], bb[1]), max(box[2], bb[2]), max(box[3], bb[3]))
pad = 8; box = (max(box[0]-pad, 0), max(box[1]-pad, 0), box[2]+pad, box[3]+pad)
s = H / (box[3] - box[1]); W = int((box[2] - box[0]) * s)
frames = [f.crop(box).resize((W, H), Image.LANCZOS) for f in frames]
os.makedirs(prefix, exist_ok=True)
for i, f in enumerate(frames): f.save(f"{prefix}/{i:03d}.png")
cols = min(len(frames), 12); rows = (len(frames) + cols - 1) // cols
sheet = Image.new("RGBA", (cols * W, rows * H))
for i, f in enumerate(frames): sheet.paste(f, ((i % cols) * W, (i // cols) * H))
sheet.save(prefix + "_sheet.png")
json.dump({"frameWidth": W, "frameHeight": H, "frames": len(frames), "fps": int(fps), "cols": cols}, open(prefix + "_sheet.json", "w"))
gif = []
for f in frames:
    bg = Image.new("RGB", (W, H), (38, 34, 30)); bg.paste(f, (0, 0), f); gif.append(bg.convert("P", palette=Image.ADAPTIVE))
gif[0].save(prefix + "_preview.gif", save_all=True, append_images=gif[1:], duration=int(1000 / int(fps)), loop=0)
print("ok", prefix, len(frames), "frames", W, "x", H)
