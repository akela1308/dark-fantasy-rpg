import { MapUnit }       from '../entities/MapUnit.js';
import { WalkableZones } from '../systems/WalkableZones.js';
import { MusicPlayer }   from '../ui/MusicPlayer.js';
import eventBus           from '../utils/eventBus.js';

// ─────────────────────────────────────────────────────────────────────────────
//  MAP CONFIGS  (все координаты в мировых пикселях карты 1672×941)
// ─────────────────────────────────────────────────────────────────────────────
const MAP_CONFIGS = {

  map1: {
    bgKey: 'map_map1',
    spawnPoints: {
      default:  { x: 240, y: 640 },
      from_left:{ x: 240, y: 640 },
    },
    // Правый край → Tavern Map
    exits: [
      { zone: { x: 1595, y: 270, w: 77, h: 460 }, toMap: 'tavern_map', spawnId: 'from_left' },
    ],
    labels:    [],
    bandits:   false,
    tavernEntry: null,
  },

  tavern_map: {
    bgKey: 'map_tavern_map',
    spawnPoints: {
      default:     { x: 110, y: 680 },
      from_left:   { x: 110, y: 680 },
      tavern_exit: { x: 890, y: 430 },   // выход из таверны — перед зданием
    },
    // Правый край (нижняя часть — мимо таверны) → Forest1
    exits: [
      { zone: { x: 1595, y: 390, w: 77, h: 480 }, toMap: 'forest1', spawnId: 'from_left' },
    ],
    // Здание таверны — ховер-надпись
    labels: [
      {
        hoverZone: { x: 870, y: 110, w: 802, h: 660 },
        text: 'Таверна',
        // Позиция надписи на экране (scroll-fixed)
        screenX: 1050,
        screenY: 60,
      },
    ],
    // Вход в здание → Tavern Inside
    tavernEntry: {
      zone:    { x: 1010, y: 300, w: 420, h: 380 },
      toMap:   'tavern_inside',
      spawnId: 'default',
    },
    bandits: false,
  },

  tavern_inside: {
    bgKey: 'map_tavern_inside',
    spawnPoints: {
      // Общий зал — нижний центр интерьера
      default: { x: 836, y: 715 },
    },
    // Зона у выходной двери → назад на Tavern Map
    exits: [
      { zone: { x: 590, y: 810, w: 420, h: 80 }, toMap: 'tavern_map', spawnId: 'tavern_exit' },
    ],
    labels: [
      {
        hoverZone: { x: 590, y: 810, w: 420, h: 80 },
        text: 'Выход',
        screenX: 640,
        screenY: 675,
      },
    ],
    tavernEntry: null,
    bandits: false,
  },

  forest1: {
    bgKey: 'map_forest1',
    spawnPoints: {
      default:  { x: 100, y: 530 },
      from_left:{ x: 100, y: 530 },
    },
    exits: [
      // Верхняя ветка → Mountains Map
      { zone: { x: 1530, y: 100, w: 142, h: 290 }, toMap: 'mountains_map', spawnId: 'from_left' },
      // Нижняя ветка → Elf Swamp
      { zone: { x: 1530, y: 590, w: 142, h: 290 }, toMap: 'elf_boloto', spawnId: 'from_left' },
    ],
    labels: [
      {
        hoverZone: { x: 1150, y: 80,  w: 522, h: 310 },
        text: '↑ Горный перевал',
        screenX: 1060,
        screenY: 50,
      },
      {
        hoverZone: { x: 1150, y: 570, w: 522, h: 310 },
        text: '↓ Болото эльфов',
        screenX: 1060,
        screenY: 690,
      },
    ],
    tavernEntry: null,
    bandits: true,
    banditPos: { x: 490, y: 465 },   // у костра, левая часть карты
  },

  mountains_map: {
    bgKey: 'map_mountains_map',
    spawnPoints: {
      default:  { x: 200, y: 610 },
      from_left:{ x: 200, y: 610 },
    },
    exits:      [],
    labels:     [],
    tavernEntry: null,
    bandits:    false,
  },

  elf_boloto: {
    bgKey: 'map_elf_boloto',
    spawnPoints: {
      default:  { x: 200, y: 520 },
      from_left:{ x: 200, y: 520 },
    },
    exits:      [],
    labels:     [],
    tavernEntry: null,
    bandits:    false,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
export class MapScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MapScene' });
  }

  init(data) {
    this.mapKey  = data?.mapKey  || 'map1';
    this.spawnId = data?.spawnId || 'default';
  }

  create() {
    this._transitioning = false;

    const cfg   = MAP_CONFIGS[this.mapKey];
    const spawn = cfg.spawnPoints[this.spawnId] ?? cfg.spawnPoints.default;

    const mapW = 1672, mapH = 941;
    const W = 1280, H = 720;
    const zoom = Math.min(W / mapW, H / mapH);   // ~0.765

    this.cameras.main.setZoom(zoom);
    this.cameras.main.centerOn(mapW / 2, mapH / 2);

    // Фон
    this.add.image(mapW / 2, mapH / 2, cfg.bgKey).setScale(1).setDepth(0);

    // Зоны хождения
    this.walkable = new WalkableZones(this.mapKey);
    // this.walkable.drawDebug(this); // раскомментируй для отладки

    // Партия
    const unitH = 130;
    this.hero    = new MapUnit(this, spawn.x,       spawn.y, 'map_hero',    { height: unitH + 10, speed: 130 });
    this.brawler = new MapUnit(this, spawn.x - 65,  spawn.y, 'map_brawler', { height: unitH,      speed: 130 });
    this.healer  = new MapUnit(this, spawn.x - 120, spawn.y, 'map_healer',  { height: unitH - 6,  speed: 130 });

    this._heroTrail     = [];
    this._trailInterval = 0;

    // Бандиты (только Forest1)
    this._bandits = [];
    if (cfg.bandits) this._spawnBandits(cfg);

    // Hover-надписи для POI
    this._hoverLabels = [];
    this._setupLabels(cfg);

    // Клик по карте
    this.input.on('pointerdown', (ptr) => {
      if (ptr.rightButtonDown()) return;
      const clamped = this.walkable.clamp(ptr.worldX, ptr.worldY);
      this.hero.moveTo(clamped.x, clamped.y);
      this._showClickMarker(clamped.x, clamped.y);
    });

    this._clickMarker = this.add.graphics().setDepth(20);
    this._buildHUD(cfg);
  }

  // ─── Update ──────────────────────────────────────────────────────────────

  update(time, delta) {
    this.hero.update(delta);

    this._trailInterval += delta;
    if (this._trailInterval > 80) {
      this._trailInterval = 0;
      this._heroTrail.push({ x: this.hero.x, y: this.hero.y });
      if (this._heroTrail.length > 60) this._heroTrail.shift();
    }

    this._followTrail(this.brawler, 15);
    this._followTrail(this.healer,  28);
    this.brawler.update(delta);
    this.healer.update(delta);

    this._separateParty();

    if (this._bandits.length) {
      this._updateBandits(delta);
      this._checkEncounters();
    }

    this._updateLabelHovers();

    if (!this._transitioning) {
      this._checkExits();
      this._checkTavernEntry();
    }
  }

  // ─── Party ───────────────────────────────────────────────────────────────

  _followTrail(unit, stepsBack) {
    const idx = Math.max(0, this._heroTrail.length - stepsBack);
    const pos = this._heroTrail[idx];
    if (pos) unit.moveTo(pos.x, pos.y);
  }

  _separateParty() {
    const MIN = 55;
    const pairs = [
      [this.hero, this.brawler],
      [this.hero, this.healer],
      [this.brawler, this.healer],
    ];
    for (const [a, b] of pairs) {
      const dx = b.sprite.x - a.sprite.x;
      const dy = b.sprite.y - a.sprite.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < MIN && dist > 0.1) {
        const push = MIN - dist;
        b.sprite.x += (dx / dist) * push;
        b.sprite.y += (dy / dist) * push;
        b.shadow.setPosition(b.sprite.x, b.sprite.y + 2);
      }
    }
  }

  // ─── Bandits ─────────────────────────────────────────────────────────────

  _spawnBandits(cfg) {
    if (this.game.registry.get('bandit_0_defeated')) return;

    const b = new MapUnit(this, cfg.banditPos.x, cfg.banditPos.y, 'map_bandit', {
      height: 120, speed: 40,
    });
    b.sprite.setFlipX(true);
    this._bandits.push({ unit: b, encountered: false });
  }

  _updateBandits(delta) {
    this._bandits.forEach(b => {
      if (!b.encountered) b.unit.update(delta);
    });
  }

  _checkEncounters() {
    if (this._transitioning) return;
    this._bandits.forEach(b => {
      if (b.encountered) return;
      const dist = Phaser.Math.Distance.Between(
        this.hero.x, this.hero.y, b.unit.x, b.unit.y
      );
      if (dist < 100) {
        b.encountered = true;
        this._transitioning = true;
        this.hero.stopMove();
        this.brawler.stopMove();
        this.healer.stopMove();
        this.time.delayedCall(350, () => {
          this.cameras.main.fade(500, 0, 0, 0, false, (cam, progress) => {
            if (progress === 1) {
              this.scene.start('LoadingScene', {
                destination: 'BattleScene',
                destinationData: {},
              });
            }
          });
        });
      }
    });
  }

  // ─── Labels (hover-надписи для зданий и развилок) ────────────────────────

  _setupLabels(cfg) {
    (cfg.labels || []).forEach(lbl => {
      const txt = this.add.text(lbl.screenX, lbl.screenY, lbl.text, {
        fontFamily: 'serif',
        fontSize:   '40px',
        color:      '#FFFFFF',
        stroke:     '#000000',
        strokeThickness: 5,
        shadow: { offsetX: 2, offsetY: 2, color: '#000', blur: 10, fill: true },
      })
        .setOrigin(0.5)
        .setDepth(60)
        .setScrollFactor(0)
        .setAlpha(0);

      this._hoverLabels.push({ txt, hoverZone: lbl.hoverZone });
    });
  }

  _updateLabelHovers() {
    if (!this._hoverLabels.length) return;
    const ptr = this.input.activePointer;
    const wx  = ptr.worldX;
    const wy  = ptr.worldY;

    this._hoverLabels.forEach(({ txt, hoverZone: z }) => {
      const inside = wx >= z.x && wx <= z.x + z.w && wy >= z.y && wy <= z.y + z.h;
      txt.setAlpha(inside ? 1 : 0);
    });
  }

  // ─── Transitions ─────────────────────────────────────────────────────────

  _checkExits() {
    const cfg = MAP_CONFIGS[this.mapKey];
    for (const exit of (cfg.exits || [])) {
      if (this._inZone(this.hero.x, this.hero.y, exit.zone)) {
        this._transitionTo(exit.toMap, exit.spawnId);
        return;
      }
    }
  }

  _checkTavernEntry() {
    const cfg = MAP_CONFIGS[this.mapKey];
    if (!cfg.tavernEntry) return;
    const te = cfg.tavernEntry;
    if (this._inZone(this.hero.x, this.hero.y, te.zone)) {
      this._transitionTo(te.toMap, te.spawnId);
    }
  }

  _transitionTo(mapKey, spawnId) {
    if (this._transitioning) return;
    this._transitioning = true;
    this.hero.stopMove();
    this.brawler.stopMove();
    this.healer.stopMove();
    this.cameras.main.fade(600, 0, 0, 0, false, (cam, progress) => {
      if (progress === 1) {
        this.scene.start('LoadingScene', {
          destination:     'MapScene',
          destinationData: { mapKey, spawnId },
        });
      }
    });
  }

  _inZone(x, y, z) {
    return x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h;
  }

  // ─── HUD ─────────────────────────────────────────────────────────────────

  _showClickMarker(x, y) {
    this._clickMarker.clear();
    this._clickMarker.lineStyle(2, 0xC9A84C, 0.8);
    this._clickMarker.strokeCircle(x, y, 13);
    this.tweens.add({
      targets:  this._clickMarker,
      alpha:    { from: 0.8, to: 0 },
      duration: 500,
      onComplete: () => this._clickMarker.setAlpha(1),
    });
  }

  _buildHUD(cfg) {
    // Подсказка
    this.add.text(16, 16, '🗺 Кликни по дороге чтобы идти', {
      fontSize: '13px', color: '#C9A84C', fontFamily: 'serif',
      backgroundColor: '#00000088', padding: { x: 8, y: 4 },
    }).setDepth(50).setScrollFactor(0);

    // Портреты партии — левый край
    const portraits = [
      { key: 'portrait_hero_duelist',      label: 'Дуэлянт' },
      { key: 'portrait_companion_brawler', label: 'Боец' },
      { key: 'portrait_companion_healer',  label: 'Знахарка' },
    ];
    const cardW = 118, cardH = 138, startY = 100, gapY = 150;
    portraits.forEach((p, i) => {
      const cx = cardW / 2;
      const cy = startY + i * gapY;
      this.add.rectangle(cx, cy, cardW, cardH, 0x0a0810, 0.92)
        .setStrokeStyle(2, 0x445577).setDepth(50).setScrollFactor(0);
      const img = this.add.image(cx, cy - 10, p.key).setDepth(51).setScrollFactor(0);
      img.setScale(Math.min((cardW - 6) / img.width, (cardH - 26) / img.height));
      this.add.text(cx, cy + cardH / 2 - 8, p.label, {
        fontSize: '13px', color: '#CCCCCC', fontFamily: 'serif',
      }).setOrigin(0.5, 1).setDepth(51).setScrollFactor(0);
    });

    // Hover-портрет бандита (только на картах с бандитами)
    if (cfg.bandits) {
      const hW = 120, hH = 145;
      const hx = 1280 - hW / 2;

      this._hoverBg = this.add.rectangle(hx, 120, hW, hH, 0x0a0810, 0.92)
        .setStrokeStyle(2, 0x663333).setDepth(59).setScrollFactor(0).setAlpha(0);
      this._hoverPortrait = this.add.image(hx, 115, 'portrait_bandit_commander')
        .setDepth(60).setScrollFactor(0).setAlpha(0);
      const pScale = Math.min(
        (hW - 6) / this._hoverPortrait.width,
        (hH - 26) / this._hoverPortrait.height
      );
      this._hoverPortrait.setScale(pScale);
      this._hoverLabel = this.add.text(hx, 185, 'Командир разбойников', {
        fontSize: '11px', color: '#CC4444', fontFamily: 'serif',
      }).setOrigin(0.5).setDepth(61).setScrollFactor(0).setAlpha(0);

      this.input.on('pointermove', (ptr) => {
        let hovered = false;
        this._bandits.forEach(b => {
          if (b.encountered) return;
          if (Phaser.Math.Distance.Between(ptr.worldX, ptr.worldY, b.unit.sprite.x, b.unit.sprite.y) < 70)
            hovered = true;
        });
        const a = hovered ? 1 : 0;
        [this._hoverPortrait, this._hoverBg, this._hoverLabel].forEach(el => el.setAlpha(a));
      });
    }

    this.music = new MusicPlayer(this);
    this.music.create();
  }
}
