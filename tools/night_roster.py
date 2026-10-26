"""Список персонажей для ночной работы 26.10 и генерация заданий.
python3 tools/night_roster.py base   -> _night/base_jobs.json (базовые позы Nano Banana)
python3 tools/night_roster.py jobs   -> дописывает недостающие задания Veo в _night/jobs.json
Пути от assets/generated. Исходники только из проекта и папки «арты»/«Maps/Characters for maps»
(Disciples_2, Dark-soul-esq battlers и Maps/Sprites не используются)."""
import json, os, sys

ROOT = "/Users/maksimilin/Desktop/Dark Fantasy"
GAME = ROOT + "/dark-fantasy-rpg"
BASE = GAME + "/assets/generated"

# map: мирная поза (как на карте), ракурс как у исходника
# battle: боевая поза, смотрит вправо. front = оружие в передней руке (справа на экране), rear = в задней (слева)
# ambient: бытовые движения (каждое начинается и заканчивается базовой позой)
# kind: human / heavy / archer / crossbow / caster / monster / beast / peaceful
R = [
 dict(slug="brawler", name="Ворнаг (Боец)", src=GAME+"/public/sprites/companion_brawler.png", kind="heavy",
      battle="a heavy wooden club in the front hand, the rear hand a bare fist",
      ambient=["rolls his shoulders and cracks his neck", "taps the club on his palm, looking at the enemy"]),
 dict(slug="shield", name="Щитоносец", src=GAME+"/public/sprites/companion_shield.png", kind="heavy",
      battle="one big spiked club held with both hands in front of him",
      ambient=["shifts his weight from foot to foot", "rests the spiked club on his shoulder and lowers it again"]),
 dict(slug="healer", name="Тая (Знахарка)", src=GAME+"/public/sprites/companion_healer.png", kind="caster",
      battle="the gnarled wooden staff in the rear hand, a small bundle of dried herbs in the front hand",
      ambient=["smells the bundle of herbs in her hand", "looks around warily, leaning on her staff"]),
 dict(slug="bandit_commander", name="Корвин Сухой (Главарь)", src=GAME+"/public/sprites/bandit_commander.png", kind="human",
      battle="one straight sword in the front hand, the rear hand empty",
      ambient=["points the sword forward as if giving an order", "twirls the sword once lazily and grins"]),
 dict(slug="bandit_brawler", name="Головорез", src=GAME+"/public/sprites/bandit_brawler.png", kind="heavy",
      battle="one big wooden club held with both hands",
      ambient=["beats the club into his open palm", "spits to the side and growls"]),
 dict(slug="bandit_archer", name="Тисс (стрелок Корвина)", src=GAME+"/public/sprites/bandit_archer.png", kind="crossbow",
      battle="one crossbow held with both hands, pointing to the right",
      ambient=["checks the crossbow string", "looks around through the hood"]),
 dict(slug="swamp_knight", name="Болотный рыцарь", src=GAME+"/public/sprites/swamp_knight.png", kind="human",
      battle="one long sword in the front hand, the rear hand empty",
      ambient=["slowly lifts the sword and looks at the blade", "heavy breath, water drips, he shifts his weight"]),
 dict(slug="kikimora", name="Кикимора", src=GAME+"/public/sprites/kikimora.png", kind="monster",
      battle="no weapon, long claws on both hands",
      ambient=["twitches her head like a bird and sniffs the air", "flexes her long claws and hisses"]),
 dict(slug="swamp_elf", name="Ресса в бою (арт swamp_elf_battle)", src=GAME+"/public/sprites/swamp_elf_battle.png", kind="archer",
      battle="one bow held in the front hand, the rear hand free to draw the string",
      ambient=["looks around listening, ears twitching", "runs her fingers along the bowstring"]),
 dict(slug="dwarf_beer1", name="Брамм Медная Борода", src=GAME+"/public/maps/characters/dwarf_beer.png", kind="peaceful",
      map="sitting on the stool, holding a beer mug", battle="a beer mug in the front hand, one small hand axe in the rear hand",
      ambient=["drinks a long gulp of beer from the mug", "laughs heartily, shoulders shaking", "wipes the foam from his beard"]),
 dict(slug="dwarf_beer2", name="Орт Камнеглух", src=GAME+"/public/maps/characters/dwarf_beer2.png", kind="peaceful",
      map="sitting on the stool", battle="one small hand axe in the rear hand, the front hand a bare fist",
      ambient=["bangs his fist on his knee and laughs", "strokes his beard and nods"]),
 dict(slug="dwarf_beer3", name="Хальвар, седой старейшина", src=ROOT+"/арты/Таверна/Dwarf_beer3.png", kind="peaceful",
      map="sitting on the stool", battle="one heavy wooden stool leg used as a club in the front hand, the rear hand a bare fist",
      ambient=["scratches his beard thoughtfully", "laughs, slapping his knee"]),
 dict(slug="cleaning_girl", name="Мира, уборщица", src=GAME+"/public/maps/characters/cleaning_girl.png", kind="peaceful",
      map="standing with the mop, no bucket", battle="the long wooden mop held with both hands like a staff",
      ambient=["mops the floor with a few strokes", "stops and wipes her forehead with her forearm", "leans on the mop handle and sighs"]),
 dict(slug="tavernman", name="Ворн, хозяин таверны", src=GAME+"/public/maps/characters/tavernman.png", kind="peaceful",
      map="standing", battle="one meat cleaver in the front hand, the rear hand empty",
      ambient=["folds his arms on his chest", "stretches his back", "looks around the room slowly"]),
 dict(slug="wanderer", name="Рован, искатель печатей", src=GAME+"/public/maps/characters/map_wanderer.png", kind="peaceful",
      map="sitting on the chair with his pipe", battle=None,
      ambient=["smokes his pipe, the chest rising", "slowly turns his hooded head to look around"]),
 dict(slug="adventurer", name="Хольт, Искатель (бой)", src=ROOT+"/арты/Таверна/Adventurer_battle.png", kind="crossbow",
      battle="one small crossbow in the front hand pointing to the right, one long knife in the rear hand",
      ambient=["checks the edge of the knife", "looks around from under the hood"]),
 dict(slug="dog", name="Пёс", src=GAME+"/public/maps/characters/dog.png", kind="beast",
      map="standing", battle="no weapon, fangs",
      ambient=["wags its tail", "scratches behind the ear with a hind leg", "lowers its head and sniffs the ground"]),
 dict(slug="drunkman", name="Савко, пьяница-ключник", src=GAME+"/public/maps/characters/drunkman.png", kind="peaceful",
      map="standing", battle="one glass bottle in the front hand, the rear hand a bare fist",
      ambient=["sways to the left and then to the right", "throws up one arm and shouts something", "takes a swig from the bottle"]),
 dict(slug="guard", name="Стражник врат", src=GAME+"/public/maps/characters/guard.png", kind="human",
      map="standing with the halberd upright", battle="one halberd held with both hands",
      ambient=["shifts from foot to foot", "adjusts his helmet", "looks to the side and back"]),
 dict(slug="archer_guard", name="Бран, лучник-страж", src=GAME+"/public/maps/characters/archer_guard.png", kind="archer",
      map="standing with the bow", battle="one longbow held in the front hand, the rear hand free to draw the string",
      ambient=["looks into the distance shading his eyes", "checks the arrows in the quiver"]),
 dict(slug="recruit", name="Мирко, рекрут", src=GAME+"/public/maps/characters/recruit.png", kind="human",
      map="standing with the sword", battle="one short sword in the front hand, the rear hand empty",
      ambient=["nervously shifts his weight", "looks at his sword and grips it tighter"]),
 dict(slug="mountain_king", name="Горный король", src=GAME+"/public/maps/characters/mountain_king.png", kind="heavy",
      map="standing with the hammer", battle="one huge war hammer in the front hand",
      ambient=["breathes heavily, stone shoulders rising", "rests the hammer on the ground and lifts it again"]),
 dict(slug="swamp_elf_girl", name="Ресса, болотная изгнанница", src=GAME+"/public/maps/characters/swamp_elf_girl.png", kind="peaceful",
      map="standing with the bow", battle=None,
      ambient=["looks around listening", "touches her hair"]),
 dict(slug="dwarf", name="Дагмар, дварф-воин", src=ROOT+"/арты/Горы/Dwarf.png", kind="human",
      battle="one round wooden shield on the front arm, one axe in the rear hand",
      ambient=["knocks the axe on the shield rim", "strokes his beard"]),
 dict(slug="assassin", name="Гаст", src=ROOT+"/арты/Assasin.png", kind="human",
      battle="one curved blade in each hand, exactly two blades",
      ambient=["spins one blade in his fingers", "looks around crouching slightly"]),
 dict(slug="assassin_undead", name="Гаст Забытый", src=ROOT+"/арты/Assasin_Undead.png", kind="human",
      battle="one curved poison blade in each hand, exactly two blades, a bow on the back",
      ambient=["tilts the head with a creaking motion", "slowly raises one blade and looks at it"]),
 dict(slug="jester", name="Пересмешник, шут Королевы", src=ROOT+"/арты/Shut.png", kind="caster",
      battle="one marotte staff with a carved head in the front hand, the rear hand empty",
      ambient=["bows mockingly", "shakes the marotte and giggles"]),
 dict(slug="winter_girl", name="Инна, снежная дева", src=ROOT+"/арты/Winter/WinterGirl.png", kind="caster",
      battle="one staff with a stone on top in the rear hand, the front hand free",
      ambient=["raises her free hand in a slow gesture", "looks to the side, hair moving"]),
 dict(slug="winter_queen", name="Зимняя королева", src=ROOT+"/арты/Winter/Winter_Queen.png", kind="caster",
      battle="one small sphere floating above the front hand, no other weapon",
      ambient=["slowly turns her head", "raises the hand with the sphere a little"]),
 dict(slug="winter_monster", name="Оленье чудовище", src=ROOT+"/арты/Winter/WinterMonster.png", kind="monster",
      battle="one gnarled wooden snag club in the front hand",
      ambient=["sniffs the air, shaking the antlers", "growls and shifts its weight"]),
 dict(slug="vurdalak", name="Висельный чтец", src=ROOT+"/арты/Winter/Vurdalak.png", kind="monster",
      battle="no weapon, long claws on both hands",
      ambient=["twitches its head", "flexes the claws"]),
 dict(slug="forest_bear", name="Лесной Дед", src=ROOT+"/арты/Winter/Forest_bear.png", kind="beast",
      battle="no weapon, claws and jaws",
      ambient=["sniffs the air", "shakes its head and growls"]),
 dict(slug="winter_archer", name="Ульв, северный лучник", src=ROOT+"/арты/Winter/winter_archer.png", kind="archer",
      battle="one bow held in the front hand, the rear hand free to draw the string",
      ambient=["blows on his cold fingers", "looks into the distance"]),
 dict(slug="rowan", name="Рован в бою (по арту map_wanderer)", src=GAME+"/public/maps/characters/map_wanderer.png", kind="human",
      battle="one long knife in the front hand, the rear hand empty", standing=True,
      ambient=["checks the edge of the knife", "looks around warily from under the hood"]),
 dict(slug="agna", name="Агна, хозяйка «Трёх столбов» (новая, предварительно)", src=None, kind="peaceful",
      desc="a tired woman of about fifty, innkeeper, plain dark dress with a stained apron, grey-streaked hair tied back, tired eyes, strong hands",
      map="standing", battle="one heavy iron frying pan in the front hand, the rear hand empty",
      ambient=["wipes her hands on the apron", "crosses her arms and sighs"]),
 dict(slug="ryzh", name="Рыж, староста Придорожного (новый, предварительно)", src=None, kind="peaceful",
      desc="a big broad red-haired man of about forty-five, red beard, village elder, wearing a sheepskin coat over a linen shirt, belt, boots",
      map="standing", battle="one wood axe in the front hand, the rear hand empty",
      ambient=["strokes his red beard", "looks around and nods to himself"]),
 dict(slug="lyo", name="Лё, болотный старейшина (новый, предварительно)", src=None, kind="caster",
      desc="a short old swamp elder, grey-green layered robes of moss and cloth, his face looks like tree bark, knotted wooden walking stick",
      map="standing with the walking stick", battle="the knotted wooden walking stick in the rear hand, the front hand free for a gesture",
      ambient=["leans on the stick and listens", "slowly raises a hand as if blessing"]),
 dict(slug="til", name="Тил, кузнец, бывший сапёр (новый, предварительно)", src=None, kind="human",
      desc="a blacksmith, former army sapper, muscular man of about forty, leather apron, rolled sleeves, a burn scar covering half of his face",
      map="standing", battle="one blacksmith hammer in the front hand, the rear hand empty",
      ambient=["wipes soot from his forehead", "taps the hammer on his palm"]),
 dict(slug="swamp_guard", name="Болотная стражница (новая, предварительно)", src=None, kind="archer",
      desc="a swamp elf woman warrior, a different person from the young swamp exile: older, stern face with green tattoos, braided dark hair, mossy leather armor with reed plates",
      battle="one bow held in the front hand, the rear hand free to draw the string",
      ambient=["looks around listening", "checks the bowstring"]),
 # ── Твари бестиария главы 1 (14_БЕСТИАРИЙ, раздел 7), новые, предварительно ──
 dict(slug="wild_dog", name="Одичавший пёс (бестиарий)", src=None, kind="beast", style="beast",
      desc="a feral stray village dog, thin, matted grey-brown fur, torn ear, no collar, standing on four legs, side view",
      map="standing", battle="no weapon, fangs", ambient=["sniffs the ground", "growls quietly with bared teeth"]),
 dict(slug="grey_wolf", name="Серый волк (бестиарий)", src=None, kind="beast", style="beast",
      desc="a lean grey forest wolf, realistic, standing on four legs, side view, cold eyes",
      map="standing", battle="no weapon, fangs", ambient=["sniffs the air", "lowers the head and growls"]),
 dict(slug="boar", name="Вепрь Старого Бора (бестиарий)", src=None, kind="beast", style="beast",
      desc="a huge old wild boar, dark bristly fur, long yellow tusks, a broken spear shaft stuck in its side, standing on four legs, side view",
      map="standing", battle="no weapon, tusks", ambient=["paws the ground", "snorts and shakes its head"]),
 dict(slug="leshy", name="Леший (бестиарий)", src=None, kind="caster", style="monster",
      desc="the leshy, an old forest spirit, very tall and thin, bark instead of a face, beard of moss and lichen, robe of leaves and roots, not scary, old and tired",
      map="standing", battle="a long gnarled branch staff in the rear hand, the front hand free",
      ambient=["slowly turns the bark face to listen", "leans on the branch staff"]),
 dict(slug="mavka", name="Мавка (бестиарий)", src=None, kind="caster", style="monster",
      desc="a mavka, a drowned village girl, wet long white shirt, long dark wet hair with water weeds, pale ordinary face, barefoot",
      map="standing", battle="no weapon, the hands reaching forward", ambient=["wrings water from her hair", "sways and hums"]),
 dict(slug="drowned", name="Утопленник (бестиарий)", src=None, kind="monster", style="monster",
      desc="a drowned man from a sunken village, bloated grey skin, tangled in water weeds, rotten peasant clothes, eyes closed",
      map="standing", battle="no weapon, heavy grasping hands", ambient=["water drips, he slowly shifts", "lifts the head with eyes closed"]),
 dict(slug="upyr", name="Упырь (бестиарий)", src=None, kind="human", style="monster",
      desc="an upyr, a withered dead man in a worn 17th-century style road-post guard coat with brass buttons and a sash, no helmet, bareheaded with thin grey hair, medieval-early-modern dark fantasy, NOT modern military, gaunt grey face, sunken eyes, long nails",
      map="standing", battle="no weapon, long claws on both hands", ambient=["twitches the head", "sniffs the air hungrily"]),
 dict(slug="kobold", name="Кобл (бестиарий)", src=None, kind="peaceful", style="monster",
      desc="a kobl, a small mountain mine goblin-like thief from miners folk tales, short, leather cap, big ears, glowing eyes, funny not ugly, ragged miner clothes",
      map="standing", battle="one small pickaxe in the front hand, the rear hand empty", ambient=["looks around greedily", "scratches behind the ear"]),
 dict(slug="cat", name="Кошка", src=ROOT+"/арты/Сфе.png", kind="beast",
      map="sitting calmly", battle=None,
      ambient=["washes its face with a paw", "stretches and sits down"]),
]

