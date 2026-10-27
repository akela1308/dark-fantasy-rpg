import eventBus from '../utils/eventBus.js';
import skillsData from '../data/skills.json';
import { Frame } from './Frame.js';
import { Tooltip } from './Tooltip.js';
import { FONT, COLOR, HEX } from './Theme.js';

/**
 * UIManager: интерфейс боя (этап 6).
 * Внизу слева бронзовая полоса с нишами (из bottom_panel1, как на карте): навыки, «Защита», «Пропустить».
 * Имена навыков в подсказке, под нишей только заряды или ожидание. Внизу справа лог в рамке окна:
 * урон красным, лечение зелёным. Сверху очередь ходов портретами. Цели навыка отмечены кольцом под ногами.
 */
const SKILL_ICONS = {
  rapier_strike:  'icon_rapier_strike',
  dueling_stance: 'icon_dueling_stance',
  pistol_shot:    'icon_pistol',
  last_argument_shot: 'icon_pistol',
  shield_cover:   'icon_hand',
  heavy_strike:   'icon_might',
  bandage:        'icon_heart',
  aimed_shot:     'icon_bow',
  challenge:      'icon_dual_sword',
  bitter_poultice: 'icon_drop',
  resin_brew:     'icon_healing_potion',
  dope_smoke:     'icon_drop',
};

// Полоса навыков: куски bottom_panel1.png (866×288). Столбы между нишами на x 121, 250, 377, 504, 622
const BAR = { key: 'battle_bar', src: 'bottom_panel1', H: 150, X: 120, left: [0, 121], niche: [121, 128], right: [622, 244], nicheCx: 64, lastCx: 84 };
const ICON = 46;

// Лог боя
const LOG = { x: 632, y: 588, w: 548, h: 130, lines: 5, step: 15 };

export class UIManager {
  constructor(scene) {
    this.scene = scene;
    this._log = [];
    this._logTexts = [];
    this._actionBtns = [];
    this._borders = [];
    this._rings = [];
    this._queueObjs = [];
    this.tip = new Tooltip(scene, 9000);
  }

  init(playerUnits, enemyUnits, turnManager) {
    this.playerUnits = playerUnits;
    this.enemyUnits  = enemyUnits;
    this.turnManager = turnManager;
    this._ensureBarFrames();
    this._createLogPanel();
    this._createTurnLabel();
  }

  _ensureBarFrames() {
    // Своя текстура на той же картинке: кадры полосы не трогают общую текстуру нижней панели карты
    const T = this.scene.textures;
    if (!T.exists(BAR.key) && T.exists(BAR.src)) T.addImage(BAR.key, T.get(BAR.src).getSourceImage());
    const tex = T.exists(BAR.key) ? T.get(BAR.key) : null;
    if (!tex || tex.has('bar_l')) return;
    tex.add('bar_l', 0, BAR.left[0], 0, BAR.left[1], 288);
    tex.add('bar_n', 0, BAR.niche[0], 0, BAR.niche[1], 288);
    tex.add('bar_r', 0, BAR.right[0], 0, BAR.right[1], 288);
  }

  // ── Лог событий ───────────────────────────────────────────────────────

  _createLogPanel() {
    const sc = this.scene;
    this._logFrame = new Frame(sc, {
      x: LOG.x + LOG.w / 2, y: LOG.y + LOG.h / 2, w: LOG.w, h: LOG.h, k: 0.12, pad: 8,
      depth: 3, modal: false, closable: false, exclusive: false, medal: false,
    });
    const inner = this._logFrame.inner;
    for (let i = 0; i < LOG.lines; i++) {
      const t = sc.add.text(inner.x, inner.y - 1 + i * LOG.step, '', {
        fontFamily: FONT, fontSize: '13px', color: COLOR.bone, stroke: '#000', strokeThickness: 2,
      }).setDepth(10);
      this._logTexts.push(t);
    }
    // Свернуть / развернуть: свёрнутый лог оставляет только кнопку-нишу
    this._logCollapsed = false;
    const bx = LOG.x + LOG.w - 30, by = LOG.y + 22;
    const btnBg = sc.add.rectangle(bx, by, 26, 22, 0x0d0b0f, 0.9).setStrokeStyle(1, HEX.gold, 0.6).setDepth(11)
      .setInteractive({ useHandCursor: true });
    const btn = sc.add.text(bx, by, '≡', { fontFamily: FONT, fontSize: '15px', color: COLOR.gold }).setOrigin(0.5).setDepth(12);
    btnBg.on('pointerover', () => { btn.setColor(COLOR.goldHi); this.tip.show(bx, by - 14, { title: 'Лог боя', action: this._logCollapsed ? 'Клик: развернуть' : 'Клик: свернуть' }); });
    btnBg.on('pointerout', () => { btn.setColor(COLOR.gold); this.tip.hide(); });
    btnBg.on('pointerdown', () => {
      this._logCollapsed = !this._logCollapsed;
      this._logFrame.setVisible(!this._logCollapsed);
      this._logTexts.forEach(t => t.setVisible(!this._logCollapsed));
      this.tip.hide();
    });
    this._logBtn = [btnBg, btn];
  }

