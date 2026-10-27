/**
 * DialoguePanel: окно диалога внизу экрана (этап 6) в общей рамке Frame.
 *
 * Портреты по краям экрана, между ними окно: реплика, разделитель, варианты ответа.
 * Окно растёт вверх по содержимому (5-8 вариантов помещаются, у вариантов перенос строк).
 * Клавиши 1-9 выбирают вариант, Esc выбирает «уйти», если такой вариант есть.
 * Без портрета собеседника его имя пишется в окне над репликой.
 *
 * show({ portraitLeft, portraitRight, speakerName, speakerNameLeft, text, choices: [{ label, style, disabled, reason, onSelect }] })
 * style: default (золото), attack (красный), threat (оранжевый), retreat (серый: уйти без последствий).
 */
import { Sfx } from '../systems/Sfx.js';
import { Frame } from './Frame.js';
import { COLOR, HEX } from './Theme.js';

const SW = 1280, SH = 720;
const PORT_W = 185, PORT_H = 255;
const FRAME_W = 870;
const MIN_H = 250, MAX_H = 600;
const DEPTH = 9500;

const STYLE = {
  default: [COLOR.gold, '#ffd98a'],
  attack:  ['#e05050', '#ff8a80'],
  threat:  ['#e08030', '#ffb060'],
  retreat: ['#9a9484', '#d0c8b4'],
};

export class DialoguePanel {
  constructor(scene) {
    this.scene = scene;
    this._objs = [];
    this._frame = null;
    this._active = false;
    this._keys = null;
  }

