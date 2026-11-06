import './_json_hook.mjs';
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
const { PlayerUnit } = await import('../src/entities/PlayerUnit.js');
const { EnemyUnit } = await import('../src/entities/EnemyUnit.js');
const { SkillSystem } = await import('../src/systems/SkillSystem.js');
const { TurnManager } = await import('../src/systems/TurnManager.js');
const { effectiveSpeed } = await import('../src/systems/CombatRules.js');
const CP = await import('../src/systems/ClassProgression.js');
const eventBus = (await import('../src/utils/eventBus.js')).default;
const units = (await import('../src/data/units.json')).default;
const skills = (await import('../src/data/skills.json')).default;
const classes = (await import('../src/data/classes.json')).default;

const realRandom = Math.random;
beforeEach(() => { Math.random = () => 0.5; });   // попадание без крита
afterEach(() => { Math.random = realRandom; });

const ss = new SkillSystem(); ss.registerAll(skills);
function hero(id, { level = 1, passives = [], skills: sk = [], res = {} } = {}) {
  const u = new PlayerUnit(structuredClone(units.find(x => x.id === id)));
  u._allies = [u]; u._foes = [];
  u.prepareForBattle(units.find(x => x.id === id).resources || {});
  u.level = level; u.passives.push(...passives); u.skills.push(...sk);
  Object.assign(u.resources, res);
  u.accuracy = 95;
  return u;
}
function foe(id = 'foe', { hp = 500, row = 0, col = 0, speed = 1, armor = 0, ranged = false, dmg = 10 } = {}) {
  return new EnemyUnit({ id, name: id, type: 'enemy', hp, maxHp: hp, damage: { min: dmg, max: dmg }, speed, armor, accuracy: 95, ranged, position: { row, col } });
}
function side(players, enemies) {
  players.forEach(u => { u._allies = players; u._foes = enemies; });
  enemies.forEach(u => { u._allies = enemies; u._foes = players; });
}
const lost = u => u.maxHp - u.hp;

// ─── Данные ─────────────────────────────────────────────────────────────────

test('у всех пяти классов нет отключённых узлов, levelPlan 2-12, навыки существуют', () => {
  const ids = new Set(skills.map(s => s.id));
  for (const c of classes) {
    assert.equal(c.branches.length, 2, c.id);
    for (let L = 2; L <= 12; L++) {
      const plan = c.levelPlan[String(L)];
      assert.ok(Array.isArray(plan), `${c.id} ${L}`);
      for (const n of plan) {
        if (typeof n !== 'object') continue;
        assert.equal(n.implemented, undefined, n.key);
        if (n.type === 'skill') assert.ok(ids.has(n.skillId), n.skillId);
        assert.ok(!/—/.test(n.desc), n.key);
      }
    }
    for (const b of c.branches) {
      if (b.firstNode.skillId) assert.ok(ids.has(b.firstNode.skillId), b.id);
      for (const L of [5, 8, 10, 12]) assert.ok(c.levelPlan[L].some(n => n.branchId === b.id), `${b.id} ${L}`);
    }
  }
  assert.ok(!skills.some(s => /—/.test(s.description)));
});

test('у Следопыта и Запрета прокачка 2-12 проходит по обеим веткам', () => {
  for (const [id, branch, want] of [
    ['holt', 'swamp_grip', ['venom_bolt', 'snare_trap', 'black_mire']],
    ['bran', 'royal_drill', ['spotter_mark', 'ordered_volley', 'overwatch', 'royal_volley']],
    ['ressa', 'blood_pact', ['blood_loan', 'bad_blood', 'final_pact']],
    ['ressa', 'black_litany', ['guilt_brand', 'black_chant', 'unspoken_name']],
  ]) {
    const u = hero(id);
    for (let L = 2; L <= 12; L++) {
      CP.applyLevelGrowth(u, L); u.level = L;
      CP.getAutoNodes(u, L).forEach(n => CP.applyProgressionChoice(u, n));
      const ch = CP.getClassProgressionChoices(u, L);
      if (ch) CP.applyProgressionChoice(u, ch.find(c => c.branchId === branch) || ch[0]);
    }
    assert.equal(u.branchId, branch);
    want.forEach(s => assert.ok(u.skills.includes(s), s));
  }
});

// ─── Дуэлянт ────────────────────────────────────────────────────────────────

