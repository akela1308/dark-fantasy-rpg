"""Контактный лист картинок с подписями. python3 tools/night_contact.py out.jpg cols cellW file1 file2 ..."""
import sys
from PIL import Image, ImageDraw
out, cols, cw = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]); files = sys.argv[4:]
cells = []
for f in files:
    im = Image.open(f).convert("RGB"); im.thumbnail((cw, cw)); c = Image.new("RGB", (cw, im.height + 18), "white")
    c.paste(im, (0, 18)); ImageDraw.Draw(c).text((3, 3), f.split("generated/")[-1], fill="black"); cells.append(c)
ch = max(c.height for c in cells); rows = (len(cells) + cols - 1) // cols
sheet = Image.new("RGB", (cols * cw, rows * ch), "white")
for i, c in enumerate(cells): sheet.paste(c, ((i % cols) * cw, (i // cols) * ch))
sheet.save(out, quality=85)