COMMON = ("Exactly one figure, the exact same character as in the reference: same face, hair, body, clothes, colors and items. "
          "Full body visible, nothing cut off, centered in the image, the figure about 75% of the image height, the feet near the bottom. "
          "Flat solid uniform pure chroma green background (#00FF00), the same green everywhere, no gradient, no furniture, no walls, no shadow, no floor, no effects, no glow on the background, "
          "no text, no sparkle, no watermark, no other objects or characters.")


STYLE_REF = GAME + "/public/maps/characters/tavernman.png"        # образец стиля для новых персонажей
STYLE_REFS = {"beast": GAME + "/public/maps/characters/dog.png", "monster": GAME + "/public/sprites/kikimora.png"}
PORTRAIT_REF = ROOT + "/арты/Таверна/TavernMan_portair.png"


def base_jobs():
    out = []
    for c in R:
        if c.get("src") is None:
            # новый персонаж без арта: сначала полный рост по описанию, в стиле образца
            out.append(dict(slug=c["slug"], out=f"{c['slug']}/k_art.png", ref=STYLE_REFS.get(c.get("style"), STYLE_REF), prompt=(
                f"A NEW original character, NOT the person in the reference image: only copy the painting style, colors and level of detail. "
                f"EXACTLY ONE single figure, not a character sheet, no turnaround, no second view. {c['desc']}. Full body, standing, three-quarter view, the whole figure visible, about 75% of the image height. "
                f"Flat solid uniform pure chroma green background (#00FF00), no shadow, no floor, no text, no watermark.")))
            out.append(dict(slug=c["slug"], out=f"{c['slug']}/portrait.png", ref=PORTRAIT_REF, aspect="1:1", prompt=(
                f"A NEW original character portrait, NOT the person in the reference image: only copy the portrait style, dark background, "
                f"warm light on the face and the frame style. {c['desc']}. Head and shoulders.")))
            art = f"{BASE}/{c['slug']}/k_art.png"
            if os.path.exists(art) and c.get("battle"):
                out.append(dict(slug=c["slug"], out=f"{c['slug']}/k_battle.png", ref=art, prompt=(
                    f"Edit of the reference image. {COMMON} Pose: a ready combat stance, three-quarter view. The character faces the RIGHT "
                    f"side of the image: the face, the chest and the toes are turned to the right. WEAPONS: {c['battle']}. "
                    f"The front hand is the hand on the right side of the image.")))
            continue
        if c.get("map"):
            out.append(dict(slug=c["slug"], out=f"{c['slug']}/k_idle.png", ref=c["src"], prompt=(
                f"Edit of the reference image. {COMMON} Keep the same pose and the same facing direction as in the reference: {c['map']}.")))
        if c.get("battle"):
            out.append(dict(slug=c["slug"], out=f"{c['slug']}/k_battle.png", ref=c["src"], prompt=("STANDING UP, not sitting. " if c.get("standing") else "") + (
                f"Edit of the reference image. {COMMON} Pose: a ready combat stance, three-quarter view. The character faces the RIGHT "
                f"side of the image: the face, the chest and the toes are turned to the right, he looks to the right. WEAPONS: {c['battle']}. The front hand is the hand on the right side of the image.")))
    return out


