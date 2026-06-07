import { COLORS, GRID } from '../utils/constants.js';
import { BattleGrid }   from '../systems/BattleGrid.js';
import eventBus from '../utils/eventBus.js';
import skillsData from '../data/skills.json';

/**
 * UIManager — HP-бары, лог, кнопки действий, подсветка хода.
 */
export class UIManager {
  constructor(scene) {
    this.scene = scene;
    this._logLines   = [];
    this._actionBtns = [];
    this._borders    = [];
  }

  init(playerUnits, enemyUnits, turnManager) {
    this.playerUnits = playerUnits;
    this.enemyUnits  = enemyUnits;
    this.turnManager = turnManager;

    this._createLogPanel();
    this._createActionPanel();
    this._createTurnLabel();
  }

  // ── Лог событий ───────────────────────────────────────────────────────

  _createLogPanel() {
    const x = 20, y = 540, w = 600, h = 160;
    this.scene.add.rectangle(x + w/2, y + h/2, w, h, 0x0D0D1A, 0.9)
      .setStrokeStyle(1, 0x333355).setDepth(3);
    this.scene.add.text(x + 10, y + 6, 'ЛОГ БОЯ', { fontSize: '11px', color: '#555577', fontFamily: 'serif' }).setDepth(3);

    this._logContainer = this.scene.add.container(x + 10, y + 22).setDepth(3);
    for (let i = 0; i < 7; i++) {
      const t = this.scene.add.text(0, i * 19, '', { fontSize: '13px', color: '#AAAAAA', fontFamily: 'serif' });
      this._logLines.push(t);
      this._logContainer.add(t);
    }
  }

  appendLog(msg) {
    // Сдвиг строк вверх
    for (let i = 0; i < this._logLines.length - 1; i++) {
      this._logLines[i].setText(this._logLines[i + 1].text);
    }
    this._logLines[this._logLines.length - 1].setText('› ' + msg);
  }

  // ── Панель действий ───────────────────────────────────────────────────

  _createActionPanel() {
    const x = 660, y = 540, w = 600, h = 160;
    this.scene.add.rectangle(x + w/2, y + h/2, w, h, 0x0D0D1A, 0.9)
      .setStrokeStyle(1, 0x333355).setDepth(3);

    this._actionPanel = this.scene.add.container(x + 10, y + 10).setDepth(3);
  }

  _createTurnLabel() {
    this._turnLabel = this.scene.add.text(640, 30, '', {
      fontFamily: 'serif', fontSize: '18px', color: '#E8E8E8',
    }).setOrigin(0.5, 0).setDepth(3);
  }

  // ── Обновление UI ─────────────────────────────────────────────────────

  update() {
    this._updateTurnLabel();
    this._updateActionButtons();
    this._updateBorders();
  }

  _updateTurnLabel() {
    const unit = this.turnManager.active;
    if (!unit) return;
    const isPlayer = this.turnManager.isPlayerTurn();
    this._turnLabel.setText(isPlayer
      ? `⚔ Ход: ${unit.name}`
      : `⏳ Ход противника: ${unit.name}`
    );
    this._turnLabel.setColor(isPlayer ? '#4A90D9' : '#CC2222');
  }

