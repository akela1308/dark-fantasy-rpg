/**
 * MapEditor: dev-редактор зон ходьбы, выходов, спавнов, NPC и перекрывающих объектов прямо на карте.
 * Включается только с ?dev=1 в адресе. Подключение в MapScene.create(): MapEditor.attach(this, cfg).
 *
 * Клавиши (по 13_ПРОМПТ, шаг 2):
 *   E  включить/выключить редактор (пока включён, герой не ходит по клику)
 *   M  маска ходьбы (по умолчанию): клетки 24 px, зелёные можно, красные нельзя.
 *      B кисть (открыть), C ластик (закрыть), F заливка (связная область меняет цвет), [ ] размер кисти.
 *      ЛКМ рисует выбранным инструментом, ПКМ всегда стирает. Маска главнее прямоугольников W.
 *   W  режим зон ходьбы: тянуть мышью прямоугольник (старый способ)
 *   X  режим зон выхода: тянуть прямоугольник, затем ввести id карты и id спавна
 *   S  поставить точку спавна (клик), ввести id
 *   N  поставить NPC (клик), ввести id
 *   O  отметить основание перекрывающего объекта (клик по точке, где объект касается земли), ввести id
 *   Z  отменить последнее действие;  ПКМ по прямоугольнику или точке: удалить
 *   P  выгрузить: JSON в консоль и файл <map>.zones.json (скачивание). Поле grid целиком вставить
 *      в src/data/walkgrid.json под ключом карты (или поправить разметку в tools/walkgrid_specs.json
 *      и собрать: python3 tools/walkgrid.py build <карта>)
 *   R  сбросить правки этой карты (вернуть данные из maps.json)
 * Всё сохраняется в localStorage (mapeditor:<map>) и сразу применяется к зонам ходьбы.
 * Формат совпадает с полями maps.json: walk, exits, spawnPoints, npcs (+ occluders для пропсов).
 */
import { CELL, COLS, ROWS, encodeGrid, decodeGrid } from '../systems/WalkableZones.js';

const KEY = (m) => `mapeditor:${m}`;
const COLORS = { walk: 0x33ff66, exit: 0xffaa22, spawn: 0x33ccff, npc: 0xff66cc, occluder: 0xffff55 };

export class MapEditor {
  static enabled() {
    try { return new URLSearchParams(window.location.search).has('dev'); } catch { return false; }
  }

  static attach(scene, cfg) {
    if (!MapEditor.enabled()) return null;
    const ed = new MapEditor(scene, cfg);
    window.__mapEditor = ed;
    return ed;
  }

  constructor(scene, cfg) {
    this.scene = scene;
    this.mapKey = scene.mapKey;
    this.cfg = cfg || {};
    this.active = false;
    this.mode = 'mask';
    this.tool = 'brush';
    this.brush = 1;
    this.history = [];
    this.data = this._load();
    this._applyWalk();

    this.g = scene.add.graphics().setDepth(9000);
    this.hud = scene.add.text(8, 8, '', {
      fontFamily: 'monospace', fontSize: '13px', color: '#ffffff', backgroundColor: 'rgba(0,0,0,0.65)',
      padding: { x: 6, y: 4 },
    }).setScrollFactor(0).setDepth(9001).setVisible(false);
    this.labels = [];

    const kb = scene.input.keyboard;
    kb.on('keydown-E', () => this.toggle());
    kb.on('keydown-M', () => this._setMode('mask'));
    kb.on('keydown-B', () => this._setTool('brush'));
    kb.on('keydown-C', () => this._setTool('erase'));
    kb.on('keydown-F', () => this._setTool('fill'));
    kb.on('keydown-OPEN_BRACKET', () => { if (this.active) { this.brush = Math.max(1, this.brush - 1); this._draw(); } });
    kb.on('keydown-CLOSED_BRACKET', () => { if (this.active) { this.brush = Math.min(8, this.brush + 1); this._draw(); } });
    kb.on('keydown-W', () => this._setMode('walk'));
    kb.on('keydown-X', () => this._setMode('exit'));
    kb.on('keydown-S', () => this._setMode('spawn'));
    kb.on('keydown-N', () => this._setMode('npc'));
    kb.on('keydown-O', () => this._setMode('occluder'));
    kb.on('keydown-Z', () => this.active && this._undo());
    kb.on('keydown-P', () => this.active && this.exportJSON());
    kb.on('keydown-R', () => this.active && this._reset());

    scene.input.on('pointerdown', (p) => this._down(p));
    scene.input.on('pointermove', (p) => this._move(p));
    scene.input.on('pointerup', (p) => this._up(p));
    scene.events.once('shutdown', () => { if (window.__mapEditor === this) window.__mapEditor = null; });
  }