if __name__ == "__main__":
    if sys.argv[1] == "base":
        os.makedirs(BASE + "/_night", exist_ok=True)
        json.dump(base_jobs(), open(BASE + "/_night/base_jobs.json", "w"), ensure_ascii=False, indent=1)
        print(len(base_jobs()), "base jobs")


# ── Задания Veo ─────────────────────────────────────────────────────────
def hands(c, battle):
    if battle and c.get("battle"):
        return (f" HANDS CANON: {c['battle']}; the front hand is the hand on the right side of the image. "
                "Never swap hands, never duplicate, drop or change the weapons.")
    return " Every item stays in the same hand as in the first frame, never duplicated, never dropped."

IDLE = ("Idle loop for the whole clip: the character stays in place in the same pose, breathes slowly and calmly, "
        "the chest rises and falls, a slight shift of weight, clothes, cloak and hair move gently. "
        "No steps, no gestures, no turning. The last frame is exactly the same pose as the first.")
IDLE_BEAST = ("Idle loop for the whole clip: the animal stays in place in the same pose, breathes calmly, "
              "the flanks rise and fall, small natural movements of the ears and tail. No steps, no turning. "
              "The last frame is exactly the same pose as the first.")
AMB = ("One single everyday action in the middle of the clip, then back to the starting pose: {a}. "
       "At the start and at the end exactly the same pose as the first frame. No other gestures, no steps away, no turning.")
