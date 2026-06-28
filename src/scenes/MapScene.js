import * as Phaser from 'phaser/dist/phaser.esm.js';

import { MapUnit }       from '../entities/MapUnit.js';
import { WalkableZones } from '../systems/WalkableZones.js';
import { MusicPlayer }   from '../ui/MusicPlayer.js';
import { DialoguePanel } from '../ui/DialoguePanel.js';
import eventBus           from '../utils/eventBus.js';

import MAP_CONFIGS  from '../data/maps.json';
import itemsData    from '../data/items.json';
import booksData    from '../data/books.json';
import { SaveSystem } from '../utils/SaveSystem.js';

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

    // Восстановить флаги реестра из сохранения (NPC-исчезновения, бандиты и т.д.)
    SaveSystem.applyFlagsToRegistry(this.game.registry);

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

    // Внутри таверны персонажи крупнее (интерьер ближе к камере)
    const s = this.mapKey === 'tavern_inside' ? 1.25 : 1;
    this.hero    = new MapUnit(this, spawn.x,       spawn.y, 'map_hero',    { height: Math.round(130 * s), speed: 130, idlePeriod: 2800, paperdoll: false, walkSpriteKey: 'map_hero_walk_side', walkFrames: 8, walkFrameRate: 10, walkFrameContentHeight: 423 });
    this.brawler = new MapUnit(this, spawn.x - 65,  spawn.y, 'map_brawler', { height: Math.round(136 * s), speed: 130, idlePeriod: 3400, paperdoll: false, walkSpriteKey: 'map_brawler_walk_side', walkFrames: 8, walkFrameRate: 8, walkFrameContentHeight: 414 });
    this.healer  = new MapUnit(this, spawn.x - 120, spawn.y, 'map_healer',  { height: Math.round(128 * s), speed: 130, idlePeriod: 2200, paperdoll: false, walkSpriteKey: 'map_healer_walk_side', walkFrames: 8, walkFrameRate: 10, walkFrameContentHeight: 482 });

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

    // Книги и записки на карте
    this._bookPickups = [];
    this._spawnBookPickups(cfg);

    // NPC (статичные, кликабельные)
    this._npcs = [];
    this._spawnNPCs(cfg);

    // Клик по карте
    this.input.on('pointerdown', (ptr) => {
      if (ptr.rightButtonDown()) return;
      if (this._bookOverlay) return;
      if (this._dialogue?.active) return;   // диалог идёт — движение заблокировано
      const clamped = this.walkable.clamp(ptr.worldX, ptr.worldY);
      this.hero.moveTo(clamped.x, clamped.y);
      this._showClickMarker(clamped.x, clamped.y);
    });

    this._clickMarker = this.add.graphics().setDepth(20);

    // ── Инвентарь: глубокая копия из items.json + синхронизация золота ──
    this._inventory = JSON.parse(JSON.stringify(itemsData));
    const savedGold = this.game.registry.get('playerGold') ?? 0;
    const _goldItem = this._inventory.find(it => it.id === 'gold');
    if (_goldItem) _goldItem.quantity = savedGold;
    this._syncCollectedBooksToInventory();

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
    this.input.keyboard.on('keydown-B', () => this._toggleInvGrid());
    this.input.keyboard.on('keydown-J', () => this._toggleFineGrid());

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
      if (this._screenGridMoveHandler) {
        this.input.off('pointermove', this._screenGridMoveHandler);
        this._screenGridMoveHandler = null;
      }
      return;
    }

    const zoom  = this.cameras.main.zoom;
    const SW    = this.cameras.main.width;   // ширина экрана в пикселях (1280)
    const SH    = this.cameras.main.height;  // высота экрана в пикселях (720)
    const STEP  = 50;
    const DEPTH = 15000;
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

    // Координаты мыши вверху по центру
    const cursor = this.add.text(SW / zoom / 2, 18 / zoom, '', {
      fontSize: `${Math.round(11 / zoom)}px`, color: '#FFFFFF', fontFamily: 'monospace',
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(DEPTH + 2);
    objs.push(cursor);

    const onMove = (ptr) => {
      if (!this._screenGrid) return;
      // Экранные координаты (screen px)
      const sx = Math.round(ptr.x * zoom);
      const sy = Math.round(ptr.y * zoom);
      // Мировые координаты
      const wx = Math.round(ptr.worldX);
      const wy = Math.round(ptr.worldY);
      cursor.setText(`screen: ${sx}, ${sy}   world: ${wx}, ${wy}`);
    };
    this.input.on('pointermove', onMove);
    // Сохраняем ссылку на обработчик чтобы снять при скрытии
    this._screenGridMoveHandler = onMove;

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

  _spawnBookPickups(cfg) {
    (cfg.bookPickups || []).forEach(p => {
      const book = booksData.find(b => b.id === p.bookId);
      if (!book) return;
      if (book.collectFlag && this.game.registry.get(book.collectFlag)) return;
      if (!this.textures.exists(book.icon)) return;

      const img = this.add.image(p.x, p.y, book.icon)
        .setOrigin(0.5, 0.5)
        .setDepth(p.depth ?? p.y + 10)
        .setInteractive({ useHandCursor: true });
      if (p.height) img.setScale(p.height / img.height);

      const label = this.add.text(p.x, p.y - (p.height ?? 50) / 2 - 10, p.label || book.shortName || book.title, {
        fontFamily: 'serif', fontSize: '12px', color: '#D4AA60',
        stroke: '#000', strokeThickness: 3,
      }).setOrigin(0.5, 1).setDepth((p.depth ?? p.y + 10) + 1).setAlpha(0);

      img.on('pointerover', () => { img.setTint(0xFFEEBB); label.setAlpha(1); });
      img.on('pointerout',  () => { img.clearTint(); label.setAlpha(0); });
      img.on('pointerdown', (pointer, localX, localY, event) => {
        event?.stopPropagation();
        if (this._transitioning || this._dialogue?.active || this._bookOverlay) return;
        this.hero.stopMove();
        this.brawler.stopMove();
        this.healer.stopMove();
        this._collectBookPickup(book, img, label);
      });

      this._bookPickups.push({ img, label, book });
    });
  }

  _bookToInventoryItem(book) {
    return {
      id: `book_${book.id}`,
      name: book.shortName || book.title,
      type: 'book',
      quantity: 1,
      icon: book.icon,
      stackable: false,
      bookId: book.id,
      description: book.description || book.title,
    };
  }

  _syncCollectedBooksToInventory() {
    booksData.forEach(book => {
      if (book.collectFlag && this.game.registry.get(book.collectFlag)) {
        this._addInventoryItem(this._bookToInventoryItem(book), { render: false });
      }
    });
  }

  _addInventoryItem(item, { render = true } = {}) {
    if (!this._inventory) this._inventory = [];
    if (this._inventory.some(it => it.id === item.id)) return false;
    this._inventory.push(JSON.parse(JSON.stringify(item)));

    if (render && this._charSheetElements && this._charSheetDEPTH !== undefined) {
      const visible = !!this._charSheetElements[0]?.visible;
      const slotIdx = this._inventory.length - 1;
      const els = this._createInventoryItemElements(item, slotIdx, visible);
      this._charSheetElements.push(...els);
    }
    return true;
  }

  _collectBookPickup(book, img, label) {
    if (book.collectFlag) SaveSystem.setFlag(book.collectFlag, true, this.game.registry);
    this._addInventoryItem(this._bookToInventoryItem(book));
    img.destroy();
    label.destroy();
    this._showBookReader(book.id);
  }

  _spawnNPCs(cfg) {
    (cfg.npcs || []).forEach(npc => {
      // NPC с vanishKey исчезает навсегда после разговора (флаг сохраняется в registry)
      if (npc.vanishKey && this.game.registry.get(npc.vanishKey)) return;
      const h = npc.height || 130;
      const tex = this.textures.get(npc.spriteKey);
      const frameKey = npc.frame ?? (npc.ambientAnim ? 0 : '__BASE');
      const frame = tex.get(frameKey) || tex.get('__BASE');
      const texHeight = frame?.height || tex.getSourceImage().height;
      const ratio = texHeight > 0 ? h / texHeight : 1;

      // Тень
      const shadow = this.add.ellipse(npc.x, npc.y + 8, 55, 16, 0x000000, 0.35).setDepth(1);

      // Для sway-NPC: origin (0.5, 1) — вращение вокруг ног.
      // Компенсируем смещение: origin снизу поднимает спрайт, добавляем h/2 к y.
      const spriteOriginY = npc.sway ? 1 : 0.5;
      const spriteY       = npc.sway ? npc.y + h / 2 : npc.y;
      const spriteFactory = npc.ambientAnim ? this.add.sprite.bind(this.add) : this.add.image.bind(this.add);
      const sprite = spriteFactory(npc.x, spriteY, npc.spriteKey, frameKey)
        .setOrigin(0.5, spriteOriginY)
        .setScale(ratio)
        .setDepth(npc.y)
        .setFlipX(npc.flipX || false)
        .setInteractive({ useHandCursor: true });
      this._addBreathingTween(sprite, 3000 + Math.random() * 600);
      this._setupAmbientNpcAnimation(sprite, npc);

      // Пьяное покачивание (sway: true) — тело качается, ноги стоят на месте
      if (npc.sway) {
        // Вращение вокруг нижнего центра (ног) — x не двигаем
        this.tweens.add({
          targets:  sprite,
          angle:    { from: -3, to: 3 },
          duration: 2000,
          yoyo:     true,
          repeat:   -1,
          ease:     'Sine.easeInOut',
        });
        // Лёгкое смещение верхней части тела (через scaleX) — как инерция при покачивании
        this.tweens.add({
          targets:  sprite,
          scaleX:   { from: ratio * 0.99, to: ratio * 1.01 },
          duration: 2600,
          yoyo:     true,
          repeat:   -1,
          ease:     'Sine.easeInOut',
          delay:    300,
        });
      }

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
        // Помечаем разговор состоявшимся — при следующем визите NPC исчезнет
        if (npc.vanishKey) this.game.registry.set(npc.vanishKey, true);
        this._showNpcDialogue(npc, this._resolveRootDialogue(npc));
      });

      this._npcs.push({ sprite, shadow, label, cfg: npc });
    });
  }

  _setupAmbientNpcAnimation(sprite, npc) {
    const cfg = npc.ambientAnim;
    if (!cfg) return;

    const animKey = cfg.key || `${npc.spriteKey}_ambient`;
    const idleFrame = cfg.idleFrame ?? 0;

    if (!this.anims.exists(animKey)) {
      this.anims.create({
        key: animKey,
        frames: this.anims.generateFrameNumbers(npc.spriteKey, {
          start: cfg.startFrame ?? 0,
          end: (cfg.startFrame ?? 0) + (cfg.frames ?? 1) - 1,
        }),
        frameRate: cfg.frameRate ?? 3,
        repeat: cfg.loop ? -1 : (cfg.repeat ?? 0),
      });
    }

    const playAmbient = () => {
      if (!sprite.active || sprite.anims?.isPlaying || this._transitioning) return;
      sprite.play(animKey);
    };

    sprite.on(`animationcomplete-${animKey}`, () => {
      if (sprite.active) sprite.setFrame(idleFrame);
    });

    if (cfg.loop) {
      this.time.delayedCall(cfg.firstDelay ?? 0, playAmbient);
      return;
    }

    const interval = cfg.interval ?? 40000;
    this.time.delayedCall(cfg.firstDelay ?? interval, () => {
      playAmbient();
      this.time.addEvent({
        delay: interval,
        loop: true,
        callback: playAmbient,
      });
    });
  }

  // Выбирает начальный диалог на основе флагов (altRoot в данных NPC)
  _resolveRootDialogue(npc) {
    if (!npc.altRoot) return 0;
    for (const alt of npc.altRoot) {
      if (alt.requiresFlag && !this.game.registry.get(alt.requiresFlag)) continue;
      if (alt.hideIfFlag  &&  this.game.registry.get(alt.hideIfFlag))  continue;
      return alt.dialogueIndex;
    }
    return 0;
  }

  _showNpcDialogue(npc, dialogueIndex) {
    const dlg = npc.dialogues[dialogueIndex] || npc.dialogues[0];

    // Фильтруем варианты по флагам, сохраняя исходный индекс для расчёта nextIdx
    const visible = (dlg.choices || [])
      .map((ch, origIdx) => ({ ch, origIdx }))
      .filter(({ ch }) => {
        if (ch.requiresFlag && !this.game.registry.get(ch.requiresFlag)) return false;
        if (ch.hideIfFlag  &&  this.game.registry.get(ch.hideIfFlag))  return false;
        return true;
      });

    const choices = visible.map(({ ch, origIdx }) => ({
      label: ch.label,
      style: ch.style || 'default',
      onSelect: () => {
        // Ставим флаг если задан
        if (ch.setFlag) this.game.registry.set(ch.setFlag, true);
        // ch.close — принудительно закрыть, не идти дальше
        if (ch.close) return;
        // ch.next — явный переход; иначе автоматический по позиции
        const nextIdx = (ch.next !== undefined) ? ch.next : dialogueIndex + 1 + origIdx;
        if (npc.dialogues[nextIdx]) {
          this._showNpcDialogue(npc, nextIdx);
        }
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
    b.sprite.setFlipX(false);

    const bx = cfg.banditPos.x;
    const by = cfg.banditPos.y;

    // ── Воин ──────────────────────────────────────────────────────────────
    const warrior = this.add.image(bx - 90, by + 20, 'map_bandit_warrior')
      .setOrigin(0.5, 1).setDepth(by + 19).setFlipX(true);
    warrior.setScale(155 / warrior.height);
    const wBase = warrior.scaleY;
    this.tweens.add({
      targets: warrior,
      scaleY: { from: wBase * 0.997, to: wBase * 1.018 },
      duration: 2700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });
    warrior.setInteractive({ useHandCursor: true });
    warrior.on('pointerdown', () => this._showCompanionDialogue('warrior'));

    // ── Арбалетчик ────────────────────────────────────────────────────────
    const archer = this.add.image(bx + 80, by - 15, 'map_bandit_archer')
      .setOrigin(0.5, 1).setDepth(by - 16).setFlipX(false);
    archer.setScale(105 / archer.height);
    const aBase = archer.scaleY;
    this.tweens.add({
      targets: archer,
      scaleY: { from: aBase * 0.997, to: aBase * 1.020 },
      duration: 3100, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });
    archer.setInteractive({ useHandCursor: true });
    archer.on('pointerdown', () => this._showCompanionDialogue('archer'));

    this._banditCompanions = [
      { sprite: warrior, type: 'warrior' },
      { sprite: archer,  type: 'archer'  },
    ];

    this._bandits.push({ unit: b, encountered: false, companions: [warrior, archer] });
  }

  _showCompanionDialogue(type) {
    if (this._dialogue?.active) return;
    if (this._bandits[0]?.encountered) return;
    const isWarrior = type === 'warrior';
    this._dialogue.show({
      portraitLeft:       'portrait_hero_duelist',
      portraitRight:      isWarrior ? 'portrait_bandit_warrior' : 'portrait_bandit_archer',
      speakerName:        isWarrior ? 'Головорез' : 'Тисс',
      speakerNameLeft:    'Дуэлянт',
      text: isWarrior
        ? '"С командиром говори. Я словами плохо работаю."'
        : '"Не подходи ближе. У меня палец устал, а тетива не любит дрожь."',
      choices: [
        { label: isWarrior ? 'Понял.' : 'Зову командира.', style: 'retreat', onSelect: () => {} },
      ],
    });
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
      speakerName:   'Корвин Сухой',
      text: '"Стой. Дальше дорога моя. Проход стоит денег. Спор стоит крови. Выбирай, что у тебя лишнее."',
      choices: [
        {
          label:    'Атаковать.',
          style:    'attack',
          onSelect: () => this._startBattle(),
        },
        {
          label:    'Назови цену.',
          style:    'default',
          onSelect: () => this._banditLetThrough(bandit),
        },
        {
          label:    '[Запугать] С дороги.',
          style:    'threat',
          onSelect: () => this._tryIntimidate(bandit),
        },
        {
          label:    'Мы вернемся позже.',
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
    this.game.registry.set('bandit_fight_started', true);
    this._transitioning = true;
    this.time.delayedCall(200, () => {
      this.cameras.main.fade(500, 0, 0, 0, false, (cam, progress) => {
        if (progress === 1) {
          this.scene.start('LoadingScene', {
            destination: 'BattleScene',
            destinationData: { fromMapKey: this.mapKey, fromSpawnId: this.spawnId },
          });
        }
      });
    });
  }

  /** Бандит пропускает — за "дань" или просто пугается молчания */
  _banditLetThrough(bandit) {
    this._dialogue.show({
      portraitLeft:  'portrait_hero_duelist',
      portraitRight: 'portrait_bandit_commander',
      speakerName:   'Корвин Сухой',
      text: '"Разум живет дольше гордости. Проходите. Но дорога назад будет стоить отдельно."',
      choices: [
        {
          label:    'Идём дальше.',
          style:    'default',
          onSelect: () => {
            this.game.registry.set('bandit_paid', true);
            this._banditRetreat(bandit);
          },
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
        speakerName:   'Корвин Сухой',
        text: '"Глаза у тебя не путника. Ладно. Сегодня дорога проглотит гордость. Отходим."',
        choices: [
          {
            label:    'Смотрим как отходят.',
            style:    'default',
            onSelect: () => {
              this.game.registry.set('bandit_intimidated', true);
              this._banditRetreat(bandit);
            },
          },
        ],
      });
    } else {
      this._dialogue.show({
        portraitLeft:  'portrait_hero_duelist',
        portraitRight: 'portrait_bandit_commander',
        speakerName:   'Корвин Сухой',
        text: '"Слова тоньше кожи. Проверим, что под ней."',
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
    // Все трое остаются на месте — можно пройти мимо
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
    // Обновить позицию в сохранении при переходе между картами
    SaveSystem.updatePosition(mapKey, spawnId);
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

    // Hover-портреты бандитов (командир + воин + арбалетчик)
    if (cfg.bandits) {
      const hW = 120, hH = 145;
      // screen x≈1220 → world x = 1220 / zoom ≈ 1594
      const hx = 1594;

      this._hoverPortrait = this.add.image(hx, 210, 'portrait_bandit_commander')
        .setDepth(60).setScrollFactor(0).setAlpha(0);
      this._hoverPortrait.setScale(
        Math.min(hW / this._hoverPortrait.width, hH / this._hoverPortrait.height)
      );
      this._hoverLabel = this.add.text(hx, 285, '', {
        fontSize: '11px', color: '#CC4444', fontFamily: 'serif',
      }).setOrigin(0.5).setDepth(61).setScrollFactor(0).setAlpha(0);

      // Проверяемые зоны: [портрет-ключ, подпись, getter позиции, радиус]
      const _getHoverTarget = (ptr) => {
        if (this._bandits[0]?.encountered) return null;

        // Командир
        const cmd = this._bandits[0]?.unit?.sprite;
        if (cmd && Phaser.Math.Distance.Between(ptr.worldX, ptr.worldY, cmd.x, cmd.y) < 70)
          return { key: 'portrait_bandit_commander', label: 'Корвин Сухой' };

        // Воин
        const wSprite = this._banditCompanions?.[0]?.sprite;
        if (wSprite && Phaser.Math.Distance.Between(ptr.worldX, ptr.worldY, wSprite.x, wSprite.y) < 65)
          return { key: 'portrait_bandit_warrior', label: 'Головорез' };

        // Арбалетчик
        const aSprite = this._banditCompanions?.[1]?.sprite;
        if (aSprite && Phaser.Math.Distance.Between(ptr.worldX, ptr.worldY, aSprite.x, aSprite.y) < 65)
          return { key: 'portrait_bandit_archer', label: 'Тисс' };

        return null;
      };

      this.input.on('pointermove', (ptr) => {
        const found = _getHoverTarget(ptr);
        if (found) {
          if (this._hoverPortrait.texture.key !== found.key) {
            this._hoverPortrait.setTexture(found.key);
            this._hoverPortrait.setScale(
              Math.min(hW / this._hoverPortrait.width, hH / this._hoverPortrait.height)
            );
          }
          this._hoverLabel.setText(found.label);
          this._hoverPortrait.setAlpha(1);
          this._hoverLabel.setAlpha(1);
        } else {
          this._hoverPortrait.setAlpha(0);
          this._hoverLabel.setAlpha(0);
        }
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

    // ── Левая панель: инвентарь ───────────────────────────────────────────────
    // Калибровка по H-сетке: TL иконки 0 = canvas(201,139), TL иконки 1 = canvas(247,140)
    // Шаг = 46px canvas, ячейка 42px, зазор 4px
    const INV_SLOT_PX = 42;   // canvas px на ячейку
    const INV_GAP_PX  = 4;    // canvas px зазор
    const INV_COLS    = 6;
    const INV_ROWS    = 9;
    const INV_STEP    = INV_SLOT_PX + INV_GAP_PX;  // 46px шаг
    const gridX0Scr   = 201;   // canvas px — левый край col 0 (TL иконки 0)
    const gridY0Scr   = 139;   // canvas px — верхний край row 0 (TL иконки 0)

    const invEls = [];

    // Заголовок «ИНВЕНТАРЬ» — центр над сеткой инвентаря (canvas x=337, y=103)
    invEls.push(
      this.add.text(s(337), s(103), 'ИНВЕНТАРЬ', {
        fontSize: `${s(11)}px`, color: '#d4a832', fontFamily: 'serif', letterSpacing: 2,
      }).setOrigin(0.5, 0).setDepth(DEPTH+3).setScrollFactor(0).setVisible(false)
    );

    // Иконки и количество предметов
    this._invGoldLabel = null;
    this._inventoryItemElements = [];
    (this._inventory || []).forEach((item, slotIdx) => {
      if (slotIdx >= INV_COLS * INV_ROWS) return;
      const itemEls = this._createInventoryItemElements(item, slotIdx, false);
      invEls.push(...itemEls);
    });
    // ──────────────────────────────────────────────────────────────────────────

    this._charSheetElements = [overlay, bg, bgImg, title, closeBtn, divLeft, divRight, tabLine, ...tabs, ...invEls];
    this._charSheetTabs = tabs;
    this._charSheetChars = CHARS;
    this._charSheetPX = PX; this._charSheetPY = PY;
    this._charSheetPW = PW; this._charSheetPH = PH;
    this._charSheetDEPTH = DEPTH;

    this._initBottomBar();
  }

  _createInventoryItemElements(item, slotIdx, visible = false) {
    const INV_SLOT_PX = 42;
    const INV_STEP    = 46;
    const INV_COLS    = 6;
    const INV_ROWS    = 9;
    const gridX0Scr   = 201;
    const gridY0Scr   = 139;
    if (slotIdx >= INV_COLS * INV_ROWS) return [];

    const zoom = this.cameras.main.zoom;
    const s = v => v / zoom;
    const DEPTH = this._charSheetDEPTH ?? 10000;
    const row   = Math.floor(slotIdx / INV_COLS);
    const col   = slotIdx % INV_COLS;
    const cxScr = gridX0Scr + col * INV_STEP + INV_SLOT_PX / 2;
    const cyScr = gridY0Scr + row * INV_STEP + INV_SLOT_PX / 2;
    const ICON_PX = 38;
    const els = [];

    let iconObj;
    if (item.icon && this.textures.exists(item.icon)) {
      iconObj = this.add.image(s(cxScr), s(cyScr), item.icon)
        .setDisplaySize(s(ICON_PX), s(ICON_PX))
        .setDepth(DEPTH + 4).setScrollFactor(0).setVisible(visible);
    } else {
      iconObj = this.add.text(s(cxScr), s(cyScr), item.name, {
        fontSize: `${s(7)}px`, color: '#888877', fontFamily: 'serif',
        wordWrap: { width: s(INV_SLOT_PX - 4) }, align: 'center',
      }).setOrigin(0.5, 0.5).setDepth(DEPTH + 4).setScrollFactor(0).setVisible(visible);
    }
    els.push(iconObj);

    if (item.type === 'book' && item.bookId) {
      iconObj.setInteractive({ useHandCursor: true });
      iconObj.on('pointerover', () => iconObj.setTint?.(0xFFEEBB));
      iconObj.on('pointerout',  () => iconObj.clearTint?.());
      iconObj.on('pointerdown', (pointer, localX, localY, event) => {
        event?.stopPropagation();
        this._showBookReader(item.bookId);
      });
    }

    // Количество — правый нижний угол слота
    if (item.stackable || item.quantity > 1) {
      const qtyLabel = this.add.text(
        s(cxScr + INV_SLOT_PX / 2 - 2),
        s(cyScr + INV_SLOT_PX / 2 - 2),
        `${item.quantity}`,
        { fontSize: `${s(8)}px`, color: '#CCCC66', fontFamily: 'monospace',
          stroke: '#000000', strokeThickness: s(1.5) }
      ).setOrigin(1, 1).setDepth(DEPTH + 5).setScrollFactor(0).setVisible(visible);
      els.push(qtyLabel);
      if (item.id === 'gold') this._invGoldLabel = qtyLabel;
    }

    this._inventoryItemElements?.push(...els);
    return els;
  }

  _showBookReader(bookId) {
    if (this._bookOverlay) return;
    const book = booksData.find(b => b.id === bookId);
    if (!book) return;

    if (book.readFlag) SaveSystem.setFlag(book.readFlag, true, this.game.registry);
    if (this._dialogue?.active) this._dialogue.hide();
    this.hero.stopMove();
    this.brawler.stopMove();
    this.healer.stopMove();

    const zoom = this.cameras.main.zoom;
    const s = v => v / zoom;
    const DEPTH = 13000;
    const group = this.add.group();
    this._bookOverlay = group;
    const add = (obj) => { group.add(obj); return obj; };

    const closeReader = () => {
      group.getChildren().forEach(obj => { try { obj.destroy(); } catch {} });
      group.clear(true, true);
      this._bookOverlay = null;
    };

    const overlay = add(this.add.rectangle(s(640), s(360), s(1280), s(720), 0x000000, 0.82)
      .setDepth(DEPTH).setScrollFactor(0).setInteractive());
    overlay.on('pointerdown', (pointer, localX, localY, event) => event?.stopPropagation());

    add(this.add.image(s(640), s(380), 'ui_book_open_panel')
      .setDisplaySize(s(930), s(704))
      .setDepth(DEPTH + 1).setScrollFactor(0));

    add(this.add.text(s(640), s(34), book.title, {
      fontSize: `${Math.round(23 / zoom)}px`,
      color: '#D4AA60',
      fontFamily: 'serif',
      stroke: '#000000',
      strokeThickness: s(2),
    }).setOrigin(0.5, 0).setDepth(DEPTH + 3).setScrollFactor(0));

    const leftText = add(this.add.text(s(278), s(174), '', {
      fontSize: `${Math.round(12 / zoom)}px`,
      color: '#2c1a0c',
      fontFamily: 'serif',
      fontStyle: 'bold',
      wordWrap: { width: s(280), useAdvancedWrap: true },
      lineSpacing: s(5),
    }).setDepth(DEPTH + 3).setScrollFactor(0));

    const rightText = add(this.add.text(s(722), s(174), '', {
      fontSize: `${Math.round(12 / zoom)}px`,
      color: '#2c1a0c',
      fontFamily: 'serif',
      fontStyle: 'bold',
      wordWrap: { width: s(300), useAdvancedWrap: true },
      lineSpacing: s(5),
    }).setDepth(DEPTH + 3).setScrollFactor(0));

    const pageLabel = add(this.add.text(s(640), s(664), '', {
      fontSize: `${Math.round(12 / zoom)}px`,
      color: '#6d5736',
      fontFamily: 'serif',
    }).setOrigin(0.5, 0.5).setDepth(DEPTH + 3).setScrollFactor(0));

    let pageIndex = 0;
    const pages = book.pages?.length ? book.pages : ['Страницы пусты.'];

    const prevBtn = add(this.add.text(s(318), s(650), '‹ Назад', {
      fontSize: `${Math.round(16 / zoom)}px`,
      color: '#6d5736',
      fontFamily: 'serif',
      stroke: '#f0d8a0',
      strokeThickness: s(0.5),
    }).setOrigin(0.5).setDepth(DEPTH + 4).setScrollFactor(0).setInteractive({ useHandCursor: true }));

    const nextBtn = add(this.add.text(s(962), s(650), 'Дальше ›', {
      fontSize: `${Math.round(16 / zoom)}px`,
      color: '#6d5736',
      fontFamily: 'serif',
      stroke: '#f0d8a0',
      strokeThickness: s(0.5),
    }).setOrigin(0.5).setDepth(DEPTH + 4).setScrollFactor(0).setInteractive({ useHandCursor: true }));

    const closeBtn = add(this.add.text(s(1110), s(84), '×', {
      fontSize: `${Math.round(34 / zoom)}px`,
      color: '#C9A84C',
      fontFamily: 'serif',
      stroke: '#000000',
      strokeThickness: s(2),
    }).setOrigin(0.5).setDepth(DEPTH + 4).setScrollFactor(0).setInteractive({ useHandCursor: true }));

    const renderPages = () => {
      leftText.setText(pages[pageIndex] || '');
      rightText.setText(pages[pageIndex + 1] || '');
      pageLabel.setText(`${pageIndex + 1}-${Math.min(pageIndex + 2, pages.length)} / ${pages.length}`);
      prevBtn.setAlpha(pageIndex > 0 ? 1 : 0.35);
      nextBtn.setAlpha(pageIndex + 2 < pages.length ? 1 : 0.35);
    };

    prevBtn.on('pointerdown', (pointer, localX, localY, event) => {
      event?.stopPropagation();
      if (pageIndex <= 0) return;
      pageIndex = Math.max(0, pageIndex - 2);
      renderPages();
    });
    nextBtn.on('pointerdown', (pointer, localX, localY, event) => {
      event?.stopPropagation();
      if (pageIndex + 2 >= pages.length) return;
      pageIndex += 2;
      renderPages();
    });
    closeBtn.on('pointerdown', (pointer, localX, localY, event) => {
      event?.stopPropagation();
      closeReader();
    });

    renderPages();
  }

  _initBottomBar() {
    const zoom = this.cameras.main.zoom;
    const W = this.cameras.main.width  / zoom;   // world units = canvas/zoom ≈ 1673
    const H = this.cameras.main.height / zoom;   // world units = canvas/zoom ≈ 941
    const BAR_H = 148;  // немного больше чтобы иконки 40px вписывались в ячейки
    const BAR_Y = H - BAR_H / 2;
    const DEPTH = 8000; // выше любого NPC (depth = npc.y, макс ~941)

    // Изображение 866×288 — сохраняем пропорции при высоте BAR_H
    const imgW = Math.round(BAR_H * (866 / 288));
    this.add.image(W / 2, BAR_Y, 'bottom_panel1')
      .setDisplaySize(imgW, BAR_H)
      .setDepth(DEPTH).setScrollFactor(0);

    // 5 слотов выровнены по визуальным ячейкам изображения
    const SLOT_SIZE = 64;  // screen pixels

    // Фракции центров ячеек для bottom_panel1.png (866×288)
    // Разделители на px: 121,250,377,504,622,854 → центры ячеек: 185,313,440,563,738
    const SLOT_FRACTIONS = [0.2136, 0.3614, 0.5081, 0.6501, 0.8522];
    const SLOTS = [
      { label: '',      action: null },                             // 0 — золото (спец.обработка)
      { label: '',      action: null },                             // 1 — пусто
      { label: '',      action: () => this._showCharSheet(0) },   // 2 — инвентарь/отряд
      { label: '',      action: null },                             // 3 — пусто
      { label: '',      action: null },                             // 4 — пусто
    ];

    const s = v => v / zoom;
    const SLOT_W_WORLD = SLOT_SIZE / zoom;
    const imgStartX = W / 2 - imgW / 2;
    // Шипы сверху смещают визуальный центр ячеек вниз на ~9% высоты панели
    const ICON_CY = BAR_Y + BAR_H * 0.09;
    const ICON_SZ = s(40);  // 40 canvas px для иконок

    SLOTS.forEach((slot, i) => {
      const sx = Math.round(imgStartX + SLOT_FRACTIONS[i] * imgW);
      const sy = BAR_Y;

      // Хит-зона — одинаковый квадрат для всех слотов
      const hit = this.add.rectangle(sx, sy, SLOT_W_WORLD, SLOT_W_WORLD, 0x000000, 0)
        .setDepth(DEPTH + 3).setScrollFactor(0);

      // ── Слот 0: золото ──
      if (i === 0) {
        let goldIcon = null;
        if (this.textures.exists('icon_gold')) {
          goldIcon = this.add.image(sx - 4, ICON_CY - 7, 'icon_gold')
            .setDisplaySize(ICON_SZ, ICON_SZ)
            .setDepth(DEPTH + 4).setScrollFactor(0).setAlpha(0.85);
        }
        const pad = 6;
        const tooltipY = ICON_CY - SLOT_W_WORLD * 0.72;
        const tooltipText = this.add.text(sx, tooltipY, 'Золото: 0', {
          fontSize: '12px', color: '#FFFFFF', fontFamily: 'serif',
        }).setOrigin(0.5, 0.5).setDepth(DEPTH + 11).setScrollFactor(0).setVisible(false);
        const tooltipBg = this.add.rectangle(sx, tooltipY, 90, 24, 0x000000, 0.88)
          .setDepth(DEPTH + 10).setScrollFactor(0).setVisible(false);
        hit.setInteractive({ useHandCursor: false });
        hit.on('pointerover', () => {
          const gold = this.game.registry.get('playerGold') ?? 0;
          tooltipText.setText(`Золото: ${gold}`);
          tooltipBg.setSize(tooltipText.width + pad * 2, tooltipText.height + pad * 2);
          tooltipBg.setVisible(true); tooltipText.setVisible(true);
          if (goldIcon) goldIcon.setAlpha(1);
        });
        hit.on('pointerout', () => {
          tooltipBg.setVisible(false); tooltipText.setVisible(false);
          if (goldIcon) goldIcon.setAlpha(0.85);
        });
        return;
      }

      // ── Слот 2: инвентарь/отряд ──
      if (i === 2) {
        // Центр вычислен из измеренного TL world(811,850) + half s(40)=26 world
        const INV_X = 837, INV_Y = 876;
        const icon = this.add.image(INV_X, INV_Y, 'map_menu_button')
          .setDisplaySize(ICON_SZ, ICON_SZ)
          .setDepth(DEPTH + 4).setScrollFactor(0).setAlpha(0.65);

        const pad = 6;
        const tooltipY = INV_Y - SLOT_W_WORLD * 0.72;
        const tooltipText = this.add.text(INV_X, tooltipY, 'Инвентарь', {
          fontSize: '12px', color: '#FFFFFF', fontFamily: 'serif',
        }).setOrigin(0.5, 0.5).setDepth(DEPTH + 11).setScrollFactor(0).setVisible(false);
        const tooltipBg = this.add.rectangle(INV_X, tooltipY, 90, 24, 0x000000, 0.88)
          .setDepth(DEPTH + 10).setScrollFactor(0).setVisible(false);

        hit.setInteractive({ useHandCursor: true });
        hit.on('pointerover', () => {
          icon.setAlpha(1);
          tooltipBg.setSize(tooltipText.width + pad * 2, tooltipText.height + pad * 2);
          tooltipBg.setVisible(true); tooltipText.setVisible(true);
        });
        hit.on('pointerout', () => {
          icon.setAlpha(0.65);
          tooltipBg.setVisible(false); tooltipText.setVisible(false);
        });
        hit.on('pointerdown', slot.action);
        return;
      }

      if (!slot.action) return;  // пустой слот — ничего не рисуем

      // ── Прочие активные слоты: иконка + подпись ──
      const iconSz = Math.round(SLOT_SIZE * 0.65 / zoom);
      const iconY  = sy;
      const labelY = sy + SLOT_W_WORLD * 0.42;

      const icon = this.add.image(sx, iconY, 'map_menu_button')
        .setDisplaySize(iconSz, iconSz)
        .setDepth(DEPTH + 4).setScrollFactor(0).setAlpha(0.9);

      const label = this.add.text(sx, labelY, slot.label, {
        fontSize: '10px', color: '#C9A84C', fontFamily: 'serif',
        stroke: '#000000', strokeThickness: 2,
      }).setOrigin(0.5, 0.5).setDepth(DEPTH + 5).setScrollFactor(0);

      const glow = this.add.rectangle(sx, sy, SLOT_W_WORLD, SLOT_W_WORLD, 0xC9A84C, 0)
        .setDepth(DEPTH + 2).setScrollFactor(0);

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
    // Синхронизируем золото из реестра при каждом открытии
    const gold = this.game.registry.get('playerGold') ?? 0;
    const goldItem = this._inventory?.find(it => it.id === 'gold');
    if (goldItem && goldItem.quantity !== gold) {
      goldItem.quantity = gold;
      if (this._invGoldLabel) this._invGoldLabel.setText(`${gold}`);
    }

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
    this._destroyInvGrid();
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
    // Координаты canvas (= screen_из_H_сетки / zoom ≈ screen * 1.307):
    // ХАРАКТЕРИСТИКИ верх-лево: canvas(874, 105)
    // Метки: canvas x=861, первая строка canvas y=175
    // Значения: canvas x=979
    const statsX     = s(861);
    const statsValX  = s(979);
    const statsLineR = s(1140);
    const statsY0    = s(175);
    const statsStep  = s(40);

    const stats = [
      ['Уровень',    `${ch.lvl}`],
      ['HP',         `${ch.hp} / ${ch.maxHp}`],
      ['Урон',       ch.dmg],
      ['Инициатива', `${ch.spd}`],
    ];

    add(this.add.text(s(874), s(105), 'ХАРАКТЕРИСТИКИ', {
      fontSize: `${s(14)}px`, color: '#d4a832', fontFamily: 'serif', letterSpacing: 2
    }).setOrigin(0, 0).setDepth(DEPTH+5).setScrollFactor(0));

    stats.forEach(([label, val], i) => {
      const rowY = statsY0 + i * statsStep;
      add(this.add.text(statsX, rowY, label, {
        fontSize: `${s(13)}px`, color: '#888877', fontFamily: 'serif'
      }).setDepth(DEPTH+5).setScrollFactor(0));
      add(this.add.text(statsValX, rowY, val, {
        fontSize: `${s(15)}px`, color: '#CCCCCC', fontFamily: 'serif', fontStyle: 'bold'
      }).setOrigin(0, 0).setDepth(DEPTH+5).setScrollFactor(0));
      const lg = add(this.add.graphics().setDepth(DEPTH+4).setScrollFactor(0));
      lg.lineStyle(1, 0x333322, 0.5);
      lg.lineBetween(statsX, rowY + s(22), statsLineR, rowY + s(22));
    });

    // Скиллы
    const skillsY = statsY0 + stats.length * statsStep + s(24);
    add(this.add.text(statsX, skillsY, 'СКИЛЛЫ', {
      fontSize: `${s(14)}px`, color: '#d4a832', fontFamily: 'serif', letterSpacing: 2
    }).setDepth(DEPTH+5).setScrollFactor(0));
    ch.skills.forEach((sk, i) => {
      add(this.add.text(statsX, skillsY + s(18) + i * s(26), `• ${sk}`, {
        fontSize: `${s(13)}px`, color: '#AAAAAA', fontFamily: 'serif'
      }).setDepth(DEPTH+5).setScrollFactor(0));
    });

    // Левая зона (инвентарь) — сетка рисуется статично в _initCharacterSheet, не здесь.
  }

  // ── Отладочная сетка инвентаря (клавиша B) ──────────────────────────────
  _destroyInvGrid() {
    if (this._invGridObjs) {
      this._invGridObjs.forEach(o => { try { o.destroy(); } catch {} });
      this._invGridObjs = null;
    }
  }

  _toggleInvGrid() {
    if (!this._charSheetElements?.[0]?.visible) return;

    if (this._invGridObjs) {
      this._destroyInvGrid();
      return;
    }

    const zoom = this.cameras.main.zoom;
    const s    = v => v / zoom;
    const DEPTH = 11000;

    // Параметры сетки в canvas px (те же, что в _initCharacterSheet)
    const INV_SLOT_PX = 42;
    const INV_STEP    = 46;
    const INV_COLS    = 6;
    const INV_ROWS    = 9;
    const gridX0Scr   = 201;
    const gridY0Scr   = 139;

    const objs = [];
    const gfx = this.add.graphics().setDepth(DEPTH).setScrollFactor(0);
    objs.push(gfx);

    for (let row = 0; row < INV_ROWS; row++) {
      for (let col = 0; col < INV_COLS; col++) {
        const x0 = gridX0Scr + col * INV_STEP;
        const y0 = gridY0Scr + row * INV_STEP;
        gfx.lineStyle(1, 0xFFAA00, 0.7);
        gfx.strokeRect(s(x0), s(y0), s(INV_SLOT_PX), s(INV_SLOT_PX));

        // Номер слота в углу
        const lbl = this.add.text(s(x0 + 2), s(y0 + 1),
          `${row * INV_COLS + col}`,
          { fontSize: `${s(7)}px`, color: '#FFAA00', fontFamily: 'monospace' }
        ).setDepth(DEPTH+1).setScrollFactor(0);
        objs.push(lbl);
      }
    }

    this._invGridObjs = objs;
  }

  // J — мелкая мировая сетка с шагом 20 world-единиц (~15 canvas px)
  // Говори «сдвинь на 3 квадрата вправо» = +60 world
  _toggleFineGrid() {
    if (this._fineGrid) {
      this._fineGrid.forEach(o => { try { o.destroy(); } catch {} });
      this._fineGrid = null;
      return;
    }

    const STEP  = 20;   // 1 квадрат = 20 world units
    const mapW  = 1672;
    const mapH  = 941;
    const DEPTH = 16000;
    const objs  = [];

    const gfx = this.add.graphics().setDepth(DEPTH);
    gfx.lineStyle(1, 0xFFDD88, 0.18);
    for (let x = 0; x <= mapW; x += STEP) {
      // Каждые 5 квадратов (100 world) — чуть ярче
      if (x % 100 === 0) gfx.lineStyle(1, 0xFFDD88, 0.45);
      else                gfx.lineStyle(1, 0xFFDD88, 0.14);
      gfx.lineBetween(x, 0, x, mapH);
    }
    for (let y = 0; y <= mapH; y += STEP) {
      if (y % 100 === 0) gfx.lineStyle(1, 0xFFDD88, 0.45);
      else                gfx.lineStyle(1, 0xFFDD88, 0.14);
      gfx.lineBetween(0, y, mapW, y);
    }
    objs.push(gfx);

    // Номера квадратов каждые 100 world (каждые 5 клеток)
    for (let x = 0; x <= mapW; x += 100) {
      for (let y = 0; y <= mapH; y += 100) {
        const lbl = this.add.text(x + 2, y + 2, `${x},${y}`, {
          fontSize: '8px', color: '#FFDD88', fontFamily: 'monospace',
          stroke: '#000', strokeThickness: 2,
        }).setDepth(DEPTH + 1).setAlpha(0.75);
        objs.push(lbl);
      }
    }

    this._fineGrid = objs;
  }
}
