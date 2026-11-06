"""Дорисовка тропы или другого участка на готовой карте (Д32): Nano Banana правит вырезку, в карту вклеивается только полоса
вдоль пути с мягким краем, остальная картинка остаётся пиксель в пиксель, разметка ходьбы не съезжает.
python3 tools/paint_path.py src.jpg dst.jpg spec.json   spec: [{"box":[x0,y0,x1,y1],"path":[[x,y],...],"width":130,"prompt":"..."}]
Координаты в px мира 1672×941. Вырезки кэшируются в assets/generated/_ui_nov/paths."""
import json, os, subprocess, sys
from PIL import Image, ImageDraw, ImageFilter
C = os.path.dirname(os.path.abspath(__file__)) + "/veo_client.py"
src, dst, spec = sys.argv[1:4]
base = Image.open(src).convert("RGB").resize((1672, 941), Image.LANCZOS)
for i, s in enumerate(json.load(open(spec))):
    x0, y0, x1, y1 = s["box"]; crop = base.crop(s["box"]); stem = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets", "generated", "_ui_nov", "paths", os.path.basename(dst)); tmp = f"{stem}.{i}.ref.png"; out = f"{stem}.{i}.png"
    crop.save(tmp)
    if not os.path.exists(out):
        p = ("Edit this exact painting. " + s["prompt"] + " Same hand-painted style, same palette, same light and shadow, same level of detail. "
             "Every tree, rock and object stays exactly where it is, same framing. No text.")
        subprocess.run([sys.executable, C, "image", p, out, tmp, "--aspect", "16:9"], check=True, capture_output=True)
    new = Image.open(out).convert("RGB").resize(crop.size, Image.LANCZOS)
    m = Image.new("L", crop.size, 0); d = ImageDraw.Draw(m)
    w = s.get("width", 130); pts = [(x - x0, y - y0) for x, y in s["path"]]
    d.line(pts, fill=255, width=w, joint="curve")
    for p in pts: d.ellipse((p[0] - w / 2, p[1] - w / 2, p[0] + w / 2, p[1] + w / 2), fill=255)
    m = m.filter(ImageFilter.GaussianBlur(w * 0.28))
    base.paste(new, (x0, y0), m)
base.save(dst, quality=93) if dst.endswith(".jpg") else base.save(dst)
print("ok", dst)
