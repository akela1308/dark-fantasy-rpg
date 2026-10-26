// JS-симулятор боя Mortis на настоящих классах игры (Unit, PlayerUnit, EnemyUnit, SkillSystem,
// CombatRules, ClassProgression, EnemyArchetypes). Гоняет те же встречи, что balance/sim.py
// (список CHAPTER1 из balance/model.py), с той же эвристикой игрока.
// Запуск: node test/battle_sim.mjs [боёв_на_строку]
import './_json_hook.mjs';

const { PlayerUnit } = await import('../src/entities/PlayerUnit.js');
const { EnemyUnit } = await import('../src/entities/EnemyUnit.js');
const { SkillSystem } = await import('../src/systems/SkillSystem.js');
const { reachableTargets, effectiveSpeed, isActive, hasFury, shouldSurrender } = await import('../src/systems/CombatRules.js');
const { statsAtLevel } = await import('../src/systems/ClassProgression.js');
const { makeEncounter, pyRound } = await import('../src/systems/EnemyArchetypes.js');
const fs = await import('node:fs');
const skillsData = JSON.parse(fs.readFileSync(new URL('../src/data/skills.json', import.meta.url), 'utf8'));
const unitsData = JSON.parse(fs.readFileSync(new URL('../src/data/units.json', import.meta.url), 'utf8'));

// ── Встречи главы 1 (balance/model.py, CHAPTER1) ─────────────────────────────
export const CHAPTER1 = [
  ['road_looters', 1, 1, [['blade', false, 'Мародёр'], ['wolf', false, 'Облезлый пёс']], 'minor'],
  ['korvin_gang_1', 2, 1, [['blade', false, 'Куль'], ['watcher', false, 'Тисс']], 'standard'],
  ['korvin_gang_2', 2, 2, [['blade', true, 'Корвин Сухой'], ['blade', false, 'Куль']], 'standard'],
  ['korvin_gang_3', 2, 3, [['blade', true, 'Корвин Сухой'], ['blade', false, 'Куль'], ['watcher', false, 'Тисс']], 'standard'],
  ['korvin_gang_4', 2, 4, [['blade', true, 'Корвин Сухой'], ['blade', false, 'Куль'], ['watcher', false, 'Тисс'], ['blade', false, 'Головорез']], 'standard'],
  ['swamp_guardians', 3, 3, [['warden', false, 'Болотный Рыцарь'], ['brute', false, 'Кикимора'], ['watcher', false, 'Болотная Эльфийка']], 'hard'],
  ['swamp_lights', 4, 3, [['wolf', false, 'Болотная тварь'], ['wolf', false, 'Болотная тварь'], ['wolf', false, 'Болотная тварь']], 'minor'],
  ['forest_grandfather', 4, 3, [['brute', true, 'Лесной Дед'], ['wolf', false, 'Болотная тварь'], ['wolf', false, 'Болотная тварь']], 'hard'],
  ['dead_road_reader', 4, 3, [['whisperer', true, 'Висельный чтец', true], ['blade', false, 'Висельник'], ['blade', false, 'Висельник']], 'hard'],
  ['altar_shadows', 4, 3, [['blade', false, 'Тень'], ['blade', false, 'Тень'], ['whisperer', false, 'Голос камня']], 'standard'],
  ['korvin_revenge', 4, 3, [['blade', true, 'Корвин Сухой'], ['blade', false, 'Головорез'], ['watcher', false, 'Стрелок']], 'hard'],
  ['chapel_cult', 5, 3, [['warden', false, 'Хранитель свечей'], ['whisperer', false, 'Чтец'], ['blade', false, 'Послушник'], ['blade', false, 'Послушник']], 'hard'],
  ['mountain_pass', 5, 3, [['warden', false, 'Латник'], ['blade', false, 'Латник-мечник', true], ['watcher', false, 'Арбалетчик']], 'hard'],
  ['sealed_basement', 6, 3, [['brute', true, 'Забытый Страж'], ['whisperer', false, 'Эхо имени'], ['whisperer', false, 'Эхо имени']], 'boss'],
  ['sealed_basement_4', 6, 4, [['brute', true, 'Забытый Страж'], ['whisperer', false, 'Эхо имени'], ['whisperer', false, 'Эхо имени'], ['watcher', false, 'Эхо имени']], 'boss'],
];

