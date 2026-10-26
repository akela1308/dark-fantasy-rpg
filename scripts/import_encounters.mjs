// Встречи бестиария: бои в battles.json (составы по архетипам, сверка HP/урона со строкой comp)
// и поле encounters в maps.json с поведением (14_БЕСТИАРИЙ 2, 8). Идемпотентно.
// Запуск: node scripts/import_encounters.mjs
import '../test/_json_hook.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const { makeEnemy, xpForEncounter } = await import('../src/systems/EnemyArchetypes.js');
const REV = path.join(os.homedir(), 'Documents/Claude/Projects/Mortis/РЕВИЗИЯ_2026-10/world/');
const OPT = JSON.parse(fs.readFileSync(REV + 'optional_encounters.json', 'utf8'));
const NEW = JSON.parse(fs.readFileSync(REV + 'new_creature_encounters.json', 'utf8'));
const SPEC = JSON.parse(fs.readFileSync(REV + 'maps_spec.json', 'utf8'));
const BPATH = new URL('../src/data/battles.json', import.meta.url);
const MPATH = new URL('../src/data/maps.json', import.meta.url);
const battles = JSON.parse(fs.readFileSync(BPATH, 'utf8'));
const maps = JSON.parse(fs.readFileSync(MPATH, 'utf8'));

const ARCH = ['blade', 'warden', 'watcher', 'whisperer', 'brute', 'wolf'];
const VARIANTS = [{}, { elite: true }, { boss: true }, { boss: true, elite: true }];
// Подбор архетипа по числам из comp: HP и урон должны совпасть (допуск 2)
function fit(name, hp, dmin, dmax, level) {
  let best = null;
  for (const arch of ARCH) for (const v of VARIANTS) for (const L of [level, level - 1, level + 1]) {
    if (L < 1) continue;
    const e = makeEnemy(arch, L, { name, ...v });
    const d = Math.abs(e.hp - hp) + Math.abs(e.damage.min - dmin) + Math.abs(e.damage.max - dmax);
    if (!best || d < best.d) best = { d, e, arch, v, L };
  }
  return best;
}

const SPRITE = {
  'Одичавший пёс': 'wild_dog', 'Волк': 'grey_wolf', 'Вожак': 'grey_wolf', 'Болотная тварь': 'dog',
  'Утопленник': 'drowned', 'Мавка': 'mavka', 'Кобл': 'kobold', 'Старший кобл': 'kobold',
  'Вепрь Старого Бора': 'boar', 'Дозорный': 'archer_guard', 'Страж': 'guard', 'Клинок': 'bandit_brawler',
  'Человек в плаще': 'assassin', 'Стрелок плащей': 'bandit_archer', 'Гаст': 'assassin',
  'Зимний стрелок': 'winter_archer', 'Зимняя Королева': 'winter_queen', 'Горный Король': 'mountain_king',
  'Оленье чудовище': 'winter_monster', 'Упырь': 'vurdalak', 'Старый упырь': 'vurdalak',
};
const FORGOTTEN = /Тень|Шептун|Эхо|Предел|Мороз/;
const BEHAVIOUR = { 'стая': 'pack', 'логово': 'lair', 'патруль': 'patrol', 'западня': 'trap', 'одиночка': 'loner', 'босс': 'loner' };
const NEW_BEHAVIOUR = { kobolds_mine: 'coward', mavki_lights: 'lair', poludnitsa: 'loner', boar_old_forest: 'loner', leshy: 'loner', likho: 'loner', troll_ugryum: 'loner', wolfolaks: 'pack', moroz: 'loner' };
const NEW_MAP = { kobolds_mine: 'copper_mine', mavki_lights: 'swamp_map', poludnitsa: 'village_fields', boar_old_forest: 'forest_deep', leshy: 'forest_deep', likho: 'gallows_hill', troll_ugryum: 'mountains_map', wolfolaks: 'winter_forest', moroz: 'frozen_lake' };
const BG = { Юг: 'Plane', Дорога: 'Plane', Лес: 'Forest_Battle', Деревня: 'Village_battle1', Болото: 'Boloto_battle', Горы: 'Mountain_battle', Север: 'Winter_Forest' };

