import { PlayerUnit } from '../entities/PlayerUnit.js';
import { EnemyUnit }  from '../entities/EnemyUnit.js';
import { TurnManager } from '../systems/TurnManager.js';
import { SkillSystem }  from '../systems/SkillSystem.js';
import { BattleGrid }   from '../systems/BattleGrid.js';
import { UIManager }    from '../ui/UIManager.js';
import { MusicPlayer }    from '../ui/MusicPlayer.js';
import { PortraitPanel }  from '../ui/PortraitPanel.js';
import { COLORS, XP, AI_DELAY } from '../utils/constants.js';
import eventBus from '../utils/eventBus.js';

import unitsData   from '../data/units.json';
import enemiesData from '../data/enemies.json';
import skillsData  from '../data/skills.json';

const SPRITE_IDS = [
  'hero_duelist',
  'companion_brawler',
  'companion_healer',
  'bandit_commander',
  'bandit_brawler',
  'bandit_archer',
];
const HAS_BG = true; // поставь true когда добавишь battle_bg.png

// ── Позиции юнитов в стиле Disciples II ──────────────────────────────────
// Передний ряд (row=0): ниже, крупнее
// Задний ряд  (row=1): выше, чуть меньше (перспектива)
// Disciples II-style diagonal grid
// Player: bottom-left → top-center-left
// Enemy:  bottom-center-right → top-far-right
const UNIT_POSITIONS = {
  player: {
    0: { 0: { x: 290, y: 490 }, 1: { x: 430, y: 455 }, 2: { x: 560, y: 425 } },
    1: { 0: { x: 225, y: 340 }, 1: { x: 360, y: 315 }, 2: { x: 490, y: 295 } },
  },
  enemy: {
    0: { 0: { x: 760, y: 480 }, 1: { x: 920, y: 455 }, 2: { x: 650, y: 460 } },
    1: { 0: { x: 820, y: 330 }, 1: { x: 1000, y: 310 }, 2: { x: 700, y: 315 } },
  },
};

// Высота спрайта в пикселях по ряду (перспектива)
const ROW_HEIGHT = { 0: 230, 1: 160 };

