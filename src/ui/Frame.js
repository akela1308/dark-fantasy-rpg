/**
 * Frame: общий компонент окна (этап 6) в стиле окна персонажа.
 *
 * Готическая рамка с черепами из атласа frame_gothic (tools/frame_pieces.py): углы, планки плиткой, медальон
 * сверху, тёмная заливка. Заголовок капителью с тонким золотым разделителем, крестик закрытия, Esc закрывает.
 * Одно окно за раз: открытие нового закрывает предыдущее в этой сцене.
 *
 * Координаты в экранных px (холст 1280×720); камера с zoom (MapScene) учитывается сама.
 *   const f = new Frame(scene, { w: 900, h: 560, title: 'Журнал', onClose });
 *   f.inner  -> { x, y, w, h } поле для содержимого (отступ от орнамента не меньше 24 px)
 *   f.add(obj) -> obj (приклеен к экрану, глубина над рамкой, уничтожится вместе с окном)
 *   f.close()
 */
import { FONT, COLOR, HEX, textStyle, caps } from './Theme.js';

const KEY = 'frame_gothic';
// Куски атласа public/ui/frame_gothic_v1.png (вывод tools/frame_pieces.py)
const PIECES = {
  tl: [0, 0, 330, 250], tr: [332, 0, 330, 250], bl: [664, 0, 330, 250], br: [0, 252, 330, 250],
  top: [332, 252, 267, 170], bottom: [601, 252, 267, 170], left: [870, 252, 230, 140], right: [0, 504, 230, 140],
  medal: [232, 504, 230, 200], fill: [464, 504, 256, 160],
};
// Внутренний край орнамента в px исходника: планки слева/справа и сверху/снизу
const RAIL_X = 200, RAIL_Y = 160;
const PAD = 24;

const open = new WeakMap();   // scene -> текущее окно

function ensureFrames(scene) {
  const tex = scene.textures.exists(KEY) ? scene.textures.get(KEY) : null;
  if (!tex || tex.has('tl')) return !!tex;
  Object.entries(PIECES).forEach(([n, [x, y, w, h]]) => tex.add(n, 0, x, y, w, h));
  return true;
}

export class Frame {
  /** Текущее открытое окно сцены или null. */
  static current(scene) { return open.get(scene) || null; }

  /** Закрыть открытое окно сцены (если есть). true, если что-то закрылось. */
  static closeCurrent(scene) {
    const f = open.get(scene);
    if (!f) return false;
    f.close();
    return true;
  }