  // ── данные ────────────────────────────────────────────────────────────────
  _fromConfig() {
    const c = this.cfg;
    return {
      walk: JSON.parse(JSON.stringify(this.scene.walkable?.zones || c.walk || [])),
      exits: (c.exits || []).map(e => ({ zone: { ...e.zone }, toMap: e.toMap, spawnId: e.spawnId })),
      spawnPoints: JSON.parse(JSON.stringify(c.spawnPoints || {})),
      npcs: (c.npcs || []).map(n => ({ id: n.id, x: n.x, y: n.y })),
      occluders: (c.props || []).filter(p => p.occluder).map(p => ({ id: p.key, x: p.x, y: p.y })),
      grid: this.scene.walkable ? encodeGrid(this.scene.walkable.cells) : null,
    };
  }

  _load() {
    try {
      const raw = window.localStorage.getItem(KEY(this.mapKey));
      if (raw) return JSON.parse(raw);
    } catch { /* приватный режим: работаем без сохранения */ }
    return this._fromConfig();
  }

  _save() {
    try { window.localStorage.setItem(KEY(this.mapKey), JSON.stringify(this.data)); } catch { /* ignore */ }
    this._applyWalk();
    this._draw();
  }

  _applyWalk() {
    const w = this.scene.walkable;
    if (!w) return;
    if (Array.isArray(this.data.walk) && this.data.walk.length) w.zones = this.data.walk.map(z => ({ ...z }));
    if (this.data.grid?.rows) w.setCells(decodeGrid(this.data.grid));
  }

  // ── маска: кисть, ластик, заливка ─────────────────────────────────────────
  _cells() { return this.scene.walkable.cells; }

  _paint(x, y, val) {
    const cells = this._cells();
    const c0 = Math.floor(x / CELL), r0 = Math.floor(y / CELL), rad = this.brush - 1;
    for (let r = r0 - rad; r <= r0 + rad; r++) for (let c = c0 - rad; c <= c0 + rad; c++) {
      if (c < 0 || r < 0 || c >= COLS || r >= ROWS) continue;
      if ((c - c0) ** 2 + (r - r0) ** 2 > rad * rad + rad) continue;   // круглая кисть
      cells[r * COLS + c] = val;
    }
  }

  _fill(x, y) {
    const cells = this._cells();
    const c0 = Math.floor(x / CELL), r0 = Math.floor(y / CELL);
    if (c0 < 0 || r0 < 0 || c0 >= COLS || r0 >= ROWS) return;
    const from = cells[r0 * COLS + c0], to = from ? 0 : 1;
    const stack = [r0 * COLS + c0];
    while (stack.length) {
      const i = stack.pop();
      if (cells[i] !== from) continue;
      cells[i] = to;
      const c = i % COLS, r = (i - c) / COLS;
      if (c > 0) stack.push(i - 1);
      if (c < COLS - 1) stack.push(i + 1);
      if (r > 0) stack.push(i - COLS);
      if (r < ROWS - 1) stack.push(i + COLS);
    }
  }

  _commitMask() {
    this.data.grid = encodeGrid(this._cells());
    this._save();
  }

  _setTool(t) { if (!this.active) return; this.mode = 'mask'; this.tool = t; this._draw(); }

  _push() { this.history.push(JSON.stringify(this.data)); if (this.history.length > 100) this.history.shift(); }
  _undo() { const h = this.history.pop(); if (h) { this.data = JSON.parse(h); this._save(); } }
  _reset() {
    if (!window.confirm(`Сбросить правки карты ${this.mapKey}?`)) return;
    try { window.localStorage.removeItem(KEY(this.mapKey)); } catch { /* ignore */ }
    this._push(); this.data = this._fromConfig(); this._save();
  }

