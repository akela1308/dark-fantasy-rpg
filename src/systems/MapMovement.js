/** Расходует дистанцию кадра на весь путь, включая повороты. Изменяет путь юнита. */
export function advanceMapMovement(unit, distance) {
  let x = unit.sprite.x, y = unit.sprite.y;
  const startX = x, startY = y;
  let travelled = 0;
  while (true) {
    const dx = unit.targetX - x, dy = unit.targetY - y;
    const length = Math.hypot(dx, dy);
    if (length > distance) {
      if (distance > 0) {
        x += dx / length * distance;
        y += dy / length * distance;
        travelled += distance;
      }
      break;
    }
    x = unit.targetX;
    y = unit.targetY;
    distance -= length;
    travelled += length;
    if (!unit._path?.length) break;
    const next = unit._path.shift();
    unit.targetX = next.x;
    unit.targetY = next.y;
  }
  unit.sprite.x = x;
  unit.sprite.y = y;
  return { travelled, dx: x - startX, dy: y - startY };
}
