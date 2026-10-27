/**
 * Рост юнитов в реальных метрах (src/data/heights.json) → размер на экране боя.
 * Ищется по spriteKey (у тварей бестиария id вида hamlet_dogs_1, а рисунок общий), затем по id.
 */
import HEIGHTS from '../data/heights.json';

export function heightM(unit) {
  const u = HEIGHTS.units;
  return u[unit.spriteKey] ?? u[unit.id] ?? HEIGHTS.battle.default;
}

/** Рост фигуры в px на экране боя: задний ряд (row 1) дальше от зрителя и чуть меньше. */
export function battleBodyPx(unit) {
  const b = HEIGHTS.battle;
  return heightM(unit) * b.pxPerMeter * (unit.position?.row === 1 ? b.backRow : 1);
}
