import { PlayerUnit } from '../entities/PlayerUnit.js';
import { EnemyUnit }  from '../entities/EnemyUnit.js';
import { TurnManager } from '../systems/TurnManager.js';
import { SkillSystem }  from '../systems/SkillSystem.js';
import { BattleGrid }   from '../systems/BattleGrid.js';
import { UIManager }    from '../ui/UIManager.js';
import { COLORS, GRID, PHASE, XP, AI_DELAY } from '../utils/constants.js';
import eventBus from '../utils/eventBus.js';

import unitsData   from '../data/units.json';
import enemiesData from '../data/enemies.json';
import skillsData  from '../data/skills.json';

/**
 * BattleScene — главная сцена боя.
 */
export class BattleScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BattleScene' });
  }

  create() {
    eventBus.clear();
    this._initSystems();
    this._initUnits();
    this._drawGrid();
    this._initUI();
    this._bindEvents();
    this.turnManager.init([...this.playerUnits, ...this.enemyUnits]);
    this._renderAll();
  }

  // ── Инициализация ─────────────────────────────────────────────────────

  _initSystems() {
    this.skillSystem  = new SkillSystem();
    this.skillSystem.registerAll(skillsData);
    this.turnManager  = new TurnManager();
    this.grid         = new BattleGrid();
    this.battleLog    = [];
    this.battleOver   = false;
    this.selectedUnit = null;
  }

  _initUnits() {
    this.playerUnits = unitsData.map(d => new PlayerUnit(d));
    this.enemyUnits  = enemiesData.map(d => new EnemyUnit(d));
    this.grid.placeAll([...this.playerUnits, ...this.enemyUnits]);
  }

  // ── Рендер сетки ──────────────────────────────────────────────────────

  _drawGrid() {
    const gfx = this.add.graphics();

    ['player', 'enemy'].forEach(side => {
      for (let row = 0; row < GRID.ROWS; row++) {
        for (let col = 0; col < GRID.COLS; col++) {
          const { x, y } = BattleGrid.getCellPixelPos(side, row, col);
          gfx.fillStyle(COLORS.GRID_CELL, 1);
          gfx.fillRect(x, y, GRID.CELL_W, GRID.CELL_H);
          gfx.lineStyle(1, COLORS.GRID_BORDER, 0.6);
          gfx.strokeRect(x, y, GRID.CELL_W, GRID.CELL_H);
        }
      }
    });

    // Разделитель сторон
    gfx.lineStyle(2, 0x444466, 0.8);
    gfx.lineBetween(640, 200, 640, 520);

    // Подписи
    this.add.text(300, 190, 'ВАШИ ВОИНЫ', { fontSize: '14px', color: '#4A90D9', fontFamily: 'serif' }).setOrigin(0.5);
    this.add.text(970, 190, 'ВРАГИ',       { fontSize: '14px', color: '#CC2222', fontFamily: 'serif' }).setOrigin(0.5);
  }

  // ── UI Manager ────────────────────────────────────────────────────────

  _initUI() {
    this.ui = new UIManager(this);
    this.ui.init(this.playerUnits, this.enemyUnits, this.turnManager);
  }

  // ── Рендер юнитов ─────────────────────────────────────────────────────

  _renderAll() {
    if (this._unitSprites) this._unitSprites.forEach(s => s.destroy());
    this._unitSprites = [];

    [...this.playerUnits, ...this.enemyUnits].forEach(unit => {
      if (!unit.isAlive) return;
      const side = unit.type === 'player' ? 'player' : 'enemy';
      const { x, y } = BattleGrid.getCellPixelPos(side, unit.position.row, unit.position.col);
      const cx = x + GRID.CELL_W / 2;
      const cy = y + GRID.CELL_H / 2;

      // Заглушка-прямоугольник (заменится спрайтом)
      const rect = this.add.rectangle(cx, cy, 60, 80, unit.color, 1)
        .setStrokeStyle(2, unit.isBoss ? 0xFF0000 : 0x333333);

      // Имя
      const nameText = this.add.text(cx, y + GRID.CELL_H - 14, unit.name, {
        fontSize: '11px', color: '#E8E8E8', fontFamily: 'serif'
      }).setOrigin(0.5, 1);

      // HP
      const hpText = this.add.text(cx, y + 8, `${unit.hp}/${unit.maxHp}`, {
        fontSize: '12px', color: '#44CC88', fontFamily: 'monospace'
      }).setOrigin(0.5, 0);

      // Кликабельность для игровых юнитов-врагов
      if (unit.type === 'enemy') {
        rect.setInteractive({ useHandCursor: true });
        rect.on('pointerdown', () => this._onEnemyClick(unit));
        rect.on('pointerover', () => rect.setStrokeStyle(3, 0xFFFF00));
        rect.on('pointerout',  () => rect.setStrokeStyle(2, unit.isBoss ? 0xFF0000 : 0x333333));
      }

      if (unit.type === 'player') {
        rect.setInteractive({ useHandCursor: true });
        rect.on('pointerdown', () => this._onAllyClick(unit));
      }

      this._unitSprites.push(rect, nameText, hpText);

      // Сохраняем ссылки на спрайты у юнита для быстрого обновления
      unit._sprite  = rect;
      unit._hpText  = hpText;
    });

    this.ui.update();
  }

  // ── Обработка кликов ──────────────────────────────────────────────────

  _onEnemyClick(target) {
    if (this.battleOver) return;
    if (!this.turnManager.isPlayerTurn()) return;
    const actor = this.turnManager.active;
    if (!actor || actor.type !== 'player') return;

    // Если ждём выбора цели для скилла
    if (this._pendingSkill) {
      const sk = this.skillSystem.get(this._pendingSkill);
      if (sk && sk.targetType === 'enemy_single') {
        actor.handleSkill(this._pendingSkill, target, this.skillSystem);
        this._pendingSkill = null;
        this._afterPlayerAction();
        return;
      }
    }

    // Базовая атака
    actor.handleAttack(target, this.skillSystem);
    this._afterPlayerAction();
  }

  _onAllyClick(target) {
    if (this.battleOver) return;
    if (!this.turnManager.isPlayerTurn()) return;
    if (!this._pendingSkill) return;

    const actor = this.turnManager.active;
    const sk = this.skillSystem.get(this._pendingSkill);
    if (sk && (sk.targetType === 'ally_single' || sk.targetType === 'self')) {
      actor.handleSkill(this._pendingSkill, target, this.skillSystem);
      this._pendingSkill = null;
      this._afterPlayerAction();
    }
  }

  _onSkillSelect(skillId) {
    if (!this.turnManager.isPlayerTurn()) return;
    const actor = this.turnManager.active;
    if (!actor) return;

    const sk = this.skillSystem.get(skillId);
    if (!sk) return;

    if (sk.targetType === 'self') {
      actor.handleSkill(skillId, actor, this.skillSystem);
      this._pendingSkill = null;
      this._afterPlayerAction();
    } else {
      // Ждём клика по цели
      this._pendingSkill = skillId;
      eventBus.emit('log', `Выберите цель для "${sk.name}"`);
      this.ui.update();
    }
  }

  // ── После хода игрока ─────────────────────────────────────────────────

  _afterPlayerAction() {
    this._renderAll();
    if (this._checkEnd()) return;
    this.turnManager.nextTurn();
    this.ui.update();

    if (!this.turnManager.isPlayerTurn()) {
      this._runAITurn();
    }
  }

  // ── ИИ ────────────────────────────────────────────────────────────────

  _runAITurn() {
    this.time.delayedCall(AI_DELAY, () => {
      if (this.battleOver) return;
      const actor = this.turnManager.active;
      if (actor && actor.type === 'enemy') {
        actor.decideAction(this.playerUnits, this.skillSystem, this.grid);
      }
      this._renderAll();
      if (this._checkEnd()) return;
      this.turnManager.nextTurn();
      this.ui.update();

      // Если снова ход ИИ — продолжаем
      if (!this.turnManager.isPlayerTurn()) {
        this._runAITurn();
      }
    });
  }

  // ── Проверка конца боя ────────────────────────────────────────────────

  _checkEnd() {
    const allEnemiesDead  = this.enemyUnits.every(u => !u.isAlive);
    const heroAlive       = this.playerUnits[0]?.isAlive;

    if (allEnemiesDead) {
      this._endBattle('victory');
      return true;
    }
    if (!heroAlive) {
      this._endBattle('defeat');
      return true;
    }
    return false;
  }

  _endBattle(result) {
    this.battleOver = true;
    eventBus.emit('battle_end', result);

    const { width, height } = this.scale;

    // Затемнение
    this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.7);

    if (result === 'victory') {
      this.add.text(width / 2, height / 2 - 80, 'ПОБЕДА', {
        fontFamily: 'serif', fontSize: '72px', color: '#C9A84C',
        stroke: '#000', strokeThickness: 4,
      }).setOrigin(0.5);

      // XP
      this.playerUnits[0].addXP(XP.WIN_HERO);
      this.playerUnits.slice(1).forEach(u => u.addXP(XP.WIN_COMPANION));

      this.add.text(width / 2, height / 2, `Получено XP: ${XP.WIN_HERO}`, {
        fontFamily: 'serif', fontSize: '28px', color: '#E8E8E8',
      }).setOrigin(0.5);

    } else {
      this.add.text(width / 2, height / 2 - 80, 'ПОРАЖЕНИЕ', {
        fontFamily: 'serif', fontSize: '72px', color: '#CC2222',
        stroke: '#000', strokeThickness: 4,
      }).setOrigin(0.5);
    }

    // Кнопка перезапуска
    const btn = this.add.text(width / 2, height / 2 + 80, '[ Попробовать снова ]', {
      fontFamily: 'serif', fontSize: '28px', color: '#AAAAAA',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    btn.on('pointerover', () => btn.setColor('#FFFFFF'));
    btn.on('pointerout',  () => btn.setColor('#AAAAAA'));
    btn.on('pointerdown', () => {
      eventBus.clear();
      this.scene.restart();
    });
  }

  // ── EventBus ──────────────────────────────────────────────────────────

  _bindEvents() {
    eventBus.on('log', msg => {
      this.battleLog.push(msg);
      if (this.battleLog.length > 20) this.battleLog.shift();
      this.ui?.appendLog(msg);
    });

    eventBus.on('turn_started', unit => {
      this.ui?.highlightActive(unit);
    });

    eventBus.on('unit_died', unit => {
      this.grid.remove(unit);
    });

    // Пробросить выбор скилла из UI
    eventBus.on('skill_selected', skillId => this._onSkillSelect(skillId));

    // Пропустить ход
    eventBus.on('skip_turn', () => {
      if (!this.turnManager.isPlayerTurn()) return;
      this.turnManager.skipTurn();
      this.ui.update();
      if (!this.turnManager.isPlayerTurn()) this._runAITurn();
    });
  }
}
