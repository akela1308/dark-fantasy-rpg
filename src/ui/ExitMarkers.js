/**
 * ExitMarkers: игрок всегда видит, куда можно уйти с карты.
 *
 * Без наведения: у выхода на краю карты пульсирует золотая стрелка, у двери тёплое свечение по контуру проёма.
 * При наведении: метка ярче, курсор «перейти» (стрелка) или «дверь», рядом с зоной табличка с названием места.
 * Клик по зоне выхода (не меньше 64×64 экранных px) ведёт героя к выходу по пути.
 *
 * Данные: exits и tavernEntry карты из maps.json. Вид выхода определяется сам: зона у края карты это «край»,
 * остальные это двери. Поле kind ("edge" | "door") и dir ("left" | "right" | "up" | "down") у выхода переопределяют,
 * label переопределяет подпись. Настройки: src/data/ui.json, раздел exits.
 */
import * as Phaser from 'phaser/dist/phaser.esm.js';
import UI from '../data/ui.json';
import { MAP_W, MAP_H } from '../systems/WalkableZones.js';

const S = UI.exits;
const COLOR = Phaser.Display.Color.HexStringToColor(S.color).color;
const EDGE = 6;   // зона ближе этого к краю карты считается выходом с края

const svgCursor = (svg, x, y) => `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}") ${x} ${y}, pointer`;
const CURSOR = {
  edge: svgCursor('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><path d="M6 6 L22 16 L6 26 L11 16 Z" fill="#d4a832" stroke="#1a1208" stroke-width="2"/><path d="M14 9 L26 16 L14 23" fill="none" stroke="#f0d890" stroke-width="2"/></svg>', 24, 16),
  door: svgCursor('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><path d="M8 29 V9 Q16 1 24 9 V29 Z" fill="#2a1d0e" stroke="#d4a832" stroke-width="2.5"/><circle cx="20" cy="19" r="1.8" fill="#f0d890"/></svg>', 16, 16),
};

export class ExitMarkers {
  /**
   * @param scene MapScene
   * @param cfg   конфиг карты из maps.json
   * @param maps  все карты (для названий мест)
   * @param isLocked exit => bool: выход сейчас закрыт (флаги)
   */
  constructor(scene, cfg, maps, isLocked = () => false) {
    this.scene = scene;
    this.zoom = scene.cameras.main.zoom;
    this.interior = cfg.kind === 'interior' || cfg.kind === 'cave';
    this.isLocked = isLocked;
    const exits = [...(cfg.exits || []), ...(cfg.tavernEntry ? [cfg.tavernEntry] : [])].filter(e => maps[e.toMap]);
    this.items = exits.map(e => this._build(e, maps[e.toMap]));
    this.hover = null;
    scene.events.once('shutdown', () => scene.input.setDefaultCursor('default'));
  }

  _build(exit, target) {
    const z = exit.zone;
    const dir = exit.dir || this._edgeDir(z);
    const kind = exit.kind || (dir ? 'edge' : 'door');
    // Зона клика: не меньше minHitPx экранных px в каждую сторону, растёт от центра зоны
    const min = S.minHitPx / this.zoom;
    const hw = Math.max(z.w, min), hh = Math.max(z.h, min);
    const hit = new Phaser.Geom.Rectangle(z.x + z.w / 2 - hw / 2, z.y + z.h / 2 - hh / 2, hw, hh);
    const item = { exit, zone: z, hit, dir, kind, text: this._text(exit, target, kind, dir) };
    item.gfx = this.scene.add.graphics().setDepth(kind === 'door' ? z.y + z.h - 2 : 3);
    this._draw(item);
    item.pulse = this.scene.tweens.add({
      targets: item.gfx, alpha: { from: 1, to: 0.45 }, duration: S.pulseMs, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });
    if (!S.enabled) item.gfx.setVisible(false);
    return item;
  }

  _edgeDir(z) {
    if (z.x <= EDGE) return 'left';
    if (z.x + z.w >= MAP_W - EDGE) return 'right';
    if (z.y <= EDGE) return 'up';
    if (z.y + z.h >= MAP_H - EDGE) return 'down';
    return null;
  }

  _text(exit, target, kind, dir) {
    if (exit.label) return exit.label;
    const name = target.name || exit.toMap;
    // «Выйти» только из помещения на улицу; в соседнюю комнату, подвал или пещеру «Войти»
    const outdoor = (target.kind || 'outdoor') === 'outdoor';
    if (kind === 'door') return this.interior && outdoor ? `Выйти: ${name}` : `Войти: ${name}`;
    const arrow = { left: '←', right: '→', up: '↑', down: '↓' }[dir] || '→';
    return `${arrow} ${name}`;
  }