  appendLog(msg) {
    this._log.push(String(msg));
    if (this._log.length > LOG.lines) this._log.shift();
    this._logTexts.forEach((t, i) => {
      const m = this._log[i - (LOG.lines - this._log.length)] ?? '';
      t.setText(m ? `› ${m}` : '').setColor(this._logColor(m));
      // Не шире рамки: обрезка по словам с многоточием
      if (t.width > LOG.w - 110) {
        let s = `› ${m}`;
        while (t.width > LOG.w - 110 && s.includes(' ')) { s = s.slice(0, s.lastIndexOf(' ')); t.setText(`${s}…`); }
      }
    });
  }

  // Цвет строки: урон красным, лечение зелёным, промах и уклонение серым
  _logColor(m) {
    if (/−\d|урона|КРИТ/.test(m)) return COLOR.damage;
    if (/\+\d+ HP|лечит|восстанавливает/.test(m)) return COLOR.heal;
    if (/промах|уклоняется|недоступен|пропускает/.test(m)) return COLOR.muted;
    return COLOR.bone;
  }

  // ── Очередь ходов и подпись ───────────────────────────────────────────

  _createTurnLabel() {
    this._turnLabel = this.scene.add.text(640, 62, '', {
      fontFamily: FONT, fontSize: '16px', color: COLOR.gold, stroke: '#000', strokeThickness: 3, letterSpacing: 1,
    }).setOrigin(0.5, 0).setDepth(30);
  }

  _updateTurnLabel() {
    const unit = this.turnManager.active;
    if (!unit) return;
    const isPlayer = this.turnManager.isPlayerTurn();
    this._turnLabel.setText(isPlayer ? `Ход: ${unit.label}` : `Ход противника: ${unit.label}`);
    this._turnLabel.setColor(isPlayer ? COLOR.gold : '#e05050');
  }

  /** Портреты по порядку ходов: текущий первым и крупнее. */
  _updateQueue() {
    this._queueObjs.forEach(o => o.destroy());
    this._queueObjs = [];
    const list = this._upcoming(9);
    if (!list.length) return;
    const sc = this.scene;
    const big = 48, small = 38, gap = 6;
    const total = big + (list.length - 1) * (small + gap) + gap;
    let x = 640 - total / 2;
    list.forEach((u, i) => {
      const sz = i === 0 ? big : small;
      const cx = x + sz / 2, cy = 8 + big / 2;
      const color = u.type === 'player' ? 0x5fbf7a : 0xc04a3a;
      const bg = sc.add.rectangle(cx, cy, sz, sz, 0x0d0b0f, 0.92).setStrokeStyle(i === 0 ? 3 : 2, i === 0 ? HEX.gold : color, 1).setDepth(30);
      this._queueObjs.push(bg);
      const key = `portrait_${u.spriteKey ?? u.id}`;
      if (sc.textures.exists(key)) {
        const img = sc.add.image(0, 0, key).setOrigin(0).setDepth(31);
        // Квадрат из середины портрета (без рамки по краям)
        const fw = img.width, fh = img.height;
        const side = Math.min(fw, fh) * 0.62;
        const cxp = fw / 2 - side / 2, cyp = fh * 0.42 - side / 2;
        const k = (sz - 4) / side;
        img.setCrop(cxp, Math.max(0, cyp), side, side).setScale(k);
        img.setPosition(cx - (sz - 4) / 2 - cxp * k, cy - (sz - 4) / 2 - Math.max(0, cyp) * k);
        this._queueObjs.push(img);
      } else {
        this._queueObjs.push(sc.add.text(cx, cy, (u.label || '?')[0], {
          fontFamily: FONT, fontSize: `${Math.round(sz * 0.5)}px`, color: COLOR.bone,
        }).setOrigin(0.5).setDepth(31));
      }
      const hit = sc.add.zone(cx, cy, sz, sz).setDepth(32).setInteractive();
      hit.on('pointerover', () => this.tip.show(cx, cy + sz / 2, { title: u.label, body: `HP ${u.hp}/${u.maxHp}` }, { below: true }));
      hit.on('pointerout', () => this.tip.hide());
      this._queueObjs.push(hit);
      x += sz + gap;
    });
  }

