"""Собирает src/data/battles.json из balance/proposed_data/battles.json ревизии 2026-10.
Даёт врагам уникальные id внутри боя, spriteKey под существующие спрайты и анимации,
архетип (arch), флаги сдачи. Запуск: python3 scripts/import_battles.py"""
import json, os, re
REV = os.path.expanduser('~/Documents/Claude/Projects/Mortis/РЕВИЗИЯ_2026-10/')
SRC = REV + 'balance/proposed_data/battles.json'
OUT = os.path.join(os.path.dirname(__file__), '..', 'src', 'data', 'battles.json')

SPRITE = {
    'Корвин Сухой': 'bandit_commander', 'Куль': 'bandit_brawler', 'Тисс': 'bandit_archer',
    'Головорез': 'bandit_brawler', 'Стрелок': 'bandit_archer', 'Мародёр': 'bandit_brawler',
    'Облезлый пёс': 'dog', 'Болотная тварь': 'dog',
    'Болотный Рыцарь': 'swamp_knight', 'Кикимора': 'kikimora', 'Болотная Эльфийка': 'swamp_elf_battle',
    'Лесной Дед': 'forest_bear', 'Латник': 'guard', 'Латник-мечник': 'guard', 'Арбалетчик': 'archer_guard',
}
# Люди Корвина могут сдаться (03_ДИАЛОГИ 6.7, 01_БАЛАНС 2)
SURRENDER = {'Корвин Сухой', 'Куль', 'Тисс', 'Головорез', 'Стрелок', 'Мародёр'}
FIXED_ID = {'Корвин Сухой': 'bandit_commander', 'Куль': 'bandit_brawler', 'Тисс': 'bandit_archer'}
SLUG = {
    'Головорез': 'thug', 'Стрелок': 'shooter', 'Мародёр': 'marauder', 'Облезлый пёс': 'mangy_dog',
    'Болотная тварь': 'swamp_beast', 'Болотный Рыцарь': 'swamp_knight', 'Кикимора': 'kikimora',
    'Болотная Эльфийка': 'swamp_elf_battle', 'Лесной Дед': 'forest_grandfather', 'Висельный чтец': 'gallows_reader',
    'Висельник': 'hanged', 'Тень': 'shade', 'Голос камня': 'stone_voice', 'Хранитель свечей': 'candle_keeper',
    'Чтец': 'reader', 'Послушник': 'novice', 'Латник': 'oath_knight', 'Латник-мечник': 'oath_swordsman',
    'Арбалетчик': 'crossbowman', 'Забытый Страж': 'forgotten_warden', 'Эхо имени': 'name_echo',
}
BG = {  # 09_МИР раздел 8
    'road_looters': 'Plane', 'korvin_gang': 'Forest_Battle', 'korvin_revenge': 'Forest_Battle',
    'altar_shadows': 'Forest_Battle', 'swamp_guardians': 'Boloto_battle1', 'swamp_lights': 'Boloto_battle',
    'forest_grandfather': 'Boloto_battle', 'dead_road_reader': 'Plane', 'chapel_cult': 'Village_battle2',
    'mountain_pass': 'Mountain_battle', 'sealed_basement': 'Tavern_battle4', 'sealed_basement_4': 'Tavern_battle4',
}

def fix_list(enemies):
    used = {}
    out = []
    for e in enemies:
        e = dict(e)
        name = e['name']
        e['arch'] = e.get('classId')
        base = FIXED_ID.get(name) or SLUG.get(name) or re.sub(r'\W+', '_', name)
        n = used.get(base, 0); used[base] = n + 1
        e['id'] = base if n == 0 else f'{base}_{n + 1}'
        if name in SPRITE and e['id'] != SPRITE[name]:
            e['spriteKey'] = SPRITE[name]
        if name not in SPRITE:
            e['art'] = 'TODO_silhouette'
            e['color'] = 0x4a4a52
        if name in SURRENDER:
            e['canSurrender'] = True
            if name != 'Корвин Сухой':
                e['commanderId'] = 'bandit_commander'
        out.append(e)
    return out

battles = json.load(open(SRC))
res = []
for b in battles:
    b = dict(b)
    b['enemies'] = fix_list(b['enemies'])
    if b.get('enemiesBySize'):
        b['enemiesBySize'] = {k: fix_list(v) for k, v in b['enemiesBySize'].items()}
    if b['id'] in BG:
        b['backgroundKey'] = 'battle_' + BG[b['id']]
        b['backgroundPath'] = 'battle/' + BG[b['id']] + '.jpg'
    res.append(b)

# Старый бой эльфийки (на него ссылается maps.json): статы из swamp_guardians, спрайты те же
sg = next(b for b in res if b['id'] == 'swamp_guardians')
elf = dict(sg)
elf['id'] = 'swamp_elf_guardians'
elf['victoryFlag'] = 'swamp_elf_guardians_defeated'
elf['backgroundKey'] = 'battle_bg_swamp'
elf['backgroundPath'] = 'battle_bg_swamp.png'
res.append(elf)

txt = json.dumps(res, ensure_ascii=False, indent=2).replace('—', ',')
open(OUT, 'w').write(txt + '\n')
print(len(res), 'боёв')
