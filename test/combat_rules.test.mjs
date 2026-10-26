import './_json_hook.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
const R = await import('../src/systems/CombatRules.js');
const battles = (await import('../src/data/battles.json', { with: { type: 'json' } })).default;

test('попадание: clamp(40, 95, точность + 2 × разница инициатив)', () => {
  assert.equal(R.hitChance({ accuracy: 82, speed: 7 }, { speed: 5 }), 86);
  assert.equal(R.hitChance({ accuracy: 50, speed: 1 }, { speed: 9 }), 40);
  assert.equal(R.hitChance({ accuracy: 94, speed: 9 }, { speed: 1 }), 95);
});

test('крит: min(20, 5 + инициатива)', () => {
  assert.equal(R.critChance({ speed: 7 }), 12);
  assert.equal(R.critChance({ speed: 30 }), 20);
});

test('потолок брони: 60 у игрока, 50 у врага', () => {
  assert.equal(R.effectiveArmor({ type: 'player', armor: 80 }), 60);
  assert.equal(R.effectiveArmor({ type: 'enemy', armor: 80 }), 50);
});

test('тонкий строй: двое впереди закрывают, один нет, Держать строй за двоих', () => {
  const att = { ranged: false };
  const back = { position: { row: 1 }, isAlive: true };
  const f1 = { position: { row: 0 }, isAlive: true, passives: [] };
  const f2 = { position: { row: 0 }, isAlive: true, passives: [] };
  assert.equal(R.meleeReach(att, back, [back, f1, f2]).ok, false);
  assert.deepEqual(R.meleeReach(att, back, [back, f1]), { ok: true, flank: true });
  assert.deepEqual(R.meleeReach(att, back, [back]), { ok: true, flank: false });
  const wall = { ...f1, passives: ['hold_the_line'] };
  assert.equal(R.meleeReach(att, back, [back, wall]).ok, false);
});

test('корни: −4 инициативы, у босса −2', () => {
  assert.equal(R.effectiveSpeed({ speed: 6, effects: [{ type: 'rooted' }] }), 2);
  assert.equal(R.effectiveSpeed({ speed: 6, isBoss: true, effects: [{ type: 'rooted' }] }), 4);
});

test('сдача: HP < 20% и командир пал', () => {
  const boss = { id: 'bandit_commander', isAlive: true, surrendered: false };
  const kul = { id: 'k', canSurrender: true, commanderId: 'bandit_commander', hp: 5, maxHp: 55, isAlive: true };
  assert.equal(R.shouldSurrender(kul, [boss, kul]), false);
  boss.isAlive = false;
  assert.equal(R.shouldSurrender(kul, [boss, kul]), true);
});

test('шайка Корвина по размеру партии', () => {
  const cfg = battles.find(b => b.id === 'korvin_gang');
  const names = n => R.enemiesForParty(cfg, n).map(e => e.name);
  assert.deepEqual(names(1), ['Куль', 'Тисс']);
  assert.deepEqual(names(2), ['Корвин Сухой', 'Куль']);
  assert.deepEqual(names(3), ['Корвин Сухой', 'Куль', 'Тисс']);
  assert.deepEqual(names(4), ['Корвин Сухой', 'Куль', 'Тисс', 'Головорез']);
});

test('правило состава без enemiesBySize: босс остаётся, одному двое', () => {
  const cfg = battles.find(b => b.id === 'sealed_basement');
  const one = R.enemiesForParty(cfg, 1);
  assert.equal(one.length, 2);
  assert.ok(one.some(e => e.isBoss));
  assert.equal(R.enemiesForParty(cfg, 4).length, 4);
});
