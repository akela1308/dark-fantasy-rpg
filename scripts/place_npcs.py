"""Расставляет NPC главы 1 с диалогами из src/data/dialogues по картам maps.json.
Идемпотентно: NPC с тем же id заменяется, остальные поля карты не трогаются.
spriteKey новых персонажей (map_agna, map_cat, map_adventurer, map_le) зарезервированы под
покадровые листы потока «Персонажи»; пока листов нет, игра рисует серый силуэт.
Запуск: python3 scripts/place_npcs.py"""
import json, os
P = os.path.join(os.path.dirname(__file__), '..', 'src', 'data', 'maps.json')
maps = json.load(open(P))

def npc(id, name, x, y, spriteKey, dialogue, start=None, portrait=None, height=130, **kw):
    d = dict(id=id, name=name, x=x, y=y, spriteKey=spriteKey, portraitKey=portrait, height=height,
             dialogue=dialogue, hoverPortrait=bool(portrait))
    if start: d['dialogueStart'] = start
    d.update(kw)
    return d

PLACE = {
    'south_post': [
        npc('marauder', 'Мародёр', 960, 560, 'map_bandit_warrior', 'south_post', 'looter', 'portrait_bandit_warrior', 150,
            hideIfFlag='road_looters_done', flipX=True),
        npc('mangy_dog', 'Облезлый пёс', 1050, 610, 'map_dog', 'south_post', 'looter', 'portrait_dog', 70,
            hideIfFlag='road_looters_done'),
        npc('vornag_post', 'Ворнаг', 700, 520, 'map_companion_brawler', 'south_post', 'vornag', 'portrait_companion_brawler', 140,
            showIf={'flag': 'road_looters_done', 'notFlag': ['wornag_recruited', 'wornag_refused']}),
    ],
    'three_pillars_inside': [
        npc('agna', 'Агна', 1000, 470, 'map_agna', 'three_pillars', 'agna', 'portrait_agna', 150),
        npc('holt', 'Хольт', 560, 520, 'map_adventurer', 'three_pillars', 'holt', 'portrait_holt', 145,
            showIf={'notFlag': 'holt_recruited'}),
        npc('cat', 'Кот', 760, 600, 'map_cat', 'three_pillars', 'cat', None, 50),
    ],
    'tavern_inside': [
        npc('taya', 'Тая', 250, 600, 'map_companion_healer', 'tavern', 'taya', 'portrait_companion_healer', 150,
            showIf={'notFlag': 'taya_recruited'}),
        npc('vornag_tavern', 'Ворнаг', 1400, 640, 'map_companion_brawler', 'tavern', 'vornag', 'portrait_companion_brawler', 160,
            showIf={'flag': 'wornag_refused', 'notFlag': 'wornag_recruited'}),
        npc('tiss_tavern', 'Тисс', 560, 800, 'map_bandit_archer', 'tavern', 'tiss', 'portrait_bandit_archer', 150,
            showIf={'flag': 'bandit_archer_recruitable', 'notFlag': 'tiss_recruited'}),
    ],
    'dead_road': [
        npc('gallows_reader', 'Висельный чтец', 840, 560, 'map_vurdalak', 'dead_road', None, None, 160,
            showIf={'notFlag': ['reader_spared', 'dead_road_reader_won']}),
    ],
    'elf_boloto': [
        npc('le', 'Старейшина Лё', 900, 470, 'map_le', 'swamp', 'le', 'portrait_le', 145),
        npc('ressa', 'Ресса', 1180, 560, 'map_swamp_elf_girl', 'swamp', 'ressa', 'portrait_swamp_elf_girl', 145,
            showIf={'notFlag': 'ressa_recruited'}),
    ],
}

for mid, lst in PLACE.items():
    m = maps[mid]
    npcs = [n for n in m.get('npcs', []) if n.get('id') not in {x['id'] for x in lst}]
    m['npcs'] = npcs + lst

# Ворн говорит из tavern.json (старые реплики v0.1 перенесены туда, поле dialogues оставлено)
for n in maps['tavern_inside']['npcs']:
    if n.get('name') == 'Ворн':
        n['dialogue'] = 'tavern'

txt = json.dumps(maps, ensure_ascii=False, indent=2)
assert chr(0x2014) not in txt
open(P, 'w').write(txt + '\n')
print('ok')
