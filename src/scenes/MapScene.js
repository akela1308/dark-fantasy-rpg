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
    // Красные прямоугольники = зоны хождения (убрать после настройки)
    this.walkable.drawDebug(this);

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

    this._updateBandits(delta);
    this._checkEncounters();
  }

  _followTrail(unit, stepsBack) {
    const idx = Math.max(0, this._heroTrail.length - stepsBack);
    const pos = this._heroTrail[idx];
    if (pos) unit.moveTo(pos.x, pos.y);
  }

  _spawnBandits() {
    // Один бандит патрулирует центральную часть дороги
    const patrols = [
      [{ x: 750, y: 510 }, { x: 950, y: 470 }, { x: 840, y: 530 }],
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
    const cardW = 100, cardH = 115, startY = 80, gapY = 125;
    portraits.forEach((p, i) => {
      const cx = 55, cy = startY + i * gapY;
      this.add.rectangle(cx, cy, cardW, cardH, 0x0a0810, 0.9)
        .setStrokeStyle(2, 0x445577).setDepth(50).setScrollFactor(0);
      const img = this.add.image(cx, cy - 8, p.key).setDepth(51).setScrollFactor(0);
      img.setScale(Math.min((cardW - 6) / img.width, (cardH - 22) / img.height));
      this.add.text(cx, cy + cardH / 2 - 10, p.label, {
        fontSize: '12px', color: '#AAAAAA', fontFamily: 'serif',
      }).setOrigin(0.5, 1).setDepth(51).setScrollFactor(0);
    });

    this._hoverPortrait = this.add.image(200, 60, 'portrait_bandit_commander')
      .setScale(0.18).setDepth(60).setScrollFactor(0).setAlpha(0).setVisible(false);
    this._hoverBg = this.add.rectangle(200, 60, 80, 90, 0x0a0810, 0.9)
      .setStrokeStyle(1, 0x663333).setDepth(59).setScrollFactor(0).setAlpha(0).setVisible(false);
    this._hoverLabel = this.add.text(200, 102, 'Разбойник', {
      fontSize: '9px', color: '#CC4444', fontFamily: 'serif',
    }).setOrigin(0.5).setDepth(61).setScrollFactor(0).setAlpha(0).setVisible(false);

    // Hover на бандита — используем мировые координаты
    this.input.on('pointermove', (ptr) => {
      let hovered = false;
      this._bandits.forEach(b => {
        if (b.encountered) return;
        if (Phaser.Math.Distance.Between(ptr.worldX, ptr.worldY, b.unit.sprite.x, b.unit.sprite.y) < 45)
          hovered = true;
      });
      [this._hoverPortrait, this._hoverBg, this._hoverLabel].forEach(el =>
        el.setVisible(hovered).setAlpha(hovered ? 1 : 0)
      );
    });

    this.music = new MusicPlayer(this);
    this.music.create();
  }
}