BIDLE = ("Combat idle loop for the whole clip: a ready fighting stance, slow tense breathing, a slight sway and weight shift, "
         "the weapons held steady, clothes and hair move gently. No steps, no attacks. The last frame is exactly the same pose as the first.")
ATTACK = {
 "human":   "One single attack to the right: a short wind-up, one fast strong strike forward to the right with the weapon, then a recovery back into the same ready stance.",
 "heavy":   "One single heavy attack to the right: a long wind-up, one powerful blow forward to the right with the whole weight of the body, a short recoil, then back into the same ready stance.",
 "archer":  "One single bow shot to the right: draws the bowstring back to the cheek, aims to the right, releases, then lowers the bow back into the same ready stance.",
 "crossbow":"One single shot to the right: raises the crossbow and aims to the right, shoots with a small recoil, then returns to the same ready stance.",
 "caster":  "One single spell cast to the right: raises the hand and the staff or item, makes one strong pushing gesture toward the right, then returns to the same ready stance. No glow, no particles.",
 "monster": "One single attack to the right: lunges forward to the right slashing with the claws or the weapon, then recovers back into the same stance.",
 "beast":   "One single attack to the right: the animal lunges forward to the right and snaps its jaws or swipes a paw, then steps back into the same stance.",
 "peaceful":"One single clumsy, unskilled attack to the right: an awkward wide swing with the item in the hand, nearly losing balance, then back into the same stance.",
}
SPECIAL = {
 "human":   ("power", "One single powerful special attack to the right: a big two-handed overhead wind-up and a crushing blow forward to the right, then back into the same ready stance."),
 "heavy":   ("power", "One single crushing overhead smash to the right with the weapon raised high above the head, a heavy impact, then back into the same ready stance."),
 "crossbow":("reload", "Reloading: lowers the crossbow, pulls the string back with effort and loads a bolt, then returns to the same ready stance."),
 "caster":  ("cast2", "A healing or blessing cast: raises the hand slowly with a calm gesture toward the left, holds it for a moment, then returns to the same ready stance. No glow, no particles."),
 "monster": ("power", "A ferocious roar: throws the head back and roars, then a double slash forward to the right, then back into the same stance."),
}
HIT = ("Is struck by one blow coming from the right: the body jerks back and away to the left, a pained face, "
       "then recovers into the same stance. Does not fall. No other gestures.")
