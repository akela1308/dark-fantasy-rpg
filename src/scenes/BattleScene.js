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
    0: { 0: { x: 280, y: 480 }, 1: { x: 420, y: 460 }, 2: { x: 180, y: 500 } },
    1: { 0: { x: 350, y: 330 }, 1: { x: 490, y: 310 }, 2: { x: 220, y: 350 } },
  },
  enemy: {
    0: { 0: { x: 760, y: 480 }, 1: { x: 900, y: 460 }, 2: { x: 1040, y: 480 } },
    1: { 0: { x: 830, y: 330 }, 1: { x: 970, y: 310 }, 2: { x: 700, y: 350 } },
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
    this.input.keyboard.on('keydown-B', () => this._toggleBattleGrid());
    this.turnManager.init([...this.playerUnits, ...this.enemyUnits]);
    this._renderAll();
    // Инициализируем плеер здесь (ассеты уже в кэше после LoadingScene)
    this.music = new MusicPlayer(this);
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

      // Глубина: передний ряд (row=0) поверх заднего (row=1)
      const rowDepth = unit.position.row === 0 ? 3 : 2;

      // Тонкое кольцо под ногами — только контур, без заливки
      const ringColor = unit.type === 'player' ? 0x44AAFF : 0xFF4422;
      const ringW = h * 0.72;
      const ringH = h * 0.20;
      const gfx = this.add.graphics().setDepth(1).setAlpha(isActive ? 0.35 : 0.15);
      gfx.lineStyle(1.5, ringColor, 1);
      gfx.strokeEllipse(x, y + 6, ringW, ringH);
      this._unitSprites.push(gfx);

      // Еле заметное мерцание
      this.tweens.add({
        targets: gfx,
        alpha: { from: isActive ? 0.35 : 0.15, to: isActive ? 0.12 : 0.05 },
        duration: Phaser.Math.Between(1800, 2600),
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });

      // Индивидуальные коэффициенты масштаба спрайтов
      const SPRITE_SCALE = {
        hero_duelist:      0.78, // герой немного меньше
        companion_brawler: 1.05, // боец чуть больше
        companion_healer:  0.90,
        bandit_commander:  0.92,
        bandit_brawler:    1.00,
        bandit_archer:     0.88,
      };

      // Спрайт или прямоугольник
      let sprite;
      const hasSprite = SPRITE_IDS.includes(unit.id);

      if (hasSprite) {
        sprite = this.add.image(x, y, unit.id).setOrigin(0.5, 1).setDepth(rowDepth);
        const boss = unit.isBoss;
        const unitScale = SPRITE_SCALE[unit.id] ?? 1;
        const targetH = (boss ? h * 1.45 : h) * unitScale;
        const ratio = sprite.width / sprite.height;
        sprite.setDisplaySize(targetH * ratio, targetH);
        // Враги смотрят влево, дуэлянт смотрит вправо (лицом к врагам)
        if (unit.type === 'enemy') sprite.setFlipX(true);
        if (unit.id === 'hero_duelist') sprite.setFlipX(true);
      } else {
        const w = unit.isBoss ? 90 : 65;
        sprite = this.add.rectangle(x, y, w, h * 0.85, unit.color, 1)
          .setOrigin(0.5, 1);
      }

      // HP-бар над спрайтом
      const barW     = hasSprite ? Math.min(sprite.displayWidth * 1.1, 80) : 60;
      const barH     = 5;
      const spriteTop = hasSprite ? (y - sprite.displayHeight) : (y - h * 0.85);
      const barY     = spriteTop - 6;
      const pct      = Math.max(0, unit.hp / unit.maxHp);
      const barColor = pct > 0.5 ? 0x44CC44 : pct > 0.25 ? 0xCCAA00 : 0xCC2222;

      const barBg = this.add.rectangle(x, barY, barW, barH, 0x111111, 0.85)
        .setDepth(rowDepth + 1);
      const barFill = this.add.rectangle(x - barW / 2, barY, barW * pct, barH, barColor)
        .setOrigin(0, 0.5).setDepth(rowDepth + 2);

      unit._hpBar    = barFill;
      unit._hpBarBg  = barBg;
      unit._hpBarMaxW = barW;
      unit._hpBarY   = barY;

      this._unitSprites.push(barBg, barFill);

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
    this.portraits?.update(this.turnManager.active);
  }

  _updateHpBar(unit) {
    if (!unit._hpBar || !unit._hpBarMaxW) return;
    const pct   = Math.max(0, unit.hp / unit.maxHp);
    const color = pct > 0.5 ? 0x44CC44 : pct > 0.25 ? 0xCCAA00 : 0xCC2222;
    unit._hpBar.setDisplaySize(Math.max(1, unit._hpBarMaxW * pct), 5);
    unit._hpBar.setFillStyle(color);
    this.portraits?.update(this.turnManager.active);
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

  _animHit(unit, isCrit = false) {
    if (!unit._sprite) return;
    const origX = unit._sprite.x;
    const shakeX = isCrit ? 12 : 7;
    this.tweens.add({
      targets: unit._sprite,
      x: origX + shakeX,
      duration: 30,
      yoyo: true,
      repeat: isCrit ? 3 : 2,
      ease: 'Linear',
      onComplete: () => { if (unit._sprite) unit._sprite.x = origX; }
    });
    // Цветовая вспышка: крит — красная, обычный — белая
    if (unit._sprite.setTint) {
      unit._sprite.setTint(isCrit ? 0xFF2222 : 0xFFFFFF);
      this.time.delayedCall(isCrit ? 220 : 160, () => { if (unit._sprite) unit._sprite.clearTint(); });
    }
    // Camera shake на крит
    if (isCrit) {
      this.cameras.main.shake(180, 0.006);
    }
  }

  _animDeath(unit) {
    if (!unit._sprite) return;
    // Camera shake на смерть
    this.cameras.main.shake(250, 0.009);
    // grid.remove() вызывается синхронно в _afterPlayerAction/_finishTurn,
    // чтобы не зависеть от onComplete (который не срабатывает при destroy спрайта)
    this.tweens.add({
      targets: unit._sprite,
      alpha: 0,
      y: unit._sprite.y + 25,
      duration: 450,
      ease: 'Power2',
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

  _animDamageNumber(unit, amount, isCrit = false) {
    if (!unit._spriteX) return;
    const label   = isCrit ? `КРИТ! -${amount}` : `-${amount}`;
    const color   = isCrit ? '#FFD700' : '#FF4444';
    const size    = isCrit ? '24px' : '19px';
    const txt = this.add.text(
      unit._spriteX + Phaser.Math.Between(-18, 18),
      unit._spriteY - 20,
      label,
      { fontSize: size, color, fontFamily: 'serif', stroke: '#000', strokeThickness: 3 }
    ).setOrigin(0.5);
    this.tweens.add({
      targets: txt,
      y:       unit._spriteY - (isCrit ? 90 : 70),
      alpha:   0,
      scaleX:  isCrit ? 1.4 : 1,
      scaleY:  isCrit ? 1.4 : 1,
      duration: isCrit ? 1000 : 850,
      ease: 'Power2',
      onComplete: () => txt.destroy(),
    });
  }

  _animMiss(unit) {
    if (!unit._spriteX) return;
    const txt = this.add.text(
      unit._spriteX + Phaser.Math.Between(-12, 12),
      unit._spriteY - 15,
      'Промах!',
      { fontSize: '16px', color: '#AAAAAA', fontFamily: 'serif',
        stroke: '#000', strokeThickness: 2 }
    ).setOrigin(0.5).setAlpha(0.85);
    this.tweens.add({
      targets: txt,
      y: unit._spriteY - 55,
      alpha: 0,
      duration: 700,
      ease: 'Power1',
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
    // Синхронно убираем мёртвых из грида (onComplete tween ненадёжен)
    [...this.playerUnits, ...this.enemyUnits].forEach(u => { if (!u.isAlive) this.grid.remove(u); });
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
    [...this.playerUnits, ...this.enemyUnits].forEach(u => { if (!u.isAlive) this.grid.remove(u); });
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
      this.game.registry.set('bandit_0_defeated', true);
    }

    const showButtons = () => {
      const btn = this.add.text(width/2, height/2 + 80, '[ Попробовать снова ]', {
        fontFamily: 'serif', fontSize: '26px', color: '#AAAAAA',
      }).setOrigin(0.5).setInteractive({ useHandCursor: true });
      btn.on('pointerover', () => btn.setColor('#FFFFFF'));
      btn.on('pointerout',  () => btn.setColor('#AAAAAA'));
      btn.on('pointerdown', () => { eventBus.clear(); this.scene.restart(); });

      if (result === 'victory') {
        const btnMap = this.add.text(width/2, height/2 + 125, '[ На карту ]', {
          fontFamily: 'serif', fontSize: '26px', color: '#C9A84C',
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });
        btnMap.on('pointerover', () => btnMap.setColor('#FFD700'));
        btnMap.on('pointerout',  () => btnMap.setColor('#C9A84C'));
        btnMap.on('pointerdown', () => {
          eventBus.clear();
          this.scene.start('LoadingScene', { destination: 'MapScene', destinationData: { mapKey: 'forest1', spawnId: 'from_left' } });
        });
      }
    };

    if (result === 'victory') {
      const leveledUp = this.playerUnits.filter(u => u.canLevelUp(XP.THRESHOLD));
      if (leveledUp.length > 0) {
        this.time.delayedCall(800, () => {
          this._showLevelUpScreen(leveledUp, showButtons);
        });
      } else {
        showButtons();
      }
    } else {
      showButtons();
    }
  }

  _showLevelUpScreen(units, onComplete) {
    const unit = units[0];
    const remaining = units.slice(1);
    const W = this.scale.width;
    const H = this.scale.height;
    const elements = [];

    // Затемняющий оверлей
    const overlay = this.add.rectangle(W/2, H/2, W, H, 0x000000, 0.7)
      .setDepth(90).setScrollFactor(0);
    elements.push(overlay);

    // Панель
    const panel = this.add.rectangle(W/2, H/2, 580, 420, 0x07060a)
      .setDepth(91).setScrollFactor(0).setAlpha(0.97);
    elements.push(panel);

    // Золотая рамка
    const gfx = this.add.graphics().setDepth(92).setScrollFactor(0);
    gfx.lineStyle(2, 0xd4a832, 0.9);
    gfx.strokeRect(W/2 - 290, H/2 - 210, 580, 420);
    // Угловые акценты
    gfx.lineStyle(3, 0xd4a832, 1);
    const cx = W/2 - 290, cy = H/2 - 210, cw = 580, ch = 420, ca = 18;
    gfx.lineBetween(cx, cy, cx + ca, cy);
    gfx.lineBetween(cx, cy, cx, cy + ca);
    gfx.lineBetween(cx + cw, cy, cx + cw - ca, cy);
    gfx.lineBetween(cx + cw, cy, cx + cw, cy + ca);
    gfx.lineBetween(cx, cy + ch, cx + ca, cy + ch);
    gfx.lineBetween(cx, cy + ch, cx, cy + ch - ca);
    gfx.lineBetween(cx + cw, cy + ch, cx + cw - ca, cy + ch);
    gfx.lineBetween(cx + cw, cy + ch, cx + cw, cy + ch - ca);
    elements.push(gfx);

    // Заголовок
    elements.push(this.add.text(W/2, H/2 - 178, '❖ УРОВЕНЬ ПОВЫШЕН ❖', {
      fontSize: '20px', color: '#d4a832', fontFamily: 'serif',
    }).setOrigin(0.5).setDepth(92).setScrollFactor(0));

    // Разделитель
    const divGfx = this.add.graphics().setDepth(92).setScrollFactor(0);
    divGfx.lineStyle(1, 0xd4a832, 0.4);
    divGfx.lineBetween(W/2 - 220, H/2 - 155, W/2 + 220, H/2 - 155);
    elements.push(divGfx);

    // Имя юнита
    elements.push(this.add.text(W/2, H/2 - 130, unit.name, {
      fontSize: '26px', color: '#FFFFFF', fontFamily: 'serif',
      stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(92).setScrollFactor(0));

    // Новый уровень
    elements.push(this.add.text(W/2, H/2 - 98, `★ Уровень ${unit.level + 1} ★`, {
      fontSize: '15px', color: '#aaaaaa', fontFamily: 'serif',
    }).setOrigin(0.5).setDepth(92).setScrollFactor(0));

    // Подпись
    elements.push(this.add.text(W/2, H/2 - 62, 'Выберите бонус:', {
      fontSize: '13px', color: '#888888', fontFamily: 'serif',
    }).setOrigin(0.5).setDepth(92).setScrollFactor(0));

    // Бонусы
    const bonuses = [
      {
        key: 'hp',
        label: 'Закалённость',
        desc: '+20 к максимальному HP',
      },
      {
        key: 'damage',
        label: 'Мастерство',
        desc: '+3 к урону',
      },
      {
        key: 'speed',
        label: 'Быстрота',
        desc: '+1 к скорости',
      },
    ];

    const cleanup = () => elements.forEach(e => { try { e.destroy(); } catch (_) {} });

    bonuses.forEach((bonus, i) => {
      const by = H/2 - 10 + i * 75;

      const btn = this.add.rectangle(W/2, by, 490, 60, 0x110e0a)
        .setDepth(92).setScrollFactor(0).setInteractive({ useHandCursor: true });

      const btnBorder = this.add.graphics().setDepth(92).setScrollFactor(0);
      btnBorder.lineStyle(1, 0x4a3a1a, 0.7);
      btnBorder.strokeRect(W/2 - 245, by - 30, 490, 60);

      const lbl = this.add.text(W/2, by - 10, bonus.label, {
        fontSize: '16px', color: '#d4a832', fontFamily: 'serif',
      }).setOrigin(0.5).setDepth(93).setScrollFactor(0);

      const desc = this.add.text(W/2, by + 13, bonus.desc, {
        fontSize: '12px', color: '#887755', fontFamily: 'serif',
      }).setOrigin(0.5).setDepth(93).setScrollFactor(0);

      elements.push(btn, btnBorder, lbl, desc);

      btn.on('pointerover', () => {
        btn.setFillStyle(0x2a1e0a);
        btnBorder.clear();
        btnBorder.lineStyle(1, 0xd4a832, 0.8);
        btnBorder.strokeRect(W/2 - 245, by - 30, 490, 60);
        lbl.setColor('#FFD700');
      });
      btn.on('pointerout', () => {
        btn.setFillStyle(0x110e0a);
        btnBorder.clear();
        btnBorder.lineStyle(1, 0x4a3a1a, 0.7);
        btnBorder.strokeRect(W/2 - 245, by - 30, 490, 60);
        lbl.setColor('#d4a832');
      });
      btn.on('pointerdown', () => {
        // Применяем бонус напрямую, вызываем levelUp с key
        if (bonus.key === 'hp') {
          unit.maxHp += 20;
          unit.hp = Math.min(unit.hp + 20, unit.maxHp);
          unit.level++;
          unit.xp = 0;
          eventBus.emit('log', `${unit.name}: +20 к максимальному HP`);
          eventBus.emit('level_up', { unit, choice: 'hp' });
        } else if (bonus.key === 'damage') {
          const dmg = unit.damage || { min: 10, max: 16 };
          unit.damage = { min: dmg.min + 3, max: dmg.max + 3 };
          unit.level++;
          unit.xp = 0;
          eventBus.emit('log', `${unit.name}: +3 к урону`);
          eventBus.emit('level_up', { unit, choice: 'damage' });
        } else if (bonus.key === 'speed') {
          unit.speed = (unit.speed || 5) + 1;
          unit.level++;
          unit.xp = 0;
          eventBus.emit('log', `${unit.name}: +1 к скорости`);
          eventBus.emit('level_up', { unit, choice: 'speed' });
        }
        cleanup();
        if (remaining.length > 0) {
          this._showLevelUpScreen(remaining, onComplete);
        } else {
          onComplete();
        }
      });
    });

    // Анимация появления панели
    panel.setAlpha(0);
    overlay.setAlpha(0);
    this.tweens.add({ targets: [overlay, panel], alpha: { from: 0, to: 1 }, duration: 300 });
  }

  // ── EventBus ──────────────────────────────────────────────────────────

  _toggleBattleGrid() {
    if (this._battleGridDebug) {
      this._battleGridDebug.forEach(o => o.destroy());
      this._battleGridDebug = null;
      return;
    }
    this._battleGridDebug = [];
    const sides = ['player', 'enemy'];
    sides.forEach(side => {
      const color = side === 'player' ? 0x00FFFF : 0xFF4444;
      const rows = UNIT_POSITIONS[side];
      Object.entries(rows).forEach(([row, cols]) => {
        Object.entries(cols).forEach(([col, pos]) => {
          const circle = this.add.circle(pos.x, pos.y, 8, color)
            .setDepth(999).setScrollFactor(0);
          const label = this.add.text(pos.x + 10, pos.y - 8,
            `${side === 'player' ? 'P' : 'E'} r${row}c${col}`, {
              fontSize: '11px', color: side === 'player' ? '#00FFFF' : '#FF4444',
              fontFamily: 'monospace',
            }).setDepth(999).setScrollFactor(0);
          this._battleGridDebug.push(circle, label);
        });
      });
    });
  }

  _bindEvents() {
    eventBus.on('log', msg => {
      this.battleLog.push(msg);
      if (this.battleLog.length > 20) this.battleLog.shift();
      this.ui?.appendLog(msg);
    });

    eventBus.on('turn_started',  unit => this.ui?.highlightActive(unit));

    eventBus.on('unit_damaged', ({ unit, amount, isCrit }) => {
      this._animHit(unit, !!isCrit);
      this._animDamageNumber(unit, amount, !!isCrit);
      this._updateHpBar(unit);
      if (!isCrit) this.cameras.main.shake(80, 0.002);
    });

    eventBus.on('unit_missed', ({ unit }) => {
      this._animMiss(unit);
    });

    eventBus.on('unit_healed', ({ unit }) => {
      this._animHeal(unit);
      this._updateHpBar(unit);
    });

    eventBus.on('unit_died', unit => this._animDeath(unit));

    eventBus.on('skill_selected', skillId => this._onSkillSelect(skillId));

    eventBus.on('skip_turn', () => {
      if (!this.turnManager.isPlayerTurn()) return;
      this.turnManager.skipTurn();
      this._renderAll();
      this.ui.update();
      if (!this.turnManager.isPlayerTurn()) this._runAITurn();
    });
  }
}
