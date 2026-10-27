/**
 * Подсказка в общем стиле (этап 6): бронзовая рамка 2 px с уголками, заголовок золотом,
 * текст костяным, действие отдельной строкой. Всегда целиком в кадре 1280×720.
 *
 *   const tip = new Tooltip(scene);
 *   tip.show(x, y, { title, body, action }, { below: false });   // экранные px, x/y: точка, к которой привязана подсказка
 *   tip.hide();
 */
import { FONT, COLOR } from './Theme.js';
import { plate } from './Plate.js';

const W_MAX = 260, PAD = 10;

export class Tooltip {
  constructor(scene, depth = 9900) {
    this.scene = scene;
    this.depth = depth;
    this.objs = [];
  }

  show(x, y, { title, body, action } = {}, { below = false } = {}) {
    this.hide();
    const sc = this.scene;
    const z = sc.cameras.main.zoom || 1;
    const s = v => v / z;
    const mk = (str, size, color, extra = {}) => sc.add.text(0, 0, str, {
      fontFamily: FONT, fontSize: `${s(size)}px`, color, stroke: '#000', strokeThickness: s(1.5),
      wordWrap: { width: s(W_MAX), useAdvancedWrap: true }, lineSpacing: s(2), ...extra,
    }).setScrollFactor(0).setDepth(this.depth + 2);
    const parts = [];
    if (title) parts.push(mk(title, 14, COLOR.gold, { letterSpacing: s(1) }));
    if (body) parts.push(mk(body, 12, COLOR.bone));
    if (action) parts.push(mk(action, 11, COLOR.muted, { fontStyle: 'italic' }));
    if (!parts.length) return;
    const w = Math.max(...parts.map(p => p.width * z)) + PAD * 2;
    const h = parts.reduce((a, p) => a + p.height * z, 0) + (parts.length - 1) * 4 + PAD * 2;
    let bx = Math.round(x - w / 2), by = Math.round(below ? y + 8 : y - h - 8);
    bx = Math.max(6, Math.min(1280 - w - 6, bx));
    if (by < 6) by = Math.round(y + 8);
    by = Math.max(6, Math.min(720 - h - 6, by));
    // Табличка: кожа в тонкой бронзе (нарисованная плашка)
    const g = plate(sc, 'label', s(bx + w / 2), s(by + h / 2), s(w + 8), s(h + 6)).setScrollFactor(0).setDepth(this.depth);
    this.objs.push(g);
    let ty = by + PAD;
    parts.forEach(p => { p.setPosition(s(bx + PAD), s(ty)); ty += p.height * z + 4; this.objs.push(p); });
  }

  hide() {
    this.objs.forEach(o => { try { o.destroy(); } catch {} });
    this.objs = [];
  }
}
