"""Лист боевых юнитов в игровом масштабе (как в BattleScene: heights.json × pxPerMeter / bodyHeight листа)
и проверка роста: первый кадр стойки против первого кадра удара (рост фигуры не должен прыгать больше 2%).
python3 tools/battle_lineup.py out.jpg"""
import json, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont

GAME = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
anims = json.load(open(f"{GAME}/src/data/animations.json"))
H = json.load(open(f"{GAME}/src/data/heights.json"))
PPM = H["battle"]["pxPerMeter"]
ORDER = ["hero_duelist", "companion_brawler", "companion_healer", "bandit_commander", "bandit_brawler", "bandit_archer",
         "guard", "swamp_knight", "swamp_elf_battle", "assassin", "vurdalak", "drowned", "mavka", "kikimora", "winter_archer",
         "dog", "wild_dog", "grey_wolf", "boar", "kobold", "forest_bear", "winter_monster", "winter_queen", "mountain_king"]


def frame(a, i=0):
    sh = Image.open(f"{GAME}/public/{a['file']}").convert("RGBA")
    cols = sh.width // a["frameWidth"]
    x, y = (i % cols) * a["frameWidth"], (i // cols) * a["frameHeight"]
    return sh.crop((x, y, x + a["frameWidth"], y + a["frameHeight"]))


def fig_h(img):
    al = np.asarray(img)[..., 3] > 60
    ys = np.nonzero(al.any(1))[0]
    return (ys.max() - ys.min() + 1) if len(ys) else 0


rows, tiles = [], []
for uid in ORDER:
    cfg = anims.get(uid)
    if not cfg: continue
    body = H["units"].get(uid, H["battle"]["default"]) * PPM
    idle = cfg["anims"]["idle"]
    f0 = frame(idle)
    s = body / idle["bodyHeight"]
    h_idle = fig_h(f0) * s
    act = cfg["anims"].get(cfg.get("actions", {}).get("basic") or "", None) or cfg["anims"].get("hit")
    h_act = fig_h(frame(act)) * body / act["bodyHeight"] if act else h_idle
    rows.append((uid, cfg.get("name", uid), round(body), round(h_idle), round(h_act), round((h_act / h_idle - 1) * 100, 1)))
    im = f0.resize((max(1, round(f0.width * s)), max(1, round(f0.height * s))), Image.LANCZOS)
    tiles.append((uid, cfg.get("name", uid), im, idle["originX"], idle["originY"], round(h_idle)))

# Лента: все стоят ступнями на одной линии, сетка через 0,5 м
W = sum(int(t[2].width * 0.62) for t in tiles) + 80
TOP = 2.6 * PPM + 40
out = Image.new("RGB", (W, int(TOP) + 90), (36, 32, 28))
d = ImageDraw.Draw(out)
try:
    font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 13)
except OSError:
    font = ImageFont.load_default()
base = int(TOP)
for m in [0.5, 1.0, 1.5, 1.75, 2.0, 2.5]:
    y = base - m * PPM
    d.line([0, y, W, y], fill=(90, 80, 60) if m != 1.75 else (160, 130, 60), width=1)
    d.text((4, y - 15), f"{m} м", fill=(200, 180, 120), font=font)
x = 60
for uid, name, im, ox, oy, h in tiles:
    px = int(x + im.width * 0.31)
    out.paste(im, (int(px - ox * im.width), int(base - oy * im.height)), im)
    d.text((px - 30, base + 8), name[:16], fill=(230, 220, 200), font=font)
    d.text((px - 30, base + 26), f"{h} px", fill=(160, 150, 130), font=font)
    x += int(im.width * 0.62)
d.line([0, base, W, base], fill=(200, 180, 120), width=2)
out.save(sys.argv[1], quality=85)
print("юнит | рост по heights.json px | стойка px | удар px | разница %")
for r in rows:
    print(" | ".join(map(str, r)))
