import './_json_hook.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
const { PlayerUnit } = await import('../src/entities/PlayerUnit.js');
const CP = await import('../src/systems/ClassProgression.js');
const CT = await import('../src/systems/CommanderTraits.js');
const { PartySystem } = await import('../src/systems/PartySystem.js');
const units = (await import('../src/data/units.json', { with: { type: 'json' } })).default;
const classes = (await import('../src/data/classes.json', { with: { type: 'json' } })).default;

class Reg { constructor() { this.list = {}; } get(k) { return this.list[k]; } set(k, v) { this.list[k] = v; } remove(k) { delete this.list[k]; } }

// 01_БАЛАНС 5: (уровень, HP, урон, иниц., броня, точность)
const TABLE = {
  fallen_duelist: [[1, 70, 11, 16, 7, 10, 82], [4, 91, 14, 19, 8, 10, 85], [8, 119, 18, 23, 9, 10, 89], [12, 147, 22, 27, 10, 10, 93]],
  brawler: [[1, 95, 9, 14, 4, 25, 72], [6, 145, 14, 19, 5, 35, 77], [12, 205, 20, 25, 6, 47, 83]],
  healer: [[1, 50, 5, 9, 5, 5, 75], [2, 56, 6, 10, 5, 6, 76], [5, 74, 7, 11, 5, 9, 79], [12, 116, 10, 14, 6, 16, 86]],
};

test('базовые статы классов по уровням совпадают с 01_БАЛАНС 5', () => {
  for (const [cid, rows] of Object.entries(TABLE)) {
    for (const [L, hp, dmin, dmax, spd, arm, acc] of rows) {
      const s = CP.statsAtLevel(cid, L);
      assert.deepEqual([s.hp, s.dmin, s.dmax, s.speed, s.armor, s.accuracy], [hp, dmin, dmax, spd, arm, acc], `${cid} L${L}`);
    }
  }
});

test('прокачка героя до 12 уровня без ошибок, черты на 2/5/8', () => {
  const reg = new Reg();
  const hero = new PlayerUnit(JSON.parse(JSON.stringify(units[0])));
  const traitLevels = [];
  for (let L = 2; L <= 12; L++) {
    CP.applyLevelGrowth(hero, L);
    hero.level = L;
    CP.getAutoNodes(hero, L).forEach(n => CP.applyProgressionChoice(hero, n));
    const tr = CT.getCommanderTraitChoices(hero, L, reg);
    if (tr) { traitLevels.push(L); CT.applyCommanderTraitChoice(hero, tr.find(t => t.traitId === 'commander') || tr[0], reg); }
    const ch = CP.getClassProgressionChoices(hero, L);
    if (ch) CP.applyProgressionChoice(hero, ch[0]);
  }
  assert.deepEqual(traitLevels, [2, 5, 8]);
  assert.equal(hero.level, 12);
  assert.equal(hero.branchId, 'honor_code');
  assert.ok(hero.passives.includes('riposte'));
  assert.ok(hero.skills.includes('challenge'));
  assert.equal(hero.maxHp, 147 + 15 * 0 + (hero.classTags.filter(t => t === 'endurance').length * 15));
  assert.equal(PartySystem.getSlots(reg), 4);
});

test('шесть черт героя, Своя дорога до трёх рангов', () => {
  const reg = new Reg();
  const hero = new PlayerUnit(JSON.parse(JSON.stringify(units[0])));
  const ids = CT.getCommanderTraitChoices(hero, 2, reg).map(c => c.traitId);
  assert.deepEqual(ids.sort(), ['commander', 'first_signs', 'own_road', 'second_strike', 'secret_literacy', 'shooting_knack']);
  const hp0 = hero.maxHp;
  for (let i = 0; i < 3; i++) CT.applyCommanderTraitChoice(hero, CT.getCommanderTraitChoices(hero, 5, reg).find(c => c.traitId === 'own_road'), reg);
  assert.equal(CT.getCommanderTraitChoices(hero, 8, reg).some(c => c.traitId === 'own_road'), false);
  assert.equal(hero.maxHp, 97);   // 70 × 1.12 три раза с округлением
});

test('общий опыт: пороги XP_TOTAL, второй слот сам на 2 уровне', () => {
  const reg = new Reg();
  assert.deepEqual(PartySystem.addXp(reg, 99), { from: 1, to: 1 });
  assert.equal(PartySystem.getSlots(reg), 1);
  assert.deepEqual(PartySystem.addXp(reg, 1), { from: 1, to: 2 });
  assert.equal(PartySystem.getSlots(reg), 2);
  assert.deepEqual(PartySystem.addXp(reg, 10000), { from: 2, to: 12 });
});

test('levelPlan на 2-12 у всех трёх классов', () => {
  for (const c of classes) {
    for (let L = 2; L <= 12; L++) assert.ok(Array.isArray(c.levelPlan[String(L)]), `${c.id} ${L}`);
  }
});
