// Сверка JS-симулятора с таблицей 01_БАЛАНС, раздел 7 (допуск ±5 пунктов).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHAPTER1, EXPECTED, simulate, seedRandom } from './battle_sim.mjs';

const N = 2000;
const TOL = 5;

test('проценты побед совпадают с 01_БАЛАНС (умная игра и только атаки), ±5', () => {
  seedRandom(20261026);
  const bad = [];
  for (const [id] of CHAPTER1) {
    const smart = simulate(id, N, { smart: true });
    const basic = simulate(id, N, { smart: false });
    const [es, eb] = EXPECTED[id];
    if (Math.abs(smart.win - es) > TOL) bad.push(`${id} умно ${smart.win.toFixed(1)} вместо ${es}`);
    if (Math.abs(basic.win - eb) > TOL) bad.push(`${id} атака ${basic.win.toFixed(1)} вместо ${eb}`);
  }
  assert.deepEqual(bad, []);
});
