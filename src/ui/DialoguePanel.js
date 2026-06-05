/**
 * DialoguePanel — нижняя диалоговая полоса в стиле RPG.
 *
 * Phaser 3 + zoom camera: setScrollFactor(0) убирает скролл, но zoom всё равно
 * масштабирует объекты. Формула: screen_px = world_px * zoom
 * → world_px = screen_px / zoom
 *
 * Всё позиционирование делается в screen-пикселях (1280×720), потом делится на zoom.
 */
export class DialoguePanel {
  constructor(scene) {
    this.scene  = scene;
    this._group = scene.add.group();
    this._active = false;
  }

  show(cfg) {
    this.hide();
    this._active = true;

    const scene = this.scene;

    // ── Zoom-компенсация ───────────────────────────────────────────────
    const zoom = scene.cameras.main.zoom || 1;
    // Переводим screen-пиксель в world-координату
    const s = v => v / zoom;

    // Размеры canvas в screen-пикселях
    const SW = 1280, SH = 720;

    const hasLeft  = !!(cfg.portraitLeft  && scene.textures.exists(cfg.portraitLeft));
    const hasRight = !!(cfg.portraitRight && scene.textures.exists(cfg.portraitRight));

    // ── Нижняя панель (screen coords → world coords) ───────────────────
    const barH_s  = 220;                    // высота в screen px
    const barTop_s = SH - barH_s;           // 500 screen px — верхняя граница панели
    const barCY_s  = SH - barH_s / 2;       // 610 screen px — центр панели

    // Фон панели — без обводки, полная ширина
    const bg = scene.add.rectangle(
      s(SW / 2), s(barCY_s), s(SW), s(barH_s), 0x040608, 0.95
    ).setDepth(950).setScrollFactor(0);
    this._add(bg);

    // Золотая линия сверху (2px)
    const topLine = scene.add.rectangle(
      s(SW / 2), s(barTop_s), s(SW), s(2), 0xc0a040, 1
    ).setDepth(951).setScrollFactor(0);
    this._add(topLine);

    // ── Портреты (в screen px, конвертируем в world) ───────────────────
    const portW_s = 160, portH_s = 190;
    const portCY_s = barCY_s;   // центр портрета = центр панели по Y

    let textLeft_s  = 20;
    let textRight_s = SW - 20;

    if (hasLeft) {
      const lx_s = 95;
      this._drawPortrait(scene, s(lx_s), s(portCY_s), s(portW_s), s(portH_s),
                         cfg.portraitLeft, null);
      textLeft_s = lx_s + portW_s / 2 + 10;   // 185 screen px
    }

    if (hasRight) {
      const rx_s = SW - 95;  // 1185 screen px
      this._drawPortrait(scene, s(rx_s), s(portCY_s), s(portW_s), s(portH_s),
                         cfg.portraitRight, cfg.speakerName, s(portH_s));
      textRight_s = rx_s - portW_s / 2 - 10;  // 1095 screen px
    }

    // ── Текст реплики ─────────────────────────────────────────────────
    const textW_s = textRight_s - textLeft_s;
    const textY_s = barTop_s + 16;

    const speech = scene.add.text(s(textLeft_s), s(textY_s), cfg.text || '', {
      fontFamily:      'serif',
      fontSize:        `${Math.round(17 / zoom)}px`,
      color:           '#E8E2D4',
      wordWrap:        { width: s(textW_s) },
      lineSpacing:     s(5),
      stroke:          '#000000',
      strokeThickness: 1,
    }).setDepth(955).setScrollFactor(0);
    this._add(speech);

    // ── Разделитель ───────────────────────────────────────────────────
    const sepY_s = barTop_s + 100;
    const sep = scene.add.rectangle(
      s((textLeft_s + textRight_s) / 2), s(sepY_s), s(textW_s), s(1), 0x8a7030, 0.6
    ).setDepth(954).setScrollFactor(0);
    this._add(sep);

    // ── Варианты ответа ───────────────────────────────────────────────
    const styleColor = { default: '#C9A84C', attack: '#E05050', threat: '#E08030', retreat: '#888888' };
    const styleHover = { default: '#FFD700', attack: '#FF8080', threat: '#FFB060', retreat: '#BBBBBB' };
    const choiceStartY_s = sepY_s + 16;
    const choiceGapY_s   = 30;

    (cfg.choices || []).forEach((ch, i) => {
      const color = styleColor[ch.style || 'default'] || styleColor.default;
      const hover = styleHover[ch.style || 'default'] || styleHover.default;

      const btn = scene.add.text(
        s(textLeft_s),
        s(choiceStartY_s + i * choiceGapY_s),
        `${i + 1}. ${ch.label}`,
        {
          fontFamily:      'serif',
          fontSize:        `${Math.round(16 / zoom)}px`,
          color,
          stroke:          '#000',
          strokeThickness: 2,
        }
      ).setDepth(956).setScrollFactor(0)
        .setInteractive({ useHandCursor: true });

      btn.on('pointerover',  () => btn.setColor(hover));
      btn.on('pointerout',   () => btn.setColor(color));
      btn.on('pointerdown',  () => { this.hide(); if (ch.onSelect) ch.onSelect(); });
      this._add(btn);
    });

    // ── Fade-in ───────────────────────────────────────────────────────
    this._group.getChildren().forEach(obj => {
      const target = obj === bg ? 0.95 : 1;
      obj.setAlpha(0);
      scene.tweens.add({ targets: obj, alpha: target, duration: 200, ease: 'Power1' });
    });
  }

  // portH нужен чтобы разместить подпись имени под портретом
  _drawPortrait(scene, x, y, w, h, key, name, portH) {
    // Изображение напрямую — без фона и без рамки
    const img = scene.add.image(x, y, key).setDepth(953).setScrollFactor(0);
    img.setScale(Math.min(w / img.width, h / img.height));
    this._add(img);

    if (name) {
      const label = scene.add.text(x, y + (portH || h) / 2 + 8, name, {
        fontFamily: 'serif',
        fontSize:   `${Math.round(12 / (scene.cameras.main.zoom || 1))}px`,
        color:      '#BB5555',
        stroke:     '#000',
        strokeThickness: 2,
      }).setOrigin(0.5, 0).setDepth(956).setScrollFactor(0);
      this._add(label);
    }
  }

  hide() {
    this._group.getChildren().forEach(obj => obj.destroy());
    this._group.clear(true, true);
    this._active = false;
  }

  get active() { return this._active; }

  _add(obj) { this._group.add(obj); }
}
