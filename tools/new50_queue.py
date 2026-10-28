"""Очередь Veo для _new50: python3 tools/new50_queue.py -> assets/generated/_new50/queue.json (пути от папки очереди)."""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import night_roster as N
GEN = N.BASE
R = json.load(open(GEN + "/_new50/roster.json"))
NOFX = " No visual effects, no flashes, no trails, no glow, no particles."
SLOW = " Slow motion, one single even movement."
jobs = []
for c in R:
    s = c["slug"]; beast = c["style"] == "beast"; k = c.get("battleKind")
    keep = " The {w} keeps exactly the same body, the same face and the same limbs for the whole clip.".format(w="animal" if beast else "figure")
    if beast:
        keep += " It never stands up on its hind legs, never changes its body shape."
    if s == "rats":
        keep = " Always exactly the same three rats, each with one tail; no rat appears or disappears. They stay on all four legs."
    h = (f" HANDS CANON: {c['weapons']}; the front hand is the hand on the right side of the image. Never swap hands, never duplicate, drop or change the weapons."
         if c["battle"] and not beast and c.get("weapons") else "")
    fb = f"../{s}/k_battle.png"
    for v in c["veo"]:
        if v == "idle":
            p = (N.IDLE_BEAST if beast else N.IDLE) + ("" if beast else " Every item stays in the same hand as in the first frame, never duplicated, never dropped.")
            jobs.append(dict(name=f"../{s}/clips/idle", first=f"../{s}/k_idle.png", last=f"../{s}/k_idle.png", prompt=p + keep + NOFX))
        elif v == "amb1":
            p = N.AMB.format(a=c["amb"]) + ("" if beast else " Every item stays in the same hand as in the first frame, never duplicated, never dropped.")
            jobs.append(dict(name=f"../{s}/clips/amb1", first=f"../{s}/k_idle.png", last=f"../{s}/k_idle.png", prompt=p + keep + NOFX))
        elif v == "bidle":
            jobs.append(dict(name=f"../{s}/clips/bidle", first=fb, last=fb, prompt=(N.IDLE_BEAST if beast else N.BIDLE) + h + keep + NOFX))
        elif v == "attack":
            jobs.append(dict(name=f"../{s}/clips/attack", first=fb, last=fb, prompt=N.ATTACK[k] + SLOW + " One strike only." + h + keep + NOFX))
        elif v == "hit":
            jobs.append(dict(name=f"../{s}/clips/hit", first=fb, last=fb, prompt=N.HIT + h + keep + NOFX))
        elif v == "death":
            jobs.append(dict(name=f"../{s}/clips/death", first=fb, prompt=(N.DEATH_BEAST if beast else N.DEATH) + h + keep + NOFX))
        elif v == "victory":
            jobs.append(dict(name=f"../{s}/clips/victory", first=fb, prompt=(N.VICTORY_BEAST if beast else N.VICTORY) + h + keep + NOFX))
for j in jobs: j.update(sec=4, n=2)
json.dump(jobs, open(GEN + "/_new50/queue.json", "w"), ensure_ascii=False, indent=1)
print(len(jobs), "jobs")