  _updateActionButtons() {
    this._actionBtns.forEach(b => b.destroy());
    this._actionBtns = [];

    if (!this.turnManager.isPlayerTurn()) return;
    const unit = this.turnManager.active;
    if (!unit) return;

    // Маппинг скилла → иконка
    const SKILL_ICONS = {
      rapier_strike:  'icon_rapier_strike',
      dueling_stance: 'icon_dueling_stance',
      pistol_shot:    'icon_pistol',
    };

    // Собираем все скиллы включая пистолет
    const buttons = [];
    unit.skills.forEach(skillId => {
      const skill = skillsData.find(s => s.id === skillId);
      if (!skill) return;
      const onCD = unit.isOnCooldown(skillId);
      buttons.push({ skillId, label: skill.name, icon: SKILL_ICONS[skillId] || null, sub: onCD ? `КД ${unit.cooldowns[skillId]}` : null, tint: onCD ? 0x444444 : null, cb: onCD ? null : () => eventBus.emit('skill_selected', skillId) });
    });
    if ((unit.resources?.pistol_charges || 0) > 0) {
      buttons.push({ skillId: 'pistol_shot', label: 'Пистолет', icon: 'icon_pistol', sub: `×${unit.resources.pistol_charges}`, tint: null, cb: () => eventBus.emit('skill_selected', 'pistol_shot') });
    }

    // Горизонтальный ряд иконок
    const btnSize = 64;
    const gap     = 12;
    const totalW  = buttons.length * (btnSize + gap) - gap;
    const startX  = 960 - totalW / 2;
    const btnY    = 610;

    buttons.forEach((b, i) => {
      const bx = startX + i * (btnSize + gap) + btnSize / 2;
      this._addIconBtn(bx, btnY, b.label, b.icon, b.sub, b.tint, b.cb);
    });

    // Кнопка Пропустить — текстовая справа
    const skip = this.scene.add.text(1230, 548, 'Пропустить', {
      fontSize: '13px', color: '#666666', fontFamily: 'serif',
    }).setOrigin(1, 0).setInteractive({ useHandCursor: true }).setDepth(3);
    skip.on('pointerover', () => skip.setColor('#AAAAAA'));
    skip.on('pointerout',  () => skip.setColor('#666666'));
    skip.on('pointerdown', () => eventBus.emit('skip_turn'));
    this._actionBtns.push(skip);

    // Подсказка
    const hint = this.scene.add.text(670, 548, 'Кликни по врагу для атаки:', {
      fontSize: '12px', color: '#555577', fontFamily: 'serif'
    }).setDepth(3);
    this._actionBtns.push(hint);
  }

  _addIconBtn(x, y, label, iconKey, sub, tint, cb) {
    const size   = 64;
    const active = !!cb;

    // Иконка скилла (под рамкой)
    if (iconKey && this.scene.textures.exists(iconKey)) {
      const ico = this.scene.add.image(x, y, iconKey)
        .setDisplaySize(size - 8, size - 8)
        .setDepth(3)
        .setAlpha(active ? 0.9 : 0.3);
      if (tint) ico.setTint(tint);
      this._actionBtns.push(ico);
    }

    // Рамка поверх иконки
    const frame = this.scene.add.image(x, y, 'skill_button')
      .setDisplaySize(size, size)
      .setDepth(4)
      .setAlpha(active ? 1 : 0.4);

    // Название скилла под кнопкой
    const lbl = this.scene.add.text(x, y + size / 2 + 4, label, {
      fontSize: '11px', color: active ? '#C9A84C' : '#555555', fontFamily: 'serif',
    }).setOrigin(0.5, 0).setDepth(4);

    // Подпись (КД или заряды)
    if (sub) {
      const s = this.scene.add.text(x, y + size / 2 + 17, sub, {
        fontSize: '10px', color: '#888888', fontFamily: 'serif',
      }).setOrigin(0.5, 0).setDepth(4);
      this._actionBtns.push(s);
    }

    if (active) {
      frame.setInteractive({ useHandCursor: true });
      frame.on('pointerover', () => { frame.setAlpha(0.75); frame.setScale(1.08); });
      frame.on('pointerout',  () => { frame.setAlpha(1);    frame.setScale(1); });
      frame.on('pointerdown', cb);
    }

    this._actionBtns.push(frame, lbl);
  }

  _addBtn(x, y, label, color, cb) {
    const btn = this.scene.add.text(x, y, label, {
      fontSize: '14px', color, fontFamily: 'serif',
    }).setInteractive({ useHandCursor: true }).setDepth(3);
    btn.on('pointerover', () => btn.setAlpha(0.7));
    btn.on('pointerout',  () => btn.setAlpha(1));
    btn.on('pointerdown', cb);
    this._actionBtns.push(btn);
  }

  // ── Подсветка активного юнита ──────────────────────────────────────────

  highlightActive(unit) {
    this._updateBorders();
  }

  _updateBorders() {
    this._borders.forEach(b => b.destroy());
    this._borders = [];

    const active = this.turnManager.active;

    [...this.playerUnits, ...this.enemyUnits].forEach(unit => {
      if (!unit.isAlive || !unit._sprite) return;
      const isActive = unit === active;
      if (!isActive) return;
      // Draw glow ring around active unit using graphics
      const x = unit._sprite.x;
      const y = unit._sprite.y;
      const w = unit._sprite.displayWidth || 80;
      const color = unit.type === 'player' ? 0x00FF88 : 0xFF3322;
      const gfx = this.scene.add.graphics().setDepth(1);
      gfx.lineStyle(3, color, 0.9);
      gfx.strokeEllipse(x, y, w * 0.9, w * 0.25);
      this._borders.push(gfx);
    });
  }
}
