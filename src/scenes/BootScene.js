import * as Phaser from 'phaser/dist/phaser.esm.js';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload() {
    this.load.image('title_bg', 'title_bg.png');
  }

  create() {
    const W = 1280, H = 720;
    const cx = W / 2, cy = H / 2;

    // ── Фон ───────────────────────────────────────────────────────────────
    const bg = this.add.image(cx, cy, 'title_bg')
      .setDisplaySize(W, H)
      .setAlpha(0);

    // Нижний градиент — читаемость кнопки
    const gradBot = this.add.rectangle(cx, H - 100, W, 200, 0x000000, 0.65).setAlpha(0);
    // Верхний градиент — читаемость заголовка
    const gradTop = this.add.rectangle(cx, 120, W, 240, 0x000000, 0.45).setAlpha(0);

    // ── Заголовок ─────────────────────────────────────────────────────────
    const title = this.add.text(cx, 150, 'DARK FANTASY', {
      fontFamily: 'serif',
      fontSize:   '86px',
      color:      '#C9A84C',
      stroke:     '#1a0f00',
      strokeThickness: 6,
      shadow: { offsetX: 0, offsetY: 0, color: '#C9A84C', blur: 24, fill: true },
    }).setOrigin(0.5).setAlpha(0);

    const subtitle = this.add.text(cx, 248, 'ТАКТИЧЕСКАЯ  RPG', {
      fontFamily: 'serif',
      fontSize:   '24px',
      color:      '#9a8060',
      letterSpacing: 8,
    }).setOrigin(0.5).setAlpha(0);

    // Декоративные линии под заголовком
    const lineL = this.add.rectangle(cx - 220, 272, 170, 1, 0x8a7030, 1).setAlpha(0);
    const lineR = this.add.rectangle(cx + 220, 272, 170, 1, 0x8a7030, 1).setAlpha(0);

    // ── Версия ────────────────────────────────────────────────────────────
    const ver = this.add.text(W - 16, H - 12, 'v0.3 — прототип', {
      fontFamily: 'serif', fontSize: '11px', color: '#444433',
    }).setOrigin(1, 1).setAlpha(0);

    // ── Кнопка НАЧАТЬ ─────────────────────────────────────────────────────
    const btn = this.add.text(cx, H - 120, '[ НАЧАТЬ ИГРУ ]', {
      fontFamily: 'serif',
      fontSize:   '34px',
      color:      '#E8DEC8',
      stroke:     '#000',
      strokeThickness: 3,
    }).setOrigin(0.5).setAlpha(0).setInteractive({ useHandCursor: true });

    const btnHint = this.add.text(cx, H - 78, 'или нажми любую клавишу', {
      fontFamily: 'serif', fontSize: '13px', color: '#4a4535',
    }).setOrigin(0.5).setAlpha(0);

    // ── Fade-in всего ─────────────────────────────────────────────────────
    const fadeIn = (obj, delay, duration) => {
      this.tweens.add({ targets: obj, alpha: 1, duration: duration || 1200, delay, ease: 'Power2' });
    };

    fadeIn(bg,       0,    2000);
    fadeIn(gradBot,  400,  1200);
    fadeIn(gradTop,  400,  1200);
    fadeIn(title,    800,  1400);
    fadeIn(subtitle, 1200, 1000);
    fadeIn(lineL,    1400, 800);
    fadeIn(lineR,    1400, 800);
    fadeIn(btn,      1800, 1000);
    fadeIn(btnHint,  2200, 1000);
    fadeIn(ver,      2400, 800);

    // ── Пульсация кнопки ──────────────────────────────────────────────────
    this.time.delayedCall(2800, () => {
      this.tweens.add({
        targets: btn, alpha: { from: 1, to: 0.55 },
        duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      });
    });

    // ── Лёгкое мерцание заголовка ─────────────────────────────────────────
    this.time.delayedCall(3000, () => {
      this.tweens.add({
        targets: title, alpha: { from: 1, to: 0.88 },
        duration: 2800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      });
    });

    // ── Hover кнопки ──────────────────────────────────────────────────────
    btn.on('pointerover', () => {
      btn.setColor('#FFD700');
      this.tweens.killTweensOf(btn);
      btn.setAlpha(1);
    });
    btn.on('pointerout', () => {
      btn.setColor('#E8DEC8');
      this.tweens.add({
        targets: btn, alpha: { from: 1, to: 0.55 },
        duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      });
    });

    // ── Старт игры ────────────────────────────────────────────────────────
    const startGame = () => {
      if (this._starting) return;
      this._starting = true;
      this.cameras.main.fade(700, 0, 0, 0, false, (cam, progress) => {
        if (progress === 1) {
          this.scene.start('LoadingScene', {
            destination:     'MapScene',
            destinationData: { mapKey: 'map1' },
          });
        }
      });
    };

    btn.on('pointerdown', startGame);
    this.input.keyboard.on('keydown', () => {
      if (this.time.now > 1800) startGame();
    });
  }
}
