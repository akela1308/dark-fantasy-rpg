/**
 * WalkableZones — определяет проходимые зоны на каждой карте.
 * Зоны описаны как прямоугольники { x, y, w, h } в координатах карты.
 */

const ZONES = {
  // Зоны по красным линиям пользователя.
  // Дорога идёт диагонально: левый низ → правый верх.
  // Карта 1672x941. Верхняя граница ~y330-380, нижняя ~y490-620 (слева ниже).
  // Дорога идёт диагонально — слева внизу к правому верху.
  // Зоны опущены ниже, чтобы попасть на булыжную мостовую.
  map1: [
    { x: 0,    y: 570, w: 220,  h: 200 },
    { x: 170,  y: 530, w: 260,  h: 200 },
    { x: 390,  y: 490, w: 300,  h: 195 },
    { x: 650,  y: 450, w: 350,  h: 195 },
    { x: 960,  y: 410, w: 380,  h: 195 },
    { x: 1290, y: 370, w: 382,  h: 200 },
  ],
  tavern_map: [
    { x: 0, y: 350, w: 1672, h: 250 },
    { x: 300, y: 200, w: 600, h: 400 },
  ],
  mountains_map: [
    { x: 0, y: 300, w: 1672, h: 300 },
  ],
};

export class WalkableZones {
  constructor(mapKey) {
    this.zones = ZONES[mapKey] || [];
  }

  /**
   * Проверяет, можно ли встать на (x, y).
   */
  isWalkable(x, y) {
    return this.zones.some(z =>
      x >= z.x && x <= z.x + z.w &&
      y >= z.y && y <= z.y + z.h
    );
  }

  /**
   * Если точка не проходима — находим ближайшую проходимую.
   */
  clamp(x, y) {
    if (this.isWalkable(x, y)) return { x, y };

    let best = null;
    let bestDist = Infinity;

    this.zones.forEach(z => {
      const cx = Math.max(z.x, Math.min(z.x + z.w, x));
      const cy = Math.max(z.y, Math.min(z.y + z.h, y));
      const d  = Math.hypot(cx - x, cy - y);
      if (d < bestDist) { bestDist = d; best = { x: cx, y: cy }; }
    });

    return best ?? { x, y };
  }

  /**
   * Debug: нарисовать зоны с учётом масштаба и смещения карты
   */
  drawDebug(scene) {
    const g = scene.add.graphics().setDepth(100).setAlpha(0.4);
    g.lineStyle(2, 0xFF0000, 0.9);
    this.zones.forEach(z => g.strokeRect(z.x, z.y, z.w, z.h));
  }
}
