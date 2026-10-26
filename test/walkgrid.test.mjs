import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkAll, loadWalkData } from './walkgrid.mjs';
import { WalkableZones } from '../src/systems/WalkableZones.js';
import { findPath } from '../src/systems/Pathfinding.js';

const START_ROUTE = ['south_post', 'three_pillars', 'three_pillars_inside', 'map1', 'tavern_map', 'tavern_inside', 'old_mill', 'mill_inside', 'burned_hamlet'];

test('сетки ходьбы: спавны на проходимых клетках, все выходы достижимы на всех картах', () => {
  const r = checkAll(loadWalkData());
  const bad = Object.entries(r).filter(([, v]) => v.errors.length).map(([k, v]) => `${k}: ${v.errors.join('; ')}`);
  assert.deepEqual(bad, []);
});

test('маршрут начала игры размечен вручную', () => {
  const { grids } = loadWalkData();
  assert.deepEqual(START_ROUTE.filter(k => !grids[k]), []);
});

test('поиск пути обходит препятствие и не срезает углы', () => {
  // Стена посередине с проходом внизу: путь обязан уйти к проходу, а не идти напрямую
  const zones = [{ x: 0, y: 0, w: 1672, h: 941 }];
  const w = new WalkableZones('x', zones);
  for (let r = 0; r < 30; r++) w.cells[r * 70 + 35] = 0;   // стена x=840..864, y=0..720
  w.setCells(w.cells);
  const res = findPath(w, 600, 300, 1100, 300);
  assert.ok(res, 'путь есть');
  assert.ok(res.points.some(p => p.y >= 720), 'путь проходит под стеной');
  let prev = { x: 600, y: 300 };
  for (const p of res.points) { assert.ok(w.lineClear(prev.x, prev.y, p.x, p.y), 'отрезок пути не пересекает стену'); prev = p; }
  // Клик далеко в непроходимое: пути нет
  for (let i = 0; i < w.cells.length; i++) if (Math.floor(i / 70) < 10) w.cells[i] = 0;
  w.setCells(w.cells);
  assert.equal(findPath(w, 600, 600, 600, 30), null);
});