DEATH = ("Is fatally struck from the right: staggers back, drops to the knees and collapses onto the ground, "
         "lying still on the ground at the end of the clip. The weapons fall next to the body.")
DEATH_BEAST = "Is fatally struck from the right: the animal staggers, collapses onto its side and lies still on the ground at the end of the clip."
VICTORY_BEAST = ("Victory: the animal stays on all four legs the whole clip, lifts its head and barks or roars once, "
                 "then stands proudly still. It never stands up on its hind legs, never changes its body shape.")
VICTORY = ("Victory: a proud triumphant gesture, raises the weapon or the fist up, then holds the triumphant pose still until the end. No steps.")

DUELIST = [
 ("block_in", "k_idle", "k_block", "Slow motion. One single smooth movement: from his guard he raises the rapier into a high horizontal parry at head height."),
 ("block_out", "k_block", "k_idle", "Slow motion. One single smooth movement: he lowers the rapier from the high parry back into his guard."),
 ("hit_in", "k_idle", "k_hit", "Slow motion. He is struck: the torso bends back and away to the left, head down in pain, weight on the back foot."),
 ("hit_out", "k_hit", "k_idle", "Slow motion. One single smooth movement: he recovers from the blow and straightens back into his guard."),
 ("death", "k_hit", "k_dead", "Slow motion. He collapses from the wound: drops to the knees and falls onto his back on the ground, the rapier and the pistol fall next to his hands."),
 ("victory", "k_idle", "k_victory", "Slow motion. One single smooth movement: he raises the rapier high above his head in triumph, the pistol hand rests on his hip."),
 ("salute_in", "k_idle", "k_stance", "Slow motion. One single smooth movement: he turns sideways into a narrow fencing stance and raises the rapier vertically in front of his face in a duelist salute."),
 ("salute_out", "k_stance", "k_idle", "Slow motion. One single smooth movement: he lowers the rapier from the salute back into his guard."),
 ("reload_in", "k_idle", "k_reload", "Slow motion. One single smooth movement: he brings the pistol up to his chest, barrel up, and pulls back the hammer with his thumb."),
 ("reload_out", "k_reload", "k_idle", "Slow motion. One single smooth movement: he lowers the pistol back to his hip into his guard."),
]
DUELIST_HANDS = (" HANDS CANON: the thin rapier stays in his front hand on the right side of the image, ONE single flintlock "
                 "pistol stays in his rear hand on the left side of the image. Never swap, never duplicate the weapons.")