  _upcoming(n) {
    const tm = this.turnManager;
    const alive = u => u.isAlive && !u.surrendered && !u.fled;
    const out = [];
    for (let i = tm.index; i < tm.queue.length && out.length < n; i++) if (alive(tm.queue[i])) out.push(tm.queue[i]);
    // Следующий раунд: тот же порядок по скорости
    const next = [...(tm.all || tm.queue)].filter(alive).sort((a, b) => (b.speed || 0) - (a.speed || 0));
    for (let i = 0; out.length < n && next.length && i < n; i++) out.push(next[i % next.length]);
    if (out[0] !== tm.active && tm.active) out.unshift(tm.active);
    return out.slice(0, n);
  }

  // ── Обновление UI ─────────────────────────────────────────────────────

  update() {
    if (this.scene.battleOver) { this.hideActions(); return; }
    this._updateTurnLabel();
    this._updateQueue();
    this._updateActionButtons();
    this._updateBorders();
  }

  _updateActionButtons() {
    this.tip.hide();
    this._actionBtns.forEach(b => b.destroy());
    this._actionBtns = [];
    if (this.scene.battleOver || !this.turnManager.isPlayerTurn()) return;
    const unit = this.turnManager.active;
    if (!unit) return;

    const ss = this.scene.skillSystem;
    const pending = this.scene._pendingSkill;
    const skillIds = [...unit.skills];
    // Пистолет одной кнопкой: заряды пишутся на нише, а не отдельной кнопкой
    if ((unit.resources?.pistol_charges || 0) > 0 && !skillIds.includes('pistol_shot')) skillIds.push('pistol_shot');
    const buttons = [];
    skillIds.forEach(skillId => {
      const skill = skillsData.find(s => s.id === skillId);
      if (!skill) return;
      const reason = ss?.unavailableReason(skillId, unit) ?? (unit.isOnCooldown(skillId) ? `ждать ${unit.cooldowns[skillId]} х.` : null);
      const charges = skill.usesResource ? unit.resources?.[skill.usesResource] : undefined;
      const cd = unit.isOnCooldown?.(skillId) ? unit.cooldowns[skillId] : 0;
      const badge = cd ? `⌛${cd}` : charges !== undefined ? `×${charges}` : null;
      const body = [skill.description, charges !== undefined ? `Заряды: ${charges}` : null].filter(Boolean).join('\n');
      buttons.push({
        icon: SKILL_ICONS[skillId] || 'icon_dual_sword', badge,
        tip: { title: skill.name, body, action: reason ? `Недоступно: ${reason}` : pending === skillId ? 'Выбрано. Клик или Esc: отменить' : (skill.targetType === 'self' ? 'Клик: применить сразу' : 'Клик: выбрать, затем цель') },
        selected: pending === skillId, disabled: !!reason,
        cb: reason ? null : () => eventBus.emit('skill_selected', skillId),
      });
    });
    const isDefending = unit.effects.some(e => e.type === 'defending');
    buttons.push({
      icon: 'icon_shield', badge: isDefending ? '✓' : null,
      tip: { title: 'Защита', body: 'До следующего хода урон по этому бойцу вдвое меньше. Ход заканчивается.', action: 'Клик: встать в защиту' },
      cb: () => eventBus.emit('defend_action'),
    });
    buttons.push({
      icon: 'icon_broken_sword',
      tip: { title: 'Пропустить ход', body: 'Боец ничего не делает до следующего круга.', action: 'Клик: пропустить' },
      cb: () => eventBus.emit('skip_turn'),
    });

    const centers = this._drawBar(buttons.length);
    buttons.forEach((b, i) => this._niche(centers[i].x, centers[i].y, b));

    // Подсказка над полосой
    const hint = pending
      ? `«${skillsData.find(s => s.id === pending)?.name || pending}»: выберите цель. Esc отменяет`
      : 'Клик по врагу: обычная атака. Навык: выбрать, затем цель';
    this._actionBtns.push(this.scene.add.text(BAR.X + 14, 720 - BAR.H + 6, hint, {
      fontFamily: FONT, fontSize: '12px', color: pending ? COLOR.gold : COLOR.bone, stroke: '#000', strokeThickness: 3,
    }).setOrigin(0, 1).setDepth(10));
  }