  /**
   * @param cfg.w, cfg.h      размер окна в экранных px
   * @param cfg.x, cfg.y      центр окна (по умолчанию центр экрана)
   * @param cfg.title         заголовок (пишется капителью)
   * @param cfg.depth         глубина (по умолчанию 9800)
   * @param cfg.k             масштаб орнамента (0.26)
   * @param cfg.pad           отступ содержимого от орнамента (24)
   * @param cfg.closable      крестик и Esc (true)
   * @param cfg.modal         затемнение и перехват кликов под окном (true)
   * @param cfg.closeOnOutside клик мимо окна закрывает (true)
   * @param cfg.medal         медальон-череп сверху (true)
   * @param cfg.exclusive     окно занимает место «одного окна» сцены (true); false для диалога и тостов
   * @param cfg.onClose       вызывается один раз при закрытии
   */
  constructor(scene, cfg = {}) {
    this.exclusive = cfg.exclusive !== false;
    if (this.exclusive) Frame.closeCurrent(scene);
    this.scene = scene;
    this.cfg = cfg;
    this.objs = [];
    this.closed = false;
    const zoom = scene.cameras.main.zoom || 1;
    this.s = v => v / zoom;
    const s = this.s;
    const k = cfg.k ?? 0.26;
    const w = Math.round(cfg.w ?? 760), h = Math.round(cfg.h ?? 520);
    const cx = cfg.x ?? 640, cy = cfg.y ?? 360;
    const x0 = Math.round(cx - w / 2), y0 = Math.round(cy - h / 2);
    this.rect = { x: x0, y: y0, w, h };
    this.depth = cfg.depth ?? 9800;
    const D = this.depth;
    const fix = o => { o.setScrollFactor(0); this.objs.push(o); return o; };

    if (cfg.modal !== false) {
      // backdropDepth: на карте затемнение под нижней панелью, её кнопки работают и при открытом окне
      const back = fix(scene.add.rectangle(s(640), s(360), s(1400), s(800), 0x000000, 0.45).setDepth(cfg.backdropDepth ?? D - 1));
      back.setInteractive();
      if (cfg.closeOnOutside !== false) back.on('pointerdown', () => this.close());
    }

    const has = ensureFrames(scene);
    // Заливка (кусок середины dialog_frame, растянут) или тёмный прямоугольник
    const ins = Math.round(40 * k);
    if (has) {
      fix(scene.add.image(s(x0 + ins), s(y0 + ins), KEY, 'fill').setOrigin(0)
        .setDisplaySize(s(w - ins * 2), s(h - ins * 2)).setDepth(D).setAlpha(0.97));
    } else {
      fix(scene.add.rectangle(s(cx), s(cy), s(w), s(h), HEX.bg, 0.95).setStrokeStyle(s(2), HEX.gold, 0.8).setDepth(D));
    }
    // Окно ловит клики, чтобы они не уходили под него
    fix(scene.add.zone(s(cx), s(cy), s(w), s(h)).setInteractive().setDepth(D));

    if (has) {
      const P = n => PIECES[n];
      const cw = Math.round(P('tl')[2] * k), ch = Math.round(P('tl')[3] * k);
      const tile = (n, x, y, ww, hh) => fix(scene.add.tileSprite(s(x), s(y), s(ww), s(hh), KEY, n)
        .setOrigin(0).setTileScale(k / zoom).setDepth(D + 1));
      const topH = Math.round(P('top')[3] * k), sideW = Math.round(P('left')[2] * k);
      if (w - 2 * cw > 0) {
        tile('top', x0 + cw, y0, w - 2 * cw, topH);
        tile('bottom', x0 + cw, y0 + h - topH, w - 2 * cw, topH);
      }
      if (h - 2 * ch > 0) {
        tile('left', x0, y0 + ch, sideW, h - 2 * ch);
        tile('right', x0 + w - sideW, y0 + ch, sideW, h - 2 * ch);
      }
      const corner = (n, x, y) => fix(scene.add.image(s(x), s(y), KEY, n).setOrigin(0).setScale(k / zoom).setDepth(D + 2));
      corner('tl', x0, y0); corner('tr', x0 + w - cw, y0);
      corner('bl', x0, y0 + h - ch); corner('br', x0 + w - cw, y0 + h - ch);
      if (cfg.medal !== false) {
        fix(scene.add.image(s(cx), s(y0), KEY, 'medal').setOrigin(0.5, 0).setScale(k / zoom).setDepth(D + 3));
      }
    }

    // Поле содержимого: внутренний край орнамента + 24 px (cfg.pad для узких плашек)
    const pad = cfg.pad ?? PAD;
    const railX = Math.round(RAIL_X * k), railY = Math.round(RAIL_Y * k);
    let top = y0 + railY + pad;
    if (cfg.title) {
      const t = fix(scene.add.text(s(cx), s(top - 6), caps(cfg.title), textStyle('title', s)).setOrigin(0.5, 0).setDepth(D + 5));
      const ty = top - 6 + t.height * (scene.cameras.main.zoom || 1) + 8;
      this.divider(cx - Math.min(260, w / 2 - railX - pad), ty, Math.min(520, w - 2 * (railX + pad)));
      top = ty + 14;
    }
    this.inner = { x: x0 + railX + pad, y: top, w: w - 2 * (railX + pad), h: y0 + h - railY - pad - top };

    if (cfg.closable !== false) {
      const bx = x0 + w - railX - 10, by = y0 + railY + 10;
      const btn = fix(scene.add.text(s(bx), s(by), '✕', {
        fontFamily: FONT, fontSize: `${s(20)}px`, color: COLOR.gold, stroke: '#000', strokeThickness: s(3),
      }).setOrigin(0.5).setDepth(D + 6).setInteractive({ useHandCursor: true }));
      btn.on('pointerover', () => btn.setColor(COLOR.goldHi));
      btn.on('pointerout', () => btn.setColor(COLOR.gold));
      btn.on('pointerdown', () => this.close());
      this._esc = () => this.close();
      scene.input.keyboard?.on('keydown-ESC', this._esc);
    }
    this._shutdown = () => this.close(true);
    scene.events.once('shutdown', this._shutdown);
    if (this.exclusive) open.set(scene, this);
  }

  /** Показать или спрятать окно целиком (свёрнутый лог боя). */
  setVisible(v) {
    this.objs.forEach(o => o.setVisible?.(v));
    return this;
  }

  /** Тонкий золотой разделитель с ромбом посередине (экранные px). */
  divider(x, y, w) {
    const s = this.s;
    const g = this.scene.add.graphics().setScrollFactor(0).setDepth(this.depth + 4);
    g.fillStyle(HEX.gold, 0.55).fillRect(s(x), s(y), s(w), s(1));
    g.fillStyle(HEX.gold, 0.18).fillRect(s(x), s(y + 1), s(w), s(1));
    const m = s(x + w / 2), r = s(4);
    g.fillStyle(HEX.gold, 0.9).fillPoints([{ x: m, y: s(y) - r }, { x: m + r, y: s(y) }, { x: m, y: s(y) + r }, { x: m - r, y: s(y) }], true);
    this.objs.push(g);
    return g;
  }

  /** Добавить объект в окно: приклеить к экрану, поднять над рамкой, уничтожить вместе с окном. */
  add(obj, dz = 5) {
    obj.setScrollFactor?.(0);
    if (obj.depth < this.depth + 1) obj.setDepth?.(this.depth + dz);
    this.objs.push(obj);
    return obj;
  }

  /** Стиль текста с учётом zoom камеры. */
  style(kind, extra) { return textStyle(kind, this.s, extra); }

  /** Текст в экранных координатах. */
  text(x, y, str, kind = 'body', extra = {}) {
    return this.add(this.scene.add.text(this.s(x), this.s(y), str, this.style(kind, extra)));
  }

  close(silent = false) {
    if (this.closed) return;
    this.closed = true;
    if (this._esc) this.scene.input.keyboard?.off('keydown-ESC', this._esc);
    this.scene.events.off('shutdown', this._shutdown);
    this.objs.forEach(o => { try { o.destroy(); } catch {} });
    this.objs = [];
    if (open.get(this.scene) === this) open.delete(this.scene);
    if (!silent) this.cfg.onClose?.();
  }
}
