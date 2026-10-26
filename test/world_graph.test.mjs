import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkWorld, loadMaps } from './world_graph.mjs';

test('граф мира: 59 карт, выходы симметричны, всё достижимо, два тупика', () => {
  const r = checkWorld(loadMaps());
  assert.equal(r.count, 59);
  assert.deepEqual(r.errors, []);
  assert.equal(r.reachable, 59);
});
