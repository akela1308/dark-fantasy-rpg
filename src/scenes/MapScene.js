import { MapUnit }       from '../entities/MapUnit.js';
import { WalkableZones } from '../systems/WalkableZones.js';
import eventBus           from '../utils/eventBus.js';

/**
 * MapScene — карта мира.
 * Герой двигается кликом мыши по дороге.
 * Спутники следуют за ним с задержкой.
 * Бандиты патрулируют — при встрече диалог → бой.
 */
export class MapScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MapScene' });
  }

  init(data) {
    this.mapKey = data?.mapKey || 'map1';
  }

  create() {
    const mapW = 1672, mapH = 941;

    // ── Фон карты ─────────────────────────────────────────────────────
    this.add.image(mapW / 2, mapH / 2, `map_${this.mapKey}`)
      .setDisplaySize(mapW, mapH)
      .setDepth(0);

    // Размер мира для камеры
    this.physics.world.setBounds(0, 0, mapW, mapH);
    this.cameras.main.setBounds(0, 0, mapW, mapH);

    // ── Walkable zones ────────────────────────────────────────────────
    this.walkable = new WalkableZones(this.mapKey);
    // this.walkable.drawDebug(this); // раскомментировать для отладки зон

    // ── Стартовая позиция ─────────────────────────────────────────────
    const startX = 220, startY = 490;

    // ── Персонажи ────────────────────────────────────────────────────
    this.hero    = new MapUnit(this, startX,      startY, 'map_hero',    { height: 68, speed: 130 });
    this.brawler = new MapUnit(this, startX - 40, startY, 'map_brawler', { height: 62, speed: 130 });
    this.healer  = new MapUnit(this, startX - 70, startY, 'map_healer',  { height: 60, speed: 130 });

    // История позиций героя для следования спутников
    this._heroTrail = [];
    this._trailInterval = 0;

    // ── Враги ────────────────────────────────────────────────────────
    this._bandits = [];
    this._spawnBandits();

    // ── Камера следует за героем ──────────────────────────────────────
    this.cameras.main.startFollow(this.hero.sprite, true, 0.08, 0.08);
    this.cameras.main.setZoom(1.3);

    // ── Клик для движения ─────────────────────────────────────────────
    this.input.on('pointerdown', (ptr) => {
      if (ptr.rightButtonDown()) return;
      // Переводим экранные координаты в мировые
      const wx = ptr.worldX;
      const wy = ptr.worldY;
      const dest = this.walkable.clamp(wx, wy);
      this.hero.moveTo(dest.x, dest.y);
      this._showClickMarker(dest.x, dest.y);
    });

    // ── Курсор движения ───────────────────────────────────────────────
    this._clickMarker = this.add.graphics().setDepth(20);

    // ── UI: кнопка пропуска к бою (dev) ──────────────────────────────
    this._buildHUD();

    // Музыка продолжает играть из BattleScene если была запущена
  }

  update(time, delta) {
    // Обновляем юнитов
    this.hero.update(delta);

    // Трейл позиций для спутников
    this._trailInterval += delta;
    if (this._trailInterval > 80) {
      this._trailInterval = 0;
      this._heroTrail.push({ x: this.hero.x, y: this.hero.y });
      if (this._heroTrail.length > 60) this._heroTrail.shift();
    }

    // Спутники следуют по трейлу с задержкой
    this._followTrail(this.brawler, 15); // ~1.2 сек задержка
    this._followTrail(this.healer,  28); // ~2.2 сек задержка
    this.brawler.update(delta);
    this.healer.update(delta);

    // Обновляем бандитов
    this._updateBandits(delta);

    // Проверка встречи с бандитами
    this._checkEncounters();
  }

  _followTrail(unit, stepsBack) {
    const idx = Math.max(0, this._heroTrail.length - stepsBack);
    const pos = this._heroTrail[idx];
    if (pos) unit.moveTo(pos.x, pos.y);
  }

  // ── Бандиты ────────────────────────────────────────────────────────

  _spawnBandits() {
    const patrols = [
      // Waypoints бандита 1 (у ворот, середина карты)
      [{ x: 650, y: 490 }, { x: 850, y: 490 }, { x: 750, y: 520 }],
      // Waypoints бандита 2 (правее)
      [{ x: 1050, y: 480 }, { x: 1200, y: 495 }, { x: 1100, y: 460 }],
    ];

    patrols.forEach((waypoints, i) => {
      const b = new MapUnit(this, waypoints[0].x, waypoints[0].y, 'map_bandit', {
        height: 65, speed: 55
      });
      b.sprite.setFlipX(true);
      this._bandits.push({
        unit: b,
        waypoints,
        wpIndex: 0,
        waitTimer: 0,
        encountered: false,
      });
    });
  }

  _updateBandits(delta) {
    this._bandits.forEach(bandit => {
      if (bandit.encountered) return;

      const wp = bandit.waypoints[bandit.wpIndex];
      const dist = Phaser.Math.Distance.Between(
        bandit.unit.x, bandit.unit.y, wp.x, wp.y
      );

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
        this.hero.x, this.hero.y,
        bandit.unit.x, bandit.unit.y
      );

      if (dist < 70) {
        bandit.encountered = true;
        this.hero.stopMove();
        this.brawler.stopMove();
        this.healer.stopMove();
        this._startEncounter();
      }
    });
  }

  _startEncounter() {
    // Небольшая пауза → диалог → бой
    this.time.delayedCall(400, () => {
      this.cameras.main.fade(600, 0, 0, 0, false, (cam, progress) => {
        if (progress === 1) {
          this.scene.start('DialogueScene', { returnTo: 'BattleScene' });
        }
      });
    });
  }

  // ── Маркер клика ──────────────────────────────────────────────────

  _showClickMarker(x, y) {
    this._clickMarker.clear();
    this._clickMarker.lineStyle(2, 0xC9A84C, 0.8);
    this._clickMarker.strokeCircle(x, y, 10);

    this.tweens.add({
      targets: this._clickMarker,
      alpha: { from: 0.8, to: 0 },
      duration: 500,
      onComplete: () => this._clickMarker.setAlpha(1),
    });
  }

  // ── HUD ────────────────────────────────────────────────────────────

  _buildHUD() {
    // Подсказка
    this.add.text(16, 16, '🗺 Кликни по дороге чтобы идти', {
      fontSize: '13px', color: '#C9A84C', fontFamily: 'serif',
      backgroundColor: '#00000088', padding: { x: 8, y: 4 }
    }).setDepth(50).setScrollFactor(0);
  }
}