  show(cfg) {
    if (!this._active) Sfx.play(this.scene, 'page');
    this.hide();
    this._active = true;
    const scene = this.scene;
    const zoom = scene.cameras.main.zoom || 1;
    const s = v => v / zoom;
    const hasRight = !!(cfg.portraitRight && scene.textures.exists(cfg.portraitRight));
    const hasLeft = !!(cfg.portraitLeft && scene.textures.exists(cfg.portraitLeft));
    const choices = cfg.choices || [];

    // Сначала мерим содержимое невидимыми текстами, потом строим окно нужной высоты
    const padX = 76;                       // орнамент + 24 px
    const textW = FRAME_W - padX * 2;
    const style = (size, color, extra = {}) => ({
      fontFamily: 'Georgia, "Times New Roman", serif', fontSize: `${s(size)}px`, color,
      stroke: '#000000', strokeThickness: s(1.5), lineSpacing: s(3),
      wordWrap: { width: s(textW), useAdvancedWrap: true }, ...extra,
    });
    const mk = (str, st) => scene.add.text(0, 0, str, st).setScrollFactor(0).setVisible(false);
    const h = o => o.height * zoom;        // высота текста в экранных px

    const name = !hasRight && cfg.speakerName ? mk(cfg.speakerName, style(18, COLOR.gold, { letterSpacing: s(1) })) : null;
    const speech = mk(cfg.text || '', style(15, '#e8e2d4'));
    const opts = choices.map((ch, i) => {
      const label = `${i + 1}. ${ch.label}${ch.disabled && ch.reason ? `  [${ch.reason}]` : ''}`;
      const [color] = ch.disabled ? ['#6a645a'] : STYLE[ch.style] || STYLE.default;
      return mk(label, style(14, color, { wordWrap: { width: s(textW - 16), useAdvancedWrap: true } }));
    });
    const GAP = 6, SEP = 22;
    const contentH = (name ? h(name) + 6 : 0) + h(speech) + SEP + opts.reduce((a, o) => a + h(o) + GAP, 0);
    const frameH = Math.max(MIN_H, Math.min(MAX_H, Math.round(contentH + 2 * 66)));
    const cy = SH - 4 - frameH / 2;

    this._frame = new Frame(scene, {
      w: FRAME_W, h: frameH, y: cy, depth: DEPTH, modal: false, closable: false, exclusive: false, medal: true,
    });
    const f = this._frame;
    const inner = f.inner;
    // Если всё не помещается (очень длинная реплика), реплика ужимается по высоте
    const over = Math.max(0, contentH - inner.h);

    let y = inner.y + Math.max(0, (inner.h - contentH) / 2) - 4;
    const place = (o, x, yy) => { f.add(o.setPosition(s(x), s(yy)).setVisible(true), 5); return o; };
    if (name) { place(name, inner.x, y); y += h(name) + 6; }
    place(speech, inner.x, y);
    if (over > 0) {
      const maskH = Math.max(40, h(speech) - over);
      const g = scene.make.graphics({ add: false });
      g.fillRect(0, s(y), s(SW), s(maskH));
      speech.setMask(g.createGeometryMask());
      this._objs.push(g);
      y += maskH;
    } else {
      y += h(speech);
    }
    f.divider(inner.x + textW / 2 - 160, y + SEP / 2 - 1, 320);
    y += SEP;

    opts.forEach((o, i) => {
      const ch = choices[i];
      place(o, inner.x + 8, y);
      const oh = h(o);
      if (!ch.disabled) {
        const [color, hover] = STYLE[ch.style] || STYLE.default;
        const bar = f.add(scene.add.rectangle(s(inner.x - 4), s(y - 2), s(textW + 8), s(oh + 4), HEX.gold, 0)
          .setOrigin(0).setInteractive({ useHandCursor: true }), 4);
        bar.on('pointerover', () => { o.setColor(hover); bar.setFillStyle(HEX.gold, 0.1); });
        bar.on('pointerout', () => { o.setColor(color); bar.setFillStyle(HEX.gold, 0); });
        bar.on('pointerdown', () => this._choose(ch));
      }
      y += oh + GAP;
    });

    // Портреты по краям экрана
    const portCY = SH - 4 - PORT_H / 2 - 10;
    if (hasLeft) this._portrait(PORT_W / 2 + 5, portCY, cfg.portraitLeft, cfg.speakerNameLeft);
    if (hasRight) this._portrait(SW - PORT_W / 2 - 5, portCY, cfg.portraitRight, cfg.speakerName);

    // Клавиатура: 1-9 выбирают вариант, Esc уходит
    this._keys = ev => {
      if (!this._active) return;
      const n = parseInt(ev.key, 10);
      if (n >= 1 && n <= 9) {
        const ch = choices[n - 1];
        if (ch && !ch.disabled) this._choose(ch);
      } else if (ev.key === 'Escape') {
        // Уход без последствий (серый вариант), но не «Дальше.»: Esc не листает разговор вперёд
        const leave = [...choices].reverse().find(c => c.style === 'retreat' && !c.disabled && !c.irreversible && !/^Дальше/.test(String(c.label)));
        if (leave) this._choose(leave);
      }
    };
    scene.input.keyboard?.on('keydown', this._keys);

    // Появление: одна общая анимация прозрачности
    const fade = f.objs.concat(this._objs).filter(o => o.setAlpha && o.alpha > 0).map(o => [o, o.alpha]);
    fade.forEach(([o]) => o.setAlpha(0));
    scene.tweens.addCounter({
      from: 0, to: 1, duration: 180, ease: 'Power1',
      onUpdate: tw => fade.forEach(([o, a]) => o.active && o.setAlpha(a * tw.getValue())),
    });
  }

  _choose(ch) {
    if (!this._active) return;
    this.hide();
    ch.onSelect?.();
  }

  _portrait(x, y, key, name) {
    const scene = this.scene;
    const zoom = scene.cameras.main.zoom || 1;
    const s = v => v / zoom;
    const img = scene.add.image(s(x), s(y), key).setDepth(DEPTH + 2).setScrollFactor(0);
    img.setScale(Math.min(s(PORT_W) / img.width, s(PORT_H) / img.height));
    this._objs.push(img);
    if (name) {
      const t = scene.add.text(s(x), s(y + PORT_H / 2 + 2), name, {
        fontFamily: 'Georgia, "Times New Roman", serif', fontSize: `${s(13)}px`, color: COLOR.gold,
        stroke: '#000', strokeThickness: s(3), letterSpacing: s(1),
      }).setOrigin(0.5, 1).setDepth(DEPTH + 5).setScrollFactor(0);
      this._objs.push(t);
    }
  }

  hide() {
    if (this._active) this._closedAt = this.scene.time.now;
    if (this._keys) this.scene.input.keyboard?.off('keydown', this._keys);
    this._keys = null;
    this._frame?.close(true);
    this._frame = null;
    this._objs.forEach(o => { try { o.destroy(); } catch {} });
    this._objs = [];
    this._active = false;
  }

  get active() { return this._active; }
}
