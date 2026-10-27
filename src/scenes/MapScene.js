import * as Phaser from 'phaser/dist/phaser.esm.js';

import { MapUnit }       from '../entities/MapUnit.js';
import { PlayerUnit }    from '../entities/PlayerUnit.js';
import { WalkableZones } from '../systems/WalkableZones.js';
import { findPath } from '../systems/Pathfinding.js';
import WALK_GRIDS from '../data/walkgrid.json';
import { ExitMarkers } from '../ui/ExitMarkers.js';
import UI from '../data/ui.json';
import HEIGHTS from '../data/heights.json';
import { MusicPlayer }   from '../ui/MusicPlayer.js';
import { DialoguePanel } from '../ui/DialoguePanel.js';
import eventBus           from '../utils/eventBus.js';
import { XP }             from '../utils/constants.js';

import MAP_CONFIGS  from '../data/maps.json';
import skillsData from '../data/skills.json';
import itemsData    from '../data/items.json';
import booksData    from '../data/books.json';
import unitsData    from '../data/units.json';
import classesData  from '../data/classes.json';
import { SaveSystem, START_MAP } from '../utils/SaveSystem.js';
import { getNpcAnimConfig, attachNpcAnimations } from '../systems/NpcAnimations.js';
import { MapAmbience } from '../systems/MapAmbience.js';
import { PartySystem } from '../systems/PartySystem.js';
import { WorldState } from '../systems/WorldState.js';
import { DialogueRunner } from '../systems/DialogueRunner.js';
import { MapEncounters } from '../systems/MapEncounters.js';
import { checkRequires } from '../systems/DialogueConditions.js';
import { JournalWindow } from '../ui/JournalWindow.js';
import { Frame } from '../ui/Frame.js';
import { Tooltip } from '../ui/Tooltip.js';
import { openGameMenu } from '../ui/GameMenu.js';
import { showToast } from '../ui/Toast.js';
import { setBackdrop } from '../ui/Backdrop.js';
import { openWorldMap } from '../ui/WorldMapWindow.js';
import { repLines } from '../systems/Reputation.js';
import { Sfx } from '../systems/Sfx.js';
import traitsData from '../data/commanderTraits.json';

const TRAIT_LABELS = Object.fromEntries(traitsData.map(t => [t.id, t.name]));
import { xpForEncounter } from '../systems/EnemyArchetypes.js';
import battlesData from '../data/battles.json';
import { MapEditor } from '../dev/MapEditor.js';
import { preloadCompanionSheets } from './LoadingScene.js';

const PLACEHOLDER_IMAGE = 'maps/gen/_placeholder.png';