  // Рисунок метки: alpha задаёт яркость (спокойно или под курсором)
  _draw(item, hovered = false) {
    const g = item.gfx;
    const z = item.zone;
    const locked = this.isLocked(item.exit);
    const a = (hovered ? S.hoverAlpha : S.idleAlpha) * (locked ? 0.55 : 1);
    g.clear();
    if (item.kind === 'door') {
      // Тёплое свечение по контуру проёма: мягкий широкий ореол и тонкая линия
      const r = Math.min(14, z.w / 4);
      g.lineStyle(10, COLOR, a * 0.22).strokeRoundedRect(z.x, z.y, z.w, z.h, r);
      g.lineStyle(5, COLOR, a * 0.35).strokeRoundedRect(z.x + 2, z.y + 2, z.w - 4, z.h - 4, r);
      g.lineStyle(2, 0xf0d890, a * 0.8).strokeRoundedRect(z.x + 4, z.y + 4, z.w - 8, z.h - 8, r);
      g.fillStyle(COLOR, a * (hovered ? 0.16 : 0.07)).fillRoundedRect(z.x + 4, z.y + 4, z.w - 8, z.h - 8, r);
      return;
    }
    // Стрелка на земле у края: два шеврона, остриём наружу
    const v = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] }[item.dir] || [1, 0];
    const cx = z.x + z.w / 2 - v[0] * Math.max(0, z.w / 2 - 34);
    const cy = z.y + z.h / 2 - v[1] * Math.max(0, z.h / 2 - 34);
    const size = hovered ? 22 : 18;
    if (hovered) g.fillStyle(COLOR, 0.12).fillRoundedRect(z.x, z.y, z.w, z.h, 10);
    [0, 1].forEach(k => {
      const ox = cx + v[0] * k * 16, oy = cy + v[1] * k * 16;
      const tipX = ox + v[0] * size, tipY = oy + v[1] * size;
      const px = -v[1] * size, py = v[0] * size;   // поперёк направления
      g.lineStyle(9, 0x000000, a * 0.45);
      g.beginPath(); g.moveTo(ox + px, oy + py); g.lineTo(tipX, tipY); g.lineTo(ox - px, oy - py); g.strokePath();
      g.lineStyle(5, COLOR, a * (k ? 1 : 0.7));
      g.beginPath(); g.moveTo(ox + px, oy + py); g.lineTo(tipX, tipY); g.lineTo(ox - px, oy - py); g.strokePath();
    });
  }

  /** Выход под точкой мира (по увеличенной зоне клика) или null. */
  exitAt(x, y) {
    return this.items.find(it => it.hit.contains(x, y)) || null;
  }

  /** Наведение: over: объекты под курсором (HUD перехватывает наведение). */
  onPointerMove(ptr, over = []) {
    const onUi = over.some(o => o.scrollFactorX === 0);
    const it = onUi ? null : this.exitAt(ptr.worldX, ptr.worldY);
    if (it === this.hover) return;
    if (this.hover) this._unhover(this.hover);
    this.hover = it;
    if (it) this._hoverOn(it);
  }

  _hoverOn(it) {
    this._draw(it, true);
    it.pulse.pause();
    it.gfx.setAlpha(1);
    this.scene.input.setDefaultCursor(it.kind === 'door' ? CURSOR.door : CURSOR.edge);
    this._showLabel(it);
  }

  _unhover(it) {
    this._draw(it, false);
    it.pulse.resume();
    this.scene.input.setDefaultCursor('default');
    this._label?.forEach(o => o.destroy());
    this._label = null;
  }

  // Табличка рядом с зоной (не в центре экрана), поверх пропсов, целиком в кадре и не под HUD
  _showLabel(it) {
    const s = this.scene;
    const px = v => v / this.zoom;
    const locked = this.isLocked(it.exit);
    const text = locked ? `${it.text}\n${it.exit.lockedText || 'Путь закрыт.'}` : it.text;
    const t = s.add.text(0, 0, text, {
      fontFamily: 'Georgia, serif', fontSize: `${px(S.labelFontPx)}px`, color: locked ? '#b0a080' : '#f0e0b0',
      align: 'center', stroke: '#000000', strokeThickness: px(2),
    }).setOrigin(0.5).setDepth(8501);
    const pad = px(8);
    const w = t.width + pad * 2, h = t.height + pad * 1.2;
    const z = it.zone, gap = px(10);
    let x = z.x + z.w / 2, y = z.y + z.h / 2;
    if (it.kind === 'door') y = z.y - gap - h / 2;
    else if (it.dir === 'left') x = z.x + z.w + gap + w / 2;
    else if (it.dir === 'right') x = z.x - gap - w / 2;
    else if (it.dir === 'up') y = z.y + z.h + gap + h / 2;
    else y = z.y - gap - h / 2;
    // В пределах экрана, мимо HUD (верхний левый угол: плеер и портреты; низ по центру: панель)
    const box = this._fit(x, y, w, h);
    t.setPosition(box.x, box.y);
    const bg = s.add.rectangle(box.x, box.y, w, h, 0x0d0b0f, 0.86)
      .setStrokeStyle(px(1), COLOR, 0.8).setDepth(8500);
    this._label = [bg, t];
  }

  _fit(x, y, w, h) {
    const m = 8 / this.zoom;
    x = Phaser.Math.Clamp(x, w / 2 + m, MAP_W - w / 2 - m);
    y = Phaser.Math.Clamp(y, h / 2 + m, MAP_H - h / 2 - m);
    const hud = this.scene.hudRects?.() || [];
    for (const r of hud) {
      const overlap = x + w / 2 > r.x && x - w / 2 < r.x + r.width && y + h / 2 > r.y && y - h / 2 < r.y + r.height;
      if (!overlap) continue;
      // Сдвиг за край прямоугольника HUD по вертикали: вниз от верхних, вверх от нижних
      y = r.y < MAP_H / 2 ? r.y + r.height + h / 2 + m : r.y - h / 2 - m;
    }
    return { x, y };
  }
}