  // ── режимы и ввод ─────────────────────────────────────────────────────────
  toggle() {
    this.active = !this.active;
    const hero = this.scene.hero;
    if (hero) {
      if (this.active) { this._heroMove = hero.moveTo; hero.moveTo = () => {}; hero.stopMove?.(); }
      else if (this._heroMove) { hero.moveTo = this._heroMove; this._heroMove = null; }
    }
    this.hud.setVisible(this.active);
    this._draw();
  }

  _setMode(m) { if (!this.active) return; this.mode = m; this._draw(); }

  _down(p) {
    if (!this.active) return;
    const x = Math.round(p.worldX), y = Math.round(p.worldY);
    if (this.mode === 'mask') {
      this._push();
      if (!p.rightButtonDown() && this.tool === 'fill') { this._fill(x, y); this._commitMask(); return; }
      this.painting = p.rightButtonDown() || this.tool === 'erase' ? 0 : 1;
      this._paint(x, y, this.painting);
      this._drawMask();
      return;
    }
    if (p.rightButtonDown()) { this._deleteAt(x, y); return; }
    if (this.mode === 'walk' || this.mode === 'exit') { this.drag = { x0: x, y0: y, x1: x, y1: y }; return; }
    if (this.mode === 'spawn') {
      const id = window.prompt('id спавна (например from_village, default):', 'default');
      if (!id) return;
      this._push(); this.data.spawnPoints[id] = { x, y }; this._save();
    } else if (this.mode === 'npc') {
      const id = window.prompt('id NPC:', '');
      if (!id) return;
      this._push(); this.data.npcs = this.data.npcs.filter(n => n.id !== id); this.data.npcs.push({ id, x, y }); this._save();
    } else if (this.mode === 'occluder') {
      const id = window.prompt('id объекта (основание = эта точка):', '');
      if (!id) return;
      this._push(); this.data.occluders = (this.data.occluders || []).filter(o => o.id !== id);
      this.data.occluders.push({ id, x, y }); this._save();
    }
  }

  _move(p) {
    if (this.active && this.mode === 'mask' && this.painting !== undefined && p.isDown) {
      this._paint(p.worldX, p.worldY, this.painting);
      this._drawMask();
      return;
    }
    if (!this.active || !this.drag) return;
    this.drag.x1 = Math.round(p.worldX); this.drag.y1 = Math.round(p.worldY);
    this._draw();
  }

  _up() {
    if (this.painting !== undefined) { this.painting = undefined; this._commitMask(); return; }
    if (!this.active || !this.drag) return;
    const d = this.drag; this.drag = null;
    const r = { x: Math.min(d.x0, d.x1), y: Math.min(d.y0, d.y1), w: Math.abs(d.x1 - d.x0), h: Math.abs(d.y1 - d.y0) };
    if (r.w < 8 || r.h < 8) { this._draw(); return; }
    if (this.mode === 'walk') {
      this._push(); this.data.walk.push(r); this._save();
    } else {
      const known = (this.cfg.exits || []).map(e => e.toMap).join(', ');
      const toMap = window.prompt(`Куда ведёт выход? (${known || 'id карты'})`, this.cfg.exits?.[0]?.toMap || '');
      if (!toMap) { this._draw(); return; }
      const spawnId = window.prompt('id спавна на той карте:', `from_${this.mapKey}`) || 'default';
      this._push(); this.data.exits.push({ zone: r, toMap, spawnId }); this._save();
    }
  }

  _deleteAt(x, y) {
    const inR = (z) => x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h;
    const near = (pt) => Math.hypot(pt.x - x, pt.y - y) < 14;
    this._push();
    const sp = Object.entries(this.data.spawnPoints).find(([, v]) => near(v));
    if (sp) { delete this.data.spawnPoints[sp[0]]; return this._save(); }
    let i = this.data.npcs.findIndex(near);
    if (i >= 0) { this.data.npcs.splice(i, 1); return this._save(); }
    i = (this.data.occluders || []).findIndex(near);
    if (i >= 0) { this.data.occluders.splice(i, 1); return this._save(); }
    i = this.data.exits.findIndex(e => inR(e.zone));
    if (i >= 0) { this.data.exits.splice(i, 1); return this._save(); }
    i = this.data.walk.map(inR).lastIndexOf(true);
    if (i >= 0) { this.data.walk.splice(i, 1); return this._save(); }
    this.history.pop();
  }