test('Парирование: только при Темпе 2+, только ближний удар, открывает ответный выпад', () => {
  const d = hero('hero_duelist', { passives: ['parry', 'riposte'], res: { tempo: 2 } });
  const e = foe(); side([d], [e]);
  Math.random = () => 0.1;
  e.attack(d, {}); assert.equal(lost(d), 0); assert.ok(e.hp < e.maxHp, 'ответный выпад');
  d.resources.tempo = 1; e.attack(d, {}); assert.ok(lost(d) > 0);
  const hp = d.hp; d.resources.tempo = 2; e.ranged = true; e.attack(d, {}); assert.ok(d.hp < hp);
  e.ranged = false; d.hp = d.maxHp; Math.random = () => 0.5; e.attack(d, {}); assert.ok(lost(d) > 0, 'шанс 20%');
});

test('Дымная завеса: минус 15 к точности по герою до конца раунда', () => {
  const d = hero('hero_duelist', { passives: ['smoke_screen'], res: { tempo: 1 } });
  const e = foe('e', { speed: d.speed }); e.accuracy = 80; side([d], [e]);
  const tm = new TurnManager(); tm.init([d, e]);
  Math.random = () => 0.7;
  ss.use('pistol_shot', d, e);
  e.attack(d, {}); assert.equal(lost(d), 0, 'точность 65 при броске 70');
  tm._startNextRound(); e.attack(d, {}); assert.ok(lost(d) > 0, 'дым рассеялся');
});

test('Честь дороги: союзники +1 инициативы, пока герой стоит, сам герой без бонуса', () => {
  const d = hero('hero_duelist', { passives: ['road_honor'] }), b = hero('companion_brawler');
  side([d, b], [foe()]);
  assert.equal(effectiveSpeed(b), b.speed + 1); assert.equal(effectiveSpeed(d), d.speed);
  d.isAlive = false; assert.equal(effectiveSpeed(b), b.speed);
});

test('Грязная дистанция: третий заряд по узлу и слабость от выстрела', () => {
  const d = hero('hero_duelist', { level: 10 }); const e = foe(); side([d], [e]);
  d.branchId = 'last_argument';
  CP.getAutoNodes(d, 10).forEach(n => CP.applyProgressionChoice(d, n));
  CP.getAutoNodes(d, 10).forEach(n => CP.applyProgressionChoice(d, n));
  d.prepareForBattle({ tempo: 0, pistol_charges: 2 });
  assert.equal(d.resources.pistol_charges, 3, 'второй вызов не добавляет заряд');
  d.resources.tempo = 1; ss.use('pistol_shot', d, e); assert.ok(e.hasEffect('weakened'));
});

test('Два ствола: два выстрела, цена, раз в бой, второй уходит в живого', () => {
  const d = hero('hero_duelist', { level: 12, skills: ['two_barrels'], passives: ['point_blank'], res: { tempo: 3, pistol_charges: 3 } });
  const e1 = foe('a', { hp: 10 }), e2 = foe('b', { col: 1 }); side([d], [e1, e2]);
  assert.equal(ss.unavailableReason('two_barrels', d), null);
  assert.equal(ss.use('two_barrels', d, e1), true);
  assert.equal(e1.isAlive, false); assert.ok(e2.hp < e2.maxHp); assert.ok(e2.hasEffect('staggered'));
  assert.deepEqual([d.resources.tempo, d.resources.pistol_charges], [1, 1]);
  assert.equal(ss.canUse('two_barrels', d), false);
  const solo = hero('hero_duelist', { skills: ['two_barrels'], res: { tempo: 2, pistol_charges: 1 } });
  assert.match(ss.unavailableReason('two_barrels', solo), /Пистоль 2/);
});

test('Последний барьер: раз в бой ниже 30%, отбивает ближние до конца раунда', () => {
  const d = hero('hero_duelist', { passives: ['last_barrier'] }); const e = foe(), a = foe('a', { ranged: true }); side([d], [e, a]);
  const tm = new TurnManager(); tm.init([d, e, a]);
  d.takeDamage(Math.ceil(d.maxHp * 0.75), { ignoreArmor: 1 });
  assert.ok(d.hasEffect('last_barrier'));
  const hp = d.hp; e.attack(d, {}); assert.equal(d.hp, hp);
  a.attack(d, {}); assert.ok(d.hp < hp, 'дальние проходят');
  tm._startNextRound(); assert.equal(d.hasEffect('last_barrier'), false);
  d.takeDamage(1, { ignoreArmor: 1 }); assert.equal(d.hasEffect('last_barrier'), false, 'раз в бой');
});

