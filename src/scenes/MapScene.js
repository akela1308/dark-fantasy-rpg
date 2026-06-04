import { MapUnit }       from '../entities/MapUnit.js';
import { WalkableZones } from '../systems/WalkableZones.js';
import { MusicPlayer }   from '../ui/MusicPlayer.js';
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
    const W    = 1280, H    = 720; // размер экрана

    // Масштаб чтобы вся карта влезла на экран
    const zoom = Math.min(W / mapW, H / mapH); // ~0.765

    // Рендерим карту в координатах ЭКРАНА (не мира) — проще и надёжнее
    // Всё в одном масштабе, камера статична
    this.cameras.main.setZoom(1); // zoom = 1, масштабируем сам контент

    const imgScale = zoom;

    // ── Фон карты — вписан в экран ───────────────────────────────────
    this.add.image(W / 2, H / 2, `map_${this.mapKey}`)
      .setScale(imgScale)
      .setDepth(0);

    // Мировые координаты = экранные (zoom 1), карта занимает W×H пикселей
    // Пересчитаем позиции персонажей и зон в экранные координаты
    this._mapScale = imgScale;
    this._mapOffX  = (W - mapW * imgScale) / 2;
    this._mapOffY  = (H - mapH * imgScale) / 2;

    // ── Walkable zones ────────────────────────────────────────────────
    this.walkable = new WalkableZones(this.mapKey);
    // this.walkable.drawDebug(this, this._mapScale, this._mapOffX, this._mapOffY);

    // ── Стартовая позиция (в координатах карты → экрана) ─────────────
    const toScreen = (mx, my) => ({
      x: this._mapOffX + mx * this._mapScale,
      y: this._mapOffY + my * this._mapScale,
    });
    this._toScreen = toScreen;

    const start = toScreen(220, 490);

    // ── Персонажи ────────────────────────────────────────────────────
    const unitH = Math.round(88 * this._mapScale);  // масштабируем высоту
    this.hero    = new MapUnit(this, start.x,       start.y, 'map_hero',    { height: unitH + 8, speed: 100 });
    this.brawler = new MapUnit(this, start.x - 42,  start.y, 'map_brawler', { height: unitH,     speed: 100 });
    this.healer  = new MapUnit(this, start.x - 76,  start.y, 'map_healer',  { height: unitH - 4, speed: 100 });

    // История позиций героя для следования спутников
    this._heroTrail = [];
    this._trailInterval = 0;

    // ── Враги ────────────────────────────────────────────────────────
    this._bandits = [];
    this._spawnBandits();

    // ── Камера: вся карта видна на экране, без скролла ───────────────
    // Карта 1672x941, экран 1280x720 → подгоняем масштаб чтобы влезла
    const scaleX = 1280 / mapW;
    const scaleY = 720  / mapH;
    const zoom   = Math.min(scaleX, scaleY);
    this.cameras.main.setZoom(zoom);
    this.cameras.main.centerOn(mapW / 2, mapH / 2);

    // ── Клик для движения ─────────────────────────────────────────────
    this.input.on('pointerdown', (ptr) => {
      if (ptr.rightButtonDown()) return;
      const sx = ptr.x, sy = ptr.y;
      // Конвертируем экранные координаты в координаты карты для проверки walkable
      const mx = (sx - this._mapOffX) / this._mapScale;
      const my = (sy - this._mapOffY) / this._mapScale;
      const clamped = this.walkable.clamp(mx, my);
      // Обратно в экранные
      const dest = this._toScreen(clamped.x, clamped.y);
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
    // Waypoints в координатах карты → конвертируем в экранные
    const patrols = [
      [{ x: 650, y: 430 }, { x: 820, y: 415 }, { x: 720, y: 445 }],
      [{ x: 1050, y: 390 }, { x: 1200, y: 370 }, { x: 1120, y: 410 }],
    ].map(wps => wps.map(p => this._toScreen(p.x, p.y)));

    const unitH = Math.round(88 * this._mapScale);
    patrols.forEach((waypoints, i) => {
      const b = new MapUnit(this, waypoints[0].x, waypoints[0].y, 'map_bandit', {
        height: unitH, speed: 42
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
    this.time.delayedCall(400, () => {
      this.cameras.main.fade(500, 0, 0, 0, false, (cam, progress) => {
        if (progress === 1) {
          // Через LoadingScene — покажет наш экран загрузки
          this.scene.start('LoadingScene', {
            destination: 'BattleScene',
            destinationData: {}
          });
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
    this.add.text(16, 16, '🗺 Кликни по дороге чтобы идти', {
      fontSize: '13px', color: '#C9A84C', fontFamily: 'serif',
      backgroundColor: '#00000088', padding: { x: 8, y: 4 }
    }).setDepth(50).setScrollFactor(0);

    // ── Портреты игрока (левая панель, как в бою) ─────────────────────
    const portraits = [
      { key: 'portrait_hero_duelist',    label: 'Дуэлянт' },
      { key: 'portrait_companion_brawler', label: 'Боец' },
      { key: 'portrait_companion_healer',  label: 'Знахарка' },
    ];
    const cardW = 64, cardH = 72, startY = 120, gapY = 80;
    portraits.forEach((p, i) => {
      const cx = 38, cy = startY + i * gapY;
      this.add.rectangle(cx, cy, cardW, cardH, 0x0a0810, 0.85)
        .setStrokeStyle(1, 0x334466).setDepth(50).setScrollFactor(0);
      const img = this.add.image(cx, cy - 6, p.key).setDepth(51).setScrollFactor(0);
      const s = Math.min((cardW - 4) / img.width, (cardH - 18) / img.height);
      img.setScale(s);
      this.add.text(cx, cy + cardH / 2 - 10, p.label, {
        fontSize: '9px', color: '#AAAAAA', fontFamily: 'serif'
      }).setOrigin(0.5, 1).setDepth(51).setScrollFactor(0);
    });

    // ── Hover-портрет бандита (появляется при наведении) ─────────────
    this._hoverPortrait = this.add.image(200, 60, 'portrait_bandit_commander')
      .setScale(0.18).setDepth(60).setScrollFactor(0).setAlpha(0).setVisible(false);
    this._hoverBg = this.add.rectangle(200, 60, 80, 90, 0x0a0810, 0.9)
      .setStrokeStyle(1, 0x663333).setDepth(59).setScrollFactor(0).setAlpha(0).setVisible(false);
    this._hoverLabel = this.add.text(200, 102, 'Разбойник', {
      fontSize: '9px', color: '#CC4444', fontFamily: 'serif'
    }).setOrigin(0.5).setDepth(61).setScrollFactor(0).setAlpha(0).setVisible(false);

    // Показываем hover при наведении на бандита
    this.input.on('pointermove', (ptr) => {
      let hovered = false;
      this._bandits.forEach(b => {
        if (b.encountered) return;
        const d = Phaser.Math.Distance.Between(ptr.x, ptr.y, b.unit.sprite.x, b.unit.sprite.y);
        if (d < 35) hovered = true;
      });
      [this._hoverPortrait, this._hoverBg, this._hoverLabel].forEach(el => {
        el.setVisible(hovered).setAlpha(hovered ? 1 : 0);
      });
    });

    // Музыкальный плеер
    this.music = new MusicPlayer(this);
    this.music.create();
  }
}
