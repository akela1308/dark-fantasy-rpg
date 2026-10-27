/**
 * Кнопка-ниша (этап 6): тёмная ниша с бронзовой рамкой и золотыми уголками, надпись золотом.
 * Экранные px; камера с zoom учитывается. Возвращает { objs, setEnabled(bool), destroy() }.
 *
 *   nicheButton(scene, 640, 500, 'На карту', { w: 220, onClick, depth: 2010 })
 */
import { FONT, COLOR, HEX } from './Theme.js';

export function nicheButton(scene, x, y, label, { w = 220, h = 44, onClick, depth = 9810, color = COLOR.gold, size = 16, sub = null } = {}) {
  const z = scene.cameras.main.zoom || 1;
  const s = v => v / z;
  const objs = [];
  const fix = o => { o.setScrollFactor?.(0); objs.push(o); return o; };
  const bg = fix(scene.add.rectangle(s(x), s(y), s(w), s(h), 0x15110c, 0.95).setDepth(depth));
  const g = fix(scene.add.graphics().setDepth(depth + 1));
  const draw = hover => {
    g.clear();
    g.lineStyle(s(2), HEX.bronze, 1).strokeRect(s(x - w / 2), s(y - h / 2), s(w), s(h));
    g.lineStyle(s(1), HEX.gold, hover ? 0.7 : 0.3).strokeRect(s(x - w / 2 + 4), s(y - h / 2 + 4), s(w - 8), s(h - 8));
    g.lineStyle(s(2), HEX.gold, hover ? 1 : 0.8);
    const c = 8, x0 = x - w / 2, y0 = y - h / 2;
    [[x0, y0, 1, 1], [x0 + w, y0, -1, 1], [x0, y0 + h, 1, -1], [x0 + w, y0 + h, -1, -1]].forEach(([px, py, dx, dy]) => {
      g.beginPath(); g.moveTo(s(px + dx * c), s(py)); g.lineTo(s(px), s(py)); g.lineTo(s(px), s(py + dy * c)); g.strokePath();
    });
  };
  draw(false);
  const t = fix(scene.add.text(s(x), s(sub ? y - 4 : y), label, {
    fontFamily: FONT, fontSize: `${s(size)}px`, color, stroke: '#000', strokeThickness: s(2), letterSpacing: s(1),
    align: 'center', wordWrap: { width: s(w - 20), useAdvancedWrap: true },
  }).setOrigin(0.5, sub ? 1 : 0.5).setDepth(depth + 2));
  let st = null;
  if (sub) st = fix(scene.add.text(s(x), s(y), sub, {
    fontFamily: FONT, fontSize: `${s(11)}px`, color: COLOR.muted, stroke: '#000', strokeThickness: s(1.5),
    align: 'center', wordWrap: { width: s(w - 20), useAdvancedWrap: true },
  }).setOrigin(0.5, 0).setDepth(depth + 2));
  let enabled = true;
  bg.setInteractive({ useHandCursor: true });
  bg.on('pointerover', () => { if (!enabled) return; draw(true); bg.setFillStyle(0x2a2114, 0.95); t.setColor(COLOR.goldHi); });
  bg.on('pointerout', () => { draw(false); bg.setFillStyle(0x15110c, 0.95); t.setColor(enabled ? color : COLOR.dim); });
  bg.on('pointerdown', () => { if (enabled) onClick?.(); });
  return {
    objs, text: t, sub: st,
    setEnabled(v) { enabled = v; t.setColor(v ? color : COLOR.dim); bg.input && (bg.input.cursor = v ? 'pointer' : 'default'); },
    destroy() { objs.forEach(o => { try { o.destroy(); } catch {} }); },
  };
}
