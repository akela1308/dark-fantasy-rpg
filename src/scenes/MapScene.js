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
      default:  { x: 240, y: 640 },
      from_left:{ x: 240, y: 640 },
    },
    exits: [
      { zone: { x: 1588, y: 360, w: 84, h: 165 }, toMap: 'tavern_map', spawnId: 'from_left' },
    ],
    labels:    [],
    bandits:   false,
    tavernEntry: null,
    lanterns: [
      { x: 1218, y: 525 },  // фонарь справа на дороге
    ],
  },

  tavern_map: {
    bgKey: 'map_tavern_map',
    spawnPoints: {
      default:          { x: 150, y: 820 },   // зона спавна: квадраты (0-300, 700-900)
      from_left:        { x: 150, y: 820 },
      tavern_exit:      { x: 1380, y: 420 },   // возврат из таверны — у двери
      from_road_boloto: { x: 310, y: 380 },    // возврат с болотной дороги — вне exit-зоны
    },
    exits: [
      // Правый-нижний угол → Forest1
      { zone: { x: 1548, y: 720, w: 124, h: 221 }, toMap: 'forest1',    spawnId: 'from_left' },
      // Верхняя-левая дорога → Road Boloto
      { zone: { x: 0,    y: 130, w: 220, h: 390 }, toMap: 'road_boloto', spawnId: 'from_tavern' },
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
    torches: [
      { x: 670,  y: 195, scale: 1.4 },  // люстра (крупнее)
      { x: 260,  y: 320 },              // настенный фонарь слева
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
      default:  { x: 800, y: 500 },
      from_left:{ x: 100, y: 555 },
    },
    exits: [
      // Верхняя ветка → Mountains Map (y=192-450)
      { zone: { x: 1548, y: 178, w: 124, h: 275 }, toMap: 'mountains_map', spawnId: 'from_left' },
      // Нижняя ветка → Elf Swamp (y=570-798)
      { zone: { x: 1548, y: 558, w: 124, h: 245 }, toMap: 'elf_boloto',    spawnId: 'from_left' },
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
    ],
    tavernEntry: null,
    bandits: true,
    banditPos: { x: 920, y: 490 },
  },

  road_boloto: {
    bgKey: 'map_road_boloto',
    spawnPoints: {
      default:      { x: 380, y: 420 },   // в блоке 2 (x:300-700, y:280-560), вне exit-зоны (y>520 нет — проверено)
      from_tavern:  { x: 380, y: 420 },
    },
    exits: [
      // Назад на tavern_map — нижняя-левая дорога
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
  },

  mountains_map: {
    bgKey: 'map_mountains_map',
    spawnPoints: {
      default:  { x: 180, y: 580 },
      from_left:{ x: 180, y: 580 },
    },
    exits:      [],
    labels:     [],
    tavernEntry: null,
    bandits:    false,
  },

  elf_boloto: {
    bgKey: 'map_elf_boloto',
    spawnPoints: {
      default:  { x: 180, y: 560 },
      from_left:{ x: 180, y: 560 },
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

    this.cameras.main.setOrigin(0, 0);
    this.cameras.main.setZoom(zoom);
    this.cameras.main.setScroll(0, 0);

    // Фон
    this.add.image(mapW / 2, mapH / 2, cfg.bgKey).setScale(1).setDepth(0);

    // Зоны хождения
    this.walkable = new WalkableZones(this.mapKey);
    // this.walkable.drawDebug(this); // раскомментируй для отладки зон

    // Партия: боец — самый крупный, герой чуть меньше, знахарка меньше всех
    const unitH = this.mapKey === 'tavern_inside' ? 158 : 130;
    // idlePeriod — уникальный ритм дыхания для каждого персонажа
    this.hero    = new MapUnit(this, spawn.x,       spawn.y, 'map_hero',    { height: unitH - 5,  speed: 130, idlePeriod: 2800 });
    this.brawler = new MapUnit(this, spawn.x - 65,  spawn.y, 'map_brawler', { height: unitH + 15, speed: 130, idlePeriod: 3400 });
    this.healer  = new MapUnit(this, spawn.x - 120, spawn.y, 'map_healer',  { height: unitH - 8,  speed: 130, idlePeriod: 2200 });

    this._heroTrail     = [];
    this._trailInterval = 0;

    // Частицы огня (факелы, свечи)
    this._spawnTorches(cfg);

    // Мерцание фонарей
    this._spawnLanterns(cfg);

    // Бандиты (только Forest1)
    this._bandits = [];
    if (cfg.bandits) this._spawnBandits(cfg);

    // Hover-надписи для POI
    this._hoverLabels = [];
    this._setupLabels(cfg);

    // Диалоговая панель (in-world overlay)
    this._dialogue = new DialoguePanel(this);

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

      // Имя над головой — только по hover
      const label = this.add.text(npc.x, npc.y - h / 2 - 12, npc.name, {
        fontFamily: 'serif', fontSize: '14px', color: '#D4AA60',
        stroke: '#000', strokeThickness: 3,
      }).setOrigin(0.5, 1).setDepth(npc.y + 1).setAlpha(0);

      // Hover-портрет справа (если задан флаг hoverPortrait)
      let _hBg, _hImg, _hName;
      if (npc.hoverPortrait && npc.portraitKey) {
        const hW = 120, hH = 145, hx = 1594;
        _hBg   = this.add.rectangle(hx, 230, hW, hH, 0x0a0810, 0.92).setDepth(59).setScrollFactor(0).setAlpha(0);
        _hImg  = this.add.image(hx, 222, npc.portraitKey).setDepth(60).setScrollFactor(0).setAlpha(0);
        _hImg.setScale(Math.min((hW - 6) / _hImg.width, (hH - 26) / _hImg.height));
        _hName = this.add.text(hx, 295, npc.name, {
          fontSize: '11px', color: '#CC9944', fontFamily: 'serif',
        }).setOrigin(0.5).setDepth(61).setScrollFactor(0).setAlpha(0);
      }

      // Hover — свечение + показываем имя
      sprite.on('pointerover',  () => {
        sprite.setTint(0xFFEEBB); label.setAlpha(1);
        if (_hBg) { _hBg.setAlpha(1); _hImg.setAlpha(1); _hName.setAlpha(1); }
      });
      sprite.on('pointerout',   () => {
        sprite.clearTint(); label.setAlpha(0);
        if (_hBg) { _hBg.setAlpha(0); _hImg.setAlpha(0); _hName.setAlpha(0); }
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
    // Портреты: левый край = x:0, setOrigin(0, 0.5) гарантирует flush к краю
    const cardW  = 150, cardH = 160;
    const startY = 310;
    const gapY   = 170;
    portraits.forEach((p, i) => {
      const cy = startY + i * gapY;
      // Левый край прямоугольника ровно на x=0, без рамки
      this.add.rectangle(0, cy, cardW, cardH, 0x0a0810, 0.94)
        .setOrigin(0, 0.5)
        .setDepth(50).setScrollFactor(0);
      const cx = cardW / 2;
      const img = this.add.image(cx, cy - 10, p.key).setDepth(51).setScrollFactor(0);
      img.setScale(Math.min((cardW - 8) / img.width, (cardH - 28) / img.height));
      this.add.text(cx, cy + cardH / 2 - 6, p.label, {
        fontSize: '14px', color: '#CCCCCC', fontFamily: 'serif',
      }).setOrigin(0.5, 1).setDepth(51).setScrollFactor(0);
    });

    // Hover-портрет бандита (только на картах с бандитами)
    if (cfg.bandits) {
      const hW = 120, hH = 145;
      // origin(0,0) camera: canvas_x = world_x * zoom → world_x = canvas_x / zoom
      // target canvas center: 1280 - 60 = 1220 → world = 1220 / 0.7651 ≈ 1594
      const hx = 1594;

      this._hoverBg = this.add.rectangle(hx, 230, hW, hH, 0x0a0810, 0.92)
        .setDepth(59).setScrollFactor(0).setAlpha(0);
      this._hoverPortrait = this.add.image(hx, 225, 'portrait_bandit_commander')
        .setDepth(60).setScrollFactor(0).setAlpha(0);
      const pScale = Math.min(
        (hW - 6) / this._hoverPortrait.width,
        (hH - 26) / this._hoverPortrait.height
      );
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
        [this._hoverPortrait, this._hoverBg, this._hoverLabel].forEach(el => el.setAlpha(a));
      });
    }

    this.music = new MusicPlayer(this);
    this.music.create();
  }
}
