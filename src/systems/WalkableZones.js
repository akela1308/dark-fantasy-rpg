/**
 * WalkableZones — определяет проходимые зоны на каждой карте.
 * Зоны описаны как прямоугольники { x, y, w, h } в координатах карты.
 */

const ZONES = {
  map1: [
    // Главная дорога (горизонтальная, центр карты)
    { x: 0,    y: 390, w: 1672, h: 200 },
    // Небольшое расширение у ворот слева
    { x: 100,  y: 320, w: 200,  h: 280 },
    // Расширение у таверны справа
    { x: 1350, y: 300, w: 320,  h: 300 },
    // Переход вверх (к горам)
    { x: 780,  y: 200, w: 120,  h: 220 },
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
   * Debug: нарисовать зоны (вызвать в create для отладки)
   */
  drawDebug(scene) {
    const g = scene.add.graphics().setDepth(100).setAlpha(0.25);
    g.fillStyle(0x00FF00);
    this.zones.forEach(z => g.fillRect(z.x, z.y, z.w, z.h));
  }
}
