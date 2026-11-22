import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CHAPTER_END_PENDING, chapterEndingRoute } from '../src/systems/ChapterEnding.js';

const courtyard = { fromMapKey: 'tavern_map', fromSpawnId: 'tavern_exit' };
const summary = { key: 'ChapterEndScene', data: courtyard };

test('Сохранение в ролике возобновляет текущий вариант ролика', () => {
  for (const [sealWorn, id] of [[false, 'end_road'], [true, 'end_seal']]) {
    const registry = new Map([[CHAPTER_END_PENDING, 'cinema'], ['seal_worn', sealWorn]]);
    assert.deepEqual(chapterEndingRoute(registry, 'tavern_cellar'), {
      key: 'CinemaScene', data: { id, next: 'ChapterEndScene', nextData: courtyard },
    });
  }
});

test('Сохранение на итоговом экране возобновляет его с прежней точкой выхода', () => {
  const registry = new Map([[CHAPTER_END_PENDING, 'summary'], ['chapter1_done', true]]);
  assert.deepEqual(chapterEndingRoute(registry, 'tavern_cellar'), summary);
});

test('Старые сохранения с принятым исходом и незакрытым финалом открывают итог', () => {
  for (const flag of ['basement_cleared', 'basement_left_closed']) {
    assert.deepEqual(chapterEndingRoute(new Map([[flag, true]]), 'tavern_cellar'), summary);
  }
});

test('Незавершённый бой, отмена и повторный визит после главы загружают карту', () => {
  assert.equal(chapterEndingRoute(new Map(), 'tavern_cellar'), null);
  assert.equal(chapterEndingRoute(new Map([['sealed_basement_defeated', true]]), 'tavern_cellar'), null);
  assert.equal(chapterEndingRoute(new Map([['basement_cleared', true], ['chapter1_done', true]]), 'tavern_cellar'), null);
  assert.equal(chapterEndingRoute(new Map([['basement_left_closed', true]]), 'tavern_map'), null);
});