// ─── Боец ───────────────────────────────────────────────────────────────────

test('Глухая стойка: без атаки, снижение на 2 хода, +2 Мощи', () => {
  const b = hero('companion_brawler', { skills: ['deaf_stance'] }); side([b], [foe()]);
  ss.use('deaf_stance', b, b); assert.equal(b.resources.might, 2);
  b.endTurn(); assert.ok(b.hasEffect('guarded'));
  b.endTurn(); assert.ok(b.hasEffect('guarded')); b.endTurn(); assert.equal(b.hasEffect('guarded'), false);
});

test('Размах: цель и более раненый сосед по ряду, задний ряд и дальние не задеты', () => {
  const b = hero('companion_brawler', { skills: ['sweep'], res: { might: 2 } });
  const mid = foe('m', { col: 1 }), l = foe('l', { col: 0, hp: 100 }), r = foe('r', { col: 2 }), back = foe('z', { row: 1, col: 1 });
  side([b], [mid, l, r, back]);
  ss.use('sweep', b, mid);
  assert.ok(lost(mid) > 0 && lost(l) > 0); assert.equal(lost(r), 0); assert.equal(lost(back), 0);
  assert.equal(b.resources.might, 0);
  const base = hero('companion_brawler'); side([base], [mid]);
  assert.equal(ss.canUse('sweep', b), false, 'нужно 2 Мощи');
});

test('Неотступный: нет шатания и слабости, в лог не идёт ложное «ослаблен»', () => {
  const b = hero('companion_brawler', { passives: ['unyielding'] }), e = foe();
  const log = []; const off = m => log.push(m); eventBus.on('log', off);
  ss._status(b, { type: 'staggered', duration: 99, label: 'шатается' }, e);
  ss._status(b, { type: 'weakened', value: 0.75, duration: 2, label: 'слабость' }, e);
  eventBus.off?.('log', off);
  assert.equal(b.effects.length, 0); assert.ok(log.every(m => !/шатается|слабость/.test(m)));
});

test('Жажда: +1 Мощь за убитую цель, Костолом убивает ниже 25%, иначе бьёт обычно', () => {
  const b = hero('companion_brawler', { level: 12, passives: ['thirst'], skills: ['bonebreaker_finisher'], res: { might: 3 } });
  b.resourceMax = { might: 4 };
  const low = foe('l', { hp: 400 }); low.hp = 99; side([b], [low]);
  ss.use('bonebreaker_finisher', b, low);
  assert.equal(low.isAlive, false); assert.equal(low.hp, 0); assert.equal(b.resources.might, 1, '3 потрачено, 1 за цель');
  assert.equal(ss.canUse('bonebreaker_finisher', b), false, 'откат и Мощь');
  const full = foe('f', { hp: 400 }); b.cooldowns = {}; b.resources.might = 3; side([b], [full]);
  ss.use('bonebreaker_finisher', b, full);
  assert.ok(full.isAlive && full.hp < 400 && full.hp > 300);
  const dodgy = foe('d', { hp: 400 }); dodgy.hp = 50; b.cooldowns = {}; b.resources.might = 3; b.accuracy = 40; dodgy.speed = 50; side([b], [dodgy]);
  Math.random = () => 0.99; ss.use('bonebreaker_finisher', b, dodgy);
  assert.equal(dodgy.hp, 50, 'промах не убивает');
});

test('Последний заслон: урон по союзникам идёт в Бойца вполсилы до его хода, раз в бой', () => {
  const b = hero('companion_brawler', { skills: ['last_bulwark'] }), h = hero('companion_healer');
  b.armor = 0; const e = foe(); side([b, h], [e]);
  ss.use('last_bulwark', b, b); b.endTurn();
  h.takeDamage(20); assert.equal(h.hp, h.maxHp); assert.equal(lost(b), 10);
  b.endTurn(); b.hp = b.maxHp; h.takeDamage(20); assert.ok(h.hp < h.maxHp, 'заслон снят своим ходом');
  assert.equal(ss.canUse('last_bulwark', b), false);
  ss.registerAll(skills);
});

// ─── Знахарка ───────────────────────────────────────────────────────────────

