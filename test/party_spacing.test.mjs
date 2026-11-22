import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planPartySeparation } from '../src/systems/PartySpacing.js';
const open = { lineClear: () => true };
const unit = (x, y, moving = false) => ({ x, y, moving });
test('Идущий отряд не получает толчки или новые цели', () => {
  const group = [unit(0, 0, true), unit(2, 0, true), unit(3, 0)];
  assert.deepEqual(planPartySeparation(group, open, 55), []);
  assert.equal(group[1].x, 2);
});
test('Стоящий спутник получает цель шага, координаты не телепортируются', () => {
  const a = unit(0, 0), b = unit(10, 0);
  const [plan] = planPartySeparation([a, b], open, 55);
  assert.deepEqual(plan.to, { x: 55, y: 0 });
  assert.equal(b.x, 10);
  assert.deepEqual(planPartySeparation([a, unit(55, 0)], open, 55), []);
});
test('Разделение не ведёт сквозь стену и обрабатывает совпадающие позиции', () => {
  const group = [unit(0, 0), unit(0, 0)];
  assert.deepEqual(planPartySeparation(group, { lineClear: () => false }, 55), []);
  assert.deepEqual(planPartySeparation(group, open, 55)[0].to, { x: 55, y: 0 });
});
