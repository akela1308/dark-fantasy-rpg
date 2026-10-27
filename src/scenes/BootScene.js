import * as Phaser from 'phaser/dist/phaser.esm.js';
import { SaveSystem, START_MAP, START_SPAWN, SLOTS } from '../utils/SaveSystem.js';
import MAP_CONFIGS from '../data/maps.json';
import { Frame } from '../ui/Frame.js';
import { nicheButton } from '../ui/NicheButton.js';
import { applySavedVolume } from '../ui/GameMenu.js';
import { setBackdrop } from '../ui/Backdrop.js';
import { FONT, COLOR } from '../ui/Theme.js';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload() {
    this.load.image('title_bg', 'title_bg.png');
  }

  create() {
    // Сцена переиспользуется (после смерти в Железе титул открывается снова)
    this._starting = false;
    applySavedVolume(this.game);
    const W = 1280, H = 720;
    const cx = W / 2, cy = H / 2;

    // ── Фон ───────────────────────────────────────────────────────────────
    setBackdrop(this, 'title_bg');
    const bg = this.add.image(cx, cy, 'title_bg')
      .setDisplaySize(W, H)
      .setAlpha(0);

    // Нижний градиент - читаемость кнопки
    const gradBot = this.add.rectangle(cx, H - 100, W, 200, 0x000000, 0.65).setAlpha(0);
    // Верхний градиент - читаемость заголовка
    const gradTop = this.add.rectangle(cx, 150, W, 300, 0x000000, 0.45).setAlpha(0);

    // ── Заголовок ─────────────────────────────────────────────────────────
    const title = this.add.text(cx, 150, 'МОРТИС', {
      fontFamily: FONT,
      fontSize:   '92px',
      color:      '#C9A84C',
      stroke:     '#1a0f00',
      strokeThickness: 6,
      letterSpacing: 14,
      shadow: { offsetX: 0, offsetY: 0, color: '#C9A84C', blur: 24, fill: true },
    }).setOrigin(0.5).setAlpha(0);

    const subtitle = this.add.text(cx, 250, 'ТЁМНОЕ ФЭНТЕЗИ', {
      fontFamily: FONT,
      fontSize:   '22px',
      color:      '#b09a70',
      letterSpacing: 8,
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5).setAlpha(0);

    // Декоративные линии под заголовком
    const lineL = this.add.rectangle(cx - 240, 274, 170, 1, 0x8a7030, 1).setAlpha(0);
    const lineR = this.add.rectangle(cx + 240, 274, 170, 1, 0x8a7030, 1).setAlpha(0);

    const ver = this.add.text(W - 16, H - 12, 'v0.3, прототип', {
      fontFamily: FONT, fontSize: '11px', color: '#6a6352',
    }).setOrigin(1, 1).setAlpha(0);

    const fadeIn = (obj, delay, duration) => {
      this.tweens.add({ targets: obj, alpha: 1, duration: duration || 1200, delay, ease: 'Power2' });
    };
    fadeIn(bg, 0, 2000);
    fadeIn(gradBot, 400, 1200);
    fadeIn(gradTop, 400, 1200);
    fadeIn(title, 800, 1400);
    fadeIn(subtitle, 1200, 1000);
    fadeIn(lineL, 1400, 800);
    fadeIn(lineR, 1400, 800);
    fadeIn(ver, 2400, 800);
    this.time.delayedCall(3000, () => {
      this.tweens.add({ targets: title, alpha: { from: 1, to: 0.88 }, duration: 2800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    });

    // ── Старт ─────────────────────────────────────────────────────────────
    const go = (save) => {
      if (this._starting) return;
      this._starting = true;
      this.cameras.main.fade(700, 0, 0, 0, false, (cam, progress) => {
        if (progress !== 1) return;
        this.scene.start('LoadingScene', {
          destination: 'MapScene',
          destinationData: save
            ? { mapKey: save.mapKey || START_MAP, spawnId: save.spawnId || START_SPAWN }
            : { mapKey: START_MAP, spawnId: START_SPAWN },
        });
      });
    };
    const continueGame = () => {
      const save = SaveSystem.load();
      if (!save) return;
      SaveSystem.applyFlagsToRegistry(this.game.registry, { force: true });
      go(save);
    };
    const newGame = (mode) => {
      SaveSystem.newGame(this.game.registry, { mode });
      go(null);
    };

    const save = SaveSystem.load();
    const menu = [];
    const fadeMenu = objs => objs.forEach(o => { o.setAlpha(0); fadeIn(o, 1800, 900); });
    this._mode = 'chronicle';
    const MODES = {
      chronicle: ['Хроника', 'Поражение возвращает к последнему привалу'],
      iron: ['Железо', 'Смерть отряда стирает сохранение'],
    };
    if (save) {
      const info = SaveSystem.slotInfo(SaveSystem.getSlot());
      const where = MAP_CONFIGS[info?.mapKey]?.name || info?.mapKey || '';
      const b1 = nicheButton(this, cx, 590, 'Продолжить', { w: 300, h: 56, size: 20, depth: 10, onClick: continueGame,
        sub: `уровень ${info?.level || 1}, ${where}, ${info?.mode === 'iron' ? 'Железо' : 'Хроника'}` });
      const b2 = nicheButton(this, cx, 650, 'Новая игра', { w: 300, h: 40, size: 16, depth: 10, onClick: () => this._confirmNew(newGame, MODES) });
      menu.push(...b1.objs, ...b2.objs);
      this._enter = continueGame;
    } else {
      const b1 = nicheButton(this, cx, 590, 'Новая игра', { w: 300, h: 56, size: 20, depth: 10, onClick: () => newGame(this._mode) });
      menu.push(...b1.objs);
      // Режим: две ниши-переключателя
      const modeBtns = Object.entries(MODES).map(([id, [name]], i) => {
        const b = nicheButton(this, cx + (i ? 110 : -110), 650, name, { w: 200, h: 36, size: 15, depth: 10, onClick: () => { this._mode = id; paint(); } });
        menu.push(...b.objs);
        return [id, b];
      });
      const modeHint = this.add.text(cx, 680, '', { fontFamily: FONT, fontSize: '12px', color: '#a89c80', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5, 0);
      menu.push(modeHint);
      const paint = () => {
        modeBtns.forEach(([id, b]) => b.text.setColor(id === this._mode ? '#f0d890' : '#6a645a'));
        modeHint.setText(`Режим: ${MODES[this._mode][0]}. ${MODES[this._mode][1]}.`);
      };
      paint();
      this._enter = () => newGame(this._mode);
    }

    // Три слота сохранений (04_ТЕХПЛАН 2.2): клик выбирает слот
    const cur = SaveSystem.getSlot();
    SLOTS.forEach((n, i) => {
      const info = SaveSystem.slotInfo(n);
      const label = info ? `Слот ${n}: ур. ${info.level}, ${MAP_CONFIGS[info.mapKey]?.name || info.mapKey}` : `Слот ${n}: пусто`;
      const t = this.add.text(cx + (i - 1) * 300, 24, label, {
        fontFamily: FONT, fontSize: '13px', color: n === cur ? '#d4a832' : '#8a826c', stroke: '#000', strokeThickness: 3,
      }).setOrigin(0.5).setInteractive({ useHandCursor: true });
      t.on('pointerdown', () => { SaveSystem.setSlot(n); this.scene.restart(); });
      menu.push(t);
    });
    fadeMenu(menu);

    this.input.keyboard.on('keydown-ENTER', () => { if (this.time.now > 1800 && !Frame.current(this)) this._enter?.(); });
  }

  /** «Новая игра» поверх сохранения: выбор режима и предупреждение, что слот перезапишется. */
  _confirmNew(newGame, MODES) {
    const f = new Frame(this, { w: 620, h: 330, title: 'Новая игра', depth: 100 });
    f.text(640, f.inner.y + 4, `Сохранение в слоте ${SaveSystem.getSlot()} будет стёрто.\nВыберите режим:`, 'body',
      { align: 'center', color: COLOR.text, lineSpacing: 4 }).setOrigin(0.5, 0);
    Object.entries(MODES).forEach(([id, [name, desc]], i) => {
      const b = nicheButton(this, 640 + (i ? 140 : -140), f.inner.y + 118, name, { w: 260, h: 74, size: 17, depth: 120, sub: desc,
        onClick: () => { f.close(true); newGame(id); } });
      b.objs.forEach(o => f.add(o, 20));
    });
  }
}