test('Пиявочный отклик: союзник ниже 30% лечится, раз в раунд, на себя не работает', () => {
  const h = hero('companion_healer', { level: 8, passives: ['leech_response'] }), b = hero('companion_brawler'); b.armor = 0;
  side([b, h], [foe()]);
  b.takeDamage(b.maxHp - 10); assert.equal(b.hp, 28);
  b.takeDamage(5); assert.equal(b.hp, 23, 'раз в раунд');
  b.onRoundStart(); h.onRoundStart(); b.takeDamage(1); assert.equal(b.hp, 40);
  h.armor = 0; h.onRoundStart(); h.takeDamage(h.maxHp - 2); assert.equal(h.hp, 2);
});

test('Горькая цена: Перевязка без Сборов, но 5 HP, от неё не умирают', () => {
  const h = hero('companion_healer', { passives: ['bitter_price'], res: { supplies: 0 } }), b = hero('companion_brawler');
  b.hp = 10; side([b, h], []);
  assert.equal(ss.unavailableReason('bandage', h), null);
  ss.use('bandage', h, b);
  assert.equal(h.resources.supplies, 0); assert.equal(lost(h), 5); assert.equal(b.hp, 28);
  h.hp = 3; h.cooldowns = {}; ss.use('bandage', h, b); assert.equal(h.hp, 1); assert.ok(h.isAlive);
});

test('Чистые руки: в конце хода союзника снимается один статус, Порча +15% по ослабленному', () => {
  const h = hero('companion_healer', { passives: ['clean_hands', 'rot'] }), b = hero('companion_brawler'), e = foe();
  side([b, h], [e]);
  ss._status(b, { type: 'weakened', value: 0.75, duration: 9 }, e);
  ss._status(b, { type: 'marked', value: 1.25, duration: 9 }, e);
  b.endTurn(); assert.equal(b.effects.length, 1); b.endTurn(); assert.equal(b.effects.length, 0);
  e.takeDamage(100); assert.equal(lost(e), 100);
  ss._status(e, { type: 'weakened', value: 0.75, duration: 2 }, h); e.hp = e.maxHp;
  e.takeDamage(100); assert.equal(lost(e), 115);
  h.isAlive = false; e.hp = e.maxHp; e.takeDamage(100); assert.equal(lost(e), 100, 'Знахарка пала');
});

test('Последняя настойка: поднимает последнего упавшего с 40%, он снова в очереди', () => {
  const h = hero('companion_healer', { skills: ['last_tincture'] }), a = hero('hero_duelist'), b = hero('companion_brawler'), e = foe();
  side([a, b, h], [e]);
  assert.equal(ss.unavailableReason('last_tincture', h), 'некого поднимать');
  assert.equal(ss.use('last_tincture', h, h), false); assert.equal(ss.canUse('last_tincture', h), false);
  a.takeDamage(9999, { ignoreArmor: 1 });
  ss._status(b, { type: 'armor_broken', value: 5, duration: 9 }, e); const arm = b.armor + 5;
  b.takeDamage(9999, { ignoreArmor: 1 });
  let revived = null; const on = u => { revived = u; }; eventBus.on('unit_revived', on);
  assert.equal(ss.use('last_tincture', h, h), true);
  assert.equal(revived, b); assert.equal(b.isAlive, true); assert.equal(b.hp, Math.round(b.maxHp * 0.4));
  assert.equal(b.armor, arm); assert.equal(b.effects.length, 0); assert.equal(a.isAlive, false);
  assert.equal(ss.canUse('last_tincture', h), false, 'раз в бой');
});

test('Дурман на всех: слабость на всех живых и не сдавшихся', () => {
  const h = hero('companion_healer', { skills: ['dope_all'] }), e1 = foe('a'), e2 = foe('b'), dead = foe('c'), gave = foe('d');
  dead.isAlive = false; gave.surrendered = true; side([h], [e1, e2, dead, gave]);
  ss.use('dope_all', h, h);
  assert.ok(e1.hasEffect('weakened') && e2.hasEffect('weakened'));
  assert.equal(dead.effects.length + gave.effects.length, 0);
});

// ─── Следопыт ───────────────────────────────────────────────────────────────