const report = [];
function build(o, behaviour) {
  const parts = o.comp.split(',').map(s => s.trim()).map(s => {
    const m = s.match(/^(.*?)\s+(\d+)HP\s+(\d+)-(\d+)$/);
    return { name: m[1], hp: +m[2], dmin: +m[3], dmax: +m[4] };
  });
  const cols = { 0: 0, 1: 0 };
  const used = {};
  const enemies = parts.map(p => {
    const f = fit(p.name, p.hp, p.dmin, p.dmax, o.level);
    const e = { ...f.e, hp: p.hp, maxHp: p.hp, damage: { min: p.dmin, max: p.dmax } };
    if (f.d > 2) report.push(`${o.id}: ${p.name} подобран ${f.arch}${f.v.boss ? ' босс' : ''}${f.v.elite ? ' элита' : ''} L${f.L}, расхождение ${f.d} (HP и урон взяты из comp)`);
    const r = e.ranged ? 1 : 0;
    e.position = { row: r, col: [0, 2, 1][cols[r]++ % 3] };
    const base = (SPRITE[p.name] || f.arch);
    const n = (used[base] = (used[base] || 0) + 1);
    e.id = `${o.id}_${n}`;
    if (SPRITE[p.name]) e.spriteKey = SPRITE[p.name]; else e.art = 'TODO_silhouette';
    if (FORGOTTEN.test(p.name)) e.tags = ['forgotten'];
    if (/Клинок|плаще|Гаст|Дозорный|Страж/.test(p.name)) e.canSurrender = !f.v.boss;
    return e;
  });
  const loc = SPEC.locations.find(l => l.encounter === o.id) || SPEC.locations.find(l => l.id === NEW_MAP[o.id]);
  const b = {
    id: o.id, name: o.name, intendedLevel: o.level, intendedPartySize: o.party, kind: o.kind,
    xpReward: o.xp ?? xpForEncounter(o.level, o.kind), goldLoot: enemies.length * (4 + 2 * o.level),
    victoryFlag: `${o.id}_defeated`, behaviour, enemies,
    backgroundKey: `battle_${BG[loc?.region] || 'Plane'}`, backgroundPath: `battle/${BG[loc?.region] || 'Plane'}.jpg`,
  };
  if (behaviour === 'coward') b.flee = 'half';
  return { b, loc };
}

const added = [];
const all = [...OPT.map(o => ({ o, beh: BEHAVIOUR[o.behaviour] || 'pack' })), ...NEW.map(o => ({ o, beh: NEW_BEHAVIOUR[o.id] || 'pack' }))];
for (const { o, beh } of all) {
  const { b, loc } = build(o, beh);
  const i = battles.findIndex(x => x.id === b.id);
  if (i >= 0) battles[i] = b; else battles.push(b);
  added.push(b.id);
  const mapId = SPEC.locations.find(l => l.encounter === o.id)?.id || NEW_MAP[o.id];
  const m = maps[mapId];
  if (!m) continue;
  const walk = m.walk?.length ? m.walk : null;
  // встреча ставится в середину самой большой зоны ходьбы, чуть в стороне от центра
  const z = walk ? walk.reduce((a, c) => (c.w * c.h > a.w * a.h ? c : a)) : { x: 600, y: 450, w: 400, h: 300 };
  const k = (m.encounters || []).length;
  const enc = {
    id: o.id, battleId: o.id, name: o.name.split(':').pop().replace(/\(.*\)/, '').trim(), behaviour: beh,
    x: Math.round(z.x + z.w * (0.62 + 0.12 * k)), y: Math.round(z.y + z.h * 0.45),
  };
  if (beh === 'patrol') enc.waypoints = [{ x: Math.round(z.x + z.w * 0.25), y: enc.y }, { x: Math.round(z.x + z.w * 0.8), y: enc.y }], enc.period = 14000;
  if (beh === 'lair') enc.triggerFlag = `${o.id}_woken`;
  if (beh === 'trap') enc.spotters = { companion: ['holt', 'tiss_recruit', 'bran'], trait: 'secret_literacy' };
  m.encounters = [...(m.encounters || []).filter(e => e.id !== enc.id), enc];
}

