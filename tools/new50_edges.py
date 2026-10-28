"""Проверка фигуры на зелёном: касается ли края, доля высоты. python3 tools/new50_edges.py files..."""
import sys, numpy as np
from PIL import Image
for p in sys.argv[1:]:
    a = np.array(Image.open(p).convert("RGB")).astype(int); r, g, b = a[..., 0], a[..., 1], a[..., 2]
    fg = ~((g > 120) & (g > r + 45) & (g > b + 45))
    ys, xs = np.nonzero(fg); h, w = fg.shape
    if len(ys) == 0: print(p, "EMPTY"); continue
    m = 3; e = [n for n, v in (("top", ys.min() < m), ("bottom", ys.max() > h - m), ("left", xs.min() < m), ("right", xs.max() > w - m)) if v]
    print(f"{p:40s} h={ (ys.max()-ys.min())/h:.2f} {'EDGE '+','.join(e) if e else ''}")