test('Сосредоточение копится ударом, Яд на жале тикает мимо брони и не складывается', () => {
  const t = hero('holt', { level: 5, skills: ['venom_bolt'] }), e = foe('e', { armor: 40 }); side([t], [e]);
  assert.equal(t.resources.focus, 0);
  assert.equal(ss.canUse('venom_bolt', t), false);
  t.attack(e, { basic: true }); assert.equal(t.resources.focus, 1);
  ss.use('venom_bolt', t, e); assert.equal(t.resources.focus, 0);
  const hp = e.hp; e.endTurn(); assert.equal(hp - e.hp, 7);
  ss._status(e, { type: 'poison', value: 2, valuePerLevel: 1, duration: 3 }, t);
  assert.equal(e.effects.filter(x => x.type === 'poison').length, 1);
  e.endTurn(); e.endTurn(); e.endTurn(); assert.equal(e.hasEffect('poison'), false); assert.equal(hp - e.hp, 28);
  e.endTurn(); assert.equal(hp - e.hp, 28);
});

test('Яд убивает в конце хода, очередь идёт дальше, Гнилая кровь уходит к соседу', () => {
  const t = hero('holt', { level: 5, passives: ['rotten_blood'] });
  const e = foe('e', { hp: 5, col: 0 }), near = foe('n', { col: 1 }), far = foe('f', { col: 2 }); side([t], [e, near, far]);
  ss._status(e, { type: 'poison', value: 2, valuePerLevel: 1, duration: 3 }, t);
  const tm = new TurnManager(); tm.init([e, near, far, t]); tm.active = e; tm.index = 0; tm.queue = [e, near, far, t];
  tm.nextTurn();
  assert.equal(e.isAlive, false); assert.equal(tm.active, near);
  assert.ok(near.hasEffect('poison')); assert.equal(far.hasEffect('poison'), false);
  assert.equal(near.getEffect('poison').duration, 2);
});

test('Силок: ближний удар ловит обидчика, дальний проходит мимо', () => {
  const t = hero('holt', { skills: ['snare_trap'], res: { focus: 2 } }), b = hero('companion_brawler');
  const e = foe('e'), a = foe('a', { ranged: true }); side([b, t], [e, a]);
  ss.use('snare_trap', t, b);
  a.attack(b, {}); assert.ok(b.hasEffect('trap')); assert.equal(a.hasEffect('rooted'), false);
  e.attack(b, {}); assert.equal(b.hasEffect('trap'), false);
  assert.ok(e.hasEffect('rooted') && e.hasEffect('staggered'));
  assert.equal(effectiveSpeed(e), e.speed - 4);
});

test('Кормилец топи: +1 по отравленной, -15% по чистой', () => {
  const t = hero('holt', { passives: ['mire_feeder'] }); t.damage = { min: 100, max: 100 };
  const e = foe('e'); side([t], [e]);
  t.attack(e, { }); assert.equal(lost(e), 85); assert.equal(t.resources.focus, 0);
  e.hp = e.maxHp; ss._status(e, { type: 'poison', value: 1, duration: 9 }, t);
  t.attack(e, { }); assert.equal(lost(e), 100); assert.equal(t.resources.focus, 1);
});

test('Чёрная топь: опутаны и отравлены все, цена 3 Сосредоточения, босс теряет меньше', () => {
  const t = hero('holt', { level: 12, skills: ['black_mire'], res: { focus: 3 } }), e = foe('e'), boss = foe('b', { speed: 9 }); boss.isBoss = true; side([t], [e, boss]);
  ss.use('black_mire', t, t);
  assert.equal(t.resources.focus, 0);
  assert.ok([e, boss].every(u => u.hasEffect('rooted') && u.getEffect('poison').value === 14));
  assert.equal(effectiveSpeed(boss), 7);
});

test('Целеуказание и Залп по приказу: по метке верно и ×1,8, по чистой обычный выстрел', () => {
  const t = hero('bran', { skills: ['spotter_mark', 'ordered_volley'], res: { focus: 3 } }); t.damage = { min: 100, max: 100 };
  const e = foe('e'), c = foe('c'); side([t], [e, c]);
  ss.use('spotter_mark', t, e); assert.equal(lost(e), 60); assert.ok(e.hasEffect('marked'));
  e.hp = e.maxHp; e.removeEffect('marked'); e.addEffect({ type: 'marked', value: 1, duration: 9 });
  t.accuracy = 40; e.speed = 50; Math.random = () => 0.99;
  ss.use('ordered_volley', t, e); assert.equal(lost(e), 180, 'метка не даёт промахнуться');
  t.cooldowns = {}; Math.random = () => 0.5; t.accuracy = 95; t.resources.focus = 2;
  ss.use('ordered_volley', t, c); assert.equal(lost(c), 100);
});