// Следопыт (класс расширения) нужен четвёртым в партии, как в модели
const TRACKER = { base: { hp: 62, dmin: 10, dmax: 15, speed: 7, armor: 8, accuracy: 85 }, growth: { hp: 6, dmin: 1, dmax: 1, armor: 1, accuracy: 1 }, speedAt: [3, 7, 11] };
const CLASS_UNIT = { fallen_duelist: 'hero_duelist', brawler: 'companion_brawler', healer: 'companion_healer' };
const ROW = { fallen_duelist: 0, brawler: 0, healer: 1, tracker: 1 };

function playerData(classId, level, perks = level - 1) {
  let s;
  let tmpl;
  if (classId === 'tracker') {
    const b = TRACKER.base, g = TRACKER.growth, n = level - 1;
    s = { hp: b.hp + g.hp * n, dmin: pyRound(b.dmin + g.dmin * n), dmax: pyRound(b.dmax + g.dmax * n),
      speed: b.speed + TRACKER.speedAt.filter(L => L <= level).length, armor: Math.min(60, b.armor + g.armor * n),
      accuracy: Math.min(95, b.accuracy + g.accuracy * n) };
    tmpl = { id: 'tracker', name: 'Следопыт', classId: 'tracker', type: 'player', skills: [], resources: {}, lifesteal: 0, regen: 0, ranged: true };
  } else {
    s = statsAtLevel(classId, level);
    tmpl = JSON.parse(JSON.stringify(unitsData.find(u => u.id === CLASS_UNIT[classId])));
  }
  const hp = pyRound(s.hp * (1 + 0.025 * perks));
  const d = { ...tmpl, hp, maxHp: hp, damage: { min: pyRound(s.dmin * (1 + 0.02 * perks)), max: pyRound(s.dmax * (1 + 0.02 * perks)) },
    speed: s.speed, armor: s.armor, accuracy: s.accuracy, position: { row: ROW[classId], col: 0 } };
  if (classId === 'healer') d.resources = { ...d.resources, supplies: s.supplies };
  return d;
}

/** Партия как в model.party(): ранги «Своей дороги» у одиночки и двойки, раскладка по рядам. */
export function buildPartyData(level, size) {
  const classes = size === 4 ? ['fallen_duelist', 'brawler', 'healer', 'tracker'] : ['fallen_duelist', 'brawler', 'healer'].slice(0, size);
  const P = classes.map(c => playerData(c, level));
  let solo = level >= 2 ? { 1: 2, 2: 1, 3: 0, 4: 0 }[size] : 0;
  if (level < 5 && size === 1) solo = 1;   // как в model.party(): условие стоит вне проверки уровня
  if (solo) {
    const h = P[0]; const k = 1 + 0.12 * solo;
    h.hp = pyRound(h.hp * k); h.maxHp = h.hp;
    h.damage = { min: pyRound(h.damage.min * k), max: pyRound(h.damage.max * k) };
  }
  const cols = { 0: 0, 1: 0 };
  P.forEach(u => { const r = u.position.row; u.position.col = [0, 2, 1][cols[r]]; cols[r]++; });
  return P.map((d, i) => ({ ...d, _level: level }));
}

// ── Эвристика игрока (balance/sim.py, player_act) ────────────────────────────
function playerAct(u, allies, enemies, ss, smart) {
  const targets = reachableTargets(u, enemies);
  if (!targets.length) return;
  const alive = allies.filter(a => a.isAlive);
  const low = alive.reduce((a, b) => (b.hp / b.maxHp < a.hp / a.maxHp ? b : a));
  const has = id => u.skills.includes(id);
  if (smart && has('bandage') && ss.canUse('bandage', u) && low.hp / low.maxHp < 0.55) { ss.use('bandage', u, low); return; }
  if (smart && has('shield_cover') && ss.canUse('shield_cover', u) && low !== u && low.hp / low.maxHp < 0.4) { ss.use('shield_cover', u, low); return; }
  const tgt = targets.reduce((a, b) => (b.hp < a.hp ? b : a));
  if (smart && has('pistol_shot') && ss.canUse('pistol_shot', u)) {
    const any = enemies.filter(isActive).reduce((a, b) => (b.hp < a.hp ? b : a));
    ss.use('pistol_shot', u, any); return;
  }
  if (smart && has('heavy_strike') && ss.canUse('heavy_strike', u)) { ss.use('heavy_strike', u, tgt); return; }
  if (smart && has('rapier_strike') && ss.canUse('rapier_strike', u)) { ss.use('rapier_strike', u, tgt); return; }
  if (smart && has('dueling_stance') && ss.canUse('dueling_stance', u) && u.hp / u.maxHp < 0.35) { ss.use('dueling_stance', u, u); return; }
  u.attack(tgt, { basic: true });
}

