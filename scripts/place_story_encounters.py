"""Сюжетные встречи главы 1 на картах (поле encounters в maps.json). Идемпотентно.
Запуск: python3 scripts/place_story_encounters.py"""
import json, os
P = os.path.join(os.path.dirname(__file__), '..', 'src', 'data', 'maps.json')
maps = json.load(open(P))

def center(m, fx=0.5, fy=0.45):
    z = max(m.get('walk') or [{'x': 600, 'y': 450, 'w': 400, 'h': 300}], key=lambda z: z['w'] * z['h'])
    return round(z['x'] + z['w'] * fx), round(z['y'] + z['h'] * fy)

STORY = {
    'forest_camp': dict(id='korvin_revenge', battleId='korvin_revenge', name='Корвин Сухой', behaviour='pack', radius=170,
                        preDialogue='korvin', preNode='revenge',
                        showIf={'any': [{'flag': 'korvin_humiliated'}, {'flag': 'korvin_debt_overdue'}], 'notFlag': ['korvin_revenge_done', 'bandit_commander_killed']}),
    'swamp_map': dict(id='swamp_lights', battleId='swamp_lights', name='Огни на воде', behaviour='loner', dialogue='swamp', dialogueStart='lights',
                      showIf={'notFlag': ['lights_not_counted', 'swamp_lights_defeated']}),
    'swamp_obelisk': dict(id='forest_grandfather', battleId='forest_grandfather', name='Лесной Дед', behaviour='loner',
                          showIf={'notFlag': 'swamp_deal_kept', 'notCompanion': 'ressa'}),
    'forest_altar': dict(id='altar_shadows', battleId='altar_shadows', name='Три камня', behaviour='loner', dialogue='altar'),
    'mountains_map': dict(id='mountain_pass', battleId='mountain_pass', name='Латники клятвы', behaviour='loner',
                          dialogue='mountains', dialogueStart='pass',
                          showIf={'notFlag': ['mountain_pass_peaceful', 'mountain_pass_defeated']}),
    'chapel_inside': dict(id='chapel_cult', battleId='chapel_cult', name='Свет в часовне', behaviour='loner',
                          dialogue='village', dialogueStart='chapel',
                          showIf={'notFlag': ['chapel_peaceful', 'cult_turned', 'chapel_cult_defeated']}),
    'tavern_cellar': dict(id='sealed_basement', battleId='sealed_basement', name='Дверь со знаком', behaviour='loner',
                          dialogue='cellar', showIf={'notFlag': ['basement_cleared', 'basement_left_closed']}),
}
for mid, enc in STORY.items():
    m = maps[mid]
    x, y = center(m, 0.55)
    enc = dict(enc, x=x, y=y)
    m['encounters'] = [e for e in m.get('encounters', []) if e['id'] != enc['id']] + [enc]

# Люк в подвал открывается ключом Савко (06_КВЕСТЫ 6.1)
for ex in maps['tavern_map']['exits']:
    if ex['toMap'] == 'tavern_cellar':
        ex['requiresFlag'] = 'cellar_open'
        ex['lockedText'] = 'Люк заперт. Ключ у Савко.'

# Деревня: стражник-беглец у врат, староста Рыж в доме, состояние ворот по Корвину (03_ДИАЛОГИ 10)
def put(mid, n):
    m = maps[mid]
    m['npcs'] = [x for x in m.get('npcs', []) if x.get('id') != n['id']] + [n]
put('gate', dict(id='deserter', name='Стражник-беглец', x=420, y=620, spriteKey='map_guard', portraitKey='portrait_guard',
                 height=150, dialogue='village', dialogueStart='deserter', hoverPortrait=True, flipX=True))
maps['gate']['npcs'] = [x for x in maps['gate']['npcs'] if x.get('id') != 'gate_state']
# Сцены при входе на карту: первая подходящая, один раз (флаг once)
maps['gate']['onEnter'] = [dict(dialogue='village', node='gate_state', once='gate_state_seen')]
maps['village']['onEnter'] = [dict(dialogue='village', node='well', once='well_water_omen',
                                   showIf={'companion': 'companion_healer'})]
put('elder_house', dict(id='ryzh', name='Староста Рыж', x=840, y=520, spriteKey='map_ryzh', portraitKey=None, height=150,
                        dialogue='village', dialogueStart='ryzh_alone'))
put('elder_house', dict(id='ryzh_taya', name='Тая и староста', x=980, y=560, spriteKey='map_companion_healer', portraitKey='portrait_companion_healer',
                        height=140, dialogue='village', dialogueStart='ryzh',
                        showIf={'companion': 'companion_healer', 'notFlag': ['well_truth_told', 'swamp_deal_kept', 'village_tribute']}))
for n in maps['village']['npcs']:
    n.pop('dialogue_taya_hint', None)

# Старые NPC переведены на файлы диалогов (реплики v0.1 перенесены туда дословно, поле dialogues оставлено)
CONVERT = {
    ('tavern_inside', 'Мира'): ('mira', None, None),
    ('tavern_inside', 'Рован'): ('rowan', None, {'notFlag': 'rowan_gone'}),
    ('tavern_inside', 'Брамм'): ('dwarves', 'bramm', None),
    ('tavern_inside', 'Орт'): ('dwarves', 'ort', None),
    ('kingthrone', 'Горный Король'): ('mountains', 'king', None),
    ('village', 'Мирко, ополченец'): ('village', 'mirko', {'notFlag': 'mirko_recruited'}),
    ('gate', 'Дозорный'): ('village', 'bran', {'notFlag': 'bran_recruited'}),
}
for (mid, name), (dlg, start, show) in CONVERT.items():
    for n in maps[mid]['npcs']:
        if n.get('name') == name:
            n['dialogue'] = dlg
            if start: n['dialogueStart'] = start
            if show: n['showIf'] = show
put('tavern_inside', dict(id='korvin_men', name='Люди Корвина', x=760, y=690, spriteKey='map_bandit_warrior', portraitKey='portrait_bandit_warrior',
                          height=150, dialogue='dwarves', dialogueStart='korvin_men',
                          showIf={'any': [{'flag': 'bandit_paid'}, {'flag': 'bandit_intimidated'}], 'flag': 'cnt_visits_tavern_inside_3',
                                  'notFlag': ['korvin_men_gone', 'bandit_commander_killed', 'korvin_debt_active']}))
put('tavern_inside', dict(id='halvar', name='Хальвар', x=600, y=760, spriteKey='map_dwarf_beer', portraitKey='portrait_dwarf_beer',
                          height=140, dialogue='dwarves', dialogueStart='halvar',
                          showIf={'any': [{'flag': 'mountain_pass_peaceful'}, {'flag': 'mountain_pass_defeated'}], 'notFlag': 'halvar_message'}))

# Савко говорит из savko.json и уходит из игры при savko_gone (03_ДИАЛОГИ 4, 9)
for n in maps['tavern_map']['npcs']:
    if n.get('name') == 'Савко':
        n['dialogue'] = 'savko'
        n['showIf'] = {'notFlag': 'savko_gone'}

txt = json.dumps(maps, ensure_ascii=False, indent=2)
assert chr(0x2014) not in txt
open(P, 'w').write(txt + '\n')
print('ok')