def veo_jobs():
    j = []
    for name, a, b, p in DUELIST:
        j.append(dict(stage=0, name=f"duelist/clips2/{name}", first=f"duelist/{a}.png", last=f"duelist/{b}.png", prompt=p + DUELIST_HANDS))
    for c in R:   # этап 1: стойка
        s = c["slug"]; beast = c["kind"] == "beast"
        if c.get("map"):
            j.append(dict(stage=1, name=f"{s}/clips/idle", first=f"{s}/k_idle.png", last=f"{s}/k_idle.png",
                          prompt=(IDLE_BEAST if beast else IDLE) + hands(c, False)))
        if c.get("battle"):
            j.append(dict(stage=1, name=f"{s}/clips/bidle", first=f"{s}/k_battle.png", last=f"{s}/k_battle.png",
                          prompt=(IDLE_BEAST if beast else BIDLE) + hands(c, True)))
    for c in R:   # этап 2: бытовые движения от мирной позы (или боевой, если мирной нет)
        s = c["slug"]; base = "k_idle" if c.get("map") else "k_battle"
        for i, a in enumerate(c.get("ambient", []), 1):
            j.append(dict(stage=2, name=f"{s}/clips/amb{i}", first=f"{s}/{base}.png", last=f"{s}/{base}.png",
                          prompt=AMB.format(a=a) + hands(c, base == "k_battle")))
    for c in R:   # этап 3: бой
        if not c.get("battle"): continue
        s = c["slug"]; k = c["kind"]; beast = k == "beast"; fb = f"{s}/k_battle.png"; h = hands(c, True)
        j.append(dict(stage=3, name=f"{s}/clips/attack", first=fb, last=fb, prompt=ATTACK[k] + " One strike only." + h))
        j.append(dict(stage=3, name=f"{s}/clips/hit", first=fb, last=fb, prompt=HIT + h))
        j.append(dict(stage=3, name=f"{s}/clips/death", first=fb, prompt=(DEATH_BEAST if beast else DEATH) + h))
        j.append(dict(stage=3, name=f"{s}/clips/victory", first=fb, prompt=(VICTORY_BEAST if beast else VICTORY) + h))
        if k in SPECIAL:
            nm, p = SPECIAL[k]
            j.append(dict(stage=3, name=f"{s}/clips/{nm}", first=fb, last=fb, prompt=p + h))
    for x in j:
        x.setdefault("sec", 4); x.setdefault("n", 2)
    return j





