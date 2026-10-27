/**
 * Кнопка-ниша (этап 6): тёмная ниша с бронзовой рамкой и золотыми уголками, надпись золотом.
 * Экранные px; камера с zoom учитывается. Возвращает { objs, setEnabled(bool), destroy() }.
 *
 *   nicheButton(scene, 640, 500, 'На карту', { w: 220, onClick, depth: 2010 })
 */
import { FONT, COLOR } from './Theme.js';
import { plate } from './Plate.js';

export function nicheButton(scene, x, y, label, { w = 220, h = 44, onClick, depth = 9810, color = COLOR.gold, size = 16, sub = null } = {}) {
  const z = scene.cameras.main.zoom || 1;
  const s = v => v / z;
  const objs = [];
  const fix = o => { o.setScrollFactor?.(0); objs.push(o); return o; };
  // Нарисованная плашка: тёмное дерево в бронзе (public/ui/plate_button_v1.png); прозрачная зона ловит клики
  const pl = fix(plate(scene, 'button', s(x), s(y), s(w), s(h)).setDepth(depth));
  const bg = fix(scene.add.rectangle(s(x), s(y), s(w), s(h), 0x000000, 0).setDepth(depth + 1));
  const draw = hover => pl.setTint?.(hover ? 0xffe2b0 : 0xffffff);
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
  bg.on('pointerover', () => { if (!enabled) return; draw(true); t.setColor(COLOR.goldHi); });
  bg.on('pointerout', () => { draw(false); t.setColor(enabled ? color : COLOR.dim); });
  bg.on('pointerdown', () => { if (enabled) onClick?.(); });
  return {
    objs, text: t, sub: st,
    setEnabled(v) { enabled = v; t.setColor(v ? color : COLOR.dim); bg.input && (bg.input.cursor = v ? 'pointer' : 'default'); },
    destroy() { objs.forEach(o => { try { o.destroy(); } catch {} }); },
  };
}