  /** Бронзовая полоса на n ниш; возвращает центры ниш (экранные px). */
  _drawBar(n) {
    const sc = this.scene;
    const k = BAR.H / 288;
    const cy = 720 - BAR.H / 2 + 2;
    const has = sc.textures.exists(BAR.key) && sc.textures.get(BAR.key).has('bar_l');
    const centers = [];
    let x = BAR.X;
    const piece = (frame, w) => {
      if (has) this._actionBtns.push(sc.add.image(x, cy, BAR.key, frame).setOrigin(0, 0.5).setScale(k).setDepth(4).setInteractive());
      x += w * k;
    };
    piece('bar_l', BAR.left[1]);
    for (let i = 0; i < n - 1; i++) { centers.push(x + BAR.nicheCx * k); piece('bar_n', BAR.niche[1]); }
    centers.push(x + BAR.lastCx * k);
    piece('bar_r', BAR.right[1]);
    const iconY = cy + BAR.H * 0.09;
    return centers.map(cx => ({ x: cx, y: iconY }));
  }

  _niche(x, y, b) {
    const sc = this.scene;
    const active = !!b.cb;
    if (b.selected) {
      const glow = sc.add.rectangle(x, y, ICON + 12, ICON + 12).setStrokeStyle(3, HEX.gold, 1).setDepth(7);
      sc.tweens.add({ targets: glow, alpha: 0.4, duration: 600, yoyo: true, repeat: -1 });
      this._actionBtns.push(glow);
    }
    if (sc.textures.exists(b.icon)) {
      // Недоступный навык виден, но приглушён (раньше ниша казалась пустой)
      const ico = sc.add.image(x, y, b.icon).setDisplaySize(ICON, ICON).setDepth(5).setAlpha(active ? 0.95 : 0.6);
      if (!active) ico.setTint(0x8a8a8a);
      this._actionBtns.push(ico);
    }
    if (b.badge) {
      this._actionBtns.push(sc.add.text(x + ICON / 2 + 1, y + ICON / 2 + 1, b.badge, {
        fontFamily: FONT, fontSize: '12px', color: b.badge === '✓' ? '#7fcf6a' : COLOR.goldHi, stroke: '#000', strokeThickness: 3,
      }).setOrigin(1, 1).setDepth(8));
    }
    const hit = sc.add.rectangle(x, y, ICON + 8, ICON + 8, HEX.gold, 0).setDepth(9).setInteractive({ useHandCursor: active });
    hit.on('pointerover', () => { if (active) hit.setFillStyle(HEX.gold, 0.12); this.tip.show(x, y - ICON / 2 - 6, b.tip); });
    hit.on('pointerout', () => { hit.setFillStyle(HEX.gold, 0); this.tip.hide(); });
    if (active) hit.on('pointerdown', () => { this.tip.hide(); b.cb(); });
    this._actionBtns.push(hit);
  }

  /** Конец боя: убрать кнопки, подсказку, очередь, подпись хода и кольца. */
  hideActions() {
    this.tip.hide();
    this._actionBtns.forEach(b => b.destroy());
    this._actionBtns = [];
    this._borders.forEach(b => b.destroy());
    this._borders = [];
    this.clearTargets();
    this._queueObjs.forEach(o => o.destroy());
    this._queueObjs = [];
    this._turnLabel?.setVisible(false);
  }

  // ── Кольца: активный боец и цели навыка ───────────────────────────────

  highlightActive() {
    if (this.scene.battleOver) return;
    this._updateBorders();
  }

  _ringW(unit) {
    return unit._bodyPx ? Math.max(70, unit._bodyPx * 0.6) : (unit._sprite.displayWidth || 80);   // по фигуре, а не по кадру листа
  }

  _updateBorders() {
    this._borders.forEach(b => b.destroy());
    this._borders = [];
    const unit = this.turnManager.active;
    if (!unit?.isAlive || !unit._sprite) return;
    const w = this._ringW(unit);
    const gfx = this.scene.add.graphics().setDepth(1);
    gfx.lineStyle(3, unit.type === 'player' ? 0x00ff88 : 0xff3322, 0.9);
    gfx.strokeEllipse(unit._sprite.x, unit._sprite.y, w * 0.9, w * 0.25);
    this._borders.push(gfx);
  }

  /** Возможные цели навыка: пульсирующее кольцо под ногами (не заливка фигуры). */
  showTargets(units, ally = false) {
    this.clearTargets();
    const color = ally ? 0x7fcf6a : HEX.gold;
    units.forEach(u => {
      if (!u._sprite) return;
      const w = this._ringW(u);
      const g = this.scene.add.graphics().setDepth(1);
      g.lineStyle(2, color, 0.95).strokeEllipse(u._sprite.x, u._sprite.y, w * 1.0, w * 0.3);
      g.lineStyle(6, color, 0.25).strokeEllipse(u._sprite.x, u._sprite.y, w * 1.0, w * 0.3);
      this.scene.tweens.add({ targets: g, alpha: 0.45, duration: 650, yoyo: true, repeat: -1 });
      this._rings.push(g);
    });
  }

  clearTargets() {
    this._rings.forEach(g => g.destroy());
    this._rings = [];
  }
}
