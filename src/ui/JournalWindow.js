/**
 * Журнал заданий (этап 6): окно Frame в две колонки.
 * Слева список квестов (название золотом, место серым из поля where), справа выбранный квест:
 * текущий этап крупно, пройденные этапы зачёркнуты, исходы. Вкладки «Текущие» и «Завершено».
 * Будущие этапы не показываются: в них люди и места, о которых герой ещё не знает.
 */
import * as Phaser from 'phaser/dist/phaser.esm.js';
import { Frame } from './Frame.js';
import { COLOR, HEX } from './Theme.js';
import { journal, outcomesSeen } from '../systems/QuestLog.js';
import { checkRequires } from '../systems/DialogueConditions.js';

const W = 960, H = 600;
const LIST_W = 300;
const ROW_H = 50;

export class JournalWindow {
  constructor(scene, ws, { onClose } = {}) {
    this.scene = scene;
    this.ws = ws;
    this.tab = 'active';
    this.sel = null;
    this.scroll = 0;
    this.frame = new Frame(scene, { w: W, h: H, y: 350, title: 'Журнал', onClose });
    this.parts = [];
    this._wheel = (ptr, over, dx, dy) => this._onWheel(ptr, dy);
    scene.input.on('wheel', this._wheel);
    const off = () => scene.input.off('wheel', this._wheel);
    this.frame.cfg.onClose = () => { off(); onClose?.(); };
    scene.events.once('shutdown', off);
    this.render();
  }

  get closed() { return this.frame.closed; }
  close() { this.frame.close(); }

  _entries() {
    const all = journal(this.ws);
    return {
      active: all.filter(e => e.status === 'active'),
      done: all.filter(e => e.status === 'done'),
    };
  }

  _clear() {
    this.parts.forEach(o => { try { o.destroy(); } catch {} });
    this.parts = [];
  }

  _add(o) { this.frame.add(o); this.parts.push(o); return o; }

  _text(x, y, str, kind, extra) {
    const f = this.frame;
    return this._add(this.scene.add.text(f.s(x), f.s(y), str, f.style(kind, extra)));
  }

  render() {
    this._clear();
    const f = this.frame, s = f.s, sc = this.scene;
    const { x, y, w, h } = f.inner;
    const groups = this._entries();
    const list = groups[this.tab];
    if (!list.some(e => e.quest.id === this.sel)) this.sel = list[0]?.quest.id ?? null;

    // Вкладки
    const tabs = [['active', `Текущие (${groups.active.length})`], ['done', `Завершено (${groups.done.length})`]];
    let tx = x;
    tabs.forEach(([id, label]) => {
      const on = this.tab === id;
      const t = this._text(tx + 14, y + 6, label, 'body', { color: on ? COLOR.gold : COLOR.muted });
      const bw = t.width * sc.cameras.main.zoom + 28;
      const bg = this._add(sc.add.rectangle(s(tx), s(y), s(bw), s(32), on ? 0x2a2114 : 0x000000, on ? 0.85 : 0.35)
        .setOrigin(0).setStrokeStyle(s(1), HEX.gold, on ? 0.7 : 0.25));
      bg.setDepth(t.depth - 1).setInteractive({ useHandCursor: true });
      bg.on('pointerdown', () => { this.tab = id; this.sel = null; this.scroll = 0; this.render(); });
      tx += bw + 10;
    });

    const top = y + 46;
    const bodyH = y + h - top;
    // Вертикальный разделитель колонок
    const g = this._add(sc.add.graphics());
    g.fillStyle(HEX.gold, 0.35).fillRect(s(x + LIST_W + 18), s(top), s(1), s(bodyH));

    // Левая колонка: список
    if (!list.length) {
      this._text(x, top + 4, this.tab === 'active' ? 'Открытых заданий нет.' : 'Пока ничего не завершено.', 'body', { color: COLOR.muted });
    }
    const visible = Math.max(1, Math.floor(bodyH / ROW_H));
    const si = list.findIndex(q => q.quest.id === this.sel);
    if (this._follow && si >= 0 && (si < this.scroll || si >= this.scroll + visible)) this.scroll = si - visible + 1;
    this._follow = false;
    this.scroll = Phaser.Math.Clamp(this.scroll, 0, Math.max(0, list.length - visible));
    list.slice(this.scroll, this.scroll + visible).forEach((e, i) => {
      const ry = top + i * ROW_H;
      const on = e.quest.id === this.sel;
      const bg = this._add(sc.add.rectangle(s(x - 8), s(ry), s(LIST_W + 16), s(ROW_H - 4), on ? 0x2a2114 : 0x000000, on ? 0.8 : 0.001)
        .setOrigin(0).setInteractive({ useHandCursor: true }));
      if (on) bg.setStrokeStyle(s(1), HEX.gold, 0.5);
      bg.on('pointerdown', () => { this.sel = e.quest.id; this.render(); });
      const name = this._text(x, ry + 4, e.quest.name, 'body', {
        size: 15, color: this.tab === 'done' ? COLOR.muted : COLOR.gold,
        fixedWidth: s(LIST_W), wordWrap: undefined,
      });
      name.setDepth(bg.depth + 1);
      const where = this._text(x, ry + 25, e.quest.where || '', 'small');
      where.setDepth(bg.depth + 1);
    });
    if (list.length > visible) {
      const more = `${this.scroll + 1}-${Math.min(list.length, this.scroll + visible)} из ${list.length}, колесо мыши`;
      this._text(x, y + h - 14, more, 'small', { color: COLOR.dim });
    }

    // Правая колонка: выбранный квест
    const e = list.find(q => q.quest.id === this.sel);
    if (e) this._renderQuest(e, x + LIST_W + 40, top, w - LIST_W - 40, bodyH);
  }