  // ── отрисовка ─────────────────────────────────────────────────────────────
  // Маска поверх карты: зелёные клетки можно, красные нельзя
  _drawMask() {
    if (!this.mg) this.mg = this.scene.add.graphics().setDepth(8999);
    const g = this.mg; g.clear();
    if (!this.active) return;
    const cells = this._cells();
    for (let i = 0; i < cells.length; i++) {
      const c = i % COLS, r = (i - c) / COLS;
      g.fillStyle(cells[i] ? 0x33ff66 : 0xff3333, cells[i] ? 0.28 : 0.16);
      g.fillRect(c * CELL + 1, r * CELL + 1, CELL - 2, CELL - 2);
    }
  }

  _draw() {
    const g = this.g; g.clear();
    this.labels.forEach(l => l.destroy()); this.labels = [];
    this._drawMask();
    if (!this.active) return;
    const label = (x, y, t, c) => this.labels.push(this.scene.add.text(x, y, t, {
      fontFamily: 'monospace', fontSize: '14px', color: c, stroke: '#000', strokeThickness: 3,
    }).setDepth(9001));
    const rect = (z, col, a) => { g.fillStyle(col, a); g.fillRect(z.x, z.y, z.w, z.h); g.lineStyle(2, col, 1); g.strokeRect(z.x, z.y, z.w, z.h); };
    if (this.mode === 'walk') this.data.walk.forEach((z, i) => { rect(z, COLORS.walk, 0.12); label(z.x + 3, z.y + 2, `${i}`, '#66ff88'); });
    this.data.exits.forEach(e => { rect(e.zone, COLORS.exit, 0.22); label(e.zone.x + 3, e.zone.y + 2, `→${e.toMap}:${e.spawnId}`, '#ffcc66'); });
    Object.entries(this.data.spawnPoints).forEach(([id, p]) => {
      g.fillStyle(COLORS.spawn, 1); g.fillCircle(p.x, p.y, 7); label(p.x + 9, p.y - 8, id, '#66ddff');
    });
    this.data.npcs.forEach(n => { g.fillStyle(COLORS.npc, 1); g.fillTriangle(n.x, n.y - 12, n.x - 8, n.y + 4, n.x + 8, n.y + 4); label(n.x + 9, n.y - 8, n.id, '#ff99dd'); });
    (this.data.occluders || []).forEach(o => {
      g.lineStyle(2, COLORS.occluder, 1); g.lineBetween(o.x - 30, o.y, o.x + 30, o.y); label(o.x + 4, o.y + 2, `осн ${o.id}`, '#ffff77');
    });
    if (this.drag) {
      const d = this.drag;
      rect({ x: Math.min(d.x0, d.x1), y: Math.min(d.y0, d.y1), w: Math.abs(d.x1 - d.x0), h: Math.abs(d.y1 - d.y0) },
        this.mode === 'exit' ? COLORS.exit : COLORS.walk, 0.25);
    }
    const tools = { brush: 'кисть', erase: 'ластик', fill: 'заливка' };
    const names = { mask: `M маска: ${tools[this.tool]}, кисть ${this.brush}`, walk: 'W зоны ходьбы', exit: 'X выходы', spawn: 'S спавны', npc: 'N NPC', occluder: 'O основания объектов' };
    this.hud.setText([
      `РЕДАКТОР ${this.mapKey}  режим: ${names[this.mode]}`,
      'E выкл  M маска (B кисть, C ластик, F заливка, [ ] размер, ПКМ стереть)',
      'W/X тянуть прямоугольник  S/N/O клик  ПКМ удалить  Z отмена  P выгрузить  R сброс',
      `зон ${this.data.walk.length}  выходов ${this.data.exits.length}  спавнов ${Object.keys(this.data.spawnPoints).length}  NPC ${this.data.npcs.length}`,
    ].join('\n'));
  }

  // ── выгрузка ──────────────────────────────────────────────────────────────
  exportJSON() {
    const out = { map: this.mapKey, ...this.data };
    const text = JSON.stringify(out, null, 1);
    console.log(`[MapEditor] ${this.mapKey}.zones.json\n` + text);
    try {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      a.download = `${this.mapKey}.zones.json`;
      document.body.appendChild(a); a.click(); a.remove();
    } catch { /* без DOM: только консоль */ }
    return out;
  }
}
