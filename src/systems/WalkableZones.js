/**
 * WalkableZones — определяет проходимые зоны на каждой карте.
 * Зоны описаны как прямоугольники { x, y, w, h } в координатах карты.
 */

const ZONES = {
  // Зоны по красным линиям пользователя.
  // Дорога идёт диагонально: левый низ → правый верх.
  // Карта 1672x941. Верхняя граница ~y330-380, нижняя ~y490-620 (слева ниже).
  map1: [
    // Левая часть (у фонаря и статуи)
    { x: 0,    y: 380, w: 200,  h: 220 },
    // Левый центр
    { x: 150,  y: 350, w: 250,  h: 210 },
    // Центр (у арки)
    { x: 350,  y: 330, w: 300,  h: 200 },
    // Правый центр (у обелиска)
    { x: 600,  y: 315, w: 350,  h: 185 },
    // Правая часть (у фонаря и ворот)
    { x: 900,  y: 300, w: 400,  h: 195 },
    // Крайняя правая (к таверне)
    { x: 1250, y: 280, w: 422,  h: 200 },
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
  drawDebug(scene, scale = 1, offX = 0, offY = 0) {
    const g = scene.add.graphics().setDepth(100).setAlpha(0.3);
    g.lineStyle(2, 0xFF0000, 0.8);
    this.zones.forEach(z => {
      g.strokeRect(
        offX + z.x * scale,
        offY + z.y * scale,
        z.w * scale,
        z.h * scale
      );
    });
  }
}