# ── Этап 4: ходьба по карте (вид сбоку, как у Дуэлянта: duelist/walk/) ──
WALKERS = [
 dict(slug="brawler", src=GAME+"/public/maps/characters/brawler_idle_v3.png", ref2=GAME+"/public/sprites/companion_brawler.png",
      canon="the club hangs on his belt at the hip, both hands EMPTY"),
 dict(slug="healer", src=GAME+"/public/maps/characters/healer.png", ref2=GAME+"/public/sprites/companion_healer.png",
      canon="she holds her gnarled wooden staff in the far hand and uses it as a walking stick, the near hand empty"),
 dict(slug="bandit_map", src=GAME+"/public/maps/characters/bandit.png", ref2=None,
      canon="he carries his weapon exactly as in the reference, in the same hand"),
 dict(slug="bandit_warrior_map", src=GAME+"/public/maps/characters/bandit_warrior.png", ref2=None,
      canon="he carries his weapon exactly as in the reference, in the same hand"),
 dict(slug="bandit_archer_map", src=GAME+"/public/maps/characters/bandit_archer_map.png", ref2=None,
      canon="the crossbow is carried exactly as in the reference, in the same hand"),
]
WALK_DIR = "walk"


def walk_base_jobs():
    out = []
    for w in WALKERS:
        refs = [w["src"]] + ([w["ref2"]] if w["ref2"] else [])
        out.append(dict(slug=w["slug"], out=f"{w['slug']}/{WALK_DIR}/k_walk.png", ref=refs[0], refs=refs, prompt=(
            "Exactly one figure: the exact same character as in the first reference image (same face, hair, clothes, colors). "
            "Pure side view profile, walking to the RIGHT side of the image. Mid-stride: the front leg forward with the heel touching "
            f"the ground, the back leg behind on its toes, arms swinging naturally. MAP CANON: {w['canon']}. Whole figure visible with "
            "margin, feet near the bottom, figure height about 80 percent of the image, centered. Flat solid pure chroma green "
            "background (#00FF00), no ground, no shadow, no other objects.")))
        out.append(dict(slug=w["slug"], out=f"{w['slug']}/{WALK_DIR}/k_stand.png", ref=f"{BASE}/{w['slug']}/{WALK_DIR}/k_walk.png", prompt=(
            "Edit of the reference image. Exactly one figure, the exact same character, same size, same ground line, same place in "
            "the frame, still in side view facing the RIGHT side of the image. New pose: standing still and relaxed, feet planted "
            f"slightly apart, weight on both legs. MAP CANON: {w['canon']}. Flat solid pure chroma green background (#00FF00), no "
            "ground, no shadow, no other objects."), after="walk"))
    return out