/** Детерминированный генератор (mulberry32) вместо Math.random: тесты не мигают. */
export function seedRandom(seed = 12345) {
  let t = seed >>> 0;
  Math.random = () => {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const SS = new SkillSystem();
SS.registerAll(skillsData);

export function runBattle(playersD, enemiesD, { smart = true, surrender = false, maxRounds = 40 } = {}) {
  const P = playersD.map(d => { const u = new PlayerUnit(JSON.parse(JSON.stringify(d))); u.level = d._level || 1; return u; });
  const E = enemiesD.map(d => new EnemyUnit(JSON.parse(JSON.stringify(d))));
  P.forEach(u => { u._allies = P; u._foes = E; u.prepareForBattle(unitsData.find(x => x.id === u.id)?.resources || {}); });
  E.forEach(u => { u._allies = E; u._foes = P; });
  const over = () => !E.some(isActive) || !P.some(u => u.isAlive);
  let rounds = 0;
  while (rounds < maxRounds) {
    rounds++;
    const order = [...P, ...E].sort((a, b) => effectiveSpeed(b) - effectiveSpeed(a));
    for (const u of order) {
      if (!isActive(u)) continue;
      if (u.type === 'player') {
        playerAct(u, P, E, SS, smart);
        if (u._extraAction && !over()) { u._extraAction = false; playerAct(u, P, E, SS, smart); }
      } else {
        u.decideAction(P, SS, null, E);
        if (u.skills.includes('boss_fury') && hasFury(u) && P.some(p => p.isAlive)) u.decideAction(P, SS, null, E);
      }
      u.endTurn();
      if (surrender) E.forEach(e => { if (shouldSurrender(e, E)) e.surrendered = true; });
      if (over()) break;
    }
    if (over()) break;
  }
  const win = P.some(u => u.isAlive) && !E.some(isActive);
  const hpLost = P.reduce((s, u) => s + (u.maxHp - u.hp), 0) / P.reduce((s, u) => s + u.maxHp, 0);
  const deaths = P.filter(u => !u.isAlive).length;
  return { win, rounds, hpLost, deaths };
}

export function simulate(id, n = 2000, opts = {}) {
  const row = CHAPTER1.find(r => r[0] === id);
  const [, level, size, spec] = row;
  const P = buildPartyData(level, size);
  const E = makeEncounter(level, spec);
  let wins = 0, rounds = 0, allyDown = 0;
  for (let i = 0; i < n; i++) {
    const r = runBattle(P, E, opts);
    if (r.win) { wins++; if (r.deaths > 0) allyDown++; }
    rounds += r.rounds;
  }
  return { id, win: (100 * wins) / n, rounds: rounds / n, allyDown: wins ? (100 * allyDown) / wins : 100 };
}

// Таблица 01_БАЛАНС, раздел 7: победа умно / только атака
export const EXPECTED = {
  road_looters: [97, 84], korvin_gang_1: [69, 11], korvin_gang_2: [93, 73], korvin_gang_3: [95, 44],
  korvin_gang_4: [96, 72], swamp_guardians: [96, 23], swamp_lights: [100, 100], forest_grandfather: [78, 3],
  dead_road_reader: [90, 9], altar_shadows: [99, 56], korvin_revenge: [87, 16], chapel_cult: [70, 2],
  mountain_pass: [79, 7], sealed_basement: [79, 0], sealed_basement_4: [87, 8],
};

const { pathToFileURL } = await import('node:url');
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const n = Number(process.argv[2]) || 2000;
  console.log('id                    умно  (табл)   атака (табл)  раунды');
  for (const [id] of CHAPTER1) {
    const a = simulate(id, n, { smart: true });
    const b = simulate(id, Math.round(n / 2), { smart: false });
    const [ea, eb] = EXPECTED[id];
    console.log(`${id.padEnd(20)} ${a.win.toFixed(1).padStart(6)} (${ea})  ${b.win.toFixed(1).padStart(6)} (${eb})   ${a.rounds.toFixed(1)}`);
  }
}
