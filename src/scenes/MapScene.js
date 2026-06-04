import { MapUnit }       from '../entities/MapUnit.js';
import { WalkableZones } from '../systems/WalkableZones.js';
import { MusicPlayer }   from '../ui/MusicPlayer.js';
import eventBus           from '../utils/eventBus.js';

export class MapScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MapScene' });
  }

  init(data) {
    this.mapKey = data?.mapKey || 'map1';
  }

  create() {
    const mapW = 1672, mapH = 941;
    const W = 1280, H = 720;

    // Zoom камеры чтобы вся карта влезла на экран
    const zoom = Math.min(W / mapW, H / mapH); // ~0.765
    this.cameras.main.setZoom(zoom);
    this.cameras.main.centerOn(mapW / 2, mapH / 2);

    // Фон в мировых координатах (мир = координаты карты)
    this.add.image(mapW / 2, mapH / 2, `map_${this.mapKey}`)
      .setScale(1)
      .setDepth(0);

    // Зоны хождения в мировых координатах карты
    this.walkable = new WalkableZones(this.mapKey);
    // this.walkable.drawDebug(this);

    // Персонажи в мировых координатах
    // unitH в пикселях мира — на экране будет unitH * zoom (~0.765)
    const unitH = 130;
    const startX = 240, startY = 640; // стартуем на дороге

    this.hero    = new MapUnit(this, startX,       startY, 'map_hero',    { height: unitH + 10, speed: 130 });
    this.brawler = new MapUnit(this, startX - 65,  startY, 'map_brawler', { height: unitH,      speed: 130 });
    this.healer  = new MapUnit(this, startX - 120, startY, 'map_healer',  { height: unitH - 6,  speed: 130 });

    this._heroTrail    = [];
    this._trailInterval = 0;

    this._bandits = [];
    this._spawnBandits();

    // Клик — используем мировые координаты (ptr.worldX/Y)
    this.input.on('pointerdown', (ptr) => {
      if (ptr.rightButtonDown()) return;
      const clamped = this.walkable.clamp(ptr.worldX, ptr.worldY);
      this.hero.moveTo(clamped.x, clamped.y);
      this._showClickMarker(clamped.x, clamped.y);
    });

    this._clickMarker = this.add.graphics().setDepth(20);

    this._buildHUD();
  }

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

    this._updateBandits(delta);
    this._checkEncounters();
  }

  _followTrail(unit, stepsBack) {
    const idx = Math.max(0, this._heroTrail.length - stepsBack);
    const pos = this._heroTrail[idx];
    if (pos) unit.moveTo(pos.x, pos.y);
  }

  _separateParty() {
    const MIN = 55; // минимальное расстояние между центрами спрайтов
    // Порядок приоритета: герой не двигается, brawler только от героя, healer от обоих
    const pairs = [
      [this.hero,    this.brawler],
      [this.hero,    this.healer],
      [this.brawler, this.healer],
    ];
    for (const [a, b] of pairs) {
      const dx = b.sprite.x - a.sprite.x;
      const dy = b.sprite.y - a.sprite.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < MIN && dist > 0.1) {
        // Выталкиваем только b (менее приоритетный)
        const push = MIN - dist;
        const nx = dx / dist;
        const ny = dy / dist;
        b.sprite.x += nx * push;
        b.sprite.y += ny * push;
        b.shadow.setPosition(b.sprite.x, b.sprite.y + 2);
      }
    }
  }

  _spawnBandits() {
    if (this.game.registry.get('bandit_0_defeated')) return;

    // Два бандита патрулируют дорогу (screen coords, y=420-460 = середина дороги)
    const patrols = [
      [{ x: 640, y: 450 }, { x: 780, y: 430 }, { x: 710, y: 460 }],
      [{ x: 880, y: 430 }, { x: 1040, y: 415 }, { x: 960, y: 445 }],
    ];

    const unitH = 120;
    patrols.forEach((waypoints) => {
      const b = new MapUnit(this, waypoints[0].x, waypoints[0].y, 'map_bandit', {
        height: unitH, speed: 55,
      });
      b.sprite.setFlipX(true);
      this._bandits.push({ unit: b, waypoints, wpIndex: 0, waitTimer: 0, encountered: false });
    });
  }

  _updateBandits(delta) {
    this._bandits.forEach(bandit => {
      if (bandit.encountered) return;

      const wp   = bandit.waypoints[bandit.wpIndex];
      const dist = Phaser.Math.Distance.Between(bandit.unit.x, bandit.unit.y, wp.x, wp.y);

      if (dist < 5) {
        bandit.unit.stopMove();
        bandit.waitTimer += delta;
        if (bandit.waitTimer > 1200) {
          bandit.waitTimer = 0;
          bandit.wpIndex = (bandit.wpIndex + 1) % bandit.waypoints.length;
        }
      } else {
        bandit.unit.moveTo(wp.x, wp.y);
      }

      bandit.unit.update(delta);
    });
  }

  _checkEncounters() {
    this._bandits.forEach(bandit => {
      if (bandit.encountered) return;

      const dist = Phaser.Math.Distance.Between(
        this.hero.x, this.hero.y, bandit.unit.x, bandit.unit.y
      );

      if (dist < 90) {
        bandit.encountered = true;
        this.hero.stopMove();
        this.brawler.stopMove();
        this.healer.stopMove();
        this._startEncounter();
      }
    });
  }

  _startEncounter() {
    this.time.delayedCall(400, () => {
      this.cameras.main.fade(500, 0, 0, 0, false, (cam, progress) => {
        if (progress === 1) {
          this.scene.start('LoadingScene', { destination: 'BattleScene', destinationData: {} });
        }
      });
    });
  }

  _showClickMarker(x, y) {
    this._clickMarker.clear();
    this._clickMarker.lineStyle(2, 0xC9A84C, 0.8);
    this._clickMarker.strokeCircle(x, y, 13);

    this.tweens.add({
      targets: this._clickMarker,
      alpha: { from: 0.8, to: 0 },
      duration: 500,
      onComplete: () => this._clickMarker.setAlpha(1),
    });
  }

  _buildHUD() {
    this.add.text(16, 16, '🗺 Кликни по дороге чтобы идти', {
      fontSize: '13px', color: '#C9A84C', fontFamily: 'serif',
      backgroundColor: '#00000088', padding: { x: 8, y: 4 },
    }).setDepth(50).setScrollFactor(0);

    const portraits = [
      { key: 'portrait_hero_duelist',      label: 'Дуэлянт' },
      { key: 'portrait_companion_brawler', label: 'Боец' },
      { key: 'portrait_companion_healer',  label: 'Знахарка' },
    ];
    // Портреты — вплотную к левому краю, крупнее
    const cardW = 118, cardH = 138, startY = 100, gapY = 150;
    portraits.forEach((p, i) => {
      const cx = cardW / 2;  // вплотную к левому краю
      const cy = startY + i * gapY;
      this.add.rectangle(cx, cy, cardW, cardH, 0x0a0810, 0.92)
        .setStrokeStyle(2, 0x445577).setDepth(50).setScrollFactor(0);
      const img = this.add.image(cx, cy - 10, p.key).setDepth(51).setScrollFactor(0);
      img.setScale(Math.min((cardW - 6) / img.width, (cardH - 26) / img.height));
      this.add.text(cx, cy + cardH / 2 - 8, p.label, {
        fontSize: '13px', color: '#CCCCCC', fontFamily: 'serif',
      }).setOrigin(0.5, 1).setDepth(51).setScrollFactor(0);
    });

    // Hover-портрет бандита — у ПРАВОГО края экрана
    const hW = 120, hH = 145;
    const hx = 1280 - hW / 2;  // правый край
    this._hoverBg = this.add.rectangle(hx, 120, hW, hH, 0x0a0810, 0.92)
      .setStrokeStyle(2, 0x663333).setDepth(59).setScrollFactor(0).setAlpha(0);
    this._hoverPortrait = this.add.image(hx, 115, 'portrait_bandit_commander')
      .setDepth(60).setScrollFactor(0).setAlpha(0);
    // Масштаб портрета под карточку
    const pScale = Math.min((hW - 6) / this._hoverPortrait.width, (hH - 26) / this._hoverPortrait.height);
    this._hoverPortrait.setScale(pScale);
    this._hoverLabel = this.add.text(hx, 185, 'Командир разбойников', {
      fontSize: '11px', color: '#CC4444', fontFamily: 'serif',
    }).setOrigin(0.5).setDepth(61).setScrollFactor(0).setAlpha(0);

    // Hover на бандита
    this.input.on('pointermove', (ptr) => {
      let hovered = false;
      this._bandits.forEach(b => {
        if (b.encountered) return;
        if (Phaser.Math.Distance.Between(ptr.x, ptr.y, b.unit.sprite.x, b.unit.sprite.y) < 40)
          hovered = true;
      });
      const a = hovered ? 1 : 0;
      [this._hoverPortrait, this._hoverBg, this._hoverLabel].forEach(el => el.setAlpha(a));
    });

    this.music = new MusicPlayer(this);
    this.music.create();
  }
}