// ─────────────────────────────────────────────────────────────────────────────
// Где в зале «Хромого Лося» сидят спутники из запаса: [x, y, спрайт карты, рост м]
const WAITING_SPOTS = {
  companion_brawler: [1250, 560, 'map_companion_brawler', 1.86],
  companion_healer:  [330, 700, 'map_companion_healer', 1.66],
  holt:              [1000, 560, 'map_holt', 1.8],
  tiss_recruit:      [450, 780, 'map_bandit_archer', 1.75],
  mirko:             [1150, 620, 'map_recruit', 1.74],
  bran:              [1320, 500, 'map_archer_guard', 1.78],
  ressa:             [880, 520, 'map_swamp_elf_girl', 1.8],
};

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
    // Сцена переиспользуется: окна прошлой карты уничтожены вместе с ней, ссылки на них сбрасываем
    this._journalObjs   = null;
    this._doorTimer = null;
    this._doorTarget = null;
    this._extraFollowers = [];   // сцена переиспользуется: спрайты прошлого запуска уже уничтожены
    this._waitingNpcs = {};
    this._bookOverlay   = null;
    this._charSheetOpen = false;
    this._exitCooldown  = 2200;  // мс после спавна - выходы не срабатывают

    const cfg   = MAP_CONFIGS[this.mapKey];
    const rawSpawn = cfg.spawnPoints[this.spawnId] ?? cfg.spawnPoints.default;

    const mapW = 1672, mapH = 941;
    const W = 1280, H = 720;
    const zoom = Math.min(W / mapW, H / mapH);   // ~0.765

    this.cameras.main.setOrigin(0, 0);
    this.cameras.main.setZoom(zoom);
    this.cameras.main.setScroll(0, 0);

    // Фон
    // Новые локации: картинка из поля image (ключ img:<путь>), растягивается на всю карту
    if (this.textures.exists(cfg.bgKey)) {
      this.add.image(mapW / 2, mapH / 2, cfg.bgKey).setScale(1).setDepth(0);
      setBackdrop(this, cfg.bgKey);   // размытый край карты вместо чёрных полос
    } else {
      this.add.image(mapW / 2, mapH / 2, `img:${cfg.image}`).setDisplaySize(mapW, mapH).setDepth(0);
    }

    // Зоны хождения - создаём ДО клампинга спавна
    // Сетка ходьбы: ручная маска из walkgrid.json, иначе из прямоугольников walk
    this.walkable = new WalkableZones(this.mapKey, cfg.walk, WALK_GRIDS[this.mapKey]);
    // this.walkable.drawDebug(this); // раскомментируй для отладки зон

    // Клампим спавн на случай если он вне walkable зоны
    const spawn = this.walkable.clamp(rawSpawn.x, rawSpawn.y);

    // В интерьерах и пещерах все персонажи одного, чуть большего роста (src/data/heights.json, map)
    const s = this._charScale = (cfg.kind === 'interior' || cfg.kind === 'cave') ? HEIGHTS.map.interiorScale : 1;
    this.hero    = new MapUnit(this, spawn.x,       spawn.y, 'map_hero',    { height: Math.round(130 * s), speed: 130, idlePeriod: 2800, paperdoll: false, walkSpriteKey: 'map_hero_walk_side', walkFrames: 29, walkFrameRate: 24, walkFrameContentHeight: 251, idleSpriteKey: 'map_hero_stand', idleFrames: 96, idleFrameRate: 24, idleFrameContentHeight: 251, idleOriginX: 0.56 });
    this.brawler = new MapUnit(this, spawn.x - 65,  spawn.y, 'map_brawler', { height: Math.round(136 * s), speed: 130, idlePeriod: 3400, paperdoll: false, walkSpriteKey: 'map_brawler_walk_v4', walkFrames: 23, walkFrameRate: 24, walkFrameContentHeight: 251, idleSpriteKey: 'map_brawler_stand_v1', idleFrames: 95, idleFrameRate: 24, idleFrameContentHeight: 251 });
    this.healer  = new MapUnit(this, spawn.x - 120, spawn.y, 'map_healer',  { height: Math.round(128 * s), speed: 130, idlePeriod: 2200, paperdoll: false, walkSpriteKey: 'map_healer_walk_v3', walkFrames: 25, walkFrameRate: 24, walkFrameContentHeight: 274, idleSpriteKey: 'map_healer_stand_v1', idleFrames: 95, idleFrameRate: 24, idleFrameContentHeight: 274 }); // 274: в высоту кадра входит посох выше головы

    // Спутники за героем, но только на проходимых клетках (у края карты сдвиг уводил их за кадр)
    [[this.brawler, 65], [this.healer, 120]].forEach(([u, dx]) => {
      const p = this.walkable.clamp(spawn.x - dx, spawn.y);
      const ok = findPath(this.walkable, spawn.x, spawn.y, p.x, p.y, { maxSnap: 0 }) ? p : this.walkable.clamp(spawn.x, spawn.y);
      u.sprite.x = u.targetX = ok.x;
      u.sprite.y = u.targetY = ok.y;
      u.shadow?.setPosition(ok.x, ok.y + 2);
    });

    // После перехода отряд стоит спиной к выходу, из которого пришёл (ближайший выход в 260 px)
    {
      const exits = [...(cfg.exits || []), ...(cfg.tavernEntry ? [cfg.tavernEntry] : [])];
      const near = exits.map(e => ({ cx: e.zone.x + e.zone.w / 2, cy: e.zone.y + e.zone.h / 2 }))
        .map(c => ({ ...c, d: Math.hypot(c.cx - spawn.x, c.cy - spawn.y) })).sort((a, b) => a.d - b.d)[0];
      if (near && near.d < 260 && Math.abs(near.cx - spawn.x) > 20) {
        const faceLeft = near.cx > spawn.x;
        [this.hero, this.brawler, this.healer].forEach(u => { u.sprite.setFlipX?.(faceLeft); u._syncOrigin?.(); });
      }
    }

    this._heroTrail     = [];
    this._trailInterval = 0;

    // Спутники на карте только если они в партии (PartySystem)
    this._applyPartyVisibility();
    // Временная картинка: показываем название, зоны ходьбы и выходы, чтобы карта была проходима
    if (cfg.image === PLACEHOLDER_IMAGE && !this.textures.exists(cfg.bgKey)) this._drawPlaceholderOverlay(cfg);

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
    // Метки выходов: стрелки у края, свечение у дверей, подпись и курсор при наведении (старые подписи labels не нужны)
    this._hoverLabels = [];
    this._exitMarkers = new ExitMarkers(this, cfg, MAP_CONFIGS, exit => this._exitLocked(exit));
    this.input.on('pointermove', (ptr, over) => this._exitMarkers?.onPointerMove(ptr, over));

    // Диалоговая панель (in-world overlay)
    this._dialogue = new DialoguePanel(this);
    // Диалоги из src/data/dialogues/*.json с условиями и репутацией (блок Г)
    this._ws = new WorldState(this.game.registry);
    this._lastGold = SaveSystem.getGold(this.game.registry);
    // Автосохранение при входе на карту в обоих режимах: в Железе сохранение есть с первого шага (этап 8)
    SaveSystem.saveWorld(this.game.registry, this.mapKey, this.spawnId);
    this.game.registry.set(`${this.mapKey}_visited`, true);
    { const v = this._ws.inc(`visits_${this.mapKey}`); this.game.registry.set(`cnt_visits_${this.mapKey}_${v}`, true); }
    // Пошлина: заплатил Корвину один раз, дальше каждый проход лесом 10 монет, пока он жив и без сделки (03_ДИАЛОГИ 6.3)
    {
      const reg = this.game.registry;
      if (this.mapKey === 'forest1' && reg.get('road_open_personal_only') && !reg.get('bandit_commander_killed')
          && !reg.get('korvin_debt_active') && !reg.get('bandit_commander_spared')) {
        const toll = Math.min(10, SaveSystem.getGold(reg));
        if (toll > 0) {
          SaveSystem.addGold(-toll, reg);
          this.time.delayedCall(900, () => this._toast(`Люди Корвина берут пошлину: ${toll} монет`));
        }
      }
    }
    this._runner = new DialogueRunner(this, this._dialogue, this._ws, this._dialogueHooks());
    // Необязательные встречи бестиария (стая, логово, патруль, западня, одиночка, ватага)
    this._encounters = new MapEncounters(this, cfg.encounters, this._ws, {
      battle: (enc, opts) => this._startEncounterBattle(enc, opts),
      talk: enc => this._talkEncounter(enc),
      toast: t => this._toast(t),
    });

    // Дым из трубок
    this._spawnPipeSmoke(cfg);

    // Статические пропсы (мебель и предметы)
    this._spawnProps(cfg);

    // Книги и записки на карте
    this._bookPickups = [];
    this._spawnBookPickups(cfg);
    this._spawnDoors(cfg);

    // Малые интерактивные предметы окружения
    this._inspectables = [];
    this._spawnInspectables(cfg);

    // NPC (статичные, кликабельные)
    this._npcs = [];
    this._spawnNPCs(cfg);

    // Передний слой для объектов, за которыми должен проходить отряд
    this._spawnForegrounds(cfg);

    // Оживление мира: птицы, свет окон, дым, листья/снег/светлячки, вода (src/data/ambience.json)
    this._ambience = new MapAmbience(this, this.mapKey, this.hero);
    // Листы спутников, которых ещё нет в отряде, догружаем в фоне (понадобятся после найма)
    if (preloadCompanionSheets(this, ['companion_brawler', 'companion_healer'])) this.load.start();
    MapEditor.attach(this, cfg); // dev-редактор зон: только с ?dev=1, клавиша E

    // Esc: если открытых окон нет, открывает «Меню» (открытое окно Esc закрывает само)
    this.input.keyboard.on('keydown-ESC', () => {
      if (Frame.current(this) || this._dialogue?.active || this._bookOverlay || this._transitioning) return;
      if (this.time.now - (this._dialogue?._closedAt ?? -1e9) < 150) return;   // тот же Esc только что закрыл разговор
      if (this._charSheetOpen) { this._hideCharSheet(); return; }
      this._openMenu();
    });

    // Клик по карте
    this.input.on('pointerdown', (ptr, over = []) => {
      if (ptr.rightButtonDown()) return;
      if (this._uiBlocksMapClick(over)) return;
      if (over.some(o => o._isDoor)) return;
      const exit = this._exitMarkers?.exitAt(ptr.worldX, ptr.worldY);
      if (exit && this._walkToExit(exit)) return;
      this._walkHeroTo(ptr.worldX, ptr.worldY);
    });

    this._clickMarker = this.add.graphics().setDepth(20);

    // ── Инвентарь: глубокая копия из items.json + синхронизация золота ──
    // Стартовый набор: золото и то, что есть с начала. Квестовые предметы добавит _syncWorldItems, когда они появятся
    this._inventory = JSON.parse(JSON.stringify(itemsData)).filter(it => it.id === 'gold' || it.quantity > 0);
    const savedGold = this.game.registry.get('playerGold') ?? 0;
    const _goldItem = this._inventory.find(it => it.id === 'gold');
    if (_goldItem) _goldItem.quantity = savedGold;
    this._syncCollectedBooksToInventory();
    this._syncCollectedInspectablesToInventory();
    this._syncWorldItems();

    this._buildHUD(cfg);

    // Возврат с боя, начатого из диалога: продолжение разговора (пощада, сдача, награда)
    this.time.delayedCall(700, () => this._resumePendingBattle() || this._runOnEnter(cfg));

    // ─── Dev Grid (клавиша G) ────────────────────────────────────────────
    this._devGrid = null;
    this._devGridLabels = [];
    this._devCursorLabel = this.add.text(0, 0, '', {
      fontSize: '11px', color: '#00FF88', fontFamily: 'monospace',
      stroke: '#000', strokeThickness: 2,
    }).setDepth(999).setScrollFactor(0).setAlpha(0);

    if (import.meta.env.DEV) {
      this.input.keyboard.on('keydown-G', () => this._toggleDevGrid());
      this.input.keyboard.on('keydown-H', () => this._toggleScreenGrid());
      this.input.keyboard.on('keydown-B', () => { if (!window.__mapEditor?.active) this._toggleInvGrid(); });
      this.input.keyboard.on('keydown-J', () => this._toggleFineGrid());
    }
    // TEMP: прод-тест прокачки. Убрать после проверки веток классов.
    if (import.meta.env?.DEV) this.input.keyboard.on('keydown-L', () => this._launchDevLevelUp());

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
      this._fogLayers.forEach(t => { t.tilePositionX += t._speedX * delta / 16.67; }); // по времени, а не по кадрам: плавно при любом FPS
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
    (this._extraFollowers || []).forEach((f, i) => { this._followTrail(f.unit, 40 + i * 12); f.unit.update(delta); });

    this._separateParty();

    // Safety-net: если герой стоит - компаньоны гарантированно в idle (дышат, не шатаются)
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
    this._encounters?.update(delta, this.hero);
    // Шаги героя: дерево в помещениях, снег на Севере, трава снаружи
    if (this.hero.moving) {
      this._stepT = (this._stepT || 0) + delta;
      if (this._stepT > 420) {
        this._stepT = 0;
        const c = MAP_CONFIGS[this.mapKey];
        Sfx.play(this, c.kind === 'interior' || this.mapKey === 'tavern_inside' ? 'step_wood' : c.region === 'Север' ? 'step_snow' : 'step_grass');
      }
    }

    if (this._exitCooldown > 0) this._exitCooldown -= delta;

    if (!this._transitioning && this._exitCooldown <= 0) {
      this._checkExits();
      this._checkTavernEntry();
    }
  }

  _launchDevLevelUp() {
    // Только в dev: добавить опыта до следующего уровня партии и открыть экран уровня
    if (this._transitioning || this.scene.isActive('LevelUpScene')) return;
    const reg = this.game.registry;
    const need = PartySystem.xpTotalFor(PartySystem.getLevel(reg) + 1) - PartySystem.getXp(reg);
    this._grantXp(Math.max(1, need));
  }

  /** Опыт отряду (мирное решение, квест, dev). При новом уровне открывает экран уровня. */
  _grantXp(amount) {
    const reg = this.game.registry;
    const span = PartySystem.addXp(reg, amount);
    if (amount > 0) this._toast?.(`Опыт отряда: +${amount}`);
    if (span.to > span.from) {
      const roster = PartySystem.buildRosterUnits(reg);
      this.scene.launch('LevelUpScene', {
        leveledUnits: roster, allPlayerUnits: roster, toLevel: span.to,
        fromMapKey: this.mapKey, fromSpawnId: this.spawnId,
      });
    } else {
      SaveSystem.saveWorld(reg, this.mapKey, this.spawnId);
    }
    return span;
  }

  _toast(text, icon = null) {
    showToast(this, text, icon);
  }

  // ─── Party ───────────────────────────────────────────────────────────────

  _applyPartyVisibility(reveal = false) {
    const party = PartySystem.getParty(this.game.registry);
    this._syncExtraFollowers(party);
    [[this.brawler, 'companion_brawler'], [this.healer, 'companion_healer']].forEach(([u, id]) => {
      u._hidden = !party.includes(id);
      const vis = !u._hidden;
      if (!vis || reveal) {
        if (vis && reveal) u.sprite.setPosition?.(this.hero.x - 60, this.hero.y);
        u.sprite.setVisible(vis);
        u.shadow?.setVisible(vis);
        if (u._container) u._container.setVisible(vis);
      }
    });
  }

  /**
   * Остальные спутники отряда (Хольт, Тисс, Мирко, Бран, Ресса) идут за героем статичной фигурой
   * с карты (листов ходьбы у них пока нет). Те, кого нет в отряде, убираются.
   */
  _syncExtraFollowers(party) {
    this._extraFollowers = (this._extraFollowers || []).filter(f => {
      if (party.includes(f.id)) return true;
      f.unit.destroy();
      return false;
    });
    party.filter(id => WAITING_SPOTS[id] && !['hero_duelist', 'companion_brawler', 'companion_healer'].includes(id))
      .forEach(id => {
        if (this._extraFollowers.some(f => f.id === id)) return;
        const [, , key, heightM] = WAITING_SPOTS[id];
        if (!this.textures.exists(key)) return;
        const M = HEIGHTS.map;
        const p = this.walkable.clamp(this.hero.x - 90 - this._extraFollowers.length * 40, this.hero.y);
        const unit = new MapUnit(this, p.x, p.y, key, { height: Math.round(M.heroPx * this._charScale * heightM / M.heroM), speed: 130, idlePeriod: 3000, paperdoll: false });
        this._extraFollowers.push({ id, unit });
      });
  }

  _drawPlaceholderOverlay(cfg) {
    const g = this.add.graphics().setDepth(2);
    g.fillStyle(0x8a7a5a, 0.18);
    (cfg.walk || []).forEach(z => g.fillRect(z.x, z.y, z.w, z.h));
    g.fillStyle(0xC9A84C, 0.35);
    (cfg.exits || []).forEach(e => g.fillRect(e.zone.x, e.zone.y, e.zone.w, e.zone.h));
    (cfg.exits || []).forEach(e => {
      const target = MAP_CONFIGS[e.toMap];
      const name = target?.name || e.toMap;
      const lx = Math.min(1560, Math.max(110, e.zone.x + e.zone.w / 2));
      const ly = Math.min(900, Math.max(40, e.zone.y + e.zone.h / 2 - 28));
      this.add.text(lx, ly, name, {
        fontFamily: 'serif', fontSize: '22px', color: '#E8DEC8', stroke: '#000', strokeThickness: 4,
      }).setOrigin(0.5).setDepth(3).setAlpha(0.85);
    });
    this.add.text(836, 120, cfg.name || this.mapKey, {
      fontFamily: 'serif', fontSize: '54px', color: '#C9A84C', stroke: '#000', strokeThickness: 6,
    }).setOrigin(0.5).setDepth(3).setAlpha(0.75);
    this.add.text(836, 175, 'карта в работе', {
      fontFamily: 'serif', fontSize: '22px', color: '#9a8e78', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(3).setAlpha(0.7);
  }

  _followTrail(unit, stepsBack) {
    if (unit._hidden) return;
    // Когда герой стоит - не обновляем цель, компаньоны остаются на месте и дышат
    if (!this.hero.moving) return;
    const idx = Math.max(0, this._heroTrail.length - stepsBack);
    const pos = this._heroTrail[idx];
    if (pos) {
      const clamped = this.walkable.clamp(pos.x, pos.y);
      this._walkCompanionTo(unit, clamped.x, clamped.y);
    }
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
        const nx = b.sprite.x + (dx / dist) * push;
        const ny = b.sprite.y + (dy / dist) * push;
        // Толчок не должен уводить за угол стены: и сам сдвиг, и дорога от новой точки к цели чистые
        const w = this.walkable;
        if (!w.lineClear(b.sprite.x, b.sprite.y, nx, ny) || (b.moving && !w.lineClear(nx, ny, b.targetX, b.targetY))) continue;
        b.sprite.x = nx;
        b.sprite.y = ny;
        b.shadow.setPosition(b.sprite.x, b.sprite.y + 2);
        // Если юнит стоит - обновляем цель чтобы не было обратного движения
        if (!b.moving) {
          b.targetX = b.sprite.x;
          b.targetY = b.sprite.y;
        }
      }
    }
  }

  // ─── Туман (TileSprite - бесконечный скроллинг текстуры) ────────────────
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

      // Несколько точек огня вокруг центра - имитация языков пламени
      const offsets = [
        { dx: 0,   dy:  0,  sc: 1.3  },   // центр - самый высокий
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

      // Дым - поднимается выше и рассеивается
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
          onComplete: flicker,   // рекурсивно - каждый раз новые значения
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

  // Экранная сетка (H) - координаты в пикселях экрана, для позиционирования UI
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
    const hint = this.add.text(SW / zoom / 2, 4 / zoom, 'SCREEN COORDS (H: скрыть)', {
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
      // Основное пламя - оранжево-жёлтые частицы вверх
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
      // Дым - серые частицы чуть выше, медленнее
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
      // Тонкая струйка дыма - медленная, светло-серая, рассеивается
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
    const place = (p) => {
      const img = this.add.image(p.x, p.y, p.key)
        .setOrigin(p.originX ?? 0.5, p.originY ?? 1)
        .setDepth(p.depth ?? p.y + 1); // depth по Y - поверх всего что выше по экрану
      if (p.height) {
        const scale = p.height / img.height;
        img.setScale(scale);
      }
    };
    // Пропсы с полем src (вырезанные из карты перекрыватели) подгружаются здесь же, при входе на карту
    const lazy = (cfg.props || []).filter(p => p.src && !this.textures.exists(p.key));
    (cfg.props || []).forEach(p => { if (!lazy.includes(p)) place(p); });
    if (lazy.length) {
      lazy.forEach(p => {
        this.load.once(`filecomplete-image-${p.key}`, () => { if (this.scene.isActive()) place(p); });
        this.load.image(p.key, p.src);
      });
      this.load.start();
    }
  }

  _spawnForegrounds(cfg) {
    (cfg.foregrounds || []).forEach(p => {
      if (!this.textures.exists(p.key)) return;
      const img = this.add.image(p.x, p.y, p.key)
        .setOrigin(p.originX ?? 0.5, p.originY ?? 1)
        .setDepth(p.depth ?? 2500);
      if (p.height) img.setScale(p.height / img.height);
      if (p.alpha !== undefined) img.setAlpha(p.alpha);
    });
  }

  /**
   * Двери, которые открывают разговор, а не ведут на другую карту (комнаты наверху «Хромого Лося»).
   * maps.json → doors: [{ id, x, y, w, h, label, dialogue, node, glow }]: клик ведёт героя к порогу (низ двери),
   * на месте начинается диалог. glow: тёплый свет у порога (приоткрытая дверь).
   */
  _spawnDoors(cfg) {
    (cfg.doors || []).forEach(d => {
      const zone = this.add.zone(d.x + d.w / 2, d.y + d.h / 2, d.w, d.h).setInteractive({ useHandCursor: true }).setDepth(d.y + d.h);
      zone._isDoor = true;   // клик по двери не уходит в карту
      const label = this.add.text(d.x + d.w / 2, d.y - 8, d.label || 'Дверь', {
        fontFamily: 'Georgia, serif', fontSize: '18px', color: '#f0e0b0', stroke: '#000', strokeThickness: 4,
      }).setOrigin(0.5, 1).setDepth(8501).setAlpha(0);
      zone.on('pointerover', () => label.setAlpha(1));
      zone.on('pointerout', () => label.setAlpha(0));
      zone.on('pointerdown', (p, lx, ly, ev) => {
        ev?.stopPropagation();
        if (this._transitioning || this._dialogue?.active) return;
        this._walkHeroTo(d.x + d.w / 2, d.y + d.h + 30);
        // Цель: конец найденного пути (ближайшая проходимая клетка у порога)
        const end = this.hero._path?.length ? this.hero._path[this.hero._path.length - 1] : { x: this.hero.targetX, y: this.hero.targetY };
        this._doorTarget = { d, tx: end.x, ty: end.y, t: this.time.now };
      });
    });
    if ((cfg.doors || []).length && !this._doorTimer) {
      this._doorTimer = this.time.addEvent({ delay: 150, loop: true, callback: () => {
        const dt = this._doorTarget;
        if (!dt) return;
        const near = Math.hypot(this.hero.x - dt.tx, this.hero.y - dt.ty) < 24;
        if (near || (!this.hero.moving && this.time.now - dt.t > 400)) {
          this._doorTarget = null;
          if (near && this._runner.has(dt.d.dialogue)) { this.hero.stopMove(); this._runner.start(dt.d.dialogue, dt.d.node || null); }
        }
      } });
    }
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
        this._collectBookPickup(book, img, label, p);
      });

      this._bookPickups.push({ img, label, book });
    });
  }

  _spawnInspectables(cfg) {
    (cfg.inspectables || []).forEach(p => {
      if (p.collectFlag && this.game.registry.get(p.collectFlag)) return;
      if (!this.textures.exists(p.key)) return;

      const depth = p.depth ?? p.y + 10;
      const h = p.height ?? 42;
      const img = this.add.image(p.x, p.y, p.key)
        .setOrigin(p.originX ?? 0.5, p.originY ?? 0.5)
        .setDepth(depth)
        .setInteractive({ useHandCursor: true });
      img.setScale(h / img.height);

      const label = this.add.text(p.x, p.y - h / 2 - 8, p.label || p.title || 'Осмотреть', {
        fontFamily: 'serif', fontSize: '12px', color: '#D4AA60',
        stroke: '#000', strokeThickness: 3,
      }).setOrigin(0.5, 1).setDepth(depth + 1).setAlpha(0);

      img.on('pointerover', () => { img.setTint(0xFFEEBB); label.setAlpha(1); });
      img.on('pointerout',  () => { img.clearTint(); label.setAlpha(0); });
      img.on('pointerdown', (pointer, localX, localY, event) => {
        event?.stopPropagation();
        if (this._transitioning || this._dialogue?.active || this._bookOverlay) return;
        this.hero.stopMove();
        this.brawler.stopMove();
        this.healer.stopMove();
        this._showInspectable(p, img, label);
      });

      this._inspectables.push({ img, label, data: p });
    });
  }

  _showInspectable(item, img, label) {
    const hasRewards = Array.isArray(item.rewards) && item.rewards.length > 0 && item.collectFlag;
    const choices = [];

    if (hasRewards) {
      choices.push({
        label: item.takeLabel || 'Забрать найденное.',
        style: 'default',
        onSelect: () => {
          SaveSystem.setFlag(item.collectFlag, true, this.game.registry);
          item.rewards.forEach(reward => this._addInventoryItem(this._inspectableRewardToInventoryItem(reward)));
          img.destroy();
          label.destroy();
        },
      });
    }

    choices.push({
      label: item.inspectLabel || (hasRewards ? 'Оставить.' : 'Отойти.'),
      style: 'retreat',
      onSelect: () => {},
    });

    this._dialogue.show({
      portraitLeft: 'portrait_hero_duelist',
      speakerNameLeft: 'Герой',
      speakerName: item.title || item.label || 'Находка',
      text: item.text || 'Здесь пока нечего прочитать.',
      choices,
    });
  }

  _inspectableRewardToInventoryItem(reward) {
    return {
      id: reward.id,
      name: reward.name,
      type: reward.type || 'misc',
      quantity: reward.quantity ?? 1,
      icon: reward.icon,
      stackable: reward.stackable ?? false,
      description: reward.description || reward.name,
    };
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

  _syncCollectedInspectablesToInventory() {
    Object.values(MAP_CONFIGS).forEach(cfg => {
      (cfg.inspectables || []).forEach(item => {
        if (!item.collectFlag || !this.game.registry.get(item.collectFlag)) return;
        (item.rewards || []).forEach(reward => {
          this._addInventoryItem(this._inspectableRewardToInventoryItem(reward), { render: false });
        });
      });
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

  _collectBookPickup(book, img, label, p = {}) {
    if (book.collectFlag) SaveSystem.setFlag(book.collectFlag, true, this.game.registry);
    // Взять без спроса (поле theftFlag у подбора): свидетель запоминает, если не было разрешения allowedFlag
    if (p.theftFlag && !(p.allowedFlag && this.game.registry.get(p.allowedFlag))) {
      SaveSystem.setFlag(p.theftFlag, true, this.game.registry);
      if (p.theftText) this.time.delayedCall(300, () => this._toast(p.theftText));
    }
    this._addInventoryItem(this._bookToInventoryItem(book));
    img.destroy();
    label.destroy();
    this._showBookReader(book.id);
  }

  /** Появление по флагам и условиям (блок Г): showIfFlag, hideIfFlag, showIf. */
  _npcConditionsMet(npc) {
    if (npc.waitingFor) {
      const reg = this.game.registry;
      return PartySystem.getRoster(reg).includes(npc.waitingFor) && !PartySystem.getParty(reg).includes(npc.waitingFor);
    }
    if (npc.showIfFlag && !this.game.registry.get(npc.showIfFlag)) return false;
    if (npc.hideIfFlag && this.game.registry.get(npc.hideIfFlag)) return false;
    if (npc.showIf && this._ws && !checkRequires(npc.showIf, this._ws).ok) return false;
    return true;
  }

  /** После диалога или боя: убрать NPC, чьё условие больше не выполняется, и показать новых. */
  _refreshNpcs() {
    if (!this._npcs) return;
    this._npcs = this._npcs.filter(n => {
      if (this._npcConditionsMet(n.cfg)) return true;
      [n.sprite, n.shadow, n.label, n.hoverImg, n.hoverName].forEach(o => {
        if (!o) return;
        this.tweens.killTweensOf(o);
        o.disableInteractive?.();
        this.tweens.add({ targets: o, alpha: 0, duration: 400, onComplete: () => o.destroy() });
      });
      return false;
    });
    this._spawnNPCs(MAP_CONFIGS[this.mapKey]);
  }

  /**
   * Спутники в запасе ждут там, где их наняли или оставили (registry waitAt_<id> = { map, x, y }),
   * без такой метки в зале «Хромого Лося»; клик открывает выбор, кто идёт в отряде.
   */
  _waitingCompanionNpcs() {
    this._waitingNpcs = this._waitingNpcs || {};
    const reg = this.game.registry;
    return Object.entries(WAITING_SPOTS).map(([id, [tx, ty, spriteKey, heightM]]) => {
      const u = unitsData.find(d => d.id === id);
      if (!u) return null;
      const wa = reg.get(`waitAt_${id}`);
      if (wa ? wa.map !== this.mapKey : this.mapKey !== 'tavern_inside') return null;
      const x = wa ? wa.x : tx, y = wa ? wa.y : ty;
      const key = `${id}@${this.mapKey}:${x},${y}`;   // новое место ожидания: новый NPC
      return (this._waitingNpcs[key] = this._waitingNpcs[key] || {
        id: `waiting_${id}`, waitingFor: id, name: u.personalName || u.name, x, y, spriteKey, heightM,
        portraitKey: `portrait_${u.spriteKey || id}`, hoverPortrait: true,
        onTalk: () => this._showPartyManager(),
      });
    }).filter(Boolean);
  }

  _spawnNPCs(cfg) {
    [...(cfg.npcs || []), ...this._waitingCompanionNpcs()].forEach(npc => {
      if (this._npcs.some(n => n.cfg === npc)) return;   // уже на карте (повторный вызов из _refreshNpcs)
      // NPC с vanishKey исчезает навсегда после разговора (флаг сохраняется в registry)
      if (npc.vanishKey && this.game.registry.get(npc.vanishKey)) return;
      if (!this._npcConditionsMet(npc)) return;
      // Нет арта: временная фигура (серый силуэт), имя видно при наведении
      if (!this.textures.exists(npc.spriteKey)) this._ensureNpcPlaceholder(npc);
      const h = this._npcHeight(npc);
      const tex = this.textures.get(npc._tex || npc.spriteKey);
      const frameKey = npc.frame ?? (npc.ambientAnim ? 0 : '__BASE');
      const frame = tex.get(frameKey) || tex.get('__BASE');
      const texHeight = frame?.height || tex.getSourceImage().height;
      const ratio = texHeight > 0 ? h / texHeight : 1;

      // Тень
      const shadow = this.add.ellipse(npc.x, npc.y + 8, 55, 16, 0x000000, 0.35).setDepth(1);

      // Для sway/anchorFeet-NPC: origin (0.5, 1) - движение вокруг ног.
      // Компенсируем смещение: origin снизу поднимает спрайт, добавляем h/2 к y.
      const anchoredToFeet = npc.sway || npc.anchorFeet;
      const spriteOriginY = anchoredToFeet ? 1 : 0.5;
      const spriteY       = anchoredToFeet ? npc.y + h / 2 : npc.y;
      const animated = !!getNpcAnimConfig(npc.spriteKey)?.idle;   // покадровая стойка и бытовые движения
      const spriteFactory = (npc.ambientAnim || animated) ? this.add.sprite.bind(this.add) : this.add.image.bind(this.add);
      const sprite = spriteFactory(npc.x, spriteY, npc._tex || npc.spriteKey, frameKey)
        .setOrigin(0.5, spriteOriginY)
        .setScale(ratio)
        .setDepth(npc.y)
        .setFlipX(npc.flipX || false)
        .setInteractive({ useHandCursor: true });
      const breath = npc.breathing || {};
      if (animated) {
        // Ноги: у sway/anchorFeet это spriteY, у остальных низ картинки
        attachNpcAnimations(this, sprite, npc, h, anchoredToFeet ? spriteY : npc.y + h / 2);
      } else {
        this._addBreathingTween(sprite, breath.period || (3000 + Math.random() * 600), breath);
        this._setupAmbientNpcAnimation(sprite, npc);
      }

      // Пьяное покачивание (sway: true) - тело качается, ноги стоят на месте
      if (npc.sway && !animated) {
        // Вращение вокруг нижнего центра (ног) - x не двигаем
        this.tweens.add({
          targets:  sprite,
          angle:    { from: -3, to: 3 },
          duration: 2000,
          yoyo:     true,
          repeat:   -1,
          ease:     'Sine.easeInOut',
        });
        // Лёгкое смещение верхней части тела (через scaleX) - как инерция при покачивании
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

      // Имя над головой - только по hover
      const label = this.add.text(npc.x, npc.y - h / 2 - 12, npc.name, {
        fontFamily: 'serif', fontSize: '14px', color: '#D4AA60',
        stroke: '#000', strokeThickness: 3,
      }).setOrigin(0.5, 1).setDepth(npc.y + 1).setAlpha(0);

      // Hover-портрет справа (если задан флаг hoverPortrait)
      // Hover-портрет справа - только PNG, никакого фона/рамки
      let _hImg, _hName;
      if (npc.hoverPortrait && npc.portraitKey) {
        const hW = 120, hH = 145, hx = 1594;
        _hImg  = this.add.image(hx, 222, npc.portraitKey).setDepth(60).setScrollFactor(0).setAlpha(0);
        _hImg.setScale(Math.min(hW / _hImg.width, hH / _hImg.height));
        _hName = this.add.text(hx, 295, npc.name, {
          fontSize: '11px', color: '#CC9944', fontFamily: 'serif',
        }).setOrigin(0.5).setDepth(61).setScrollFactor(0).setAlpha(0);
      }

      // Hover - свечение + показываем имя
      sprite.on('pointerover',  () => {
        sprite.setTint(0xFFEEBB); label.setAlpha(1);
        if (_hImg) { _hImg.setAlpha(1); _hName.setAlpha(1); }
      });
      sprite.on('pointerout',   () => {
        sprite.clearTint(); label.setAlpha(0);
        if (_hImg) { _hImg.setAlpha(0); _hName.setAlpha(0); }
      });

      // Клик - диалог
      sprite.on('pointerdown', () => {
        if (this._transitioning || this._dialogue?.active) return;
        this.hero.stopMove();
        this.brawler.stopMove();
        this.healer.stopMove();
        // Помечаем разговор состоявшимся - при следующем визите NPC исчезнет
        if (npc.vanishKey) this.game.registry.set(npc.vanishKey, true);
        this._talkNpc = npc;   // где стоит собеседник: нанятый без места в отряде будет ждать здесь же
        sprite.clearTint(); label.setAlpha(0);
        if (_hImg) { _hImg.setAlpha(0); _hName.setAlpha(0); }   // мини-портрет не висит весь разговор
        if (npc.onTalk) { npc.onTalk(); return; }
        if (npc.dialogue && this._runner.has(npc.dialogue)) {
          this._runner.start(npc.dialogue, npc.dialogueStart || null);
          return;
        }
        this._showNpcDialogue(npc, this._resolveRootDialogue(npc));
      });

      this._npcs.push({ sprite, shadow, label, cfg: npc, hoverImg: _hImg, hoverName: _hName });
    });
  }

  /** Рост NPC в мировых px: по heightM от роста героя, иначе height (подобран при герое heroPx), в помещении крупнее. */
  _npcHeight(npc) {
    const M = HEIGHTS.map;
    if (npc.heightM) return Math.round(M.heroPx * this._charScale * npc.heightM / M.heroM);
    return Math.round((npc.height || M.heroPx) * this._charScale);
  }

  _ensureNpcPlaceholder(npc) {
    const key = 'npc_placeholder';
    if (!this.textures.exists(key)) {
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      g.fillStyle(0x3a3a40, 1);
      g.fillEllipse(40, 30, 44, 50);
      g.fillRoundedRect(14, 52, 52, 110, 18);
      g.lineStyle(3, 0x15151a, 1);
      g.strokeEllipse(40, 30, 44, 50);
      g.generateTexture(key, 80, 164);
      g.destroy();
    }
    // spriteKey остаётся: по нему NpcAnimations подхватит покадровые листы, когда они появятся
    npc._tex = key;
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
        if (ch.setFlag) SaveSystem.setFlag(ch.setFlag, true, this.game.registry);
        if (ch.startBattle) {
          this._startBattle({
            battleId: ch.startBattle,
            startedFlag: ch.startedFlag,
          });
          return;
        }
        // ch.close - принудительно закрыть, не идти дальше
        if (ch.close) return;
        // ch.next - явный переход; иначе автоматический по позиции
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
    if (this._runner?.has('korvin')) {
      this.hero.stopMove();
      this._runner.start('korvin', type === 'warrior' ? 'kul' : 'tiss');
      return;
    }
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
    if (this._runner?.has('korvin')) {
      this._runner.start('korvin');
      return;
    }
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
          // Без кубика: уровень 3+ или Страх 2+ (15_ПРОМПТ, раздел 7)
          disabled: !this._canIntimidateKorvin(),
          reason:   'нужен уровень 3 или Страх 2',
          onSelect: () => this._tryIntimidate(bandit),
        },
        {
          label:    'Мы вернемся позже.',
          style:    'retreat',
          onSelect: () => {
            bandit.encountered = false; // сбрасываем - если вернутся, диалог снова
            this._transitionTo('tavern_map', 'tavern_exit');
          },
        },
      ],
    });
  }

  _partyLevel() {
    const reg = this.game.registry;
    if (reg.get('partyLevel')) return reg.get('partyLevel');
    const hero = (SaveSystem.load()?.units || []).find(u => u.id === 'hero_duelist');
    return hero?.level || 1;
  }

  _dialogueHooks() {
    const reg = this.game.registry;
    return {
      startBattle: (cfg, dlgId) => {
        reg.set('pendingBattle', { battleId: cfg.battleId, dlg: dlgId, onWin: cfg.onWin || null, onLose: cfg.onLose || null });
        this._startBattle({ battleId: cfg.battleId, startedFlag: cfg.startedFlag });
      },
      giveXp: x => this._grantXp(this._resolveXp(x)),
      recruit: id => this._recruit(id),
      dismiss: id => { PartySystem.bench(reg, id); this._applyPartyVisibility(); },
      transition: (map, spawn) => this._transitionTo(map, spawn),
      refresh: () => {
        const g = SaveSystem.getGold(reg);
        if (this._lastGold !== undefined && g !== this._lastGold) Sfx.play(this, 'coins');
        this._lastGold = g;
        this._refreshGoldHud(); this._syncWorldItems();
      },
      rest: () => this._rest(),
      dismissForever: id => { PartySystem.dismiss(reg, id); this._applyPartyVisibility(true); this._toast('Спутник ушёл'); },
      loseTrait: () => this.time.delayedCall(120, () => this._chooseTraitToLose()),
      chapterEnd: () => this.time.delayedCall(300, () => {
        SaveSystem.saveWorld(reg, this.mapKey, this.spawnId);
        this._transitioning = true;
        this.scene.start('ChapterEndScene', { fromMapKey: 'tavern_map', fromSpawnId: 'tavern_exit' });
      }),
      openParty: () => this._showPartyManager(),
      onEffects: () => SaveSystem.saveWorld(reg, this.mapKey, this.spawnId),
      onClose: () => { SaveSystem.saveWorld(reg, this.mapKey, this.spawnId); this._refreshNpcs(); },
    };
  }

  /** Клик по HUD, окну или во время перехода не двигает героя. */
  _uiBlocksMapClick(over) {
    if (this._transitioning || this._bookOverlay || this._journalObjs || this._charSheetOpen || Frame.current(this)) return true;
    if (this._dialogue?.active) return true;
    // Всё, что приколото к экрану (HUD, плеер, окна), перехватывает клик
    return over.some(o => o.scrollFactorX === 0);
  }

  /** «Меню»: продолжить, громкость, выйти в титул (с сохранением мира). */
  _openMenu() {
    if (this._charSheetOpen) this._hideCharSheet();
    openGameMenu(this, { onExit: () => {
      SaveSystem.saveWorld(this.game.registry, this.mapKey, this.spawnId);
      this._transitioning = true;
      this.cameras.main.fade(400, 0, 0, 0, false, (c, p) => { if (p === 1) this.scene.start('BootScene'); });
    } });
  }

  /** «Карта»: схема посещённых мест по графу выходов. */
  _openWorldMap() {
    if (this._charSheetOpen) this._hideCharSheet();
    const reg = this.game.registry;
    const visited = new Set(Object.keys(MAP_CONFIGS).filter(k => reg.get(`${k}_visited`) || k === this.mapKey));
    openWorldMap(this, { maps: MAP_CONFIGS, visited, current: this.mapKey, start: START_MAP });
  }

  _toggleJournal() {
    if (this._journalObjs && !this._journalObjs.closed) { this._journalObjs.close(); return; }
    if (this._charSheetOpen) this._hideCharSheet();   // одно окно за раз
    this._journalObjs = new JournalWindow(this, this._ws, { onClose: () => { this._journalObjs = null; } });
  }

  /** Предметы из WorldState (квестовые, 06_КВЕСТЫ 8) в инвентарь. */
  _syncWorldItems() {
    const owned = this.game.registry.get('items') || {};
    Object.entries(owned).forEach(([id, n]) => {
      if (!n) return;
      const def = itemsData.find(it => it.id === id);
      if (def && !this._inventory?.some(it => it.id === id)) this._addInventoryItem({ ...def, quantity: n }, { render: true });
    });
  }

  /** Плата памятью Горному Королю: герой теряет одну черту на выбор (03_ДИАЛОГИ 11). */
  _chooseTraitToLose() {
    const reg = this.game.registry;
    const save = SaveSystem.load();
    const hero = (save?.units || []).find(u => u.id === 'hero_duelist');
    const traits = [...new Set(hero?.commanderTraits || [])];
    if (!traits.length) {
      this._dialogue.show({ portraitLeft: 'portrait_hero_duelist', speakerName: 'Горный Король', portraitRight: 'portrait_mountain_king',
        text: 'Помнить нечего. Гора ждёт.', choices: [{ label: 'Уйти.', style: 'retreat', onSelect: () => {} }] });
      return;
    }
    this._dialogue.show({
      portraitLeft: 'portrait_hero_duelist', portraitRight: 'portrait_mountain_king', speakerName: 'Горный Король',
      text: 'Что забудет герой?',
      choices: traits.map(t => ({
        label: TRAIT_LABELS[t] || t,
        onSelect: () => {
          const i = hero.commanderTraits.lastIndexOf(t);
          hero.commanderTraits.splice(i, 1);
          if (t === 'commander') PartySystem.setSlots(reg, PartySystem.getSlots(reg) - 1);
          if (t === 'own_road') {
            hero.maxHp = Math.round(hero.maxHp / 1.12); hero.baseMaxHp = Math.round((hero.baseMaxHp ?? hero.maxHp) / 1.12);
            hero.hp = Math.min(hero.hp, hero.maxHp);
            hero.damage = { min: Math.round(hero.damage.min / 1.12), max: Math.round(hero.damage.max / 1.12) };
          }
          reg.set(`trait_${t}`, hero.commanderTraits.includes(t));
          reg.set('mountain_king_paid_memory', true);
          reg.set('north_closed', false);
          SaveSystem.writeRaw(save);
          SaveSystem.saveWorld(reg, this.mapKey, this.spawnId);
          this._toast(`Забыто: ${TRAIT_LABELS[t] || t}. Перевал открыт.`);
        },
      })),
    });
  }

  /** Отдых: полное HP, Сборы, раны сняты, точка возврата Хроники. */
  _rest() {
    PartySystem.restAll(this.game.registry, this.mapKey, this.spawnId);
    this._toast('Отряд отдохнул');
  }

  /** Кто идёт в отряде, кто ждёт: список в диалоговой панели (без нового арта). */
  _showPartyManager() {
    const reg = this.game.registry;
    const names = Object.fromEntries(unitsData.map(u => [u.id, u.personalName || u.name]));
    const party = PartySystem.getParty(reg);
    const others = PartySystem.getRoster(reg).filter(id => id !== 'hero_duelist');
    const free = PartySystem.getSlots(reg) - party.length;
    const choices = others.map(id => party.includes(id)
      ? { label: `${names[id]}: пусть ждёт в «Хромом Лосе»`, style: 'retreat', onSelect: () => { PartySystem.bench(reg, id); this._applyPartyVisibility(true); this._refreshNpcs(); this._showPartyManager(); } }
      : { label: `${names[id]}: взять в отряд`, disabled: free <= 0, reason: PartySystem.getSlots(reg) < 2 ? 'место в отряде откроется на 2 уровне' : 'нет места в отряде', onSelect: () => { PartySystem.activate(reg, id); this._applyPartyVisibility(true); this._recruit(id); this._refreshNpcs(); this._showPartyManager(); } });
    choices.push({ label: 'Готово.', style: 'default', onSelect: () => SaveSystem.saveWorld(reg, this.mapKey, this.spawnId) });
    this._dialogue.show({
      portraitLeft: 'portrait_hero_duelist',
      speakerName: 'Отряд',
      text: others.length
        ? `Мест в отряде: ${PartySystem.getSlots(reg)}. Сейчас идут: ${party.map(id => names[id]).join(', ')}.`
        : 'Пока с вами никого нет.',
      choices,
    });
  }

  /** Опыт: число, «battle:<id>» (как за бой) или тип встречи (minor/standard/hard/boss/quest). */
  _resolveXp(x) {
    if (typeof x === 'number') return x;
    if (typeof x === 'string' && x.startsWith('battle:')) {
      return battlesData.find(b => b.id === x.slice(7))?.xpReward ?? 0;
    }
    if (typeof x === 'string') return xpForEncounter(PartySystem.getLevel(this.game.registry), x);
    return 0;
  }

  _recruit(id) {
    const reg = this.game.registry;
    const where = PartySystem.recruit(reg, id);
    if (!where) return;
    // Без места в отряде спутник ждёт в зале «Хромого Лося» (решение Максима 27.10)
    reg.remove(`waitAt_${id}`);
    this._refreshNpcs();
    this._toast(where === 'party' ? 'В отряде новый человек'
      : PartySystem.getSlots(reg) < 2 ? 'Ждёт в «Хромом Лосе»: место в отряде откроется на 2 уровне' : 'Ждёт в «Хромом Лосе»: в отряде нет места');
    this._applyPartyVisibility(true);
    // Новичок входит на уровне партии: экран уровней для него одного
    const lvl = PartySystem.getLevel(reg);
    const unit = PartySystem.buildRosterUnits(reg).find(u => u.id === id);
    if (unit && (unit.level || 1) < lvl) {
      this.time.delayedCall(400, () => this.scene.launch('LevelUpScene', {
        leveledUnits: [unit], allPlayerUnits: [unit], toLevel: lvl, fromMapKey: this.mapKey, fromSpawnId: this.spawnId,
      }));
    } else if (unit) {
      SaveSystem.save([unit], this.mapKey, this.spawnId, reg);
    }
  }

  _startEncounterBattle(enc, opts = {}) {
    if (this._transitioning) return;
    const reg = this.game.registry;
    this.hero.stopMove();
    // Реплика перед боем (засада Корвина): бой запускает сам диалог
    if (enc.preDialogue && this._runner.has(enc.preDialogue) && !opts.skipDialogue) {
      this._runner.start(enc.preDialogue, enc.preNode || null);
      return;
    }
    reg.set('pendingBattle', { battleId: enc.battleId, encounterId: enc.id, dlg: enc.dialogue || null, onWin: enc.onWin || null });
    reg.set('battleAmbush', !!opts.ambush);
    if (opts.ambush) this._toast('Засада!');
    this._startBattle({ battleId: enc.battleId });
  }

  _talkEncounter(enc) {
    if (enc.dialogue && this._runner.has(enc.dialogue)) {
      this._runner.start(enc.dialogue, enc.dialogueStart || null);
      return;
    }
    this.hero.stopMove();
    this._dialogue.show({
      portraitLeft: 'portrait_hero_duelist',
      speakerName: enc.name || '',
      text: `${enc.name || 'Существо'} не ищет боя. Можно пройти мимо.`,
      choices: [
        { label: '[Напасть]', style: 'attack', onSelect: () => this._startEncounterBattle(enc) },
        { label: 'Уйти.', style: 'retreat', onSelect: () => {} },
      ],
    });
  }

  /** Сцена при входе на карту (поле onEnter): первая подходящая, один раз. */
  _runOnEnter(cfg) {
    const reg = this.game.registry;
    for (const e of (cfg.onEnter || [])) {
      if (e.once && reg.get(e.once)) continue;
      if (e.showIf && !checkRequires(e.showIf, this._ws).ok) continue;
      if (!this._runner.has(e.dialogue)) continue;
      if (e.once) reg.set(e.once, true);
      this.hero.stopMove();
      this._runner.start(e.dialogue, e.node || null);
      return true;
    }
    return false;
  }

  _resumePendingBattle() {
    const reg = this.game.registry;
    const pb = reg.get('pendingBattle');
    if (!pb || reg.get('lastBattleId') !== pb.battleId) return false;
    const result = reg.get('lastBattleResult');
    reg.remove('pendingBattle');
    if (result !== 'victory') return false;
    if (pb.encounterId) { reg.set(`enc_${pb.encounterId}_done`, true); this._encounters?.finish(pb.encounterId); }
    (reg.get('lastSurrendered') || []).forEach(id => reg.set(`surrendered_${id}`, true));
    (reg.get('lastBattleDead') || []).forEach(id => reg.set(`dead_${id}`, true));
    if (pb.onWin && pb.dlg) {
      this.hero.stopMove();
      this._runner.start(pb.dlg, pb.onWin);
      return true;
    }
    return false;
  }

  _refreshGoldHud() {
    const g = this._inventory?.find(it => it.id === 'gold');
    if (g) g.quantity = SaveSystem.getGold(this.game.registry);
  }

  _canIntimidateKorvin() {
    return this._partyLevel() >= 3 || (this.game.registry.get('rep_fear') || 0) >= 2;
  }

  _startBattle(options = {}) {
    const battleId = options.battleId || 'korvin_gang';
    const startedFlag = options.startedFlag || (battleId === 'bandit_patrol' ? 'bandit_fight_started' : `${battleId}_started`);
    this.game.registry.set(startedFlag, true);
    this._transitioning = true;
    this.time.delayedCall(200, () => {
      this.cameras.main.fade(500, 0, 0, 0, false, (cam, progress) => {
        if (progress === 1) {
          this.scene.start('LoadingScene', {
            destination: 'BattleScene',
            destinationData: { fromMapKey: this.mapKey, fromSpawnId: this.spawnId, battleId },
          });
        }
      });
    });
  }

  /** Бандит пропускает - за "дань" или просто пугается молчания */
  _banditLetThrough(bandit) {
    // Пошлина 30 монет, после первой оплаты 60 (01_БАЛАНС 9)
    const reg = this.game.registry;
    const toll = reg.get('bandit_paid') ? 60 : 30;
    const gold = SaveSystem.getGold(reg);
    this._dialogue.show({
      portraitLeft:  'portrait_hero_duelist',
      portraitRight: 'portrait_bandit_commander',
      speakerName:   'Корвин Сухой',
      text: `"Разум живет дольше гордости. ${toll} монет, и проходите. Но дорога назад будет стоить отдельно."`,
      choices: [
        {
          label:    `Заплатить ${toll}.`,
          style:    'default',
          disabled: gold < toll,
          reason:   `у тебя ${gold} монет`,
          onSelect: () => {
            SaveSystem.addGold(-toll, reg);
            reg.set('bandit_paid', true);
            this._refreshGoldHud?.();
            this._banditRetreat(bandit);
          },
        },
        {
          label:    'Нет. Тогда в бой.',
          style:    'attack',
          onSelect: () => this._startBattle(),
        },
        {
          label:    'Мы вернемся позже.',
          style:    'retreat',
          onSelect: () => { bandit.encountered = false; },
        },
      ],
    });
  }

  /** Запугивание - 50/50 */
  _tryIntimidate(bandit) {
    const success = this._canIntimidateKorvin();
    if (success) this.game.registry.set('rep_fear', Math.min(5, (this.game.registry.get('rep_fear') || 0) + 1));
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
    // Все трое остаются на месте - можно пройти мимо
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

  _exitLocked(exit) {
    const reg = this.game.registry;
    return !!((exit.lockedIfFlag && reg.get(exit.lockedIfFlag)) || (exit.requiresFlag && !reg.get(exit.requiresFlag)));
  }

  /** Клик по выходу: герой идёт к ближайшей достижимой клетке внутри зоны выхода. */
  _walkToExit(item) {
    if (window.__mapEditor?.active) return false;
    const w = this.walkable, z = item.zone;
    const heroCell = w.open(w.cellOf(this.hero.x, this.hero.y)) ? w.cellOf(this.hero.x, this.hero.y) : w.nearestCell(this.hero.x, this.hero.y);
    if (heroCell < 0) return false;
    // Клетка цели в глубине зоны (герой останавливается в паре px от точки, на границе выход не сработал бы)
    let best = null, bestD = Infinity;
    for (const m of [8, 0]) {
      for (let i = 0; i < w.cells.length; i++) {
        if (!w.cells[i] || w.comp[i] !== w.comp[heroCell]) continue;
        const p = w.center(i);
        if (p.x < z.x + m || p.x > z.x + z.w - m || p.y < z.y + m || p.y > z.y + z.h - m) continue;
        const d = Math.hypot(p.x - this.hero.x, p.y - this.hero.y);
        if (d < bestD) { bestD = d; best = p; }
      }
      if (best) break;
    }
    if (!best) return false;
    const res = findPath(w, this.hero.x, this.hero.y, best.x, best.y);
    if (!res) return false;
    this.hero.followPath(res.points);
    this._showClickMarker(best.x, best.y);
    return true;
  }

  /** Прямоугольники HUD в мировых px: подписи выходов их обходят. */
  hudRects() {
    return UI.hud.map(([x, y, w, h]) => new Phaser.Geom.Rectangle(x, y, w, h));
  }

  _checkExits() {
    const cfg = MAP_CONFIGS[this.mapKey];
    for (const exit of (cfg.exits || [])) {
      if (this._inZone(this.hero.x, this.hero.y, exit.zone)) {
        if (!MAP_CONFIGS[exit.toMap]) continue;
        const locked = this._exitLocked(exit);
        if (locked) {
          this._showLockedExit(exit);
          return;
        }
        this._transitionTo(exit.toMap, exit.spawnId);
        return;
      }
    }
  }

  // Закрытый выход: подпись и шаг назад от края
  _showLockedExit(exit) {
    if (this._lockedMsgCd > this.time.now) return;
    this._lockedMsgCd = this.time.now + 2500;
    const z = exit.zone;
    const back = this.walkable.clamp(this.hero.x + (z.x < 200 ? 90 : z.x > 1400 ? -90 : 0), this.hero.y + (z.y < 300 ? 90 : z.y > 800 ? -90 : 0));
    this.hero.moveTo(back.x, back.y);
    this._toast(exit.lockedText || 'Путь закрыт.', 'icon_shield');
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
    Sfx.play(this, 'door');
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

  /** Герой идёт к точке по пути. Нет пути (клик в лес, небо, крышу далеко от дороги): стоит, знак «нельзя». */
  _walkHeroTo(x, y) {
    if (window.__mapEditor?.active) return false;   // редактор зон: клики рисуют маску
    const res = findPath(this.walkable, this.hero.x, this.hero.y, x, y);
    if (!res) { this._showNoGoMarker(x, y); return false; }
    this.hero.followPath(res.points);
    const end = res.points[res.points.length - 1];
    this._showClickMarker(end.x, end.y);
    return true;
  }

  /** Спутник к точке следа: напрямую, если по прямой проходимо, иначе в обход. */
  _walkCompanionTo(unit, x, y) {
    if (this.walkable.lineClear(unit.x, unit.y, x, y, 4)) { unit.moveTo(x, y); return; }
    // Уже идёт в обход к той же точке: путь не пересчитываем каждый кадр
    if (unit._path && unit._pathGoal && Math.hypot(unit._pathGoal.x - x, unit._pathGoal.y - y) < 40) return;
    const res = findPath(this.walkable, unit.x, unit.y, x, y);
    if (!res) return;
    unit.followPath(res.points);
    unit._pathGoal = { x, y };
  }

  _showNoGoMarker(x, y) {
    const g = this.add.graphics().setDepth(20);
    g.lineStyle(3, 0xA03028, 0.9);
    g.strokeCircle(x, y, 13);
    g.lineBetween(x - 9, y - 9, x + 9, y + 9);
    this.tweens.add({ targets: g, alpha: 0, delay: 250, duration: 450, onComplete: () => g.destroy() });
  }

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
    // Подсказка «Кликни чтобы идти» убрана (раунд 2: мельче 11 px и налезала на имя собеседника)

    // ── Портреты партии ───────────────────────────────────────────────
    // Позиционированы по аннотации:
    //   Экран: x=0–120px, y=180–555px
    //   zoom=0.765 → world = screen/0.765
    const party = PartySystem.getParty(this.game.registry);
    // Все в отряде (до четырёх): портрет по spriteKey, подпись личным именем
    const portraits = party.map(id => {
      const u = unitsData.find(d => d.id === id) || {};
      return { id, key: `portrait_${u.spriteKey || id}`, label: id === 'hero_duelist' ? 'Дуэлянт' : (u.personalName || u.name || id) };
    }).filter(p => this.textures.exists(p.key));
    // Портреты: ряд под плеером в левом верхнем углу (колонка вдоль левого края закрывала выходы с карты)
    const cardW  = 100, cardH = 100;
    const startX = 58, gapX = 110, cy = 100;
    const UI_DEPTH = 9000; // всегда поверх персонажей карты
    portraits.forEach((p, i) => {
      const cx = startX + i * gapX;
      const img = this.add.image(cx, cy, p.key).setDepth(UI_DEPTH).setScrollFactor(0).setInteractive();
      img.setScale(Math.min(cardW / img.width, cardH / img.height));
      this.add.text(cx, cy + cardH / 2 + 12, p.label, {
        fontSize: '15px', color: '#BBBBAA', fontFamily: 'serif', stroke: '#000000', strokeThickness: 3,
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

  _buildCharacterSheetChars() {
    const save = SaveSystem.load();
    const savedUnitsById = Object.fromEntries((save?.units || []).map(u => [u.id, u]));
    // Имена навыков из skills.json; вид персонажа по spriteKey (Хольт, Тисс, Бран, Ресса и другие наёмные)
    const skillName = id => skillsData.find(sk => sk.id === id)?.name || id;
    const metaFor = u => {
      const key = u.spriteKey || u.id;
      return {
        tabLabel: u.personalName || (u.id === 'hero_duelist' ? 'Дуэлянт' : u.name),
        portrait: `portrait_${key}`,
        sprite: key,
        mapSprite: u.id === 'hero_duelist' ? 'map_hero' : this.textures.exists(`map_${key}`) ? `map_${key}` : `map_${u.id}`,
        desc: u.description,
      };
    };

    return PartySystem.getParty(this.game.registry)
      .map(id => {
        const baseUnit = unitsData.find(u => u.id === id);
        const savedUnit = savedUnitsById[id] || {};
        const unit = baseUnit ? {
          ...baseUnit,
          ...savedUnit,
          damage: { ...(baseUnit.damage || {}), ...(savedUnit.damage || {}) },
          resources: { ...(baseUnit.resources || {}), ...(savedUnit.resources || {}) },
          skills: Array.isArray(savedUnit.skills) ? savedUnit.skills : baseUnit.skills,
          passives: Array.isArray(savedUnit.passives) ? savedUnit.passives : baseUnit.passives,
        } : null;
        if (!unit) return null;
        const meta = metaFor(unit);
        const cls = classesData.find(c => c.id === unit.classId || c.unitId === unit.id) || null;
        const branch = cls?.branches?.find(b => b.id === unit.branchId) || null;
        const unlockLevel = Math.min(...(cls?.branches || []).map(b => b.unlockLevel || 1));
        const branchPreview = (cls?.branches || []).map(b => b.name).join(' / ');
        const resourceId = cls?.resource?.id;
        const resourceValue = resourceId ? (unit.resources?.[resourceId] ?? cls.resource.startsCombat ?? 0) : null;
        const skills = (unit.skills || []).map(skillName);
        // Пистолет одной строкой с зарядами (как одна кнопка в бою)
        const pistolIdx = (unit.skills || []).indexOf('pistol_shot');
        const charges = unit.resources?.pistol_charges || 0;
        if (pistolIdx >= 0) skills[pistolIdx] = `${skillName('pistol_shot')} (зарядов: ${charges})`;
        else if (charges > 0) skills.push(`${skillName('pistol_shot')} (зарядов: ${charges})`);

        return {
          id,
          tabLabel: meta.tabLabel,
          portrait: meta.portrait,
          name: unit.personalName ? `${unit.personalName}, ${unit.name.toLowerCase()}` : unit.name,
          sprite: meta.sprite,
          mapSprite: meta.mapSprite,
          hp: unit.hp,
          maxHp: unit.maxHp,
          dmg: `${unit.damage?.min ?? 0}–${unit.damage?.max ?? 0}`,
          spd: unit.speed,
          lvl: unit.level || 1,
          armor: unit.armor ?? 0,
          accuracy: unit.accuracy ?? 0,
          className: cls?.name || 'Без класса',
          branchName: branch?.name || 'не выбрана',
          branchHint: branch?.description || (branchPreview ? `На ${unlockLevel || 3} уровне: ${branchPreview.replace(' / ', ' или ')}.` : ''),
          resourceName: cls?.resource?.name || 'Ресурс',
          resourceValue,
          resourceMax: cls?.resource?.max ?? null,
          isHero: Boolean(unit.isCommander),
          skills,
          desc: meta.desc || unit.description,
        };
      })
      .filter(Boolean);
  }

  _initCharacterSheet() {
    const CHARS = this._buildCharacterSheetChars();

    const zoom = this.cameras.main.zoom;
    const s = v => v / zoom;
    const W = this.cameras.main.width  / zoom;   // мировые единицы ≈1672
    const H = this.cameras.main.height / zoom;   // мировые единицы ≈941
    const PW = 1050 / zoom, PH = 640 / zoom;     // размер панели в мировых единицах
    const PX = (W - PW) / 2;
    const PY = (H - PH) / 2 - 20 / zoom;
    const DEPTH = 10000; // выше всего - портреты HUD=9000, боттом-бар=55

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

    // Кнопка X - отдельная тёмная плашка, чтобы она не терялась на фоне.
    const closeX = PX + PW - s(24);
    const closeY = PY + s(24);
    const closeBg = this.add.rectangle(closeX, closeY, s(34), s(34), 0x050505, 0.92)
      .setStrokeStyle(s(1), 0x7b5b24, 0.95)
      .setDepth(DEPTH+3).setScrollFactor(0)
      .setInteractive({ useHandCursor: true }).setVisible(false);
    const closeBtn = this.add.text(closeX, closeY - s(1), '×', {
      fontSize: `${s(25)}px`, color: '#C9A84C', fontFamily: 'serif',
      stroke: '#000000', strokeThickness: s(2),
    }).setOrigin(0.5).setDepth(DEPTH+4).setScrollFactor(0)
      .setInteractive({ useHandCursor: true }).setVisible(false);
    const closeOver = () => {
      closeBg.setStrokeStyle(s(1.5), 0xd4a832, 1);
      closeBtn.setColor('#F3D27A');
    };
    const closeOut = () => {
      closeBg.setStrokeStyle(s(1), 0x7b5b24, 0.95);
      closeBtn.setColor('#C9A84C');
    };
    closeBg.on('pointerover', closeOver);
    closeBtn.on('pointerover', closeOver);
    closeBg.on('pointerout', closeOut);
    closeBtn.on('pointerout', closeOut);
    closeBg.on('pointerdown', () => this._hideCharSheet());
    closeBtn.on('pointerdown', () => this._hideCharSheet());

    // Разделитель (вертикальный)
    const divLeft  = this.add.image(PX + 220, H/2, 'panel_divider')
      .setDisplaySize(6, PH - 60).setDepth(DEPTH+3).setScrollFactor(0).setVisible(false);
    const divRight = this.add.image(PX + PW - 220, H/2, 'panel_divider')
      .setDisplaySize(6, PH - 60).setDepth(DEPTH+3).setScrollFactor(0).setVisible(false);

    // Контейнер для динамического контента
    this._csContent = [];

    // Вкладки отряда
    const tabs = this._createCharSheetTabs(CHARS, PX, PY, PW, PH, DEPTH);

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
    const gridX0Scr   = 201;   // canvas px - левый край col 0 (TL иконки 0)
    const gridY0Scr   = 139;   // canvas px - верхний край row 0 (TL иконки 0)

    const invEls = [];

    // Заголовок «ИНВЕНТАРЬ» - центр над сеткой инвентаря (canvas x=337, y=103)
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

    this._charSheetElements = [overlay, bg, bgImg, title, closeBg, closeBtn, divLeft, divRight, tabLine, ...tabs.flatMap(t => [t.bg, t.text]), ...invEls];
    this._charSheetTabs = tabs;
    this._charSheetChars = CHARS;
    this._charSheetSelectedIdx = 0;
    this._charSheetPX = PX; this._charSheetPY = PY;
    this._charSheetPW = PW; this._charSheetPH = PH;
    this._charSheetDEPTH = DEPTH;

    this._initBottomBar();
  }

  /** Вкладки отряда в центральной колонке: ширина по числу бойцов (до шести), имя личное. */
  _createCharSheetTabs(CHARS, PX, PY, PW, PH, DEPTH) {
    const zoom = this.cameras.main.zoom;
    const s = v => v / zoom;
    const n = Math.max(1, CHARS.length);
    const colW = 250, gap = 4;
    const tabW = Math.min(82, (colW - (n - 1) * gap) / n);
    const x0 = 640 - ((n - 1) * (tabW + gap)) / 2;
    return CHARS.map((ch, i) => {
      const tx = s(x0 + i * (tabW + gap));
      const ty = s(146);
      const tabBg = this.add.rectangle(tx, ty, s(tabW), s(24), 0x050505, i === 0 ? 0.78 : 0.36)
        .setStrokeStyle(s(1), i === 0 ? 0xd4a832 : 0x4a3f25, i === 0 ? 0.95 : 0.55)
        .setDepth(DEPTH+4).setScrollFactor(0)
        .setInteractive({ useHandCursor: true }).setVisible(false);
      const tabText = this.add.text(tx, ty - s(1), ch.tabLabel, {
        fontSize: `${s(n > 4 ? 11 : 12)}px`,
        color: i === 0 ? '#d4a832' : '#777063',
        fontFamily: 'serif',
        stroke: '#000000',
        strokeThickness: s(1.5),
      }).setOrigin(0.5).setDepth(DEPTH+5).setScrollFactor(0)
        .setInteractive({ useHandCursor: true }).setVisible(false);
      const select = () => {
        this._setCharacterSheetTabState(i);
        this._renderCharContent(this._charSheetChars[i], PX, PY, PW, PH, DEPTH);
      };
      tabBg.on('pointerdown', select);
      tabText.on('pointerdown', select);
      tabBg.on('pointerover', () => { if (this._charSheetSelectedIdx !== i) tabBg.setAlpha(0.58); });
      tabBg.on('pointerout', () => { if (this._charSheetSelectedIdx !== i) tabBg.setAlpha(0.36); });
      return { bg: tabBg, text: tabText };
    });
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

    iconObj.setInteractive({ useHandCursor: item.type === 'book' || item.type === 'consumable' });
    iconObj.on('pointerover', (pointer) => {
      iconObj.setTint?.(0xFFEEBB);
      this._showInventoryTooltip(item, pointer);
    });
    iconObj.on('pointermove', (pointer) => this._moveInventoryTooltip(pointer));
    iconObj.on('pointerout', () => {
      iconObj.clearTint?.();
      this._hideInventoryTooltip();
    });

    if (item.type === 'book' && item.bookId) {
      iconObj.on('pointerdown', (pointer, localX, localY, event) => {
        event?.stopPropagation();
        this._showBookReader(item.bookId);
      });
    }

    // Количество - правый нижний угол слота
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

  _showInventoryTooltip(item, pointer) {
    this._hideInventoryTooltip();

    const zoom = this.cameras.main.zoom;
    const s = v => v / zoom;
    const DEPTH = (this._charSheetDEPTH ?? 10000) + 20;
    const actionText =
      item.type === 'book' ? 'ЛКМ: читать' :
      item.type === 'consumable' ? 'ЛКМ: использовать позже' :
      item.type === 'currency' ? 'Кошель отряда' :
      'Предмет';
    const qtyText = item.stackable || item.quantity > 1 ? `\nКоличество: ${item.quantity}` : '';
    const body = `${item.name}\n${item.description || 'Описание будет добавлено.'}${qtyText}\n${actionText}`;

    const text = this.add.text(0, 0, body, {
      fontSize: `${s(11)}px`,
      color: '#DDD2AA',
      fontFamily: 'serif',
      lineSpacing: s(3),
      wordWrap: { width: s(230) },
    }).setDepth(DEPTH + 1).setScrollFactor(0);
    const bg = this.add.rectangle(0, 0, s(258), text.height + s(22), 0x050505, 0.94)
      .setStrokeStyle(s(1), 0x6f5728, 0.9)
      .setDepth(DEPTH).setScrollFactor(0);

    this._inventoryTooltipEls = [bg, text];
    this._moveInventoryTooltip(pointer);
  }

  _moveInventoryTooltip(pointer) {
    if (!this._inventoryTooltipEls) return;
    const zoom = this.cameras.main.zoom;
    const s = v => v / zoom;
    const [bg, text] = this._inventoryTooltipEls;
    const panelRight = (this._charSheetPX ?? 0) + (this._charSheetPW ?? 0);
    const panelBottom = (this._charSheetPY ?? 0) + (this._charSheetPH ?? 0);
    const bgW = bg.width;
    const bgH = bg.height;
    const x = Math.min(Math.max(pointer.x / zoom + s(18), (this._charSheetPX ?? 0) + s(22)), panelRight - bgW - s(18));
    const y = Math.min(Math.max(pointer.y / zoom + s(18), (this._charSheetPY ?? 0) + s(76)), panelBottom - bgH / 2 - s(18));
    bg.setPosition(x + bgW / 2, y + bgH / 2);
    text.setPosition(x + s(12), y + s(10));
  }

  _hideInventoryTooltip() {
    if (!this._inventoryTooltipEls) return;
    this._inventoryTooltipEls.forEach(o => { try { o.destroy(); } catch {} });
    this._inventoryTooltipEls = null;
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

    // Изображение 866×288 - сохраняем пропорции при высоте BAR_H
    const imgW = Math.round(BAR_H * (866 / 288));
    this.add.image(W / 2, BAR_Y, 'bottom_panel1')
      .setDisplaySize(imgW, BAR_H)
      .setDepth(DEPTH).setScrollFactor(0)
      .setInteractive();   // панель целиком ловит клики, чтобы они не уходили в карту

    // 5 слотов выровнены по визуальным ячейкам изображения
    const SLOT_SIZE = 64;  // screen pixels

    // Фракции центров ячеек для bottom_panel1.png (866×288)
    // Разделители на px: 121,250,377,504,622,854 → центры ячеек: 185,313,440,563,738
    // Пятая ячейка визуально уже из-за правого декора, поэтому ее центр чуть левее.
    const SLOT_FRACTIONS = [0.2136, 0.3614, 0.5081, 0.6501, 0.8150];
    const SLOTS = [
      { label: 'Кошель', icon: 'icon_gold', action: null, tooltip: () => `Золото: ${this.game.registry.get('playerGold') ?? 0}` },
      { label: 'Журнал', icon: 'icon_hand', action: () => this._toggleJournal(), tooltip: 'Журнал заданий' },
      { label: 'Отряд', icon: 'map_menu_button', action: () => this._showCharSheet(0), tooltip: 'Отряд и инвентарь' },
      { label: 'Карта', icon: 'icon_luck_horseshoe', action: () => this._openWorldMap(), tooltip: 'Где отряд уже был' },
      { label: 'Меню', icon: 'icon_skull', action: () => this._openMenu(), tooltip: 'Громкость, выход в титул (Esc)' },
    ];

    const s = v => v / zoom;
    const SLOT_W_WORLD = SLOT_SIZE / zoom;
    const imgStartX = W / 2 - imgW / 2;
    // Шипы сверху смещают визуальный центр ячеек вниз на ~9% высоты панели
    const ICON_CY = BAR_Y + BAR_H * 0.09;
    const ICON_SZ = s(40);  // 40 canvas px для иконок
    SLOTS.forEach((slot, i) => {
      const sx = Math.round(imgStartX + SLOT_FRACTIONS[i] * imgW);
      const sy = ICON_CY;
      const enabled = Boolean(slot.action);
      const baseAlpha = i === 0 ? 0.86 : enabled ? 0.72 : 0.38;

      // Хит-зона - одинаковый квадрат для всех слотов
      const hit = this.add.rectangle(sx, sy, SLOT_W_WORLD, SLOT_W_WORLD, 0x000000, 0)
        .setDepth(DEPTH + 3).setScrollFactor(0);
      const icon = this.add.image(sx, sy - s(3), slot.icon)
        .setDisplaySize(ICON_SZ, ICON_SZ)
        .setDepth(DEPTH + 4).setScrollFactor(0).setAlpha(baseAlpha);

      const label = this.add.text(sx, sy + s(31), slot.label, {
        fontSize: `${s(11)}px`,
        color: enabled || i === 0 ? '#C9A84C' : '#796941',
        fontFamily: 'Georgia, "Times New Roman", serif',
        stroke: '#000000', strokeThickness: s(3),
      }).setOrigin(0.5, 0.5).setDepth(DEPTH + 5).setScrollFactor(0);

      const glow = this.add.rectangle(sx, sy, SLOT_W_WORLD, SLOT_W_WORLD, 0xC9A84C, 0)
        .setDepth(DEPTH + 2).setScrollFactor(0);
      const tip = new Tooltip(this, DEPTH + 10);
      const tooltip = {
        show: () => tip.show(sx * zoom, (sy - SLOT_W_WORLD * 0.55) * zoom,
          { title: slot.label, body: typeof slot.tooltip === 'function' ? slot.tooltip() : slot.tooltip }),
        hide: () => tip.hide(),
      };

      hit.setInteractive({ useHandCursor: enabled });
      hit.on('pointerover', () => {
        glow.setAlpha(enabled ? 0.16 : 0.08);
        icon.setAlpha(enabled || i === 0 ? 1 : 0.55);
        label.setColor(enabled || i === 0 ? '#FFD98A' : '#9A8654');
        tooltip.show();
      });
      hit.on('pointerout', () => {
        glow.setAlpha(0);
        icon.setAlpha(baseAlpha);
        label.setColor(enabled || i === 0 ? '#C9A84C' : '#796941');
        tooltip.hide();
      });
      if (slot.action) hit.on('pointerdown', slot.action);
    });

  }


  _addBreathingTween(sprite, period = 2800, cfg = {}) {
    const baseScaleX = sprite.scaleX;
    const baseScaleY = sprite.scaleY;
    const tween = {
      targets: sprite,
      scaleY: {
        from: baseScaleY * (cfg.scaleYFrom ?? 0.998),
        to:   baseScaleY * (cfg.scaleYTo   ?? 1.022),
      },
      duration: period,
      yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    };
    if (cfg.scaleXFrom || cfg.scaleXTo) {
      tween.scaleX = {
        from: baseScaleX * (cfg.scaleXFrom ?? 1),
        to:   baseScaleX * (cfg.scaleXTo   ?? 1),
      };
    }
    this.tweens.add(tween);
  }

  _addCharacterSheetFigure(ch, add, DEPTH) {
    const zoom = this.cameras.main.zoom;
    const s = v => v / zoom;
    // Фигура: спрайт карты, иначе боевой спрайт, иначе портрет (у наёмных спутников фигуры на карте может не быть в памяти)
    const key = [ch.mapSprite, `map_${ch.id}`, ch.sprite, ch.portrait].find(k => k && this.textures.exists(k)) || ch.sprite;
    const isPortrait = key === ch.portrait;
    const footX = s(640);
    const footY = s(428);
    const targetH = s(isPortrait ? 200 : 240);

    const shadow = add(this.add.ellipse(footX, footY + s(6), s(112), s(18), 0x000000, 0.45)
      .setDepth(DEPTH + 4).setScrollFactor(0));

    const sprite = add(this.add.image(footX, footY, key)
      .setOrigin(0.5, 1)
      .setDepth(DEPTH + 5)
      .setScrollFactor(0));
    const ratio = sprite.width / Math.max(1, sprite.height);
    sprite.setDisplaySize(targetH * ratio, targetH);
    this._addBreathingTween(sprite, 3200);

    return { shadow, sprite };
  }

  _setCharacterSheetTabState(idx) {
    this._charSheetSelectedIdx = idx;
    const zoom = this.cameras.main.zoom;
    const s = v => v / zoom;
    this._charSheetTabs?.forEach((tab, i) => {
      const active = i === idx;
      tab.bg.setAlpha(active ? 0.78 : 0.36);
      tab.bg.setStrokeStyle(s(active ? 1.2 : 1), active ? 0xd4a832 : 0x4a3f25, active ? 0.95 : 0.55);
      tab.text.setColor(active ? '#d4a832' : '#777063');
    });
  }

  _showCharSheet(idx = 0) {
    if (this._journalObjs) this._journalObjs.close();   // одно окно за раз
    Frame.closeCurrent(this);
    this._charSheetOpen = true;
    // Синхронизируем золото из реестра при каждом открытии
    const gold = this.game.registry.get('playerGold') ?? 0;
    const goldItem = this._inventory?.find(it => it.id === 'gold');
    if (goldItem && goldItem.quantity !== gold) {
      goldItem.quantity = gold;
      if (this._invGoldLabel) this._invGoldLabel.setText(`${gold}`);
    }

    // Отряд и числа берутся заново при каждом открытии (HP после отдыха, новый спутник)
    const old = (this._charSheetTabs || []).flatMap(t => [t.bg, t.text]);
    this._charSheetElements = this._charSheetElements.filter(e => !old.includes(e));
    old.forEach(o => o.destroy());
    this._charSheetChars = this._buildCharacterSheetChars();
    this._charSheetTabs = this._createCharSheetTabs(this._charSheetChars, this._charSheetPX, this._charSheetPY, this._charSheetPW, this._charSheetPH, this._charSheetDEPTH);
    this._charSheetElements.push(...this._charSheetTabs.flatMap(t => [t.bg, t.text]));
    idx = Math.min(idx, this._charSheetChars.length - 1);
    this._charSheetElements.forEach(e => e.setVisible(true));
    this._setCharacterSheetTabState(idx);
    this._renderCharContent(
      this._charSheetChars[idx],
      this._charSheetPX, this._charSheetPY,
      this._charSheetPW, this._charSheetPH,
      this._charSheetDEPTH
    );
  }

  _hideCharSheet() {
    this._charSheetOpen = false;
    this._charSheetElements.forEach(e => e.setVisible(false));
    this._csContent.forEach(e => { try { e.destroy(); } catch {} });
    this._csContent = [];
    this._hideInventoryTooltip();
    this._destroyInvGrid();
  }

  _renderCharContent(ch, PX, PY, PW, PH, DEPTH) {
    this._csContent.forEach(e => { try { e.destroy(); } catch {} });
    this._csContent = [];

    const zoom = this.cameras.main.zoom;
    const s = v => v / zoom;
    const add = (obj) => { this._csContent.push(obj); return obj; };

    // ── Центральная зона: игровая миниатюра персонажа ──
    this._addCharacterSheetFigure(ch, add, DEPTH);

    // Имя персонажа
    add(this.add.text(s(640), s(440), ch.name, {
      fontSize: `${s(18)}px`, color: '#d4a832', fontFamily: 'serif',
      stroke: '#000000', strokeThickness: s(2),
    }).setOrigin(0.5, 0).setDepth(DEPTH+5).setScrollFactor(0));

    // Описание
    add(this.add.text(s(640), s(466), ch.desc, {
      fontSize: `${s(11)}px`, color: '#888877', fontFamily: 'serif', maxLines: 3,
      wordWrap: { width: s(240), useAdvancedWrap: true }, align: 'center',
      lineSpacing: s(2),
    }).setOrigin(0.5, 0).setDepth(DEPTH+5).setScrollFactor(0));

    // ── Правая зона: класс, статы, умения ──
    // Координаты canvas (= screen_из_H_сетки / zoom ≈ screen * 1.307):
    // ХАРАКТЕРИСТИКИ верх-лево: canvas(874, 105)
    // Метки: canvas x=861, первая строка canvas y=175
    // Значения: canvas x=979
    const statsX     = s(864);
    const statsValX  = s(956);
    const statsLineR = s(1134);
    const rowStep    = s(30);

    const sectionTitle = (x, y, text) => add(this.add.text(x, y, text, {
      fontSize: `${s(13)}px`, color: '#d4a832', fontFamily: 'serif', letterSpacing: 2,
      stroke: '#000000', strokeThickness: s(1.5),
    }).setOrigin(0, 0).setDepth(DEPTH+5).setScrollFactor(0));

    const infoRow = (y, label, val, valueColor = '#CCCCCC') => {
      add(this.add.text(statsX, y, label, {
        fontSize: `${s(11)}px`, color: '#888877', fontFamily: 'serif'
      }).setDepth(DEPTH+5).setScrollFactor(0));
      add(this.add.text(statsValX, y, val, {
        fontSize: `${s(11)}px`, color: valueColor, fontFamily: 'serif', fontStyle: 'bold',
        wordWrap: { width: s(130) },
      }).setOrigin(0, 0).setDepth(DEPTH+5).setScrollFactor(0));
      const lg = add(this.add.graphics().setDepth(DEPTH+4).setScrollFactor(0));
      lg.lineStyle(1, 0x333322, 0.45);
      lg.lineBetween(statsX, y + s(20), statsLineR, y + s(20));
    };

    sectionTitle(s(874), s(105), 'КЛАСС');
    infoRow(s(144), 'Путь', ch.className);
    infoRow(s(174), 'Ветка', ch.branchName, ch.branchName === 'не выбрана' ? '#9A8654' : '#CCCCCC');
    const resourceText = ch.resourceMax ? `${ch.resourceValue ?? 0} / ${ch.resourceMax}` : `${ch.resourceValue ?? 0}`;
    infoRow(s(204), ch.resourceName, resourceText, '#D4AA60');

    // Подсказка ветки: не шире колонки и не выше двух строк (дальше орнамент)
    const hint = add(this.add.text(statsX, s(230), ch.branchHint, {
      fontSize: `${s(11)}px`, color: '#888877', fontFamily: 'serif',
      wordWrap: { width: s(215), useAdvancedWrap: true }, lineSpacing: s(1), maxLines: 2,
    }).setDepth(DEPTH+5).setScrollFactor(0));

    const statsY0 = s(306);

    const stats = [
      ['Уровень',    `${ch.lvl}`],
      ['Здоровье',   `${ch.hp} / ${ch.maxHp}`],
      ['Урон',       ch.dmg],
      ['Инициатива', `${ch.spd}`],
      ['Броня',      `${ch.armor}`],
    ];

    sectionTitle(s(874), s(274), 'ХАРАКТЕРИСТИКИ');

    stats.forEach(([label, val], i) => {
      infoRow(statsY0 + i * s(28), label, val);
    });

    // Скиллы
    const skillsY = statsY0 + stats.length * s(28) + s(14);
    sectionTitle(statsX, skillsY, 'УМЕНИЯ');
    ch.skills.forEach((sk, i) => {
      add(this.add.text(statsX, skillsY + s(24) + i * s(19), `• ${sk}`, {
        fontSize: `${s(11)}px`, color: '#CCCCCC', fontFamily: 'serif',
        fixedWidth: s(215),
      }).setDepth(DEPTH+5).setScrollFactor(0));
    });

    // Репутация, опыт отряда и черты героя (блок Г): только на листе героя
    if (ch.id === 'hero_duelist' || ch.portrait === 'portrait_hero_duelist') {
      const xp = PartySystem.xpProgress(this.game.registry);
      const traits = (SaveSystem.load()?.units || []).find(u => u.id === 'hero_duelist')?.commanderTraits || [];
      // Коротко, чтобы не залезать на орнамент низа колонки: репутация числами, опыт, черты
      const rep = repLines(this.game.registry).map(l => l.split(':')[0]).join(', ');
      const lines = [
        rep,
        `Опыт ${xp.have} / ${xp.need}, мест в отряде ${PartySystem.getSlots(this.game.registry)}`,
        traits.length ? `Черты: ${traits.map(t => TRAIT_LABELS[t] || t).join(', ')}` : '',
      ].filter(Boolean);
      add(this.add.text(s(640), s(500), lines.join('\n'), {
        fontSize: `${s(11)}px`, color: '#B8AC8C', fontFamily: 'serif', align: 'center', lineSpacing: s(1),
        wordWrap: { width: s(240), useAdvancedWrap: true },
        stroke: '#000', strokeThickness: s(1),
      }).setOrigin(0.5, 0).setDepth(DEPTH+5).setScrollFactor(0));
    }

    // Левая зона (инвентарь) - сетка рисуется статично в _initCharacterSheet, не здесь.
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

  // J - мелкая мировая сетка с шагом 20 world-единиц (~15 canvas px)
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
      // Каждые 5 квадратов (100 world) - чуть ярче
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
