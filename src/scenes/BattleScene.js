import { PlayerUnit } from '../entities/PlayerUnit.js';
import { EnemyUnit }  from '../entities/EnemyUnit.js';
import { TurnManager } from '../systems/TurnManager.js';
import { SkillSystem }  from '../systems/SkillSystem.js';
import { BattleGrid }   from '../systems/BattleGrid.js';
import { UIManager }    from '../ui/UIManager.js';
import { MusicPlayer }    from '../ui/MusicPlayer.js';
import { PortraitPanel, HAS_PORTRAIT } from '../ui/PortraitPanel.js';
import { battleBodyPx } from '../systems/UnitHeights.js';
import { COLORS, XP, AI_DELAY } from '../utils/constants.js';
import eventBus from '../utils/eventBus.js';

import * as Phaser from 'phaser/dist/phaser.esm.js';

import unitsData   from '../data/units.json';
import enemiesData from '../data/enemies.json';
import skillsData  from '../data/skills.json';
import battlesData from '../data/battles.json';
import MAP_CONFIGS from '../data/maps.json';
import { SaveSystem } from '../utils/SaveSystem.js';
import { PartySystem } from '../systems/PartySystem.js';
import { applyItemBonuses } from '../systems/Items.js';
import { Sfx } from '../systems/Sfx.js';
import { enemiesForParty, lootPerEnemy, meleeReach, isActive, shouldSurrender, hasFury, RULES } from '../systems/CombatRules.js';
import { getBattleAnimConfig, ensureBattleAnims, hasBattleAnims, loadBattleAnimSheets, battleAnimReady, animOrigin } from '../systems/BattleAnimations.js';
import { showBattleResult } from '../ui/BattleResultWindow.js';
import { Frame } from '../ui/Frame.js';
import { setBackdrop } from '../ui/Backdrop.js';

const SPRITE_IDS = [
  'hero_duelist',
  'companion_brawler',
  'companion_healer',
  'bandit_commander',
  'bandit_brawler',
  'bandit_archer',
  'kikimora',
  'swamp_knight',
  'swamp_elf_battle',
];
const HAS_BG = true; // поставь true когда добавишь battle_bg.png

// ── Позиции юнитов в стиле Disciples II ──────────────────────────────────
// Disciples II diagonal: задний ряд (row=1) смещён на 25px вверх относительно переднего.
// Симметрия вокруг x=640:
//   игрок front x=450 → зазор 190 → враг front x=830
//   игрок back  x=265 → зазор 375 → враг back  x=1015
// Зазор между передними рядами: 380px. Шаг по вертикали: 150px.
// col=0 (низ), col=1 (середина), col=2 (верх)
// ── Disciples II diagonal layout ─────────────────────────────────────────────
// ОБЕ армии идут по одной диагонали снизу-слева → вверху-справа (НЕ зеркально).
// Враг = точная копия позиций игрока, сдвинутая на +415px по X.
// Игрок: back(row=1) x=285-468, front(row=0) x=500-610
// Враг:  front(row=0) x=700-883, back(row=1) x=915-1025
//   → передний ряд врага (ближе к игроку) слева, задний - справа.
// col=0 нижний (ближе к зрителю, y большее), col=2 верхний (y меньшее).
// Запретная зона y < 230 (палатки): ни одна точка не нарушает ограничение.
const UNIT_POSITIONS = {
  player: {
    0: { // передний ряд (правее, ближе к врагу)
      0: { x: 500, y: 550 },  // низ
      1: { x: 560, y: 465 },  // середина
      2: { x: 610, y: 385 },  // верх
    },
    1: { // задний ряд (левее, дальше от врага)
      0: { x: 285, y: 590 },  // низ
      1: { x: 380, y: 485 },  // середина
      2: { x: 468, y: 385 },  // верх
    },
  },
  enemy: {
    // r0 - ближний ряд (левее), r1 - дальний ряд (правее)
    0: {
      0: { x: 700, y: 550 },  // P r0c0 (500) + 200
      1: { x: 760, y: 465 },  // P r0c1 (560) + 200
      2: { x: 810, y: 385 },  // P r0c2 (610) + 200
    },
    1: {
      0: { x: 915,  y: 590 },  // P r1c0 (285) + 630
      1: { x: 1010, y: 485 },  // P r1c1 (380) + 630
      2: { x: 1098, y: 385 },  // P r1c2 (468) + 630
    },
  },
};

// Высота спрайта в пикселях по ряду (перспектива)
const BASE_HEIGHT = 160; // единая база - знахарка/арбалетчик

