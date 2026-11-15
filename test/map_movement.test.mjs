import { test } from 'node:test';
import assert from 'node:assert/strict';
import { advanceMapMovement } from '../src/systems/MapMovement.js';
const unit = () => ({ sprite: { x: 0, y: 0 }, targetX: 3, targetY: 0,
  _path: [{ x: 3, y: 4 }, { x: 100, y: 4 }] });
test('Повороты расходуют общий бюджет пути, без дополнительных скачков', () => {
  const u = unit();
  const result = advanceMapMovement(u, 10);
  assert.equal(result.travelled, 10);
  assert.deepEqual(u.sprite, { x: 6, y: 4 });
});
test('Положение на ломаном пути одинаково при 30, 60 и 144 кадрах/с', () => {
  for (const fps of [30, 60, 144]) {
    const u = unit();
    for (let i = 0; i < fps; i++) advanceMapMovement(u, 60 / fps);
    assert.ok(Math.abs(u.sprite.x - 56) < 1e-9);
    assert.equal(u.sprite.y, 4);
  }
});
test('Короткий шаг и конец пути не проскакивают цель', () => {
  const u = unit(); u._path = [];
  assert.equal(advanceMapMovement(u, 20).travelled, 3);
  assert.equal(u.sprite.x, 3);
  assert.equal(advanceMapMovement(u, 20).travelled, 0);
});
test('Повторяющиеся точки не зацикливают движение', () => {
  const u = unit(); u._path.unshift({ x: 3, y: 0 }, { x: 3, y: 0 });
  advanceMapMovement(u, 10);
  assert.deepEqual(u.sprite, { x: 6, y: 4 });
});