test('Дозор: первый ударивший отряд получает выстрел, второй нет', () => {
  const t = hero('bran', { skills: ['overwatch'], res: { focus: 1 } }), b = hero('companion_brawler'); t.damage = { min: 50, max: 50 };
  const e = foe('e'), e2 = foe('x'); side([b, t], [e, e2]);
  ss.use('overwatch', t, t); t.endTurn();
  e.attack(b, {}); assert.equal(lost(e), 60);
  e2.attack(b, {}); assert.equal(lost(e2), 0);
  assert.equal(t.hasEffect('overwatch'), false);
});

test('Полевой устав: копит только по метке', () => {
  const t = hero('bran', { passives: ['field_orders'] }), e = foe(); side([t], [e]);
  t.attack(e, { basic: true }); assert.equal(t.resources.focus, 0);
  e.addEffect({ type: 'marked', value: 1.25, duration: 9 });
  t.attack(e, { basic: true }); assert.equal(t.resources.focus, 2, 'обычное накопление и узел');
  t.resources.focus = 0; ss.use('aimed_shot', t, e); assert.equal(t.resources.focus, 1);
});

test('Королевский залп: тратит всё, бьёт всех, меченые без промаха и с пробитием', () => {
  const t = hero('bran', { level: 12, skills: ['royal_volley'], res: { focus: 3 } }); t.damage = { min: 100, max: 100 };
  const m = foe('m', { armor: 40 }), c = foe('c', { armor: 40, col: 1 }); side([t], [m, c]);
  m.addEffect({ type: 'marked', value: 1, duration: 9 });
  ss.use('royal_volley', t, t);
  assert.equal(t.resources.focus, 0);
  assert.equal(lost(m), 100); assert.equal(lost(c), 75);
  assert.equal(ss.canUse('royal_volley', t), false);
});

// ─── Носитель Запрета ───────────────────────────────────────────────────────

test('Скверна: копится только с веткой, усиливает удар, на пределе жжёт хозяйку', () => {
  const r = hero('ressa'), e = foe(); r.damage = { min: 100, max: 100 }; side([r], [e]);
  r.attack(e, { basic: true }); assert.equal(r.resources.taint, 0, 'до ветки молчит');
  r.branchId = 'blood_pact';
  r.attack(e, { basic: true }); assert.equal(r.resources.taint, 1);
  e.hp = e.maxHp; r.attack(e, {}); assert.equal(lost(e), 108);
  r.resources.taint = 2; r.endTurn(); assert.equal(lost(r), 0, 'ниже предела не жжёт');
  r.resources.taint = 3; r.endTurn(); assert.equal(lost(r), Math.round(r.maxHp * 0.08));
  r.hp = 1; r.endTurn(); assert.equal(r.hp, 1); assert.ok(r.isAlive);
  r.prepareForBattle({}); assert.equal(r.resources.taint, 0);
});

test('Узлы Скверны: нутро и Через край меняют ожог, Горькое начало и предел работают', () => {
  const r = hero('ressa', { level: 10 }); r.branchId = 'black_litany'; side([r], [foe()]);
  CP.applyProgressionChoice(r, { type: 'perk', key: 'taint_cap', label: 'x', effects: { resourceMax: { taint: 4 } } });
  CP.getAutoNodes(r, 10).forEach(n => CP.applyProgressionChoice(r, n));
  assert.equal(r.resourceMax.taint, 5);
  r.gainResource('taint', 9); assert.equal(r.resources.taint, 5);
  r.endTurn(); assert.equal(lost(r), Math.round(r.maxHp * 0.16));
  r.hp = r.maxHp; r.classTags.push('steel_gut'); r.endTurn(); assert.equal(lost(r), Math.round(r.maxHp * 0.08));
  const s = hero('ressa'); CP.applyProgressionChoice(s, { type: 'perk', key: 'bitter_start', label: 'x', effects: { resourceBase: { taint: 1 } } });
  s.prepareForBattle({}); assert.equal(s.resources.taint, 1);
});

