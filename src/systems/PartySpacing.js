/** Стоящие спутники расходятся обычным шагом. Идущих не сдвигаем с их пути. */
export function planPartySeparation(group, walkable, gap) {
  const plans = [];
  const positions = group.map(unit => ({ unit, x: unit.x, y: unit.y }));
  for (let i = 1; i < positions.length; i++) {
    const b = positions[i];
    if (b.unit.moving) continue;
    for (let j = 0; j < i; j++) {
      const a = positions[j];
      if (a.unit.moving) continue;
      const dx = b.x - a.x, dy = b.y - a.y, distance = Math.hypot(dx, dy);
      if (distance >= gap - 0.01) continue;
      const nx = distance > 0.01 ? dx / distance : (i % 2 ? 1 : -1);
      const ny = distance > 0.01 ? dy / distance : 0;
      const to = { x: a.x + nx * gap, y: a.y + ny * gap };
      if (!walkable.lineClear(b.x, b.y, to.x, to.y, 4)) continue;
      // Не ставим цель поверх другого стоящего спутника или уже выбранной цели.
      if (positions.some((p, k) => k !== i && k !== j && !p.unit.moving && Math.hypot(p.x - to.x, p.y - to.y) < gap - 0.01)) continue;
      plans.push({ unit: b.unit, to });
      b.x = to.x; b.y = to.y;
      break;
    }
  }
  return plans;
}
