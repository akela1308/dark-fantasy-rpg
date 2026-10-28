"""Очередь Veo потока «Арт-2» (28.10): победа Бродячего рыцаря, бытовое Вешки, победа Шишиги,
полные боевые анимации 20 тварей бестиария. python3 tools/art2_queue.py -> assets/generated/_art2/queue.json"""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import night_roster as N
GEN = N.BASE
NOFX = " No visual effects, no flashes, no trails, no glow, no particles."
SLOW = " Slow motion, one single even movement."
HC = " HANDS CANON: {w}; the front hand is the hand on the right side of the image. Never swap hands, never duplicate, drop or change the weapons."
# slug: (вид атаки, оружие и руки или None для зверя, добавка к «сохранению облика»)
C20 = {
 "moroz": ("caster", "one tall staff of clear ice held in both hands, pointing to the right, no other weapon", ""),
 "leshy": ("monster", "no weapon, long root-like claws on both hands", " The branch antlers keep the same shape."),
 "poludnitsa": ("monster", "one large rusty sickle in the rear hand crossed in front of the body, the front hand empty", ""),
 "troll_ugryum": ("heavy", "one club made of a whole tree trunk held with both hands", ""),
 "frontier_beast": ("monster", "no weapon, long thin claws on both hands, the antlered elk skull head", " The torn banners stay on its shoulders."),
 "forgotten_warden": ("human", "one broken spear held with both hands, chains wrapped around the arms", ""),
 "wolfolak": ("monster", "no weapon, long claws on both hands", " It stays on two legs, never drops to all fours."),
 "whisperer": ("caster", "no weapon in the hands, pale empty hands, the old book stays chained to the belt", " The face always stays hidden in the hood shadow."),
 "stone_guard": ("heavy", "one stone halberd held with both hands", ""),
 "mine_spider": ("beast", None, " Always exactly eight legs, the copper crystals on its back never change."),
 "mine_shade": ("human", "one pickaxe held with both hands", ""),
 "fields_creature": ("monster", "no weapon, long twig fingers on both hands", ""),
 "gallows_reader": ("caster", "one old wooden tablet in the front hand, the rear hand empty", " The noose rope stays around the neck."),
 "hanged": ("monster", "no weapon, clawed hands", " The noose rope stays around the neck."),
 "shade": ("monster", "no weapon, long thin dark fingers", " It always stays faceless, no face ever appears."),
 "stone_voice": ("monster", "no weapon, short thick arms of roots and rock", " The body stays one rigid mossy standing stone with the same carved face, only the arms move."),
 "candle_keeper": ("caster", "one wooden staff held low in the rear hand, the front hand grips the wooden yoke with unlit candles on the shoulders", " The candles stay unlit, no flames."),
 "reader": ("caster", "one big open book held in both hands", ""),
 "novice": ("human", "one short curved knife gripped with both hands in front of the chest", ""),
 "name_echo": ("human", "one halberd held with both hands", " The figure stays pale grey and faded."),
}
SPIDER_DEATH = "Is fatally struck from the right: the spider staggers, its legs curl up under the body and it sinks to the ground, lying still at the end of the clip."
SPIDER_VIC = "Victory: the spider stays on all its legs the whole clip, lifts its front body slightly and opens its fangs once, then stands still. It never changes its body shape."
jobs = []
def add(name, first, prompt, last=None):
    j = dict(name=name, first=first, prompt=prompt, sec=4, n=2)
    if last: j["last"] = last
    jobs.append(j)
# 1. Бродячий рыцарь: победа first=k_battle, last=k_victory
kh = HC.format(w="one long sword in the front hand, one battered heater shield on the rear arm")
add("../wandering_knight/clips/victory_r3", "../wandering_knight/k_battle.png",
    "Slow motion. One single smooth movement for the whole clip: from his guard he slowly lowers the long sword until it points straight down "
    "with the point on the ground in front of his front foot, the shield lowers and relaxes, he raises his helmeted head proudly. No other gestures, no steps, no swings, no twirls." + kh +
    " The figure keeps exactly the same body, the same armor and the same limbs for the whole clip." + NOFX, last="../wandering_knight/k_victory.png")
# 2. Вешка: бытовое на карте
add("../bandit_axewoman/clips/amb1_r2", "../bandit_axewoman/k_idle.png",
    N.AMB.format(a="she slowly turns her head to look over her shoulder and then back") +
    " The hand axe stays resting on her shoulder in the same hand the whole clip and does not move, never changes its shape, never duplicated. The figure keeps exactly the same body and the same limbs." + NOFX,
    last="../bandit_axewoman/k_idle.png")
# 3. Шишига: победа
add("../shishiga/clips/victory_r2", "../shishiga/k_battle.png",
    N.VICTORY + HC.format(w="no weapon, small claws on both hands") +
    " The figure keeps exactly the same thin body and proportions as in the first frame for the whole clip, stays skinny, never grows bigger or more muscular." + NOFX)
# 3б. Полудница: победа заново (в первом заходе серп ушёл в переднюю руку)
add("../poludnitsa/clips/victory_r2", "../poludnitsa/k_battle.png",
    "Victory: she straightens up a little, throws her head back and laughs silently, the free front hand clenches into a claw, then she holds the pose still until the end. No steps."
    + HC.format(w="one large rusty sickle in the rear hand crossed in front of the body, the front hand empty") +
    " The sickle stays in the same rear hand in the same place in front of her waist for the whole clip, never passes to the other hand." +
    " The figure keeps exactly the same body, the same face and the same limbs for the whole clip." + NOFX)
# 4. 20 тварей
for s, (k, w, extra) in C20.items():
    fb = f"../{s}/k_battle.png"; beast = w is None
    keep = " The {f} keeps exactly the same body, the same face and the same limbs for the whole clip.".format(f="creature" if beast else "figure") + extra
    if beast: keep += " It never stands up on its hind legs, never changes its body shape."
    h = "" if beast else HC.format(w=w)
    add(f"../{s}/clips/bidle", fb, (N.IDLE_BEAST if beast else N.BIDLE) + h + keep + NOFX, last=fb)
    add(f"../{s}/clips/attack", fb, N.ATTACK[k] + SLOW + " One strike only." + h + keep + NOFX, last=fb)
    add(f"../{s}/clips/hit", fb, N.HIT + h + keep + NOFX, last=fb)
    add(f"../{s}/clips/death", fb, (SPIDER_DEATH if beast else N.DEATH) + h + keep + NOFX)
    add(f"../{s}/clips/victory", fb, (SPIDER_VIC if beast else N.VICTORY) + h + keep + NOFX)
os.makedirs(GEN + "/_art2", exist_ok=True)
json.dump(jobs, open(GEN + "/_art2/queue.json", "w"), ensure_ascii=False, indent=1)
print(len(jobs), "jobs")
