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

// ID юнитов у которых есть PNG-спрайт в assets/sprites/
// Добавляй сюда по мере появления арта:
const SPRITE_IDS = [
  'hero_duelist',
  // 'companion_archer',
  // 'companion_shield',
  // 'companion_healer',
  // 'shadow_guard',
  // 'bone_archer',
  // 'wraith_herald',
  // 'black_commander',
];
const HAS_BG = false; // true когда положишь assets/sprites/battle_bg.png

/**
 * BattleScene — главная сцена боя с tween-анимациями.
 */
export class BattleScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BattleScene' });
  }

  preload() {
    // Фон поля боя
    if (HAS_BG) {
      this.load.image('battle_bg', 'assets/sprites/battle_bg.png');
    }
    // Спрайты юнитов (загружаем только те что есть)
    SPRITE_IDS.forEach(id => {
      this.load.image(id, `assets/sprites/${id}.png`);
    });
  }

  create() {
    eventBus.clear();
    this._initSystems();
    this._initUnits();
    this._drawBg();
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
    this._animating   = false; // блокировка кликов во время анимации
  }

  _initUnits() {
    this.playerUnits = unitsData.map(d => new PlayerUnit(d));
    this.enemyUnits  = enemiesData.map(d => new EnemyUnit(d));
    this.grid.placeAll([...this.playerUnits, ...this.enemyUnits]);
  }

  // ── Фон ───────────────────────────────────────────────────────────────

  _drawBg() {
    if (HAS_BG) {
      this.add.image(640, 360, 'battle_bg').setDisplaySize(1280, 720);
    } else {
      // Градиентный placeholder-фон
      const bg = this.add.graphics();
      bg.fillGradientStyle(0x050510, 0x050510, 0x0A0A1F, 0x0A0A1F, 1);
      bg.fillRect(0, 0, 1280, 720);
    }
  }

  // ── Рендер сетки ──────────────────────────────────────────────────────

  _drawGrid() {
    const gfx = this.add.graphics();

    ['player', 'enemy'].forEach(side => {
      for (let row = 0; row < GRID.ROWS; row++) {
        for (let col = 0; col < GRID.COLS; col++) {
          const { x, y } = BattleGrid.getCellPixelPos(side, row, col);
          gfx.fillStyle(COLORS.GRID_CELL, 0.7);
          gfx.fillRect(x, y, GRID.CELL_W, GRID.CELL_H);
          gfx.lineStyle(1, COLORS.GRID_BORDER, 0.5);
          gfx.strokeRect(x, y, GRID.CELL_W, GRID.CELL_H);
        }
      }
    });

    gfx.lineStyle(2, 0x444466, 0.8);
    gfx.lineBetween(640, 200, 640, 520);

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

      // Свечение под активным юнитом
      const isActive = unit === this.turnManager.active;
      if (isActive) {
        const glowColor = unit.type === 'player' ? 0x00FF88 : 0xFF3322;
        const glow = this.add.ellipse(cx, cy + 36, 70, 18, glowColor, 0.35);
        this._unitSprites.push(glow);
      }

      // Спрайт или прямоугольник
      let sprite;
      const hasSprite = SPRITE_IDS.includes(unit.id);

      if (hasSprite) {
        sprite = this.add.image(cx, cy, unit.id);
        const scale = unit.isBoss ? 1.6 : 1.0;
        sprite.setDisplaySize(60 * scale, 80 * scale);
      } else {
        const w = unit.isBoss ? 80 : 60;
        const h = unit.isBoss ? 100 : 80;
        sprite = this.add.rectangle(cx, cy, w, h, unit.color, 1)
          .setStrokeStyle(unit.isBoss ? 3 : 2, unit.isBoss ? 0xFF0000 : 0x333333);
      }

      // HP-бар
      const barW = GRID.CELL_W - 16;
      const barH = 6;
      const barX = x + 8;
      const barY = y + GRID.CELL_H - 22;
      const hpPct = unit.hp / unit.maxHp;
      const barColor = hpPct > 0.5 ? 0x44CC44 : hpPct > 0.25 ? 0xCCAA00 : 0xCC2222;

      const barBg   = this.add.rectangle(barX + barW/2, barY, barW, barH, 0x111111, 1);
      const barFill = this.add.rectangle(barX + (barW * hpPct)/2, barY, barW * hpPct, barH, barColor, 1);

      // Имя
      const nameText = this.add.text(cx, y + GRID.CELL_H - 10, unit.name, {
        fontSize: '10px', color: '#CCCCCC', fontFamily: 'serif'
      }).setOrigin(0.5, 1);

      // HP цифры
      const hpText = this.add.text(cx, y + 4, `${unit.hp}/${unit.maxHp}`, {
        fontSize: '11px', color: '#88EE88', fontFamily: 'monospace'
      }).setOrigin(0.5, 0);

      // Кликабельность
      if (unit.type === 'enemy') {
        sprite.setInteractive({ useHandCursor: true });
        sprite.on('pointerdown', () => this._onEnemyClick(unit));
        sprite.on('pointerover', () => { if (!hasSprite) sprite.setStrokeStyle(3, 0xFFFF00); });
        sprite.on('pointerout',  () => { if (!hasSprite) sprite.setStrokeStyle(2, unit.isBoss ? 0xFF0000 : 0x333333); });
      }

      if (unit.type === 'player') {
        sprite.setInteractive({ useHandCursor: true });
        sprite.on('pointerdown', () => this._onAllyClick(unit));
      }

      this._unitSprites.push(sprite, barBg, barFill, nameText, hpText);

      unit._sprite  = sprite;
      unit._hpText  = hpText;
      unit._spriteX = cx;
      unit._spriteY = cy;
    });

    this.ui.update();
  }

  // ══════════════════════════════════════════════════════════════════════
  // АНИМАЦИИ
  // ══════════════════════════════════════════════════════════════════════

  /**
   * Анимация атаки: юнит сдвигается к цели и возвращается.
   * Возвращает Promise — можно await.
   */
  _animAttack(attacker, target) {
    return new Promise(resolve => {
      if (!attacker._sprite || !target._sprite) { resolve(); return; }

      const origX = attacker._spriteX;
      const origY = attacker._spriteY;
      const tx = target._spriteX;
      const ty = target._spriteY;

      // Смещение на 35% пути к цели
      const dx = (tx - origX) * 0.35;
      const dy = (ty - origY) * 0.35;

      this.tweens.add({
        targets: attacker._sprite,
        x: origX + dx,
        y: origY + dy,
        duration: 120,
        ease: 'Power2',
        yoyo: true,
        onComplete: resolve,
      });
    });
  }

  /**
   * Анимация получения урона: белая вспышка + тряска.
   */
  _animHit(unit) {
    return new Promise(resolve => {
      if (!unit._sprite) { resolve(); return; }

      const origX = unit._spriteX;

      // Тряска
      this.tweens.add({
        targets: unit._sprite,
        x: origX + 8,
        duration: 40,
        yoyo: true,
        repeat: 2,
        ease: 'Linear',
        onComplete: () => {
          unit._sprite.x = origX;
          resolve();
        }
      });

      // Белая вспышка (tint только для image, для rectangle — fillColor)
      if (unit._sprite.setTint) {
        unit._sprite.setTint(0xFFFFFF);
        this.time.delayedCall(200, () => {
          if (unit._sprite) unit._sprite.clearTint();
        });
      } else {
        const origColor = unit.color;
        unit._sprite.setFillStyle(0xFFFFFF);
        this.time.delayedCall(200, () => {
          if (unit._sprite) unit._sprite.setFillStyle(origColor);
        });
      }
    });
  }

  /**
   * Анимация смерти: юнит угасает и падает.
   */
  _animDeath(unit) {
    return new Promise(resolve => {
      if (!unit._sprite) { resolve(); return; }

      this.tweens.add({
        targets: unit._sprite,
        alpha: 0,
        y: unit._spriteY + 30,
        duration: 500,
        ease: 'Power2',
        onComplete: resolve,
      });
    });
  }

  /**
   * Анимация лечения: зелёные частицы вверх.
   */
  _animHeal(unit) {
    return new Promise(resolve => {
      if (!unit._sprite) { resolve(); return; }

      // Зелёный ореол
      const glow = this.add.ellipse(
        unit._spriteX, unit._spriteY,
        80, 80, 0x44FF88, 0.5
      );

      this.tweens.add({
        targets: glow,
        alpha: 0,
        scaleX: 2,
        scaleY: 2,
        duration: 600,
        ease: 'Power2',
        onComplete: () => { glow.destroy(); resolve(); }
      });

      // Плывущий "+HP" текст
      const txt = this.add.text(
        unit._spriteX, unit._spriteY - 20,
        `+HP`, { fontSize: '18px', color: '#44FF88', fontFamily: 'serif', stroke: '#000', strokeThickness: 2 }
      ).setOrigin(0.5);

      this.tweens.add({
        targets: txt,
        y: unit._spriteY - 70,
        alpha: 0,
        duration: 800,
        ease: 'Power2',
        onComplete: () => txt.destroy(),
      });
    });
  }

  /**
   * Плывущий текст урона над целью.
   */
  _animDamageNumber(unit, amount) {
    const txt = this.add.text(
      unit._spriteX + Phaser.Math.Between(-20, 20),
      unit._spriteY - 30,
      `-${amount}`,
      { fontSize: '20px', color: '#FF4444', fontFamily: 'serif', stroke: '#000', strokeThickness: 3 }
    ).setOrigin(0.5);

    this.tweens.add({
      targets: txt,
      y: unit._spriteY - 80,
      alpha: 0,
      duration: 900,
      ease: 'Power2',
      onComplete: () => txt.destroy(),
    });
  }

  // ══════════════════════════════════════════════════════════════════════
  // ОБРАБОТКА КЛИКОВ С АНИМАЦИЯМИ
  // ══════════════════════════════════════════════════════════════════════

  _onEnemyClick(target) {
    if (this.battleOver || this._animating) return;
    if (!this.turnManager.isPlayerTurn()) return;
    const actor = this.turnManager.active;
    if (!actor || actor.type !== 'player') return;

    if (this._pendingSkill) {
      const sk = this.skillSystem.get(this._pendingSkill);
      if (sk && sk.targetType === 'enemy_single') {
        this._animating = true;
        this._animAttack(actor, target).then(() => {
          actor.handleSkill(this._pendingSkill, target, this.skillSystem);
          this._pendingSkill = null;
          this._animating = false;
          this._afterPlayerAction();
        });
        return;
      }
    }

    this._animating = true;
    this._animAttack(actor, target).then(() => {
      actor.handleAttack(target, this.skillSystem);
      this._animating = false;
      this._afterPlayerAction();
    });
  }

  _onAllyClick(target) {
    if (this.battleOver || this._animating) return;
    if (!this.turnManager.isPlayerTurn()) return;
    if (!this._pendingSkill) return;

    const actor = this.turnManager.active;
    const sk = this.skillSystem.get(this._pendingSkill);
    if (sk && (sk.targetType === 'ally_single' || sk.targetType === 'self')) {
      this._animating = true;
      actor.handleSkill(this._pendingSkill, target, this.skillSystem);
      this._pendingSkill = null;
      this._animating = false;
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

  // ── ИИ с анимациями ───────────────────────────────────────────────────

  _runAITurn() {
    this.time.delayedCall(AI_DELAY, () => {
      if (this.battleOver) return;
      const actor = this.turnManager.active;
      if (!actor || actor.type !== 'enemy') {
        this._afterAIAction();
        return;
      }

      // Находим цель до действия чтобы анимировать
      const target = actor.findTarget(this.playerUnits, this.grid);

      if (target) {
        this._animAttack(actor, target).then(() => {
          actor.decideAction(this.playerUnits, this.skillSystem, this.grid);
          this._afterAIAction();
        });
      } else {
        actor.decideAction(this.playerUnits, this.skillSystem, this.grid);
        this._afterAIAction();
      }
    });
  }

  _afterAIAction() {
    this._renderAll();
    if (this._checkEnd()) return;
    this.turnManager.nextTurn();
    this.ui.update();

    if (!this.turnManager.isPlayerTurn()) {
      this._runAITurn();
    }
  }

  // ── Проверка конца боя ────────────────────────────────────────────────

  _checkEnd() {
    const allEnemiesDead = this.enemyUnits.every(u => !u.isAlive);
    const heroAlive      = this.playerUnits[0]?.isAlive;

    if (allEnemiesDead) { this._endBattle('victory'); return true; }
    if (!heroAlive)      { this._endBattle('defeat');  return true; }
    return false;
  }

  _endBattle(result) {
    this.battleOver = true;
    eventBus.emit('battle_end', result);

    const { width, height } = this.scale;
    this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.75);

    if (result === 'victory') {
      const titleTxt = this.add.text(width / 2, height / 2 - 80, 'ПОБЕДА', {
        fontFamily: 'serif', fontSize: '72px', color: '#C9A84C',
        stroke: '#000', strokeThickness: 4,
      }).setOrigin(0.5).setAlpha(0);

      this.tweens.add({ targets: titleTxt, alpha: 1, duration: 600, ease: 'Power2' });

      this.playerUnits[0].addXP(XP.WIN_HERO);
      this.playerUnits.slice(1).forEach(u => u.addXP(XP.WIN_COMPANION));

      this.add.text(width / 2, height / 2, `Получено XP: ${XP.WIN_HERO}`, {
        fontFamily: 'serif', fontSize: '28px', color: '#E8E8E8',
      }).setOrigin(0.5);

    } else {
      const titleTxt = this.add.text(width / 2, height / 2 - 80, 'ПОРАЖЕНИЕ', {
        fontFamily: 'serif', fontSize: '72px', color: '#CC2222',
        stroke: '#000', strokeThickness: 4,
      }).setOrigin(0.5).setAlpha(0);

      this.tweens.add({ targets: titleTxt, alpha: 1, duration: 600, ease: 'Power2' });
    }

    const btn = this.add.text(width / 2, height / 2 + 80, '[ Попробовать снова ]', {
      fontFamily: 'serif', fontSize: '28px', color: '#AAAAAA',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    btn.on('pointerover', () => btn.setColor('#FFFFFF'));
    btn.on('pointerout',  () => btn.setColor('#AAAAAA'));
    btn.on('pointerdown', () => { eventBus.clear(); this.scene.restart(); });
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

    // Анимация урона
    eventBus.on('unit_damaged', ({ unit, amount }) => {
      this._animHit(unit);
      this._animDamageNumber(unit, amount);
    });

    // Анимация лечения
    eventBus.on('unit_healed', ({ unit, amount }) => {
      this._animHeal(unit);
    });

    // Анимация смерти
    eventBus.on('unit_died', unit => {
      this._animDeath(unit).then(() => {
        this.grid.remove(unit);
      });
    });

    eventBus.on('skill_selected', skillId => this._onSkillSelect(skillId));

    eventBus.on('skip_turn', () => {
      if (!this.turnManager.isPlayerTurn()) return;
      this.turnManager.skipTurn();
      this.ui.update();
      if (!this.turnManager.isPlayerTurn()) this._runAITurn();
    });
  }
}