export class BattleScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BattleScene' });
  }

  preload() {
    if (HAS_BG) this.load.image('battle_bg', 'battle_bg.png');
    SPRITE_IDS.forEach(id => this.load.image(id, `sprites/${id}.png`));
    // Ассеты загружены в LoadingScene — здесь ничего не грузим
  }

  create() {
    eventBus.clear();
    this._initSystems();
    this._initUnits();
    this._drawBg();
    this._drawField();
    this._initUI();
    this.portraits = new PortraitPanel(this, this.playerUnits, this.enemyUnits);
    this.portraits.create();
    this._bindEvents();
    this.turnManager.init([...this.playerUnits, ...this.enemyUnits]);
    this._renderAll();
    this.music.create();
  }

  // ── Инициализация ─────────────────────────────────────────────────────

  _initSystems() {
    this.skillSystem = new SkillSystem();
    this.skillSystem.registerAll(skillsData);
    this.turnManager = new TurnManager();
    this.grid        = new BattleGrid();
    this.battleLog   = [];
    this.battleOver  = false;
    this._pendingSkill = null;
  }

  _initUnits() {
    this.playerUnits = unitsData.map(d => new PlayerUnit(d));
    this.enemyUnits  = enemiesData.map(d => new EnemyUnit(d));
    this.grid.placeAll([...this.playerUnits, ...this.enemyUnits]);
  }

  // ── Позиция юнита на экране ───────────────────────────────────────────

  _getPos(unit) {
    const side = unit.type === 'player' ? 'player' : 'enemy';
    const { row, col } = unit.position;
    const pos = UNIT_POSITIONS[side]?.[row]?.[col];
    if (!pos) return { x: 640, y: 400 };
    return pos;
  }

  // ── Фон ───────────────────────────────────────────────────────────────

  _drawBg() {
    if (HAS_BG) {
      this.add.image(640, 360, 'battle_bg').setDisplaySize(1280, 720).setDepth(0);
    } else {
      // Атмосферный градиент-заглушка
      const bg = this.add.graphics();
      bg.fillGradientStyle(0x060810, 0x060810, 0x0E1020, 0x0E1020, 1);
      bg.fillRect(0, 0, 1280, 720);
      // Земля
      bg.fillGradientStyle(0x1A1208, 0x1A1208, 0x2A1E10, 0x2A1E10, 1);
      bg.fillRect(0, 420, 1280, 300);
      // Линия горизонта
      bg.lineStyle(1, 0x3A2E1A, 0.4);
      bg.lineBetween(0, 420, 1280, 420);
    }
  }

  // ── Поле боя (без сетки, только атмосфера) ────────────────────────────

  _drawField() {
    const gfx = this.add.graphics().setDepth(1);

    // Тонкие разделители зон
    gfx.lineStyle(1, 0x333344, 0.3);
    gfx.lineBetween(640, 280, 640, 560);

    // Метки убраны — стороны видны через портреты
  }

  // ── UI ────────────────────────────────────────────────────────────────

  _initUI() {
    this.ui = new UIManager(this);
    this.ui.init(this.playerUnits, this.enemyUnits, this.turnManager);
  }

  // ── Рендер юнитов ─────────────────────────────────────────────────────

  _renderAll() {
    if (this._unitSprites) this._unitSprites.forEach(s => { try { s.destroy(); } catch(e){} });
    this._unitSprites = [];

    const active = this.turnManager.active;

    [...this.playerUnits, ...this.enemyUnits].forEach(unit => {
      if (!unit.isAlive) return;

      const { x, y } = this._getPos(unit);
      const h = ROW_HEIGHT[unit.position.row] ?? 140;
      const isActive = unit === active;

      // Круг под ногами (Disciples-стиль)
      const ringColor = isActive
        ? (unit.type === 'player' ? 0x00FF88 : 0xFF3322)
        : (unit.type === 'player' ? 0x2255AA : 0x661111);
      const ringAlpha = isActive ? 0.55 : 0.25;
      const ring = this.add.ellipse(x, y + 8, h * 0.75, h * 0.22, ringColor, ringAlpha).setDepth(1);
      this._unitSprites.push(ring);

      // Спрайт или прямоугольник
      let sprite;
      const hasSprite = SPRITE_IDS.includes(unit.id);

      if (hasSprite) {
        sprite = this.add.image(x, y, unit.id).setOrigin(0.5, 1).setDepth(1);
        const boss = unit.isBoss;
        const targetH = boss ? h * 1.45 : h;
        const ratio = sprite.width / sprite.height;
        sprite.setDisplaySize(targetH * ratio, targetH);
        // Враги смотрят влево, дуэлянт смотрит вправо (лицом к врагам)
        if (unit.type === 'enemy') sprite.setFlipX(true);
        if (unit.id === 'hero_duelist') sprite.setFlipX(true);
      } else {
        const w = unit.isBoss ? 90 : 65;
        sprite = this.add.rectangle(x, y, w, h * 0.85, unit.color, 1)
          .setOrigin(0.5, 1)
          .setStrokeStyle(unit.isBoss ? 3 : 1, unit.isBoss ? 0xFF0000 : 0x444444);
      }

      // HP/name перенесены в портреты — здесь не рисуем
      const barBg   = null;
      const barFill = null;
      const nameText = null;
      const hpText   = null;

      // Интерактивность
      if (unit.type === 'enemy') {
        sprite.setInteractive({ useHandCursor: true });
        sprite.on('pointerdown', () => this._onEnemyClick(unit));
        sprite.on('pointerover', () => sprite.setAlpha(0.8));
        sprite.on('pointerout',  () => sprite.setAlpha(1.0));
      }
      if (unit.type === 'player') {
        sprite.setInteractive({ useHandCursor: true });
        sprite.on('pointerdown', () => this._onAllyClick(unit));
      }

      this._unitSprites.push(sprite);

      unit._sprite  = sprite;
      unit._hpText  = null;
      unit._spriteX = x;
      unit._spriteY = y - h / 2; // центр для анимаций
    });

    this.ui.update();
    this.portraits?.update();
  }

  // ══════════════════════════════════════════════════════════════════════
  // АНИМАЦИИ
  // ══════════════════════════════════════════════════════════════════════

  _playAttackAnim(attacker, target) {
    if (!attacker._sprite || !target._sprite) return;
    const origX = attacker._spriteX;
    const origY = attacker._spriteY;
    const dx = (target._spriteX - origX) * 0.28;
    const dy = (target._spriteY - origY) * 0.28;
    this.tweens.add({
      targets: attacker._sprite,
      x: attacker._sprite.x + dx,
      y: attacker._sprite.y + dy,
      duration: 110,
      ease: 'Power2',
      yoyo: true,
    });
  }

  _animHit(unit) {
    if (!unit._sprite) return;
    const origX = unit._sprite.x;
    this.tweens.add({
      targets: unit._sprite,
      x: origX + 7,
      duration: 35,
      yoyo: true,
      repeat: 2,
      ease: 'Linear',
      onComplete: () => { if (unit._sprite) unit._sprite.x = origX; }
    });
    if (unit._sprite.setTint) {
      unit._sprite.setTint(0xFFFFFF);
      this.time.delayedCall(180, () => { if (unit._sprite) unit._sprite.clearTint(); });
    }
  }

  _animDeath(unit) {
    if (!unit._sprite) return;
    this.tweens.add({
      targets: unit._sprite,
      alpha: 0,
      y: unit._sprite.y + 25,
      duration: 450,
      ease: 'Power2',
      onComplete: () => this.grid.remove(unit),
    });
  }

  _animHeal(unit) {
    if (!unit._sprite) return;
    const glow = this.add.ellipse(unit._spriteX, unit._spriteY, 90, 90, 0x44FF88, 0.45);
    this.tweens.add({
      targets: glow, alpha: 0, scaleX: 2.2, scaleY: 2.2,
      duration: 550, ease: 'Power2',
      onComplete: () => glow.destroy(),
    });
    const txt = this.add.text(unit._spriteX, unit._spriteY - 20, '+HP', {
      fontSize: '17px', color: '#44FF88', fontFamily: 'serif',
      stroke: '#000', strokeThickness: 2
    }).setOrigin(0.5);
    this.tweens.add({
      targets: txt, y: unit._spriteY - 65, alpha: 0,
      duration: 750, ease: 'Power2',
      onComplete: () => txt.destroy(),
    });
  }

  _animDamageNumber(unit, amount) {
    if (!unit._spriteX) return;
    const txt = this.add.text(
      unit._spriteX + Phaser.Math.Between(-18, 18),
      unit._spriteY - 20,
      `-${amount}`,
      { fontSize: '19px', color: '#FF4444', fontFamily: 'serif', stroke: '#000', strokeThickness: 3 }
    ).setOrigin(0.5);
    this.tweens.add({
      targets: txt, y: unit._spriteY - 70, alpha: 0,
      duration: 850, ease: 'Power2',
      onComplete: () => txt.destroy(),
    });
  }

  // ══════════════════════════════════════════════════════════════════════
  // КЛИКИ
  // ══════════════════════════════════════════════════════════════════════

  _onEnemyClick(target) {
    if (this.battleOver) return;
    if (!this.turnManager.isPlayerTurn()) return;
    const actor = this.turnManager.active;
    if (!actor || actor.type !== 'player') return;

    if (this._pendingSkill) {
      const sk = this.skillSystem.get(this._pendingSkill);
      if (sk && sk.targetType === 'enemy_single') {
        this._playAttackAnim(actor, target);
        actor.handleSkill(this._pendingSkill, target, this.skillSystem);
        this._pendingSkill = null;
        this._afterPlayerAction();
        return;
      }
    }

    this._playAttackAnim(actor, target);
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
      this._afterPlayerAction();
    } else {
      this._pendingSkill = skillId;
      eventBus.emit('log', `Выберите цель для "${sk.name}"`);
      this.ui.update();
    }
  }

  // ── После хода ────────────────────────────────────────────────────────

  _afterPlayerAction() {
    if (this._checkEnd()) return;
    this.turnManager.nextTurn();
    this._renderAll();
    this.ui.update();
    if (!this.turnManager.isPlayerTurn()) this._runAITurn();
  }

  _runAITurn() {
    this.time.delayedCall(AI_DELAY, () => {
      if (this.battleOver) return;
      const actor = this.turnManager.active;
      if (!actor || actor.type !== 'enemy') {
        this._finishTurn();
        return;
      }
      const target = actor.findTarget(this.playerUnits, this.grid);
      if (target) this._playAttackAnim(actor, target);
      actor.decideAction(this.playerUnits, this.skillSystem, this.grid);
      this.time.delayedCall(180, () => this._finishTurn());
    });
  }

  _finishTurn() {
    if (this._checkEnd()) return;
    this.turnManager.nextTurn();
    this._renderAll();
    this.ui.update();
    if (!this.turnManager.isPlayerTurn()) this._runAITurn();
  }

  // ── Конец боя ─────────────────────────────────────────────────────────

  _checkEnd() {
    const allEnemiesDead = this.enemyUnits.every(u => !u.isAlive);
    const heroAlive      = this.playerUnits[0]?.isAlive;
    if (allEnemiesDead) { this._endBattle('victory'); return true; }
    if (!heroAlive)      { this._endBattle('defeat');  return true; }
    return false;
  }

  _endBattle(result) {
    this.battleOver = true;
    const { width, height } = this.scale;
    this.add.rectangle(width/2, height/2, width, height, 0x000000, 0.75);

    const title = result === 'victory' ? 'ПОБЕДА' : 'ПОРАЖЕНИЕ';
    const color = result === 'victory' ? '#C9A84C' : '#CC2222';

    const t = this.add.text(width/2, height/2 - 80, title, {
      fontFamily: 'serif', fontSize: '72px', color,
      stroke: '#000', strokeThickness: 4,
    }).setOrigin(0.5).setAlpha(0);
    this.tweens.add({ targets: t, alpha: 1, duration: 600 });

    if (result === 'victory') {
      this.playerUnits[0].addXP(XP.WIN_HERO);
      this.playerUnits.slice(1).forEach(u => u.addXP(XP.WIN_COMPANION));
      this.add.text(width/2, height/2, `Получено XP: ${XP.WIN_HERO}`, {
        fontFamily: 'serif', fontSize: '26px', color: '#E8E8E8',
      }).setOrigin(0.5);
    }

    const btn = this.add.text(width/2, height/2 + 80, '[ Попробовать снова ]', {
      fontFamily: 'serif', fontSize: '26px', color: '#AAAAAA',
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

    eventBus.on('turn_started',  unit => this.ui?.highlightActive(unit));

    eventBus.on('unit_damaged', ({ unit, amount }) => {
      this._animHit(unit);
      this._animDamageNumber(unit, amount);
    });

    eventBus.on('unit_healed', ({ unit }) => this._animHeal(unit));

    eventBus.on('unit_died', unit => this._animDeath(unit));

    eventBus.on('skill_selected', skillId => this._onSkillSelect(skillId));

    eventBus.on('skip_turn', () => {
      if (!this.turnManager.isPlayerTurn()) return;
      this.turnManager.skipTurn();
      this.ui.update();
      if (!this.turnManager.isPlayerTurn()) this._runAITurn();
    });
  }
}
