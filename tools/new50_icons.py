"""Иконки предметов и обложки книг по assets/generated/_new50/icons_needed.json.
$PY tools/new50_icons.py gen   -> assets/generated/_new50/icons/<key>.png (Nano Banana, пурпурный фон)
python3 tools/new50_icons.py cut -> public/<file> 512x512 RGBA (фон вырезан), существующие файлы не трогает."""
import json, os, sys, subprocess
from concurrent.futures import ThreadPoolExecutor
GAME = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GEN = GAME + "/assets/generated/_new50"
REF = GAME + "/public/items/book_lame_stag.png"
J = json.load(open(GEN + "/icons_needed.json"))
os.makedirs(GEN + "/icons", exist_ok=True)


def gen(x):
    out = f"{GEN}/icons/{x['key']}.png"
    if os.path.exists(out): return "skip " + x["key"]
    p = (f"A single inventory item icon for a dark fantasy game, NOT the object in the reference: copy only the hand-painted painterly oil rendering, "
         f"worn materials and muted earthy palette of the reference. The object: {x['prompt'].replace('transparent background', '').strip(', ')}. "
         "Exactly one object, three-quarter view, centered, filling about 80% of the image, the whole object visible. No frame, no text, no letters, "
         "no shadow, no glow, no sparkles. Flat solid uniform pure magenta background (#FF00FF) everywhere around the object.")
    open(out.replace(".png", "_prompt.txt"), "w").write(p)
    for _ in range(2):
        subprocess.run([sys.executable, GAME + "/tools/veo_client.py", "image", p, out, REF, "--aspect", "1:1", "--size", "1K", "--nostyle"], capture_output=True)
        if os.path.exists(out): return "ok " + x["key"]
    return "FAIL " + x["key"]


def cut(x):
    import numpy as np
    from PIL import Image, ImageFilter
    src = f"{GEN}/icons/{x['key']}.png"; dst = f"{GAME}/public/{x['file']}"
    if not os.path.exists(src): return "nosrc " + x["key"]
    if os.path.exists(dst) and "--force" not in sys.argv: return "exists " + dst
    a = np.array(Image.open(src).convert("RGB")).astype(int); r, g, b = a[..., 0], a[..., 1], a[..., 2]
    bg = (r > 150) & (b > 150) & (g < 110) & (np.abs(r - b) < 90)
    spill = (r > g + 40) & (b > g + 40) & ~bg
    a[..., 0] = np.where(spill, np.minimum(r, g + 40), r); a[..., 2] = np.where(spill, np.minimum(b, g + 40), b)
    im = Image.fromarray(np.dstack([a.astype("uint8"), np.where(bg, 0, 255).astype("uint8")]), "RGBA")
    im.putalpha(im.split()[3].filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.7)))
    im = im.crop(im.getbbox()); s = max(im.size); pad = int(s * 0.06)
    sq = Image.new("RGBA", (s + 2 * pad, s + 2 * pad), (0, 0, 0, 0)); sq.paste(im, ((s - im.width) // 2 + pad, (s - im.height) // 2 + pad), im)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    sq.resize((512, 512), Image.LANCZOS).save(dst, optimize=True); return "cut " + dst


if __name__ == "__main__":
    f = gen if sys.argv[1] == "gen" else cut
    with ThreadPoolExecutor(6 if f is gen else 1) as ex:
        for r in ex.map(f, J): print(r, flush=True)