test('Кровавый заём: лечит союзника ценой своего здоровья и даёт Скверну', () => {
  const r = hero('ressa', { level: 5, skills: ['blood_loan'] }), b = hero('companion_brawler'); b.hp = 10; side([b, r], [foe()]);
  ss.use('blood_loan', r, b);
  assert.equal(b.hp, 32); assert.equal(lost(r), 13); assert.equal(r.resources.taint, 1);
});

test('Дурная кровь и Чёрная литания: тратят всю Скверну, без брони', () => {
  const r = hero('ressa', { level: 5, skills: ['bad_blood', 'black_chant'], res: { taint: 3 } }); r.hp = 20;
  const e = foe('e', { armor: 50 }), e2 = foe('x', { armor: 50, col: 1 }); side([r], [e, e2]);
  assert.equal(ss.canUse('black_chant', hero('ressa', { skills: ['black_chant'] })), false);
  ss.use('bad_blood', r, e); assert.equal(lost(e), 30); assert.equal(r.hp, 35); assert.equal(r.resources.taint, 0);
  r.resources.taint = 2; e.hp = e.maxHp;
  ss.use('black_chant', r, r); assert.equal(lost(e), 12); assert.equal(lost(e2), 12); assert.equal(r.resources.taint, 0);
});

test('Клеймо вины: заклеймённый платит за свой удар и может умереть от него', () => {
  const r = hero('ressa', { level: 4, skills: ['guilt_brand'] }), e = foe('e', { hp: 200 }); side([r], [e]);
  ss.use('guilt_brand', r, e); assert.equal(r.resources.taint, 1);
  const hp = e.hp; e.attack(r, {}); assert.equal(hp - e.hp, 7);
  e.hp = 3; e.attack(r, {}); assert.equal(e.isAlive, false);
});

test('Долг назад и Голос за порогом: реакция раз в раунд', () => {
  const r = hero('ressa', { passives: ['debt_returned'] }); r.armor = 0; const e = foe('e', { armor: 50 }); side([r], [e]);
  e.attack(r, {}); assert.equal(lost(r), 10); assert.equal(lost(e), 5); assert.equal(r.resources.taint, 1);
  e.attack(r, {}); assert.equal(lost(e), 5);
  r.endTurn(); e.attack(r, {}); assert.equal(lost(e), 10);
  const v = hero('ressa', { level: 3, passives: ['voice_beyond'], res: { taint: 2 } }), s = foe('s'); side([v], [s]);
  s.attack(v, {}); assert.equal(s.getEffect('branded').value, 6); assert.equal(v.resources.taint, 1);
  const w = hero('ressa', { passives: ['voice_beyond'], res: { taint: 1 } }), q = foe('q'); side([w], [q]);
  q.attack(w, {}); assert.equal(q.hasEffect('branded'), false);
});

test('Жидкая кровь: ниже половины сильнее и заём больше, но лечат вдвое хуже', () => {
  const r = hero('ressa', { level: 1, passives: ['thin_blood'], skills: ['blood_loan'] }), e = foe(), b = hero('companion_brawler');
  r.damage = { min: 100, max: 100 }; r.lifesteal = 0; b.hp = 10; side([b, r], [e]);
  r.attack(e, {}); assert.equal(lost(e), 100);
  r.hp = 20; e.hp = e.maxHp; r.attack(e, {}); assert.equal(lost(e), 125);
  r.heal(20); assert.equal(r.hp, 30);
  ss.use('blood_loan', r, b); assert.equal(b.hp, 10 + 18);
});

test('Последний пакт и Непроизнесённое: раз в бой, Скверна до предела', () => {
  const r = hero('ressa', { level: 12, skills: ['final_pact'] }), b = hero('companion_brawler'), dead = hero('companion_healer'); b.hp = 10; dead.isAlive = false; dead.hp = 0;
  side([b, r, dead], [foe()]); r.hp = 41;
  ss.use('final_pact', r, r);
  assert.equal(r.hp, 21); assert.equal(b.hp, 30); assert.equal(dead.hp, 0); assert.equal(r.resources.taint, 3);
  assert.equal(ss.canUse('final_pact', r), false);
  const n = hero('ressa', { level: 12, skills: ['unspoken_name'] }), e1 = foe('a'), e2 = foe('b'); side([n], [e1, e2]);
  ss.use('unspoken_name', n, n);
  assert.equal(n.resources.taint, 3); assert.equal(e2.getEffect('branded').value, 15);
});
