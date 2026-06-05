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
    // Правый край → Tavern Map (y=377-515 — диапазон дороги на правом конце)
    exits: [
      { zone: { x: 1588, y: 360, w: 84, h: 165 }, toMap: 'tavern_map', spawnId: 'from_left' },
    ],
    labels:    [],
    bandits:   false,
    tavernEntry: null,
  },

  tavern_map: {
    bgKey: 'map_tavern_map',
    spawnPoints: {
      default:     { x: 110, y: 620 },
      from_left:   { x: 110, y: 620 },
      tavern_exit: { x: 1380, y: 480 },   // возврат из таверны — у двери
    },
    // Нижняя ветка X — правый-нижний угол → Forest1
    exits: [
      { zone: { x: 1548, y: 720, w: 124, h: 221 }, toMap: 'forest1', spawnId: 'from_left' },
    ],
    // Ховер над зданием таверны
    labels: [
      {
        hoverZone: { x: 1095, y: 368, w: 577, h: 232 },
        text: 'Войти',
        screenX: 1516,
        screenY: 72,
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
    // Зона двери → выход на Tavern Map
    exits: [
      { zone: { x: 618, y: 862, w: 325, h: 79 }, toMap: 'tavern_map', spawnId: 'tavern_exit' },
    ],
    labels: [
      {
        hoverZone: { x: 618, y: 862, w: 325, h: 79 },
        text: 'Выход',
        screenX: 836,
        screenY: 882,
      },
    ],
    tavernEntry: null,
    bandits: false,
    // Хозяин таверны стоит у барной стойки (правая часть, walkable зона)
    npcs: [
      {
        x: 1120, y: 460,
        spriteKey:   'map_tavernman',
        portraitKey: 'portrait_tavernman',
        name:        'Хозяин таверны',
        height:      140,
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
      default:  { x: 100, y: 555 },
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
    banditPos: { x: 500, y: 560 },   // у костра/лагеря, левая-центральная часть
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

    // Диалоговая панель (in-world overlay)
    this._dialogue = new DialoguePanel(this);

    // NPC (статичные, кликабельные)
    this._npcs = [];
    this._spawnNPCs(cfg);

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

  // ─── NPCs ────────────────────────────────────────────────────────────────

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

      // Имя над головой
      const label = this.add.text(npc.x, npc.y - h / 2 - 12, npc.name, {
        fontFamily: 'serif', fontSize: '14px', color: '#D4AA60',
        stroke: '#000', strokeThickness: 3,
      }).setOrigin(0.5, 1).setDepth(npc.y + 1);

      // Hover — небольшое свечение
      sprite.on('pointerover',  () => sprite.setTint(0xFFEEBB));
      sprite.on('pointerout',   () => sprite.clearTint());

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
      // Левый край прямоугольника ровно на x=0
      this.add.rectangle(0, cy, cardW, cardH, 0x0a0810, 0.94)
        .setStrokeStyle(2, 0x445577)
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
        .setStrokeStyle(2, 0x663333).setDepth(59).setScrollFactor(0).setAlpha(0);
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
