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
      .setStrokeStyle(1, 0x333355);
    this.scene.add.text(x + 10, y + 6, 'ЛОГ БОЯ', { fontSize: '11px', color: '#555577', fontFamily: 'serif' });

    this._logContainer = this.scene.add.container(x + 10, y + 22);
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
      .setStrokeStyle(1, 0x333355);

    this._actionPanel = this.scene.add.container(x + 10, y + 10);
  }

  _createTurnLabel() {
    this._turnLabel = this.scene.add.text(640, 30, '', {
      fontFamily: 'serif', fontSize: '18px', color: '#E8E8E8',
    }).setOrigin(0.5, 0);
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

    const x = 670, baseY = 548;

    // Кнопка: Пропустить ход
    this._addBtn(x + 440, baseY, 'Пропустить', '#888888', () => eventBus.emit('skip_turn'));

    // Кнопки скиллов
    unit.skills.forEach((skillId, i) => {
      const skill = skillsData.find(s => s.id === skillId);
      if (!skill) return;
      const onCD   = unit.isOnCooldown(skillId);
      const label  = onCD ? `${skill.name} (${unit.cooldowns[skillId]}ход)` : skill.name;
      const color  = onCD ? '#555555' : '#C9A84C';
      this._addBtn(x, baseY + 30 + i * 34, label, color, () => {
        if (!onCD) eventBus.emit('skill_selected', skillId);
      });
    });

    // Пистолет (если есть заряды)
    if ((unit.resources?.pistol_charges || 0) > 0) {
      const label = `Пистолет (×${unit.resources.pistol_charges})`;
      this._addBtn(x, baseY + 30 + unit.skills.length * 34, label, '#D46060', () => {
        eventBus.emit('skill_selected', 'pistol_shot');
      });
    }

    // Подсказка
    this.scene.add.text(x, baseY + 8, 'Кликни по врагу для атаки · Скиллы ниже:', {
      fontSize: '12px', color: '#666688', fontFamily: 'serif'
    }).setName('hint');
    this._actionBtns.push(this.scene.children.getByName('hint'));
  }

  _addBtn(x, y, label, color, cb) {
    const btn = this.scene.add.text(x, y, label, {
      fontSize: '14px', color, fontFamily: 'serif',
    }).setInteractive({ useHandCursor: true });

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
      const color = isActive
        ? 0x00FF88
        : (unit.type === 'player' ? COLORS.PLAYER_BORDER : COLORS.ENEMY_BORDER);
      const width = isActive ? 3 : 1;
      unit._sprite.setStrokeStyle(width, color);
    });
  }
}