WALK_PROMPT = ("Walks in place on the spot, like on a treadmill: a steady, natural, realistic walking cycle, weight shifting from "
               "foot to foot, slight up and down motion of the body, arms swinging in opposition to the legs, clothes moving with each "
               "step. The body stays in exactly the same place in the frame, does not travel across the frame, never turns around, "
               "always walks facing right. Camera locked, no zoom.")
STAND_PROMPT = ("Stands still and breathes slowly and calmly, chest and shoulders rise and fall slightly, clothes move very gently, "
                "a small natural shift of weight. Subtle idle loop, ends in exactly the same pose. Does not walk, does not turn, does "
                "not gesture. Camera locked, no zoom.")


def walk_veo_jobs():
    j = []
    for w in WALKERS:
        s = w["slug"]; d = f"{s}/{WALK_DIR}"; h = f" MAP CANON: {w['canon']}, the whole clip."
        j.append(dict(stage=2.5, name=f"{d}/walk", first=f"{d}/k_walk.png", last=f"{d}/k_walk.png", prompt=WALK_PROMPT + h, sec=4, n=2))
        j.append(dict(stage=2.5, name=f"{d}/stand", first=f"{d}/k_stand.png", last=f"{d}/k_stand.png", prompt=STAND_PROMPT + h, sec=4, n=2))
    return j


if __name__ == "__main__" and sys.argv[1] == "walkbase":
    json.dump(walk_base_jobs(), open(BASE + "/_night/walk_base_jobs.json", "w"), ensure_ascii=False, indent=1)
    print(len(walk_base_jobs()), "walk base jobs")


if __name__ == "__main__" and sys.argv[1] == "jobs":
    path = BASE + "/_night/jobs.json"
    old = json.load(open(path)) if os.path.exists(path) else []
    names = {x["name"] for x in old}
    ok_path = BASE + "/_night/approved.txt"   # принятые базовые позы (после проверки глазами)
    approved = set(open(ok_path).read().split()) if os.path.exists(ok_path) else set()
    approved |= {f"duelist/{k}.png" for k in ("k_idle", "k_block", "k_hit", "k_dead", "k_victory", "k_stance", "k_reload")}
    new = [x for x in veo_jobs() + walk_veo_jobs() if x["name"] not in names and x["first"] in approved
           and (not x.get("last") or x["last"] in approved)]
    allj = sorted(old + new, key=lambda x: x.get("stage", 9))
    json.dump(allj, open(path + ".tmp", "w"), ensure_ascii=False, indent=1)
    os.replace(path + ".tmp", path)   # атомарно: очередь читает файл в это же время
    from collections import Counter
    print("всего заданий:", len(allj), "новых:", len(new), Counter(x["stage"] for x in allj))
