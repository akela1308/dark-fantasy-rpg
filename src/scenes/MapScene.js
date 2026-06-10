import { MapUnit }       from '../entities/MapUnit.js';
import { WalkableZones } from '../systems/WalkableZones.js';
import { MusicPlayer }   from '../ui/MusicPlayer.js';
import { DialoguePanel } from '../ui/DialoguePanel.js';
import eventBus           from '../utils/eventBus.js';

// ─────────────────────────────────────────────────────────────────────────────
//  MAP CONFIGS  (все координаты в мировых пикселях карты 1672×941)
// ─────────────────────────────────────────────────────────────────────────────
const MAP_CONFIGS = {

  map1: {
    bgKey: 'map_map1',
    spawnPoints: {
      default:    { x: 240, y: 640 },
      from_left:  { x: 240, y: 640 },
      from_right: { x: 1530, y: 480 },  // возврат с tavern_map — у правого выхода
    },
    exits: [
      { zone: { x: 1588, y: 360, w: 84, h: 165 }, toMap: 'tavern_map', spawnId: 'from_left' },
    ],
    labels:    [],
    bandits:   false,
    tavernEntry: null,
    lanterns: [
      { x: 1218, y: 525 },
    ],
    fog: [
      // Верхняя зона: медленный дальний туман
      { key: 'fog',  y: 160, alpha: 0.22, speedX: 0.12, depth: 1   },
      { key: 'fog',  y: 220, alpha: 0.16, speedX: -0.08, depth: 2  },
      // Нижняя зона: стелющийся туман у земли
      { key: 'fog2', y: 790, alpha: 0.28, speedX: 0.10, depth: 1   },
      { key: 'fog2', y: 860, alpha: 0.20, speedX: -0.14, depth: 2  },
    ],
  },

  tavern_map: {
    bgKey: 'map_tavern_map',
    spawnPoints: {
      default:          { x: 150, y: 820 },   // зона спавна: квадраты (0-300, 700-900)
      from_left:        { x: 150, y: 820 },
      tavern_exit:      { x: 1350, y: 560 },   // возврат из таверны — в блоке 8 (y>530, вне запрета)
      from_road_boloto: { x: 310, y: 380 },    // возврат с болотной дороги
      from_forest:      { x: 1450, y: 750 },   // возврат с forest1 — нижний правый
    },
    exits: [
      // Правый-нижний угол → Forest1
      { zone: { x: 1548, y: 720, w: 124, h: 221 }, toMap: 'forest1',    spawnId: 'from_left' },
      // Верхняя-левая дорога → Road Boloto
      { zone: { x: 0,    y: 130, w: 220, h: 390 }, toMap: 'road_boloto', spawnId: 'from_tavern' },
      // Нижний-левый угол → Map1 (возврат)
      { zone: { x: 0,    y: 750, w: 150, h: 191 }, toMap: 'map1',        spawnId: 'from_right' },
    ],
    labels: [
      {
        hoverZone: { x: 1095, y: 368, w: 577, h: 232 },
        text: 'Войти',
        screenX: 1516,
        screenY: 72,
      },
      {
        hoverZone: { x: 0, y: 130, w: 220, h: 390 },
        text: '← Болотная дорога',
        screenX: 183,
        screenY: 52,
      },
      {
        hoverZone: { x: 0, y: 750, w: 150, h: 191 },
        text: '← Руины',
        screenX: 110,
        screenY: 872,
      },
    ],
    // Верхняя ветка X — дверь таверны → Tavern Inside
    tavernEntry: {
      zone:    { x: 1440, y: 368, w: 232, h: 175 },
      toMap:   'tavern_inside',
      spawnId: 'default',
    },
    bandits: false,
  },

  tavern_inside: {
    bgKey: 'map_tavern_inside',
    spawnPoints: {
      default: { x: 780, y: 820 },   // у входной двери, общий зал
    },
    // Зона двери (арка с фонарём, левая стена) → выход на Tavern Map
    exits: [
      { zone: { x: 148, y: 358, w: 220, h: 220 }, toMap: 'tavern_map', spawnId: 'tavern_exit' },
    ],
    labels: [
      {
        hoverZone: { x: 148, y: 358, w: 220, h: 220 },
        text: 'Выход',
        screenX: 258,
        screenY: 468,
      },
    ],
    tavernEntry: null,
    bandits: false,
    // Дым из трубки странника
    pipeSmoke: [
      { x: 663, y: 276 },
    ],
    // Статические пропсы (мебель, предметы)
    props: [
      // Стол перед странником: правый нижний угол ножки на мировых (641, 373)
      // table4: контент cols 266-380 / rows 106-268 из 661×377
      // origin выровнен по нижнему правому краю ножки
      { key: 'prop_table4', x: 665, y: 395, originX: 380/661, originY: 268/377, height: 228 },
    ],
    torches: [
      { x: 961,  y: 278 },              // свеча на баре
      { x: 1062, y: 313 },              // свеча на баре
      { x: 1201, y: 361 },              // свеча на баре
    ],
    // NPC таверны
    npcs: [
      {
        x: 683, y: 299,
        spriteKey:   'map_wanderer',
        portraitKey: 'portrait_wanderer',
        name:        'Странник',
        height:      155,
        hoverPortrait: true,   // показывать портрет справа при наведении
        dialogues: [
          {
            text: '"Ты не местный... Это видно. Присядь, раз уж пришёл. Я тут уже три дня — жду, пока стихнет. Слышал что-нибудь о старом алтаре к востоку отсюда? В лесу, за болотом. Я видел там свечение. Синее, холодное. Не природное."',
            choices: [
              { label: 'Что ещё ты там видел?',         style: 'default' },
              { label: 'Какой артефакт?',                style: 'default' },
              { label: 'Спасибо, запомню.',              style: 'retreat' },
            ],
          },
          {
            text: '"Животные обходят то место стороной. Я сам едва не шагнул в свечение — что-то остановило. Инстинкт, или предостережение. Три камня со знаками указывают путь к алтарю. Найдёшь их — найдёшь и то, что там лежит."',
            choices: [{ label: 'Что за артефакт там спрятан?', style: 'default' }],
          },
          {
            text: '"Печать Забытого — так её называют старожилы. Кольцо. Говорят, усиливает волю и позволяет видеть сквозь тьму. Но берёт свою плату. Последний, кто носил его, потерял рассудок. Иди, если не боишься. Только не говори, что я не предупреждал."',
            choices: [{ label: 'Я запомню твоё предупреждение.', style: 'default' }],
          },
          {
            text: '"Печать Забытого. Кольцо из чёрного металла — старожилы говорят, оно усиливает волю и открывает взгляд во тьму. Но берёт свою плату. Последний владелец потерял рассудок. Думай сам, стоит ли оно того."',
            choices: [{ label: 'Я буду осторожен. Спасибо.', style: 'default' }],
          },
        ],
      },
      {
        x: 1120, y: 460,
        spriteKey:   'map_tavernman',
        portraitKey: 'portrait_tavernman',
        name:        'Хозяин таверны',
        height:      185,
        dialogues: [
          {
            text: '"Добро пожаловать в «Хромой лось»! Лучшая таверна в округе — и единственная, где вас не зарежут за ужином."',
            choices: [
              { label: 'Что слышно в окрестностях?',  style: 'default' },
              { label: 'Налей-ка нам выпить.',         style: 'default' },
              { label: 'Нам нужна комната на ночь.',   style: 'default' },
              { label: 'Спасибо, мы идём дальше.',     style: 'retreat' },
            ],
          },
          {
            // ответ на "что слышно"
            text: '"В лесу за деревней разбойники орудуют уже неделю. Говорят, ими командует какой-то наёмник. Будьте осторожны."',
            choices: [{ label: 'Понятно. Спасибо.', style: 'default' }],
          },
          {
            // ответ на "налей"
            text: '"Три медяка кружка. Тёмное, светлое и что-то ужасное — я сам не знаю что, но берут охотно."',
            choices: [{ label: 'Тёмное, конечно.', style: 'default' }],
          },
          {
            // ответ на "комнату"
            text: '"Есть. Пять медяков ночь. Клопов почти нет."',
            choices: [{ label: 'Договорились.', style: 'default' }],
          },
        ],
      },
    ],
  },

  forest1: {
    bgKey: 'map_forest1',
    spawnPoints: {
      default:       { x: 800, y: 500 },
      from_left:     { x: 100, y: 555 },
      from_mountains:{ x: 1480, y: 300 },  // возврат с Mountains — верхняя ветка
      from_elf:      { x: 1480, y: 650 },  // возврат с Elf Boloto — нижняя ветка
    },
    exits: [
      // Верхняя ветка → Mountains Map
      { zone: { x: 1548, y: 178, w: 124, h: 275 }, toMap: 'mountains_map', spawnId: 'from_left' },
      // Нижняя ветка → Elf Swamp
      { zone: { x: 1548, y: 558, w: 124, h: 245 }, toMap: 'elf_boloto',    spawnId: 'from_left' },
      // Левый край → Tavern Map (возврат)
      { zone: { x: 0,    y: 468, w: 100, h: 184 }, toMap: 'tavern_map',    spawnId: 'from_forest' },
    ],
    labels: [
      {
        hoverZone: { x: 1065, y: 180, w: 607, h: 270 },
        text: '↑ Горный перевал',
        screenX: 1385,
        screenY: 65,
      },
      {
        hoverZone: { x: 1065, y: 558, w: 607, h: 250 },
        text: '↓ Болото эльфов',
        screenX: 1385,
        screenY: 902,
      },
      {
        hoverZone: { x: 0, y: 468, w: 100, h: 184 },
        text: '← Таверна',
        screenX: 90,
        screenY: 465,
      },
    ],
    tavernEntry: null,
    bandits: true,
    banditPos: { x: 920, y: 490 },
    campfires: [
      { x: 523, y: 445 },   // лагерь разбойников
    ],
  },

  road_boloto: {
    bgKey: 'map_road_boloto',
    spawnPoints: {
      default:      { x: 1600, y: 800 },   // правый нижний угол (блок 5: x:1250-1672, y:750-911)
      from_tavern:  { x: 1600, y: 800 },   // приход с tavern_map — правый нижний угол
    },
    exits: [
      { zone: { x: 0, y: 750, w: 320, h: 191 }, toMap: 'tavern_map', spawnId: 'from_road_boloto' },
    ],
    labels: [
      {
        hoverZone: { x: 0, y: 750, w: 320, h: 191 },
        text: '← Деревня',
        screenX: 183,
        screenY: 875,
      },
    ],
    tavernEntry: null,
    bandits: false,
    fog: [
      // Верхняя зона — густой болотный туман
      { key: 'fog',  y: 80,  alpha: 0.30, speedX:  0.09, depth: 1 },
      { key: 'fog',  y: 160, alpha: 0.22, speedX: -0.06, depth: 2 },
      { key: 'fog2', y: 110, alpha: 0.18, speedX:  0.13, depth: 1 },
      // Нижняя зона — туман у болота
      { key: 'fog2', y: 800, alpha: 0.28, speedX: -0.10, depth: 1 },
      { key: 'fog',  y: 870, alpha: 0.20, speedX:  0.07, depth: 2 },
      { key: 'fog2', y: 920, alpha: 0.25, speedX: -0.12, depth: 1 },
    ],
  },

  mountains_map: {
    bgKey: 'map_mountains_map',
    spawnPoints: {
      default:  { x: 180, y: 580 },
      from_left:{ x: 180, y: 580 },
    },
    exits: [
      { zone: { x: 0, y: 468, w: 120, h: 250 }, toMap: 'forest1', spawnId: 'from_mountains' },
    ],
    labels: [
      {
        hoverZone: { x: 0, y: 468, w: 120, h: 250 },
        text: '← Лес',
        screenX: 90,
        screenY: 465,
      },
    ],
    tavernEntry: null,
    bandits:    false,
  },

  elf_boloto: {
    bgKey: 'map_elf_boloto',
    spawnPoints: {
      default:  { x: 180, y: 560 },
      from_left:{ x: 180, y: 560 },
    },
    exits: [
      { zone: { x: 0, y: 468, w: 120, h: 200 }, toMap: 'forest1', spawnId: 'from_elf' },
    ],
    labels: [
      {
        hoverZone: { x: 0, y: 468, w: 120, h: 200 },
        text: '← Лес',
        screenX: 90,
        screenY: 465,
      },
    ],
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
    this.game.canvas.style.outline = 'none';
    this.game.canvas.style.webkitTapHighlightColor = 'rgba(0,0,0,0)';

    this._transitioning = false;
    this._exitCooldown  = 2200;  // мс после спавна — выходы не срабатывают

    const cfg   = MAP_CONFIGS[this.mapKey];
    const rawSpawn = cfg.spawnPoints[this.spawnId] ?? cfg.spawnPoints.default;

    const mapW = 1672, mapH = 941;
    const W = 1280, H = 720;
    const zoom = Math.min(W / mapW, H / mapH);   // ~0.765

    this.cameras.main.setOrigin(0, 0);
    this.cameras.main.setZoom(zoom);
    this.cameras.main.setScroll(0, 0);

    // Фон
    this.add.image(mapW / 2, mapH / 2, cfg.bgKey).setScale(1).setDepth(0);

    // Зоны хождения — создаём ДО клампинга спавна
    this.walkable = new WalkableZones(this.mapKey);
    // this.walkable.drawDebug(this); // раскомментируй для отладки зон

    // Клампим спавн на случай если он вне walkable зоны
    const spawn = this.walkable.clamp(rawSpawn.x, rawSpawn.y);

    // Партия: боец — самый крупный, герой чуть меньше, знахарка меньше всех
    const unitH = this.mapKey === 'tavern_inside' ? 158 : 130;
    // idlePeriod — уникальный ритм дыхания для каждого персонажа
    this.hero    = new MapUnit(this, spawn.x,       spawn.y, 'map_hero',    { height: unitH - 5,  speed: 130, idlePeriod: 2800 });
    this.brawler = new MapUnit(this, spawn.x - 65,  spawn.y, 'map_brawler', { height: unitH + 15, speed: 130, idlePeriod: 3400, walkThreshold: 40 });
    this.healer  = new MapUnit(this, spawn.x - 120, spawn.y, 'map_healer',  { height: unitH + 10, speed: 130, idlePeriod: 2200, walkThreshold: 40 });

    this._heroTrail     = [];
    this._trailInterval = 0;

    // Частицы огня (факелы, свечи)
    this._spawnTorches(cfg);

    // Мерцание фонарей
    this._spawnLanterns(cfg);

    // Костры
    this._spawnCampfires(cfg);

    // Туман
    this._spawnFog(cfg);

    // Бандиты (только Forest1)
    this._bandits = [];
    if (cfg.bandits) this._spawnBandits(cfg);

    // Hover-надписи для POI
    this._hoverLabels = [];
    this._setupLabels(cfg);

    // Диалоговая панель (in-world overlay)
    this._dialogue = new DialoguePanel(this);

    // Дым из трубок
    this._spawnPipeSmoke(cfg);

    // Статические пропсы (мебель и предметы)
    this._spawnProps(cfg);

    // NPC (статичные, кликабельные)
    this._npcs = [];
    this._spawnNPCs(cfg);

    // Клик по карте
    this.input.on('pointerdown', (ptr) => {
      if (ptr.rightButtonDown()) return;
      if (this._dialogue?.active) return;   // диалог идёт — движение заблокировано
      const clamped = this.walkable.clamp(ptr.worldX, ptr.worldY);
      this.hero.moveTo(clamped.x, clamped.y);
      this._showClickMarker(clamped.x, clamped.y);
    });

    this._clickMarker = this.add.graphics().setDepth(20);
    this._buildHUD(cfg);

    // ─── Dev Grid (клавиша G) ────────────────────────────────────────────
    this._devGrid = null;
    this._devGridLabels = [];
    this._devCursorLabel = this.add.text(0, 0, '', {
      fontSize: '11px', color: '#00FF88', fontFamily: 'monospace',
      stroke: '#000', strokeThickness: 2,
    }).setDepth(999).setScrollFactor(0).setAlpha(0);

    this.input.keyboard.on('keydown-G', () => this._toggleDevGrid());
    this.input.keyboard.on('keydown-H', () => this._toggleScreenGrid());

    // Курсор: показывает мировые координаты под мышью в dev-режиме
    this.input.on('pointermove', (ptr) => {
      if (!this._devGrid) return;
      const wx = Math.round(ptr.worldX);
      const wy = Math.round(ptr.worldY);
      this._devCursorLabel
        .setText(`world: ${wx}, ${wy}`)
        .setPosition(ptr.x + 14, ptr.y - 4)
        .setAlpha(1);
    });
  }

  // ─── Update ──────────────────────────────────────────────────────────────

  update(time, delta) {
    // Скроллинг тумана
    if (this._fogLayers) {
      this._fogLayers.forEach(t => { t.tilePositionX += t._speedX; });
    }

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

    // Safety-net: если герой стоит — компаньоны гарантированно в idle (дышат, не шатаются)
    if (!this.hero.moving) {
      [this.brawler, this.healer].forEach(u => {
        if (u.moving || u._bobTween) {
          u.moving = false;
          u._stopWalkAnim();
          if (!u._idleTween) u._startIdleAnim();
        }
      });
    }

    if (this._bandits.length) {
      this._updateBandits(delta);
      this._checkEncounters();
    }

    this._updateLabelHovers();

    if (this._exitCooldown > 0) this._exitCooldown -= delta;

    if (!this._transitioning && this._exitCooldown <= 0) {
      this._checkExits();
      this._checkTavernEntry();
    }
  }

  // ─── Party ───────────────────────────────────────────────────────────────

  _followTrail(unit, stepsBack) {
    // Когда герой стоит — не обновляем цель, компаньоны остаются на месте и дышат
    if (!this.hero.moving) return;
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
        // Если юнит стоит — обновляем цель чтобы не было обратного движения
        if (!b.moving) {
          b.targetX = b.sprite.x;
          b.targetY = b.sprite.y;
        }
      }
    }
  }

  // ─── Туман (TileSprite — бесконечный скроллинг текстуры) ────────────────
  _spawnFog(cfg) {
    const layers = cfg.fog || [];
    if (!layers.length) return;

    this._fogLayers = layers.map(f => {
      // TileSprite шириной на всю карту, высота = высота текстуры
      const tex = this.textures.get(f.key).getSourceImage();
      const h   = tex.height;
      const tile = this.add.tileSprite(836, f.y, 1672, h, f.key)
        .setAlpha(f.alpha)
        .setDepth(f.depth)
        .setScrollFactor(1);   // двигается вместе с камерой
      tile._speedX = f.speedX;
      return tile;
    });
  }

  // ─── Костры (кластер огня + дым) ────────────────────────────────────────
  _spawnCampfires(cfg) {
    (cfg.campfires || []).forEach(c => {
      if (!this.textures.exists('fire_dot')) {
        const g = this.make.graphics({ x: 0, y: 0, add: false });
        g.fillStyle(0xffffff, 1);
        g.fillCircle(3, 3, 3);
        g.generateTexture('fire_dot', 6, 6);
        g.destroy();
      }

      // Свечение у основания (угли)
      const ember = this.add.ellipse(c.x, c.y + 6, 80, 22, 0xFF4400, 0.18).setDepth(c.y - 2);
      this.tweens.add({
        targets: ember,
        alpha: { from: 0.10, to: 0.26 },
        scaleX: { from: 0.9, to: 1.1 },
        duration: 400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      });

      // Несколько точек огня вокруг центра — имитация языков пламени
      const offsets = [
        { dx: 0,   dy:  0,  sc: 1.3  },   // центр — самый высокий
        { dx: -14, dy:  5,  sc: 0.9  },   // левый язык
        { dx:  14, dy:  5,  sc: 0.85 },   // правый язык
        { dx: -6,  dy: -4,  sc: 0.75 },   // левый-центр
        { dx:  7,  dy: -2,  sc: 0.70 },   // правый-центр
      ];

      offsets.forEach(({ dx, dy, sc }) => {
        // Огонь
        this.add.particles(c.x + dx, c.y + dy, 'fire_dot', {
          speed:    { min: 25 * sc, max: 60 * sc },
          angle:    { min: 258, max: 282 },
          lifespan: { min: 300, max: 550 },
          scale:    { start: 0.7 * sc, end: 0 },
          alpha:    { start: 1, end: 0 },
          tint:     [0xFFEE22, 0xFF9900, 0xFF4400],
          quantity:  1,
          frequency: 45 + Math.random() * 30,   // чуть разные ритмы
          gravityY: -35,
          blendMode: 'ADD',
          depth:     c.y + 2,
        });
      });

      // Дым — поднимается выше и рассеивается
      this.add.particles(c.x, c.y - 10, 'fire_dot', {
        speed:    { min: 12, max: 30 },
        angle:    { min: 255, max: 285 },
        lifespan: { min: 900, max: 1800 },
        scale:    { start: 0.5, end: 1.8 },
        alpha:    { start: 0.22, end: 0 },
        tint:     [0x888888, 0x666666, 0xAAAAAA],
        quantity:  1,
        frequency: 90,
        gravityY: -14,
        depth:     c.y + 3,
      });
    });
  }

  // ─── Фонари (мерцающее свечение без открытого огня) ─────────────────────
  _spawnLanterns(cfg) {
    (cfg.lanterns || []).forEach(t => {
      // Внешнее мягкое свечение (большой, полупрозрачный)
      const outerGlow = this.add.ellipse(t.x, t.y, 110, 60, 0xFF8800, 0.08)
        .setDepth(t.y - 1);
      // Внутреннее ядро (поменьше, ярче)
      const innerGlow = this.add.ellipse(t.x, t.y - 4, 48, 28, 0xFFCC44, 0.30)
        .setDepth(t.y);

      // Мерцание: случайные tweens на alpha создают неравномерный живой огонь
      const flicker = () => {
        const duration = Phaser.Math.Between(80, 320);
        const alphaOuter = Phaser.Math.FloatBetween(0.05, 0.14);
        const alphaInner = Phaser.Math.FloatBetween(0.18, 0.42);
        const scaleX = Phaser.Math.FloatBetween(0.88, 1.12);
        const scaleY = Phaser.Math.FloatBetween(0.90, 1.10);

        this.tweens.add({
          targets: outerGlow,
          alpha: alphaOuter,
          scaleX, scaleY,
          duration,
          ease: 'Sine.easeInOut',
          onComplete: flicker,   // рекурсивно — каждый раз новые значения
        });
        this.tweens.add({
          targets: innerGlow,
          alpha: alphaInner,
          scaleX: scaleX * 0.9,
          scaleY: scaleY * 0.9,
          duration,
          ease: 'Sine.easeInOut',
        });
      };

      flicker();
    });
  }

  // ─── Dev Grid ────────────────────────────────────────────────────────────
  _toggleDevGrid() {
    if (this._devGrid) {
      // Выключить
      this._devGrid.destroy();
      this._devGrid = null;
      this._devGridLabels.forEach(l => l.destroy());
      this._devGridLabels = [];
      this._devCursorLabel.setAlpha(0);
      return;
    }

    // Включить
    const STEP = 100;          // шаг сетки в мировых пикселях
    const mapW = 1672, mapH = 941;
    const g = this.add.graphics().setDepth(998).setAlpha(0.55);

    // Вертикальные линии
    g.lineStyle(1, 0x00FF88, 0.4);
    for (let x = 0; x <= mapW; x += STEP) {
      g.lineBetween(x, 0, x, mapH);
    }
    // Горизонтальные линии
    for (let y = 0; y <= mapH; y += STEP) {
      g.lineBetween(0, y, mapW, y);
    }

    // Подписи координат каждые 200px
    for (let x = 0; x <= mapW; x += 200) {
      for (let y = 0; y <= mapH; y += 200) {
        const lbl = this.add.text(x + 3, y + 2, `${x},${y}`, {
          fontSize: '10px', color: '#00FF88', fontFamily: 'monospace',
          stroke: '#000', strokeThickness: 2,
        }).setDepth(999).setAlpha(0.85);
        this._devGridLabels.push(lbl);
      }
    }

    this._devGrid = g;
  }

  // Экранная сетка (H) — координаты в пикселях экрана, для позиционирования UI
  _toggleScreenGrid() {
    if (this._screenGrid) {
      this._screenGrid.forEach(o => { try { o.destroy(); } catch {} });
      this._screenGrid = null;
      return;
    }

    const zoom  = this.cameras.main.zoom;
    const SW    = this.cameras.main.width;   // ширина экрана в пикселях (1280)
    const SH    = this.cameras.main.height;  // высота экрана в пикселях (720)
    const STEP  = 100;
    const DEPTH = 998;
    const objs  = [];

    const gfx = this.add.graphics().setScrollFactor(0).setDepth(DEPTH);
    gfx.lineStyle(1, 0x00FFFF, 0.25);
    objs.push(gfx);

    // Вертикальные линии
    for (let sx = 0; sx <= SW; sx += STEP) {
      const wx = sx / zoom;
      gfx.lineBetween(wx, 0, wx, SH / zoom);
      const lbl = this.add.text(wx + 2, 4 / zoom, `${sx}`, {
        fontSize: `${Math.round(9 / zoom)}px`, color: '#00FFFF', fontFamily: 'monospace',
      }).setScrollFactor(0).setDepth(DEPTH + 1).setAlpha(0.85);
      objs.push(lbl);
    }

    // Горизонтальные линии
    for (let sy = 0; sy <= SH; sy += STEP) {
      const wy = sy / zoom;
      gfx.lineBetween(0, wy, SW / zoom, wy);
      const lbl = this.add.text(4 / zoom, wy + 2 / zoom, `${sy}`, {
        fontSize: `${Math.round(9 / zoom)}px`, color: '#00FFFF', fontFamily: 'monospace',
      }).setScrollFactor(0).setDepth(DEPTH + 1).setAlpha(0.85);
      objs.push(lbl);
    }

    // Подсказка
    const hint = this.add.text(SW / zoom / 2, 4 / zoom, 'SCREEN COORDS (H — скрыть)', {
      fontSize: `${Math.round(10 / zoom)}px`, color: '#FFFF00', fontFamily: 'monospace',
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(DEPTH + 1);
    objs.push(hint);

    this._screenGrid = objs;
  }

  // ─── NPCs ────────────────────────────────────────────────────────────────

  // ─── Частицы огня (факелы / свечи) ─────────────────────────────────────────
  _spawnTorches(cfg) {
    const torches = cfg.torches || [];
    if (!torches.length) return;

    // Создаём текстуру-точку для частиц (если ещё нет)
    if (!this.textures.exists('fire_dot')) {
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      g.fillStyle(0xffffff, 1);
      g.fillCircle(3, 3, 3);
      g.generateTexture('fire_dot', 6, 6);
      g.destroy();
    }

    torches.forEach(t => {
      const sc = t.scale ?? 1.0;
      // Основное пламя — оранжево-жёлтые частицы вверх
      this.add.particles(t.x, t.y, 'fire_dot', {
        speed:    { min: 18 * sc, max: 45 * sc },
        angle:    { min: 255, max: 285 },        // вверх ± чуть в стороны
        lifespan: { min: 350, max: 600 },
        scale:    { start: 0.55 * sc, end: 0 },
        alpha:    { start: 0.9, end: 0 },
        tint:     [ 0xFFDD44, 0xFF9900, 0xFF6600 ],
        quantity:  1,
        frequency: 55,
        gravityY: -22,
        blendMode: 'ADD',
        depth:     t.y + 5,
      });
      // Дым — серые частицы чуть выше, медленнее
      this.add.particles(t.x, t.y - 12 * sc, 'fire_dot', {
        speed:    { min: 8 * sc,  max: 22 * sc },
        angle:    { min: 260, max: 280 },
        lifespan: { min: 500, max: 900 },
        scale:    { start: 0.3 * sc, end: 0.6 * sc },
        alpha:    { start: 0.18, end: 0 },
        tint:     0xAAAAAA,
        quantity:  1,
        frequency: 120,
        gravityY: -10,
        depth:     t.y + 6,
      });
    });
  }

  _spawnPipeSmoke(cfg) {
    (cfg.pipeSmoke || []).forEach(({ x, y }) => {
      // Тонкая струйка дыма — медленная, светло-серая, рассеивается
      this.add.particles(x, y, 'fire_dot', {
        speed:    { min: 4, max: 12 },
        angle:    { min: 262, max: 278 },   // почти строго вверх, лёгкое колебание
        lifespan: { min: 1200, max: 2400 },
        scale:    { start: 0.18, end: 0.9 },
        alpha:    { start: 0.35, end: 0 },
        tint:     [0xCCCCCC, 0xAAAAAA, 0xBBBBBB],
        quantity:  1,
        frequency: 220,                      // одна частица каждые ~220мс
        gravityY: -8,
        depth:    y + 5,
      });
    });
  }

  _spawnProps(cfg) {
    (cfg.props || []).forEach(p => {
      const img = this.add.image(p.x, p.y, p.key)
        .setOrigin(p.originX ?? 0.5, p.originY ?? 1)
        .setDepth(p.y + 1); // depth по Y — поверх всего что выше по экрану
      if (p.height) {
        const scale = p.height / img.height;
        img.setScale(scale);
      }
    });
  }

  _spawnNPCs(cfg) {
    (cfg.npcs || []).forEach(npc => {
      const h = npc.height || 130;
      const tex = this.textures.get(npc.spriteKey);
      const ratio = tex.getSourceImage().height > 0
        ? h / tex.getSourceImage().height : 1;

      // Тень
      const shadow = this.add.ellipse(npc.x, npc.y + 8, 55, 16, 0x000000, 0.35).setDepth(1);

      // Спрайт
      const sprite = this.add.image(npc.x, npc.y, npc.spriteKey)
        .setScale(ratio)
        .setDepth(npc.y)
        .setInteractive({ useHandCursor: true });
      this._addBreathingTween(sprite, 3000 + Math.random() * 600);

      // Имя над головой — только по hover
      const label = this.add.text(npc.x, npc.y - h / 2 - 12, npc.name, {
        fontFamily: 'serif', fontSize: '14px', color: '#D4AA60',
        stroke: '#000', strokeThickness: 3,
      }).setOrigin(0.5, 1).setDepth(npc.y + 1).setAlpha(0);

      // Hover-портрет справа (если задан флаг hoverPortrait)
      // Hover-портрет справа — только PNG, никакого фона/рамки
      let _hImg, _hName;
      if (npc.hoverPortrait && npc.portraitKey) {
        const hW = 120, hH = 145, hx = 1594;
        _hImg  = this.add.image(hx, 222, npc.portraitKey).setDepth(60).setScrollFactor(0).setAlpha(0);
        _hImg.setScale(Math.min(hW / _hImg.width, hH / _hImg.height));
        _hName = this.add.text(hx, 295, npc.name, {
          fontSize: '11px', color: '#CC9944', fontFamily: 'serif',
        }).setOrigin(0.5).setDepth(61).setScrollFactor(0).setAlpha(0);
      }

      // Hover — свечение + показываем имя
      sprite.on('pointerover',  () => {
        sprite.setTint(0xFFEEBB); label.setAlpha(1);
        if (_hImg) { _hImg.setAlpha(1); _hName.setAlpha(1); }
      });
      sprite.on('pointerout',   () => {
        sprite.clearTint(); label.setAlpha(0);
        if (_hImg) { _hImg.setAlpha(0); _hName.setAlpha(0); }
      });

      // Клик — диалог
      sprite.on('pointerdown', () => {
        if (this._transitioning || this._dialogue?.active) return;
        this.hero.stopMove();
        this.brawler.stopMove();
        this.healer.stopMove();
        this._showNpcDialogue(npc, 0);
      });

      this._npcs.push({ sprite, shadow, label, cfg: npc });
    });
  }

  _showNpcDialogue(npc, dialogueIndex) {
    const dlg = npc.dialogues[dialogueIndex] || npc.dialogues[0];

    // Маппинг вариантов: некоторые открывают следующий диалог
    const choices = dlg.choices.map((ch, i) => ({
      label:    ch.label,
      style:    ch.style || 'default',
      onSelect: () => {
        // Если есть следующий диалог — показываем его, иначе просто закрываем
        const nextIdx = dialogueIndex + 1 + i;
        if (npc.dialogues[nextIdx]) {
          this._showNpcDialogue(npc, nextIdx);
        }
        // retreat и последний вариант — просто закрываем (hide уже вызван в DialoguePanel)
      },
    }));

    this._dialogue.show({
      portraitLeft:  'portrait_hero_duelist',
      portraitRight: npc.portraitKey,
      speakerName:   npc.name,
      text:          dlg.text,
      choices,
    });
  }

  // ─── Bandits ─────────────────────────────────────────────────────────────

  _spawnBandits(cfg) {
    if (this.game.registry.get('bandit_0_defeated')) return;

    const b = new MapUnit(this, cfg.banditPos.x, cfg.banditPos.y, 'map_bandit', {
      height: 130, speed: 40,
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
    if (this._transitioning || this._dialogue?.active) return;
    this._bandits.forEach(b => {
      if (b.encountered) return;
      const dist = Phaser.Math.Distance.Between(
        this.hero.x, this.hero.y, b.unit.x, b.unit.y
      );
      if (dist < 100) {
        b.encountered = true;
        this.hero.stopMove();
        this.brawler.stopMove();
        this.healer.stopMove();
        this._showBanditDialogue(b);
      }
    });
  }

  // ─── Диалог с бандитом ────────────────────────────────────────────────

  _showBanditDialogue(bandit) {
    this._dialogue.show({
      portraitLeft:  'portrait_hero_duelist',
      portraitRight: 'portrait_bandit_commander',
      speakerName:   'Командир разбойников',
      text: '"Стоять. Дальше — только если заплатите жизнями. Последний шанс убраться."',
      choices: [
        {
          label:    'Атаковать!',
          style:    'attack',
          onSelect: () => this._startBattle(),
        },
        {
          label:    'Мы просто проходим мимо, не ищем беды.',
          style:    'default',
          onSelect: () => this._banditLetThrough(bandit),
        },
        {
          label:    '[Запугать] Убирайся с дороги, пока цел.',
          style:    'threat',
          onSelect: () => this._tryIntimidate(bandit),
        },
        {
          label:    'Поворачиваем назад.',
          style:    'retreat',
          onSelect: () => {
            bandit.encountered = false; // сбрасываем — если вернутся, диалог снова
            this._transitionTo('tavern_map', 'tavern_exit');
          },
        },
      ],
    });
  }

  _startBattle() {
    this._transitioning = true;
    this.time.delayedCall(200, () => {
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

  /** Бандит пропускает — за "дань" или просто пугается молчания */
  _banditLetThrough(bandit) {
    // Второй диалог — бандит отступает
    this._dialogue.show({
      portraitLeft:  'portrait_hero_duelist',
      portraitRight: 'portrait_bandit_commander',
      speakerName:   'Командир разбойников',
      text: '"...Умно. Проходите. Но помните — дороги назад не будет."',
      choices: [
        {
          label:    'Идём дальше.',
          style:    'default',
          onSelect: () => this._banditRetreat(bandit),
        },
      ],
    });
  }

  /** Запугивание — 50/50 */
  _tryIntimidate(bandit) {
    const success = Math.random() < 0.5;
    if (success) {
      this._dialogue.show({
        portraitLeft:  'portrait_hero_duelist',
        portraitRight: 'portrait_bandit_commander',
        speakerName:   'Командир разбойников',
        text: '"...Вы не обычные путники. Отступить! Уходим!"',
        choices: [
          {
            label:    'Смотрим как бегут.',
            style:    'default',
            onSelect: () => this._banditRetreat(bandit),
          },
        ],
      });
    } else {
      this._dialogue.show({
        portraitLeft:  'portrait_hero_duelist',
        portraitRight: 'portrait_bandit_commander',
        speakerName:   'Командир разбойников',
        text: '"Хах! Слова — не оружие. Взять их!"',
        choices: [
          {
            label:    'Тогда в бой!',
            style:    'attack',
            onSelect: () => this._startBattle(),
          },
        ],
      });
    }
  }

  /** Анимация отступления бандита + убираем его с карты */
  _banditRetreat(bandit) {
    this.game.registry.set('bandit_0_defeated', true);
    if (bandit?.unit?.sprite) {
      this.tweens.add({
        targets:  bandit.unit.sprite,
        x:        bandit.unit.sprite.x - 200,
        alpha:    0,
        duration: 800,
        ease:     'Power2',
        onComplete: () => bandit.unit.sprite?.destroy(),
      });
    }
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
    // Подсказка — справа внизу (world coords for origin(0,0) camera: canvas = world * zoom)
    this.add.text(1662, 928, 'Кликни чтобы идти', {
      fontSize: '12px', color: '#666655', fontFamily: 'serif',
    }).setOrigin(1, 1).setDepth(50).setScrollFactor(0);

    // ── Портреты партии ───────────────────────────────────────────────
    // Позиционированы по аннотации:
    //   Экран: x=0–120px, y=180–555px
    //   zoom=0.765 → world = screen/0.765
    const portraits = [
      { key: 'portrait_hero_duelist',      label: 'Дуэлянт' },
      { key: 'portrait_companion_brawler', label: 'Боец' },
      { key: 'portrait_companion_healer',  label: 'Знахарка' },
    ];
    // Портреты: только PNG + подпись, никаких рамок и прямоугольников
    const cardW  = 150, cardH = 130;
    const startY = 210;
    const gapY   = 175;  // гарантирует зазор 45px между картами
    const UI_DEPTH = 9000; // всегда поверх персонажей карты
    portraits.forEach((p, i) => {
      const cy = startY + i * gapY;
      const cx = cardW / 2;
      const img = this.add.image(cx, cy, p.key).setDepth(UI_DEPTH).setScrollFactor(0);
      img.setScale(Math.min(cardW / img.width, cardH / img.height));
      // Подпись в середине зазора между портретами
      this.add.text(cx, cy + cardH / 2 + (gapY - cardH) / 2, p.label, {
        fontSize: '13px', color: '#BBBBAA', fontFamily: 'serif',
      }).setOrigin(0.5, 0.5).setDepth(UI_DEPTH).setScrollFactor(0);
    });

    // Hover-портрет бандита (только на картах с бандитами)
    if (cfg.bandits) {
      const hW = 120, hH = 145;
      // origin(0,0) camera: canvas_x = world_x * zoom → world_x = canvas_x / zoom
      // target canvas center: 1280 - 60 = 1220 → world = 1220 / 0.7651 ≈ 1594
      const hx = 1594;

      // Только PNG портрет + подпись, никакого фона и рамок
      this._hoverPortrait = this.add.image(hx, 225, 'portrait_bandit_commander')
        .setDepth(60).setScrollFactor(0).setAlpha(0);
      const pScale = Math.min(hW / this._hoverPortrait.width, hH / this._hoverPortrait.height);
      this._hoverPortrait.setScale(pScale);
      this._hoverLabel = this.add.text(hx, 295, 'Командир разбойников', {
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
        [this._hoverPortrait, this._hoverLabel].forEach(el => el.setAlpha(a));
      });
    }

    this.music = new MusicPlayer(this);
    this.music.create();

    this._initCharacterSheet();
  }

  // ── Экран персонажа ──────────────────────────────────────────────────────

  _initCharacterSheet() {
    const CHARS = [
      { id: 'hero_duelist',      name: 'Падший Дуэлянт', sprite: 'hero_duelist',       hp: 80,  maxHp: 80,  dmg: '12–18', spd: 7, lvl: 1,
        skills: ['Укол в уязвимость', 'Дуэльная стойка', 'Пистолет (2 заряда)'],
        desc: 'Бывший имперский дуэлянт. Мастер рапиры и пистолета.' },
      { id: 'companion_brawler', name: 'Боец',            sprite: 'companion_brawler',  hp: 100, maxHp: 100, dmg: '10–16', spd: 5, lvl: 1,
        skills: ['Прикрыть'],
        desc: 'Верный защитник отряда. Принимает удары на себя.' },
      { id: 'companion_healer',  name: 'Знахарка',        sprite: 'companion_healer',   hp: 50,  maxHp: 50,  dmg: '6–10',  spd: 4, lvl: 1,
        skills: ['Перевязка'],
        desc: 'Целительница с тёмным прошлым. Лечит раны отряда.' },
    ];

    const zoom = this.cameras.main.zoom;
    const s = v => v / zoom;
    const W = this.cameras.main.width  / zoom;   // мировые единицы ≈1672
    const H = this.cameras.main.height / zoom;   // мировые единицы ≈941
    const PW = 1050 / zoom, PH = 640 / zoom;     // размер панели в мировых единицах
    const PX = (W - PW) / 2;
    const PY = (H - PH) / 2 - 20 / zoom;
    const DEPTH = 10000; // выше всего — портреты HUD=9000, боттом-бар=55

    // Затемнение фона
    const overlay = this.add.rectangle(W/2, H/2, W, H, 0x000000, 0.78)
      .setDepth(DEPTH).setScrollFactor(0).setInteractive()
      .setVisible(false);
    overlay.on('pointerdown', (ptr) => {
      const cam  = this.cameras.main;
      const zoom = cam.zoom;
      const sx   = ptr.x / zoom;
      const sy   = ptr.y / zoom;
      const insideX = sx >= this._charSheetPX && sx <= this._charSheetPX + this._charSheetPW;
      const insideY = sy >= this._charSheetPY && sy <= this._charSheetPY + this._charSheetPH;
      if (!insideX || !insideY) this._hideCharSheet();
    });

    // Фон панели
    const bg = this.add.rectangle(W/2, H/2 - 20, PW, PH, 0x07060a, 0.97)
      .setDepth(DEPTH+1).setScrollFactor(0).setVisible(false);

    // Готический фрейм
    const bgImg = this.add.image(W/2, H/2 - 20, 'character_sheet_bg')
      .setDisplaySize(PW + 16, PH + 16)
      .setDepth(DEPTH+2).setScrollFactor(0).setVisible(false);

    // Заголовок
    const title = this.add.text(W/2, s(115), 'ПЕРСОНАЖ', {
      fontSize: '17px', color: '#d4a832', fontFamily: 'serif', letterSpacing: 4
    }).setOrigin(0.5, 0).setDepth(DEPTH+3).setScrollFactor(0).setVisible(false);

    // Кнопка X
    const closeBtn = this.add.text(PX + PW - 14, PY + 14, '✕', {
      fontSize: '22px', color: '#CCCCCC', fontFamily: 'serif'
    }).setOrigin(1, 0).setDepth(DEPTH+3).setScrollFactor(0)
      .setInteractive({ useHandCursor: true }).setVisible(false);
    closeBtn.on('pointerover', () => closeBtn.setColor('#FFFFFF'));
    closeBtn.on('pointerout',  () => closeBtn.setColor('#888888'));
    closeBtn.on('pointerdown', () => this._hideCharSheet());

    // Разделитель (вертикальный)
    const divLeft  = this.add.image(PX + 220, H/2, 'panel_divider')
      .setDisplaySize(6, PH - 60).setDepth(DEPTH+3).setScrollFactor(0).setVisible(false);
    const divRight = this.add.image(PX + PW - 220, H/2, 'panel_divider')
      .setDisplaySize(6, PH - 60).setDepth(DEPTH+3).setScrollFactor(0).setVisible(false);

    // Контейнер для динамического контента
    this._csContent = [];

    // Вкладки персонажей
    const tabs = [];
    CHARS.forEach((ch, i) => {
      const tx = PX + 60 + i * 260;
      const ty = PY + 46;
      const tab = this.add.text(tx, ty, '', {
        fontSize: '13px', color: i === 0 ? '#d4a832' : '#666666', fontFamily: 'serif'
      }).setOrigin(0, 0).setDepth(DEPTH+4).setScrollFactor(0)
        .setInteractive({ useHandCursor: true }).setVisible(false);
      tab.on('pointerdown', () => {
        tabs.forEach((t,j) => t.setColor(j === i ? '#d4a832' : '#666666'));
        this._renderCharContent(CHARS[i], PX, PY, PW, PH, DEPTH);
      });
      tabs.push(tab);
    });

    // Горизонтальная линия под вкладками
    const tabLine = this.add.graphics().setDepth(DEPTH+3).setScrollFactor(0).setVisible(false);
    tabLine.lineStyle(1, 0x4a3f25, 0.6);
    tabLine.lineBetween(PX + 20, PY + 68, PX + PW - 20, PY + 68);

    this._charSheetElements = [overlay, bg, bgImg, title, closeBtn, divLeft, divRight, tabLine, ...tabs];
    this._charSheetTabs = tabs;
    this._charSheetChars = CHARS;
    this._charSheetPX = PX; this._charSheetPY = PY;
    this._charSheetPW = PW; this._charSheetPH = PH;
    this._charSheetDEPTH = DEPTH;

    this._initBottomBar();
  }

  _initBottomBar() {
    const zoom = this.cameras.main.zoom;
    const W = this.cameras.main.width  / zoom;   // world units = canvas/zoom ≈ 1673
    const H = this.cameras.main.height / zoom;   // world units = canvas/zoom ≈ 941
    const BAR_H = 130;
    const BAR_Y = H - BAR_H / 2;
    const DEPTH = 55;

    // Изображение 1536×343 — сохраняем пропорции при высоте BAR_H
    const imgW = Math.round(BAR_H * (1536 / 343));
    this.add.image(W / 2, BAR_Y, 'bottom_panel')
      .setDisplaySize(imgW, BAR_H)
      .setDepth(DEPTH).setScrollFactor(0);

    // 5 слотов выровнены по визуальным ячейкам изображения
    const SLOT_FRACTIONS = [0.164, 0.332, 0.500, 0.668, 0.836];
    const SLOTS = [
      { label: '',       action: null },
      { label: '',       action: null },
      { label: 'Отряд', action: () => this._showCharSheet(0) },
      { label: '',       action: null },
      { label: '',       action: null },
    ];

    const SLOT_W = Math.round(imgW * 0.11);
    const SLOT_H = Math.round(BAR_H * 0.55);
    const imgStartX = W / 2 - imgW / 2;

    SLOTS.forEach((slot, i) => {
      const sx = Math.round(imgStartX + SLOT_FRACTIONS[i] * imgW);
      const sy = BAR_Y;

      const isEmpty = !slot.action;

      // Невидимая интерактивная зона поверх слота
      const hit = this.add.rectangle(sx, sy, SLOT_W, SLOT_H, 0x000000, 0)
        .setDepth(DEPTH + 3).setScrollFactor(0);

      if (isEmpty) return;

      // Иконка кнопки внутри слота
      const iconSize = Math.round(SLOT_H * 0.72);
      const icon = this.add.image(sx, sy - SLOT_H * 0.08, 'map_menu_button')
        .setDisplaySize(iconSize, iconSize)
        .setDepth(DEPTH + 4).setScrollFactor(0).setAlpha(0.9);

      // Подпись под иконкой
      const label = this.add.text(sx, sy + SLOT_H * 0.32, slot.label, {
        fontSize: '10px', color: '#C9A84C', fontFamily: 'serif',
        stroke: '#000000', strokeThickness: 2,
      }).setOrigin(0.5, 0.5).setDepth(DEPTH + 5).setScrollFactor(0);

      // Hover-подсветка
      const glow = this.add.rectangle(sx, sy, SLOT_W, SLOT_H, 0xC9A84C, 0)
        .setDepth(DEPTH + 3).setScrollFactor(0);

      hit.setInteractive({ useHandCursor: true });
      hit.on('pointerover', () => { glow.setAlpha(0.15); icon.setAlpha(1); label.setColor('#FFD700'); });
      hit.on('pointerout',  () => { glow.setAlpha(0);    icon.setAlpha(0.9); label.setColor('#C9A84C'); });
      hit.on('pointerdown', slot.action);
    });
  }

  _addBreathingTween(sprite, period = 2800) {
    const baseScaleY = sprite.scaleY;
    this.tweens.add({
      targets: sprite,
      scaleY: { from: baseScaleY * 0.998, to: baseScaleY * 1.022 },
      duration: period,
      yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });
  }

  _showCharSheet(idx = 0) {
    this._charSheetElements.forEach(e => e.setVisible(true));
    this._charSheetTabs.forEach((t,i) => t.setColor(i === idx ? '#d4a832' : '#666666'));
    this._renderCharContent(
      this._charSheetChars[idx],
      this._charSheetPX, this._charSheetPY,
      this._charSheetPW, this._charSheetPH,
      this._charSheetDEPTH
    );
  }

  _hideCharSheet() {
    this._charSheetElements.forEach(e => e.setVisible(false));
    this._csContent.forEach(e => { try { e.destroy(); } catch {} });
    this._csContent = [];
  }

  _renderCharContent(ch, PX, PY, PW, PH, DEPTH) {
    this._csContent.forEach(e => { try { e.destroy(); } catch {} });
    this._csContent = [];

    const zoom = this.cameras.main.zoom;
    const s = v => v / zoom;
    const add = (obj) => { this._csContent.push(obj); return obj; };

    // ── Центральная зона: спрайт персонажа ──
    const sprite = add(this.add.image(s(575), s(340), ch.sprite)
      .setOrigin(0.5, 0.5).setDepth(DEPTH+5).setScrollFactor(0));
    const naturalRatio = sprite.width / sprite.height;
    const displayH = s(370);
    sprite.setDisplaySize(displayH * naturalRatio, displayH);

    // Имя персонажа
    add(this.add.text(s(630), s(490), ch.name, {
      fontSize: `${s(18)}px`, color: '#d4a832', fontFamily: 'serif'
    }).setOrigin(0.5, 0).setDepth(DEPTH+5).setScrollFactor(0));

    // Описание
    add(this.add.text(s(630), s(518), ch.desc, {
      fontSize: `${s(12)}px`, color: '#888877', fontFamily: 'serif',
      wordWrap: { width: s(260) }, align: 'center'
    }).setOrigin(0.5, 0).setDepth(DEPTH+5).setScrollFactor(0));

    // ── Правая зона: статы ──
    const rx = s(880);
    const ry = s(115);
    const statsX = s(800);
    const stats = [
      ['Уровень',  `${ch.lvl}`],
      ['HP',       `${ch.hp} / ${ch.maxHp}`],
      ['Урон',     ch.dmg],
      ['Скорость', `${ch.spd}`],
    ];
    add(this.add.text(rx, ry - s(14), 'ХАРАКТЕРИСТИКИ', {
      fontSize: `${s(14)}px`, color: '#d4a832', fontFamily: 'serif', letterSpacing: 2
    }).setDepth(DEPTH+5).setScrollFactor(0));

    stats.forEach(([label, val], i) => {
      add(this.add.text(statsX, ry + s(10) + i * s(40), label, {
        fontSize: `${s(13)}px`, color: '#888877', fontFamily: 'serif'
      }).setDepth(DEPTH+5).setScrollFactor(0));
      add(this.add.text(statsX + s(200), ry + s(10) + i * s(40), val, {
        fontSize: `${s(15)}px`, color: '#CCCCCC', fontFamily: 'serif', fontStyle: 'bold'
      }).setOrigin(1, 0).setDepth(DEPTH+5).setScrollFactor(0));
      const lg = add(this.add.graphics().setDepth(DEPTH+4).setScrollFactor(0));
      lg.lineStyle(1, 0x333322, 0.5);
      lg.lineBetween(statsX, ry + s(26) + i * s(40), statsX + s(200), ry + s(26) + i * s(40));
    });

    // Скиллы
    const skillsY = ry + stats.length * s(40) + s(20);
    add(this.add.text(statsX, skillsY, 'СКИЛЛЫ', {
      fontSize: `${s(14)}px`, color: '#d4a832', fontFamily: 'serif', letterSpacing: 2
    }).setDepth(DEPTH+5).setScrollFactor(0));
    ch.skills.forEach((sk, i) => {
      add(this.add.text(statsX, skillsY + s(18) + i * s(26), `• ${sk}`, {
        fontSize: `${s(13)}px`, color: '#AAAAAA', fontFamily: 'serif'
      }).setDepth(DEPTH+5).setScrollFactor(0));
    });

    // ── Левая зона: заголовок инвентаря ──
    add(this.add.text(s(300), s(100), 'ИНВЕНТАРЬ', {
      fontSize: `${s(13)}px`, color: '#d4a832', fontFamily: 'serif', letterSpacing: 3
    }).setOrigin(0.5, 0).setDepth(DEPTH+5).setScrollFactor(0));
  }
}
