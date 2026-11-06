/**
 * Полоска здоровья из нарисованных частей: рамка hp_bar_frame и заливка hp_fill_v1 (серая, цвет задаётся tint).
 * Прямоугольники кодом здесь не нужны: заливка обрезается по доле здоровья, рамка не масштабируется по содержимому.
 *   const bar = new HpBar(scene, x, y, w, h, depth); bar.set(0.4); bar.parts -> объекты для уничтожения
 */
const FILL = 'hp_fill';
const COLOR = { ok: 0x7f9440, mid: 0xb58a2c, low: 0xa22c22 };

export function preloadHpBar(scene) {
  if (!scene.textures.exists(FILL)) scene.load.image(FILL, 'ui/hp_fill_v1.png');
  if (!scene.textures.exists('hp_bar_frame')) scene.load.image('hp_bar_frame', 'ui/hp_bar_frame.png');
}

export const hpColor = pct => (pct > 0.5 ? COLOR.ok : pct > 0.25 ? COLOR.mid : COLOR.low);

export class HpBar {
  constructor(scene, x, y, w, h, depth) {
    const fx = x - w / 2;
    this.bg = scene.add.image(fx, y, FILL).setOrigin(0, 0.5).setDisplaySize(w, h).setTint(0x17100c).setDepth(depth);
    this.fill = scene.add.image(fx, y, FILL).setOrigin(0, 0.5).setDisplaySize(w, h).setDepth(depth + 1);
    // Рамка шире заливки: её внутренний край ложится на полоску
    this.frame = scene.add.image(x, y, 'hp_bar_frame').setDisplaySize(w + 6, h * 2.3).setDepth(depth + 2);
    this.parts = [this.bg, this.fill, this.frame];
  }

  set(pct) {
    const p = Math.max(0, Math.min(1, pct));
    const t = this.fill.texture.getSourceImage();
    this.fill.setCrop(0, 0, Math.max(1, t.width * p), t.height);
    this.fill.setTint(hpColor(p));
    return this;
  }
}