export class BattleScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BattleScene' });
  }

  init(data) {
    this._fromMapKey  = data?.fromMapKey  || 'map1';
    this._fromSpawnId = data?.fromSpawnId || 'default';
    this._battleId    = data?.battleId    || 'korvin_gang';
    if (this._battleId === 'bandit_patrol') this._battleId = 'korvin_gang';   // старый id боя с Корвином
    this._battleConfig = battlesData.find(b => b.id === this._battleId) || null;
    this._battleBgKey = this._battleConfig?.backgroundKey || 'battle_bg';
    // Фон по карте, если у боя своего нет (09_МИР 8, поле battleBg в maps.json)
    const mapBg = MAP_CONFIGS[this._fromMapKey]?.battleBg;
    if (!this._battleConfig?.backgroundKey && mapBg) {
      this._battleConfig = { ...(this._battleConfig || {}), backgroundKey: `battle_${mapBg}`, backgroundPath: `battle/${mapBg}.jpg` };
      this._battleBgKey = `battle_${mapBg}`;
    }
  }

  preload() {
    this._loadingScreen();
    const img = (key, path) => { if (!this.textures.exists(key)) this.load.image(key, path); };
    if (this._battleConfig?.backgroundKey && this._battleConfig?.backgroundPath) {
      img(this._battleConfig.backgroundKey, this._battleConfig.backgroundPath);
    } else if (HAS_BG) img('battle_bg', 'battle_bg.png');
    // Покадровые анимации: только для тех, кто участвует в этом бою
    const enemySource = [
      ...(this._battleConfig?.enemies || enemiesData),
      ...Object.values(this._battleConfig?.enemiesBySize || {}).flat(),
    ];
    // Из своих только те, кто в отряде (а не все, кого можно нанять)
    const party = PartySystem.getParty(this.game.registry);
    const partyData = unitsData.filter(u => party.includes(u.id));
    this._animUnitIds = [...partyData, ...enemySource].flatMap(u => [u.id, u.spriteKey]).filter(Boolean);
    loadBattleAnimSheets(this, this._animUnitIds);
    // Статичные спрайты (запасной вид без анимации) и портреты: только участники этого боя
    const ids = new Set(this._animUnitIds);
    SPRITE_IDS.filter(id => ids.has(id)).forEach(id => img(id, `sprites/${id}.png`));
    [...partyData, ...enemySource].forEach(u => {
      const pk = u.spriteKey ?? u.id;
      if (HAS_PORTRAIT(pk)) img(`portrait_${pk}`, `portraits/${pk}.png`);
    });
  }

  /** Заставка на время загрузки листов боя: тёмный фон, название боя, полоса прогресса. */
  _loadingScreen() {
    const objs = [
      this.add.rectangle(640, 360, 1280, 720, 0x0a0a0f, 1).setDepth(5000),
      this.add.text(640, 320, this._battleConfig?.name || 'Бой', {
        fontFamily: 'Georgia, "Times New Roman", serif', fontSize: '26px', color: '#d4a832', letterSpacing: 3,
      }).setOrigin(0.5).setDepth(5001),
      this.add.rectangle(640, 372, 420, 6, 0x2a2114, 1).setDepth(5001),
    ];
    const bar = this.add.rectangle(430, 372, 0, 6, 0xd4a832, 1).setOrigin(0, 0.5).setDepth(5002);
    const hint = this.add.text(640, 400, 'Отряд готовится к бою', {
      fontFamily: 'Georgia, "Times New Roman", serif', fontSize: '14px', color: '#888877',
    }).setOrigin(0.5).setDepth(5001);
    objs.push(bar, hint);
    this._loadObjs = objs;
    // Обработчик снимается вместе с заставкой: загрузчик сцены переживает перезапуск боя
    const onProgress = v => { if (bar.active) bar.setSize(420 * v, 6); };
    this.load.on('progress', onProgress);
    this._offLoadProgress = () => this.load.off('progress', onProgress);
    this.events.once('shutdown', () => this._offLoadProgress?.());
  }

  create() {
    // Заставка загрузки уходит, когда сцена готова (если грузить было нечего, событие загрузчика не приходит)
    this._offLoadProgress?.();
    (this._loadObjs || []).forEach(o => o.destroy());
    this._loadObjs = null;
    eventBus.clear();
    // Железо: выход из боя через F5 засчитывается как поражение (метку снимает любое сохранение после боя)
    SaveSystem.markBattle(this._battleId);
    this._initSystems();
    this._initUnits();
    this._drawBg();
    this._drawField();
    this._initUI();
    this.portraits = new PortraitPanel(this, this.playerUnits, this.enemyUnits);
    this.portraits.create();
    this._bindEvents();
    Sfx.bindBattle(this);
    if (import.meta.env.DEV) {
      this.input.keyboard.on('keydown-B', () => this._toggleBattleGrid());
      this.input.keyboard.on('keydown-G', () => this._toggleBattleCoordGrid());
      this.input.keyboard.on('keydown-H', () => this._toggleFineGrid());
      this.input.keyboard.on('keydown-J', () => this._toggleJGrid());
    }
    // Esc и правый клик снимают выбранный навык
    this.input.keyboard.on('keydown-ESC', () => this._cancelPendingSkill());
    this.input.on('pointerdown', p => { if (p.rightButtonDown()) this._cancelPendingSkill(); });
    this.turnManager.init([...this.playerUnits, ...this.enemyUnits]);
    this._renderAll();
    // Инициализируем плеер здесь (ассеты уже в кэше после LoadingScene)
    this.music = new MusicPlayer(this);
    this.music.create();
    // Удары, смерть и победа догружаются в фоне; пока листа нет, действие идёт без покадровой анимации
    if (loadBattleAnimSheets(this, this._animUnitIds || [], false)) this.load.start();
    if (!this.turnManager.isPlayerTurn()) this._runAITurn();
  }

  // ── Инициализация ─────────────────────────────────────────────────────

  _initSystems() {
    this.skillSystem = new SkillSystem();
    this.skillSystem.registerAll(skillsData);
    this.turnManager = new TurnManager();
    this.grid        = new BattleGrid();
    this.battleLog   = [];
    this.battleOver  = false;
    this._animLock   = false;
    this._furyUsed   = false;
    this._pendingSkill = null;
  }

  _initUnits() {
    // Только живая активная партия (PartySystem), враги из конфига боя по размеру партии
    this.playerUnits = PartySystem.buildPlayerUnits(this.game.registry);
    const enemySource = this._battleConfig?.enemies
      ? enemiesForParty(this._battleConfig, this.playerUnits.length)
      : enemiesData;
    this.enemyUnits  = enemySource.map(d => new EnemyUnit(JSON.parse(JSON.stringify(d))));
    // Стороны знают друг друга (тонкий строй, рёв, лечение всех)
    this.playerUnits.forEach(u => {
      u._allies = this.playerUnits; u._foes = this.enemyUnits;
      const base = unitsData.find(d => d.id === u.id)?.resources || {};
      u.prepareForBattle(base);
    });
    this.enemyUnits.forEach(u => { u._allies = this.enemyUnits; u._foes = this.playerUnits; });
    applyItemBonuses(this.playerUnits, this.game.registry);
    // Западня: враги ходят первыми в первом раунде
    if (this.game.registry.get('battleAmbush')) {
      this.enemyUnits.forEach(u => { u._initiativeBonus = 100; });
      this.game.registry.set('battleAmbush', false);
    }
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
      this.add.image(640, 360, this._battleBgKey).setDisplaySize(1280, 720).setDepth(0);
      setBackdrop(this, this._battleBgKey);
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

    // Метки убраны - стороны видны через портреты
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
      if (!unit.isAlive) {
        // Анимированный спрайт живёт вне _unitSprites: убираем его после твина смерти
        if (unit._animSprite) {
          const dead = unit._animSprite;
          unit._animSprite = null;
          this.time.delayedCall(500, () => dead.destroy());
        }
        return;
      }

      const { x, y } = this._getPos(unit);
      const h = BASE_HEIGHT;
      const isActive = unit === active;

      // Глубина по «ногам» (painter's algorithm): кто стоит ниже на экране
      // (больший y = ближе к зрителю), тот рисуется поверх. Это не даёт дальнему
      // юниту перекрывать ближнего внутри одного ряда. При равном y передний
      // ряд (row=0) чуть выше заднего.
      const rowDepth = y + (unit.position.row === 0 ? 0.5 : 0);

      // Тонкое кольцо под ногами - только контур, без заливки
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

      // Рост фигуры по реальному росту существа (src/data/heights.json), задний ряд чуть меньше
      const bodyPx = battleBodyPx(unit);
      unit._bodyPx = bodyPx;

      // Спрайт или прямоугольник (spriteKey позволяет тест-юнитам использовать чужой спрайт)
      let sprite;
      const spriteKey = unit.spriteKey ?? unit.id;
      const animCfg = getBattleAnimConfig(unit.id) ?? getBattleAnimConfig(unit.spriteKey);
      const animated = hasBattleAnims(this, animCfg);
      const hasSprite = animated || this.textures.exists(spriteKey);

      if (animated) {
        // Покадровый спрайт (смотрит вправо, без flipX) переживает перерисовку,
        // иначе анимация обрывалась бы после каждого хода.
        sprite = this._ensureAnimSprite(unit, animCfg, bodyPx / (animCfg.anims.idle.bodyHeight ?? animCfg.bodyHeight));
        sprite._bodyPx = bodyPx;
        sprite.setPosition(x, y).setDepth(rowDepth);
      } else if (hasSprite) {
        sprite = this.add.image(x, y, spriteKey).setOrigin(0.5, 1).setDepth(rowDepth);
        const ratio = sprite.width / sprite.height;
        sprite.setDisplaySize(bodyPx * ratio, bodyPx);
        // Враги смотрят влево, дуэлянт смотрит вправо (лицом к врагам)
        if (unit.type === 'enemy') sprite.setFlipX(true);
        if (unit.id === 'hero_duelist') sprite.setFlipX(true);
      } else {
        const w = Phaser.Math.Clamp(bodyPx * 0.42, 40, 110);
        // Заглушка без рисунка: тёмный силуэт нужного роста (у врагов из battles.json цвета нет)
        sprite = this.add.rectangle(x, y, w, bodyPx, unit.color ?? 0x3a3a42, 1)
          .setStrokeStyle(2, 0x6a6a72, 0.9)
          .setOrigin(0.5, 1);
      }

      // HP-бар над спрайтом
      // Над головой фигуры (а не над краем кадра листа): зазор одинаковый у всех
      const barW     = Phaser.Math.Clamp(bodyPx * 0.5, 44, 80);
      const barH     = 5;
      const spriteTop = y - bodyPx;
      const barY     = spriteTop - 6;
      const pct      = Math.max(0, unit.hp / unit.maxHp);
      const barColor = pct > 0.5 ? 0x44CC44 : pct > 0.25 ? 0xCCAA00 : 0xCC2222;

      // HP-бары всегда поверх всех спрайтов (макс. глубина спрайта ≈ 590)
      const barBg = this.add.rectangle(x, barY, barW, barH, 0x111111, 0.85)
        .setDepth(rowDepth + 600);
      const barFill = this.add.rectangle(x - barW / 2, barY, barW * pct, barH, barColor)
        .setOrigin(0, 0.5).setDepth(rowDepth + 601);

      unit._hpBar    = barFill;
      unit._hpBarBg  = barBg;
      unit._hpBarMaxW = barW;
      unit._hpBarY   = barY;

      this._unitSprites.push(barBg, barFill);

      // Интерактивность
      if (unit.type === 'enemy' && !animated) {
        sprite.setInteractive({ useHandCursor: true });
        sprite.on('pointerdown', () => this._onEnemyClick(unit));
        sprite.on('pointerover', () => { sprite.setAlpha(0.8); this.ui.showTarget(unit); });
        sprite.on('pointerout',  () => { sprite.setAlpha(1.0); this.ui.tip.hide(); });
      }
      if (unit.type === 'player' && !animated) {
        sprite.setInteractive({ useHandCursor: true });
        sprite.on('pointerdown', () => this._onAllyClick(unit));
        sprite.on('pointerover', () => this.ui.showTarget(unit));
        sprite.on('pointerout', () => this.ui.tip.hide());
      }

      if (!animated) this._unitSprites.push(sprite);

      if (unit.surrendered) { sprite.setTint?.(0x777777); sprite.disableInteractive?.(); }
      unit._sprite  = sprite;
      unit._hpText  = null;
      unit._spriteX = x;
      unit._spriteY = y - bodyPx / 2; // центр фигуры для анимаций и цифр урона
    });

    this.ui.update();
    this.portraits?.update(this.turnManager.active);
    // Подсветка целей: при ходе игрока - враги, иначе - сброс
    if (this.turnManager.isPlayerTurn() && !this._pendingSkill) {
      this._highlightTargets('enemy_single');
    } else if (!this.turnManager.isPlayerTurn()) {
      this._clearTargetHighlight();
    }
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

  _ensureAnimSprite(unit, cfg, scale) {
    if (unit._animSprite?.active) return unit._animSprite;
    ensureBattleAnims(this, cfg);
    const idle = cfg.anims.idle;
    const flip = unit.type === 'enemy';   // все кадры нарисованы лицом вправо, враги смотрят влево
    const spr = this.add.sprite(0, 0, idle.key, 0)
      .setOrigin(...animOrigin(cfg, idle, flip))
      .setFlipX(flip)
      .setScale(scale);
    spr.play({ key: idle.key, startFrame: Phaser.Math.Between(0, idle.frames - 1) });
    // Обработчики вешаются один раз: спрайт не пересоздаётся при перерисовке
    // Клик по видимой фигуре, а не по прозрачным полям кадра (иначе крупный сосед перехватывал клик)
    spr.setInteractive({ useHandCursor: true, pixelPerfect: true, alphaTolerance: 8 });
    if (unit.type === 'enemy') {
      spr.on('pointerdown', () => this._onEnemyClick(unit));
      spr.on('pointerover', () => { spr.setAlpha(0.8); this.ui.showTarget(unit); });
      spr.on('pointerout',  () => { spr.setAlpha(1.0); this.ui.tip.hide(); });
    } else {
      spr.on('pointerdown', () => this._onAllyClick(unit));
      spr.on('pointerover', () => this.ui.showTarget(unit));
      spr.on('pointerout', () => this.ui.tip.hide());
    }
    unit._animSprite = spr;
    unit._animCfg = cfg;
    return spr;
  }

  // Имя анимации для действия юнита (null, если у юнита нет такой анимации)
  _actionAnim(unit, actionId) {
    if (!unit._animSprite?.active || !unit._animCfg) return null;
    const name = unit._animCfg.actions?.[actionId];
    return name && battleAnimReady(this, unit._animCfg, name) ? name : null;
  }

  // Реакция (hit / death / victory / block), если такая анимация есть
  _react(unit, name, onDone) {
    if (!unit._animSprite?.active || !battleAnimReady(this, unit._animCfg, name)) return false;
    if (name === 'hit' && unit._animBusy) return false;   // урон не прерывает собственный удар
    this._playUnitAnim(unit, name, null, onDone);
    return true;
  }

  /**
   * Проиграть анимацию действия. onHit вызывается на кадре удара (hitFrame),
   * в конце спрайт плавно возвращается в стойку.
   */
  _playUnitAnim(unit, name, onHit, onDone) {
    const spr = unit._animSprite;
    const cfg = unit._animCfg;
    const a = cfg.anims[name];
    const reaction = !onHit;
    if (!reaction) unit._animBusy = true;
    // Смерть от ответного выпада может прервать удар. Завершение хода
    // переносится на конец новой анимации, иначе ввод останется заблокирован.
    const previousDone = spr._actionDone;
    spr._actionDone = previousDone && onDone
      ? () => { onDone(); previousDone(); }
      : onDone || previousDone;
    const run = {};
    spr._animationRun = run;
    let hit = false;
    const fireHit = () => {
      if (hit) return;
      hit = true;
      if (a.muzzle) this._fxMuzzle(spr, a);
      onHit?.();
    };
    const onUpdate = (_anim, frame) => {
      if (frame.index - 1 >= (a.hitFrame ?? 0)) fireHit();
    };
    spr.off('animationupdate');
    spr.off('animationcomplete');
    spr.setOrigin(...animOrigin(cfg, a, spr.flipX));
    // Листы упакованы в разном масштабе: рост фигуры держим постоянным на каждой анимации
    if (spr._bodyPx && a.bodyHeight) spr.setScale(spr._bodyPx / a.bodyHeight);
    spr.play(a.key);
    spr.on('animationupdate', onUpdate);
    spr.once('animationcomplete', () => {
      spr.off('animationupdate', onUpdate);
      fireHit();
      if (spr._animationRun !== run) return;
      if (!reaction) unit._animBusy = false;
      const done = spr._actionDone;
      spr._actionDone = null;
      if (!a.hold) this._returnToIdle(unit);   // смерть и победа держат последний кадр
      done?.(); // следующий ход может запустить победу: стойка не должна её перебить
    });
  }

  _returnToIdle(unit) {
    const spr = unit._animSprite;
    if (!spr?.active) return;
    const cfg = unit._animCfg;
    // Последний кадр действия плавно растворяется поверх стойки: позы не совпадают точно
    const ghost = this.add.image(spr.x, spr.y, spr.texture.key, spr.frame.name)
      .setOrigin(spr.originX, spr.originY).setScale(spr.scaleX).setFlipX(spr.flipX).setDepth(spr.depth + 0.1);
    this.tweens.add({ targets: ghost, alpha: 0, duration: 180, onComplete: () => ghost.destroy() });
    spr.setOrigin(...animOrigin(cfg, cfg.anims.idle, spr.flipX));
    if (spr._bodyPx && cfg.anims.idle.bodyHeight) spr.setScale(spr._bodyPx / cfg.anims.idle.bodyHeight);
    spr.play({ key: cfg.anims.idle.key, startFrame: 0 });
  }

  // Вспышка и дым выстрела у дула (в спрайтах их нет, их рисует игра)
  _fxMuzzle(spr, a) {
    const s = spr.scaleX;
    const mxLocal = spr.flipX ? a.frameWidth - a.muzzle.x : a.muzzle.x;
    const mx = spr.x + (mxLocal - spr.originX * a.frameWidth) * s;
    const my = spr.y + (a.muzzle.y - spr.originY * a.frameHeight) * s;
    const d = spr.depth + 1;
    const glow  = this.add.ellipse(mx + 6, my, 30, 16, 0xFFB040, 0.85).setDepth(d);
    const core  = this.add.ellipse(mx + 3, my, 12, 7, 0xFFF4C0, 1).setDepth(d + 0.1);
    this.tweens.add({
      targets: [glow, core], scaleX: 1.8, scaleY: 1.4, alpha: 0,
      duration: 110, ease: 'Power2',
      onComplete: () => { glow.destroy(); core.destroy(); },
    });
    for (let i = 0; i < 6; i++) {
      const puff = this.add.circle(mx + Phaser.Math.Between(0, 8), my + Phaser.Math.Between(-3, 3),
        Phaser.Math.Between(4, 7), 0xB8B0A4, 0.55).setDepth(d - 0.2);
      this.tweens.add({
        targets: puff,
        x: puff.x + Phaser.Math.Between(10, 34),
        y: puff.y - Phaser.Math.Between(8, 26),
        scale: Phaser.Math.FloatBetween(2.2, 3.4),
        alpha: 0,
        delay: i * 25,
        duration: Phaser.Math.Between(600, 900),
        ease: 'Sine.easeOut',
        onComplete: () => puff.destroy(),
      });
    }
    this.cameras.main.shake(90, 0.003);
  }

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
    // Цветовая вспышка: крит - красная, обычный - белая
    if (unit._sprite.setTint) {
      unit._sprite.setTint(isCrit ? 0xFF2222 : 0xFFFFFF);
      this.time.delayedCall(isCrit ? 220 : 160, () => { unit._sprite?.clearTint?.(); });
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
    // Покадровая смерть: падает и лежит, потом тело медленно растворяется
    if (unit._animSprite?.active && battleAnimReady(this, unit._animCfg, 'death')) {
      const spr = unit._animSprite;
      unit._animSprite = null;          // перерисовка больше не трогает этот спрайт
      spr.disableInteractive();
      this._playUnitAnim({ _animSprite: spr, _animCfg: unit._animCfg }, 'death', null, () => {
        this.tweens.add({ targets: spr, alpha: 0, delay: 900, duration: 700, onComplete: () => spr.destroy() });
      });
      return;
    }
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

  _animHeal(unit, support = false) {
    if (!unit._sprite) return;
    const glow = this.add.ellipse(unit._spriteX, unit._spriteY, 90, 90, support ? 0xd4a832 : 0x44FF88, 0.45).setDepth(900);
    this.tweens.add({
      targets: glow, alpha: 0, scaleX: 2.2, scaleY: 2.2,
      duration: 550, ease: 'Power2',
      onComplete: () => glow.destroy(),
    });
    if (support) return; // прикрытие и другие нелечащие навыки не показывают ложное «+HP»
    const txt = this.add.text(unit._spriteX, unit._spriteY - 20, '+HP', {
      fontSize: '17px', color: '#44FF88', fontFamily: 'serif',
      stroke: '#000', strokeThickness: 2
    }).setOrigin(0.5).setDepth(1300);
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
    ).setOrigin(0.5).setDepth(1300);
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
    ).setOrigin(0.5).setAlpha(0.85).setDepth(1300);
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


  // ── Подсветка доступных целей ────────────────────────────────────────

  _highlightTargets(type) {
    this._clearTargetHighlight();
    const isAlly = type === 'ally_single';
    const actor = this.turnManager.active;
    const skill = this._pendingSkill ? this.skillSystem.get(this._pendingSkill) : null;
    const ignoresRows = actor?.ranged || actor?.ignoreRows || skill?.ignoreRows;
    const targets = isAlly
      ? this.playerUnits.filter(u => u.isAlive)
      : this.enemyUnits.filter(u => isActive(u) && (ignoresRows || meleeReach(actor, u, this.enemyUnits).ok));
    // Кольцо под ногами цели, фигура не перекрашивается
    this.ui?.showTargets(targets, isAlly);
  }

  _clearTargetHighlight() {
    this.ui?.clearTargets();
  }

  _onEnemyClick(target) {
    if (this.battleOver || this._animLock) return;
    if (!this.turnManager.isPlayerTurn()) return;
    const actor = this.turnManager.active;
    if (!actor || actor.type !== 'player') return;

    if (!isActive(target)) return;
    const pendingSk = this._pendingSkill ? this.skillSystem.get(this._pendingSkill) : null;
    const rangedAct = actor.ranged || actor.ignoreRows || (pendingSk?.targetType === 'enemy_single' && pendingSk.ignoreRows);
    if (!rangedAct && !meleeReach(actor, target, this.enemyUnits).ok) {
      eventBus.emit('log', `${target.name} за строем: до заднего ряда не дотянуться, пока впереди стоят двое`);
      return;
    }

    if (this._pendingSkill) {
      const skillId = this._pendingSkill;
      const sk = this.skillSystem.get(skillId);
      if (sk && sk.targetType !== 'enemy_single') {
        // Навык на союзника: клик по врагу не превращается в обычную атаку
        eventBus.emit('log', `«${sk.name}» применяется к союзнику. Esc или повторный клик по навыку снимает выбор`);
        return;
      }
      if (sk) {
        const reason = this.skillSystem.unavailableReason(skillId, actor);
        if (reason) {
          // Ход не сгорает: навык просто нельзя применить
          eventBus.emit('log', `«${sk.name}» недоступен: ${reason}`);
          this._cancelPendingSkill();
          return;
        }
        this._pendingSkill = null;
        this._performAction(actor, target, this._actionAnim(actor, skillId), () => actor.handleSkill(skillId, target, this.skillSystem));
        return;
      }
    }

    this._performAction(actor, target, this._actionAnim(actor, 'basic'),
      () => actor.handleAttack(target, this.skillSystem));
  }

  // Действие с анимацией: урон засчитывается на кадре удара, до конца хода ввод заблокирован
  _performAction(actor, target, anim, apply, support = false) {
    this._animLock = true;
    this._clearTargetHighlight();
    this.ui.update();
    const done = () => {
      actor._animBusy = false;
      this._animLock = false;
      this._afterPlayerAction();
    };
    if (!anim) {
      if (support) this._animHeal(actor, true);
      else this._playAttackAnim(actor, target);
      apply();
      this.time.delayedCall(support ? 450 : 240, done);
      return;
    }
    this._playUnitAnim(actor, anim, apply, done);
  }

  _onAllyClick(target) {
    if (this.battleOver || this._animLock) return;
    if (!this.turnManager.isPlayerTurn()) return;
    if (!this._pendingSkill) return;
    if (!target?.isAlive) return;
    const actor = this.turnManager.active;
    const sk = this.skillSystem.get(this._pendingSkill);
    if (sk && (sk.targetType === 'ally_single' || sk.targetType === 'self')) {
      const reason = this.skillSystem.unavailableReason(this._pendingSkill, actor);
      if (reason) { eventBus.emit('log', `«${sk.name}» недоступен: ${reason}`); this._cancelPendingSkill(); return; }
      const skillId = this._pendingSkill;
      this._pendingSkill = null;
      this._performAction(actor, sk.targetType === 'self' ? actor : target, this._actionAnim(actor, skillId),
        () => actor.handleSkill(skillId, sk.targetType === 'self' ? actor : target, this.skillSystem), true);
    }
  }

  _cancelPendingSkill() {
    if (!this._pendingSkill || this.battleOver) return;
    this._pendingSkill = null;
    this._clearTargetHighlight();
    if (this.turnManager.isPlayerTurn()) this._highlightTargets('enemy_single');
    this.ui.update();
  }

  _onSkillSelect(skillId) {
    if (this.battleOver || this._animLock || !this.turnManager.isPlayerTurn()) return;
    const actor = this.turnManager.active;
    if (!actor) return;
    const sk = this.skillSystem.get(skillId);
    if (!sk) return;
    // Повторный клик по выбранному навыку снимает выбор
    if (this._pendingSkill === skillId) { this._cancelPendingSkill(); return; }
    const reason = this.skillSystem.unavailableReason(skillId, actor);
    if (reason) { eventBus.emit('log', `«${sk.name}» недоступен: ${reason}`); return; }
    if (sk.targetType === 'self') {
      this._pendingSkill = null;
      this._performAction(actor, actor, this._actionAnim(actor, skillId),
        () => actor.handleSkill(skillId, actor, this.skillSystem), true);
    } else {
      this._pendingSkill = skillId;
      eventBus.emit('log', `«${sk.name}»: выберите цель`);
      this._highlightTargets(sk.targetType);
      this.ui.update();
    }
  }

  // ── После хода ────────────────────────────────────────────────────────

  _afterPlayerAction() {
    this._pendingSkill = null;
    this._clearTargetHighlight();
    this._checkSurrenders();
    if (this._checkEnd()) return;
    // Второй выпад: базовая атака убила цель, тот же герой действует ещё раз
    const actor = this.turnManager.active;
    if (actor?._extraAction) {
      actor._extraAction = false;
      this._renderAll();
      this.ui.update();
      return;
    }
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
      const anim = target ? this._actionAnim(actor, 'basic') : null;
      // Ярость босса: ниже половины HP второе действие в том же ходу
      const afterAction = () => {
        if (!this.battleOver && !this._furyUsed && hasFury(actor) && this.playerUnits.some(u => u.isAlive)) {
          this._furyUsed = true;
          eventBus.emit('log', `${actor.name} в ярости и бьёт ещё раз!`);
          this._checkSurrenders();
          if (this._checkEnd()) return;
          this._runAITurn();
          return;
        }
        this._furyUsed = false;
        this._finishTurn();
      };
      if (anim) {
        // Урон по кадру удара, ход заканчивается после анимации
        this._animLock = true;
        this._playUnitAnim(actor, anim, () => {
          actor.decideAction(this.playerUnits, this.skillSystem, this.grid, this.enemyUnits);
        }, () => {
          this._animLock = false;
          afterAction();
        });
        return;
      }
      if (target) this._playAttackAnim(actor, target);
      actor.decideAction(this.playerUnits, this.skillSystem, this.grid, this.enemyUnits);
      this.time.delayedCall(180, afterAction);
    });
  }

  _finishTurn() {
    this._checkSurrenders();
    if (this._checkEnd()) return;
    this.turnManager.nextTurn();
    [...this.playerUnits, ...this.enemyUnits].forEach(u => { if (!u.isAlive) this.grid.remove(u); });
    this._renderAll();
    this.ui.update();
    if (!this.turnManager.isPlayerTurn()) this._runAITurn();
  }

  // ── Конец боя ─────────────────────────────────────────────────────────

  // Сдача: человек с canSurrender при HP < 20%, когда командир пал или сдался
  _checkSurrenders() {
    this.enemyUnits.forEach(u => {
      if (shouldSurrender(u, this.enemyUnits)) {
        u.surrendered = true;
        eventBus.emit('log', `${u.name} бросает оружие и сдаётся`);
        const spr = u._animSprite || u._sprite;
        spr?.setTint?.(0x777777);
        spr?.disableInteractive?.();
      }
    });
  }

  _checkEnd() {
    if (this.battleOver) return true;
    // Трусливая ватага: потеряв половину, остальные бегут (14_БЕСТИАРИЙ 2)
    if (this._battleConfig?.flee === 'half') {
      const fallen = this.enemyUnits.filter(u => !u.isAlive).length;
      if (fallen * 2 >= this.enemyUnits.length) {
        this.enemyUnits.filter(u => isActive(u)).forEach(u => {
          u.surrendered = true; u.fled = true;
          eventBus.emit('log', `${u.name} бросает добычу и бежит`);
        });
      }
    }
    // Сдавшиеся не мешают победе
    const enemiesDown = this.enemyUnits.every(u => !isActive(u));
    // Хроника: поражение, когда лежат все. Железо: когда пал герой.
    const iron = this.game.registry.get('gameMode') === 'iron';
    const lost = iron ? !this.playerUnits[0]?.isAlive : this.playerUnits.every(u => !u.isAlive);
    if (enemiesDown) { this._endBattle('victory'); return true; }
    if (lost)        { this._endBattle('defeat');  return true; }
    return false;
  }

  _endBattle(result) {
    this.battleOver = true;
    const { width, height } = this.scale;
    // Затемнение ловит клики: кнопки боя под ним больше не работают
    const OVERLAY_DEPTH = 2000;
    this.add.rectangle(width/2, height/2, width, height, 0x000000, 0.55).setDepth(OVERLAY_DEPTH - 2).setInteractive();
    this._pendingSkill = null;
    this._clearTargetHighlight();
    this.ui.hideActions();

    const iron = this.game.registry.get('gameMode') === 'iron';
    const rows = [];
    const toMap = () => {
      eventBus.clear();
      this.scene.start('LoadingScene', {
        destination: 'MapScene',
        destinationData: { mapKey: this._fromMapKey, spawnId: this._fromSpawnId },
      });
    };

    if (result === 'victory') {
      this.playerUnits.filter(u => u.isAlive).forEach(u => this._react(u, 'victory'));
      // Хроника: упавшие встают с 1 HP и раной (maxHp ×0.8 до отдыха)
      this.playerUnits.filter(u => !u.isAlive).forEach(u => {
        u.isAlive = true;
        u.baseMaxHp = u.baseMaxHp ?? u.maxHp;
        u.injured = true;
        u.maxHp = Math.round(u.baseMaxHp * RULES.INJURY_MULT);
        u.hp = 1;
        eventBus.emit('log', `${u.label}: рана, до отдыха максимум HP ${u.maxHp}`);
        rows.push({ icon: 'icon_drop', text: `${u.label}: рана, до отдыха HP не выше ${u.maxHp}`, color: '#d08a6a' });
      });
      // Сдавшиеся: решение «добить / отпустить» показывает карта (03_ДИАЛОГИ 6.7)
      const surrendered = this.enemyUnits.filter(u => u.surrendered && u.isAlive).map(u => u.id);
      this.game.registry.set('lastSurrendered', surrendered);
      this.game.registry.set('lastBattleId', this._battleId);
      this.game.registry.set('lastBattleResult', 'victory');
      this.game.registry.set('lastBattleDead', this.enemyUnits.filter(u => !u.isAlive).map(u => u.id));
      if (surrendered.length) eventBus.emit('battle_surrender_choice', surrendered);
      // Общий опыт партии за решённую встречу (01_БАЛАНС 3), не за трупы
      const xpGain = this._battleConfig?.xpReward ?? 0;
      this._levelSpan = PartySystem.addXp(this.game.registry, xpGain);
      rows.unshift({ icon: 'icon_luck_horseshoe', text: `Опыт отряда: +${xpGain}`, color: '#e8e2d4' });
      this.game.registry.set(this._battleConfig?.victoryFlag || 'bandit_0_defeated', true);
      // Встреча на карте пройдена сразу при победе: на возврате её не видно, и флаг попадает в сохранение
      const pb = this.game.registry.get('pendingBattle');
      if (pb?.encounterId && pb.battleId === this._battleId) this.game.registry.set(`enc_${pb.encounterId}_done`, true);
      if (this._battleId === 'korvin_gang') this.game.registry.set('bandit_0_defeated', true);
      // Добыча: 4 + 2 × уровень встречи с каждого врага (01_БАЛАНС 9)
      const loot = this._battleConfig ? this.enemyUnits.length * lootPerEnemy(this._battleConfig.intendedLevel) : 0;
      if (loot > 0) {
        SaveSystem.addGold(loot, this.game.registry);
        rows.splice(1, 0, { icon: 'icon_gold', text: `Добыча: ${loot} ${loot % 10 === 1 && loot % 100 !== 11 ? 'монета' : [2, 3, 4].includes(loot % 10) && ![12, 13, 14].includes(loot % 100) ? 'монеты' : 'монет'}`, color: '#d4a832' });
      }
    }

    // Итог уже виден: F5 во время задержки окна не должен отменить победу
    // или превратить её в поражение Железа.
    const rest = result === 'defeat' && !iron ? SaveSystem.restoreRestPoint() : null;
    if (result === 'victory') SaveSystem.save(this.playerUnits, this._fromMapKey, this._fromSpawnId, this.game.registry);
    else if (iron) SaveSystem.deleteSave();

    const showWindow = () => {
      if (result === 'victory') {
        // Сохранение сразу после победы: метка «идёт бой» снимается, F5 на экране итога или уровня ничего не теряет
        const span = this._levelSpan || { from: 1, to: 1 };
        if (span.to > span.from) {
          // Сначала итог боя, по кнопке экран нового уровня (он же потом ведёт на карту)
          rows.push({ icon: 'icon_might', text: `Новый уровень отряда: ${span.to}`, color: '#f0d890' });
          showBattleResult(this, { victory: true, rows, depth: OVERLAY_DEPTH, buttons: [{ label: 'Новый уровень', onClick: () => {
            Frame.closeCurrent(this);
            // Повышаются все завербованные: партия и те, кто ждёт в таверне
            const roster = PartySystem.buildRosterUnits(this.game.registry, this.playerUnits);
            this.scene.launch('LevelUpScene', {
              leveledUnits: roster, allPlayerUnits: roster, toLevel: span.to,
              fromMapKey: this._fromMapKey, fromSpawnId: this._fromSpawnId,
            });
          } }] });
          return;
        }
        // ── Сохранение после победы ──────
        showBattleResult(this, { victory: true, rows, depth: OVERLAY_DEPTH, buttons: [{ label: 'На карту', onClick: toMap }] });
      } else if (!iron) {
        // ── ХРОНИКА: поражение возвращает к последнему отдыху ─────────────
        showBattleResult(this, {
          victory: false, depth: OVERLAY_DEPTH,
          note: rest ? 'Дорога оборвалась.\nВы очнулись у последнего привала.' : 'Дорога оборвалась.\nОтдыха ещё не было: всё сначала.',
          buttons: [{ label: rest ? 'К последнему привалу' : 'Начать сначала', onClick: () => {
            eventBus.clear();
            if (rest) SaveSystem.applyFlagsToRegistry(this.game.registry, { force: true });
            else SaveSystem.newGame(this.game.registry, { mode: 'chronicle' });
            this.scene.start('LoadingScene', {
              destination: 'MapScene',
              destinationData: rest ? { mapKey: rest.mapKey, spawnId: rest.spawnId } : { mapKey: 'south_post', spawnId: 'default' },
            });
          } }],
        });
      } else {
        // ── ЖЕЛЕЗНЫЙ РЕЖИМ: поражение = удаление сохранения ─────────────
        showBattleResult(this, {
          victory: false, depth: OVERLAY_DEPTH,
          note: 'Сохранение уничтожено.\nВсё начинается заново.',
          buttons: [{ label: 'Начать заново', color: '#e06060', onClick: () => {
            eventBus.clear();
            this.scene.start('LoadingScene', { destination: 'BootScene', destinationData: {} });
          } }],
        });
      }
    };

    this.time.delayedCall(result === 'victory' ? 800 : 1200, showWindow);
  }

  // ── EventBus ──────────────────────────────────────────────────────────

  _toggleFineGrid() {
    if (this._fineGrid) {
      this._fineGrid.forEach(o => { try { o.destroy(); } catch {} });
      this._fineGrid = null;
      return;
    }
    this._fineGrid = [];
    const W = 1280, H = 720, STEP = 25;
    const gfx = this.add.graphics().setDepth(997).setScrollFactor(0);
    // Мелкие линии - очень прозрачные
    gfx.lineStyle(1, 0x00FF88, 0.10);
    for (let x = 0; x <= W; x += STEP) gfx.lineBetween(x, 0, x, H);
    for (let y = 0; y <= H; y += STEP) gfx.lineBetween(0, y, W, y);
    // Каждые 100px - ярче и с подписью
    gfx.lineStyle(1, 0x00FF88, 0.30);
    for (let x = 0; x <= W; x += 100) {
      gfx.lineBetween(x, 0, x, H);
      const lbl = this.add.text(x + 2, 2, `${x}`, {
        fontSize: '9px', color: '#00FF88', fontFamily: 'monospace',
      }).setDepth(998).setScrollFactor(0);
      this._fineGrid.push(lbl);
    }
    for (let y = 0; y <= H; y += 100) {
      gfx.lineBetween(0, y, W, y);
      const lbl = this.add.text(2, y + 2, `${y}`, {
        fontSize: '9px', color: '#00FF88', fontFamily: 'monospace',
      }).setDepth(998).setScrollFactor(0);
      this._fineGrid.push(lbl);
    }
    this._fineGrid.push(gfx);
  }

  _toggleBattleCoordGrid() {
    if (this._coordGrid) {
      this._coordGrid.forEach(o => { try { o.destroy(); } catch {} });
      this._coordGrid = null;
      return;
    }
    this._coordGrid = [];
    const W = 1280, H = 720, STEP = 100;
    const gfx = this.add.graphics().setDepth(998).setScrollFactor(0);
    gfx.lineStyle(1, 0x00FF88, 0.2);
    this._coordGrid.push(gfx);

    for (let x = 0; x <= W; x += STEP) {
      gfx.lineBetween(x, 0, x, H);
      const lbl = this.add.text(x + 2, 2, `${x}`, {
        fontSize: '10px', color: '#00FF88', fontFamily: 'monospace',
      }).setDepth(999).setScrollFactor(0);
      this._coordGrid.push(lbl);
    }
    for (let y = 0; y <= H; y += STEP) {
      gfx.lineBetween(0, y, W, y);
      const lbl = this.add.text(2, y + 2, `${y}`, {
        fontSize: '10px', color: '#00FF88', fontFamily: 'monospace',
      }).setDepth(999).setScrollFactor(0);
      this._coordGrid.push(lbl);
    }
    // Показывает координаты мыши
    const cursor = this.add.text(640, 10, '', {
      fontSize: '12px', color: '#FFFF00', fontFamily: 'monospace',
    }).setOrigin(0.5, 0).setDepth(999).setScrollFactor(0);
    this._coordGrid.push(cursor);
    this.input.on('pointermove', (ptr) => {
      if (this._coordGrid) cursor.setText(`x:${Math.round(ptr.x)}  y:${Math.round(ptr.y)}`);
    });
  }

  _toggleJGrid() {
    if (this._jGrid) {
      this._jGrid.forEach(o => { try { o.destroy(); } catch {} });
      this._jGrid = null;
      return;
    }
    const W = 1280, H = 720, STEP = 20, DEPTH = 997;
    const objs = [];
    const gfx = this.add.graphics().setDepth(DEPTH).setScrollFactor(0);
    for (let x = 0; x <= W; x += STEP) {
      if (x % 100 === 0) gfx.lineStyle(1, 0xFFDD88, 0.45);
      else                gfx.lineStyle(1, 0xFFDD88, 0.14);
      gfx.lineBetween(x, 0, x, H);
    }
    for (let y = 0; y <= H; y += STEP) {
      if (y % 100 === 0) gfx.lineStyle(1, 0xFFDD88, 0.45);
      else                gfx.lineStyle(1, 0xFFDD88, 0.14);
      gfx.lineBetween(0, y, W, y);
    }
    objs.push(gfx);
    for (let x = 0; x <= W; x += 100) {
      for (let y = 0; y <= H; y += 100) {
        const lbl = this.add.text(x + 2, y + 2, `${x},${y}`, {
          fontSize: '8px', color: '#FFDD88', fontFamily: 'monospace',
          stroke: '#000', strokeThickness: 2,
        }).setDepth(DEPTH + 1).setScrollFactor(0).setAlpha(0.75);
        objs.push(lbl);
      }
    }
    this._jGrid = objs;
  }

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
      if (unit.isAlive) this._react(unit, 'hit');
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

    eventBus.on('unit_died', unit => {
      this._animDeath(unit);
      // Опыт даётся за встречу целиком в конце боя (PartySystem.addXp)
    });

    eventBus.on('skill_selected', skillId => this._onSkillSelect(skillId));

    eventBus.on('commanders_roar', () => {
      // Ярость союзникам выдаёт сам навык (SkillSystem), здесь только эффект камеры
      this.cameras.main.shake(350, 0.010);
    });

    eventBus.on('skip_turn', () => {
      if (this.battleOver || this._animLock || !this.turnManager.isPlayerTurn()) return;
      this._pendingSkill = null;
      this.turnManager.skipTurn();
      this._renderAll();
      this.ui.update();
      if (!this.turnManager.isPlayerTurn()) this._runAITurn();
    });

    // Защита: юнит получает эффект defending на 1 ход (~50% урона)
    eventBus.on('defend_action', () => {
      if (this.battleOver || this._animLock || !this.turnManager.isPlayerTurn()) return;
      this._pendingSkill = null;
      const unit = this.turnManager.active;
      if (!unit || unit.type !== 'player') return;
      unit.addEffect({ type: 'defending', value: 0.5, duration: 2 }); // duration=2: снимается после след. хода
      this._react(unit, 'block');
      eventBus.emit('log', `${unit.label} встаёт в защиту: до следующего хода урон вдвое меньше`);
      this.turnManager.skipTurn(true);
      this._renderAll();
      this.ui.update();
      if (!this.turnManager.isPlayerTurn()) this._runAITurn();
    });
  }
}