// Драка в таверне (03_ДИАЛОГИ 7.6): два Клинка уровня 2
const brawl = {
  id: 'tavern_brawl', name: 'Таверна: люди Корвина', intendedLevel: 2, intendedPartySize: 3, kind: 'minor',
  xpReward: xpForEncounter(3, 'minor'), goldLoot: 2 * (4 + 2 * 2), victoryFlag: 'tavern_brawl_done',
  backgroundKey: 'battle_Tavern_battle', backgroundPath: 'battle/Tavern_battle.jpg',
  enemies: [
    { ...makeEnemy('blade', 2, { name: 'Человек Корвина', pos: [0, 0] }), id: 'brawl_1', spriteKey: 'bandit_brawler', canSurrender: true },
    { ...makeEnemy('blade', 2, { name: 'Человек Корвина', pos: [0, 2] }), id: 'brawl_2', spriteKey: 'bandit_brawler', canSurrender: true },
  ],
};
const bi = battles.findIndex(x => x.id === 'tavern_brawl');
if (bi >= 0) battles[bi] = brawl; else battles.push(brawl);

// Боевые фоны карт (09_МИР 8): поле battleBg
const BG_BY_MAP = {
  south_post: 'Plane', map1: 'Plane', dead_road: 'Plane', three_pillars: 'Forest_Road', tavern_map: 'Forest_Road',
  tavern_inside: 'Tavern_battle', three_pillars_inside: 'Tavern_battle2', tavern_rooms: 'Tavern_battle3', tavern_cellar: 'Tavern_battle4',
  forest1: 'Forest_Battle', forest_altar: 'Forest_Battle', road_boloto: 'Boloto_battle1', elf_boloto1: 'Boloto_battle1',
  swamp_map: 'Boloto_battle', elf_boloto: 'Boloto_battle', road_to_village: 'Grad_battle', gate: 'Grad_battle',
  village: 'Village_battle1', chapel_inside: 'Village_battle2', village_fields: 'Village_battle3', mountains_map: 'Mountain_battle',
  kingthrone: 'KingThrone_battle', dwarf_hall: 'KingThrone_battle2', winter_forest: 'Winter_Forest',
  winter_grad_gate: 'Winter_Grad', grad_square: 'Winter_Grad', north_road: 'Winter_Grad', old_outpost: 'Winter_Grad',
};
const REGION_BG = { Юг: 'Plane', Дорога: 'Plane', Лес: 'Forest_Battle', Деревня: 'Village_battle1', Болото: 'Boloto_battle', Горы: 'Mountain_battle', Север: 'Winter_Forest' };
for (const [id, m] of Object.entries(maps)) {
  const reg = m.region || SPEC.locations.find(l => l.id === id)?.region;
  m.battleBg = BG_BY_MAP[id] || REGION_BG[reg] || 'Plane';
}

const bt = JSON.stringify(battles, null, 2);
const mt = JSON.stringify(maps, null, 2);
if (bt.includes(String.fromCharCode(0x2014)) || mt.includes(String.fromCharCode(0x2014))) throw new Error('длинное тире');
fs.writeFileSync(BPATH, bt + '\n');
fs.writeFileSync(MPATH, mt + '\n');
console.log(`боёв встреч: ${added.length}, всего боёв ${battles.length}`);
report.forEach(r => console.log('  ', r));