  _renderQuest(e, x, y, w, h) {
    const sc = this.scene, s = this.frame.s;
    const z = sc.cameras.main.zoom || 1;
    const q = e.quest;
    let cy = y;
    const line = (str, kind, extra = {}, gap = 6) => {
      const t = this._text(x, cy, str, kind, { wordWrap: { width: s(w), useAdvancedWrap: true }, lineSpacing: s(3), ...extra });
      cy += t.height * z + gap;
      return t;
    };
    line(q.name, 'title', { letterSpacing: 0 }, 2);
    line(q.where || '', 'small', {}, 16);

    const done = e.status === 'done';
    const passed = q.stages.filter(st => st !== e.stage && checkRequires(st.doneIf, this.ws).ok);
    if (!done && e.stage) {
      line('Сейчас', 'small', { color: COLOR.gold, letterSpacing: s(2) }, 4);
      line(e.stage.text, 'body', { size: 16, color: COLOR.text }, 18);
    }
    if (passed.length) {
      line(done ? 'Пройдено' : 'Уже сделано', 'small', { color: COLOR.gold, letterSpacing: s(2) }, 4);
      passed.forEach(st => {
        const t = line(st.text, 'body', { size: 13, color: COLOR.muted }, 8);
        this._strike(t, z);
      });
      cy += 8;
    }
    const outs = outcomesSeen(q, this.ws);
    if (outs.length) {
      line('Исходы', 'small', { color: COLOR.gold, letterSpacing: s(2) }, 4);
      outs.forEach(o => line(`◆ ${o}`, 'body', { size: 13, color: COLOR.bone }, 6));
    }
  }

  // Зачёркивание: линия через середину каждой строки текста
  _strike(t, z) {
    const lines = t.getWrappedText ? t.getWrappedText() : [t.text];
    const lh = t.height / Math.max(1, lines.length);
    const g = this._add(this.scene.add.graphics());
    g.setDepth(t.depth + 1);
    const ctx = t.context;   // свой canvas текста, шрифт уже выставлен
    lines.forEach((ln, i) => {
      const lw = ctx ? Math.min(t.width, ctx.measureText(ln.trimEnd()).width) : t.width;
      g.fillStyle(0x8a8270, 0.8).fillRect(t.x, t.y + lh * (i + 0.55), lw, Math.max(1, 1 / z));
    });
  }

  /** Открыть квест по id (выбрать и прокрутить список к нему). */
  select(id) {
    this.sel = id;
    this._follow = true;
    this.render();
  }

  _onWheel(ptr, dy) {
    if (this.closed) return;
    this.scroll += dy > 0 ? 1 : -1;
    this.render();
  }
}
