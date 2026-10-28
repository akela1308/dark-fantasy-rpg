"""Крупно кадры готового листа: python3 tools/new50_frames.py out.jpg slug anim_vN [from to]"""
import sys, os, glob
from PIL import Image
GEN = os.path.dirname(os.path.dirname(os.path.abspath(__file__))) + "/assets/generated/"
out, slug, a = sys.argv[1:4]
fs = sorted(glob.glob(f"{GEN}{slug}/final/{a}/*.png"))
lo, hi = (int(sys.argv[4]), int(sys.argv[5])) if len(sys.argv) > 5 else (0, len(fs) - 1)
fs = fs[lo:hi + 1]
ims = [Image.open(f) for f in fs]; H = 300
ims = [i.resize((int(i.width * H / i.height), H)) for i in ims]
W = sum(i.width for i in ims); o = Image.new("RGB", (W, H), (200, 190, 180)); x = 0
for i in ims: o.paste(i, (x, 0), i); x += i.width
o.save(out, quality=85); print(len(fs))
