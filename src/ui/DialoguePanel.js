/**
 * DialoguePanel — нижняя диалоговая полоса в стиле RPG.
 * dialog_frame.png — центральная рамка. Портреты снаружи по бокам.
 */
export class DialoguePanel {
  constructor(scene) {
    this.scene   = scene;
    this._group  = scene.add.group();
    this._active = false;
  }

  show(cfg) {
    this.hide();
    this._active = true;

    const scene = this.scene;
    const zoom  = scene.cameras.main.zoom || 1;
    const s     = v => v / zoom;

    const SW = 1280, SH = 720;

    const hasLeft  = !!(cfg.portraitLeft  && scene.textures.exists(cfg.portraitLeft));
    const hasRight = !!(cfg.portraitRight && scene.textures.exists(cfg.portraitRight));

    // ── Размеры панели ─────────────────────────────────────────────────
    const barH_s   = 240;
    const barTop_s = SH - barH_s;       // 480
    const barCY_s  = SH - barH_s / 2;  // 600

    // ── Портреты: снаружи рамки, по краям экрана ───────────────────────
    const portW_s = 155;
    const portH_s = 210;
    const portCY_s = barCY_s - 10; // чуть выше центра — выступают вверх

    // ── Рамка: занимает пространство МЕЖДУ портретами ──────────────────
    const frameMargin_s = hasLeft || hasRight ? portW_s + 10 : 20;
    const frameL_s = hasLeft  ? frameMargin_s       : 20;
    const frameR_s = hasRight ? SW - frameMargin_s  : SW - 20;
    const frameCX_s = (frameL_s + frameR_s) / 2;
    const frameW_s  = frameR_s - frameL_s;
    const frameH_s  = barH_s;

    // ── Тёмный фон (full width) ────────────────────────────────────────
    const bg = scene.add.rectangle(
      s(SW / 2), s(barCY_s), s(SW), s(barH_s), 0x020305, 0.93
    ).setDepth(950).setScrollFactor(0);
    this._add(bg);

    // ── Декоративная рамка ─────────────────────────────────────────────
    if (scene.textures.exists('dialog_frame')) {
      const frame = scene.add.image(s(frameCX_s), s(barCY_s), 'dialog_frame')
        .setDisplaySize(s(frameW_s), s(frameH_s))
        .setDepth(951).setScrollFactor(0);
      this._add(frame);
    }

    // ── Портреты ───────────────────────────────────────────────────────
    if (hasLeft) {
      const lx_s = portW_s / 2 + 5;
      this._drawPortrait(scene, s(lx_s), s(portCY_s), s(portW_s), s(portH_s),
                         cfg.portraitLeft, cfg.speakerNameLeft || null, s(portH_s));
    }
    if (hasRight) {
      const rx_s = SW - portW_s / 2 - 5;
      this._drawPortrait(scene, s(rx_s), s(portCY_s), s(portW_s), s(portH_s),
                         cfg.portraitRight, cfg.speakerName || null, s(portH_s));
    }

    // ── Текстовая зона — внутри рамки, с отступом от края рамки ────────
    const innerPad_s = 30;  // отступ от края рамки до текста
    const textL_s = frameL_s + innerPad_s;
    const textR_s = frameR_s - innerPad_s;
    const textW_s = textR_s - textL_s;

    // Рамка: верхняя часть ≈ 40px занята черепом-орнаментом → текст ниже
    const textY_s = barTop_s + 45;

    const speech = scene.add.text(s(textL_s), s(textY_s), cfg.text || '', {
      fontFamily:      'serif',
      fontSize:        `${Math.round(16 / zoom)}px`,
      color:           '#E8E2D4',
      wordWrap:        { width: s(textW_s) },
      lineSpacing:     s(4),
      stroke:          '#000000',
      strokeThickness: 1,
    }).setDepth(955).setScrollFactor(0);
    this._add(speech);

    // ── Разделитель ────────────────────────────────────────────────────
    const sepY_s = barTop_s + 120;
    const sep = scene.add.rectangle(
      s(frameCX_s), s(sepY_s), s(textW_s), s(1), 0x8a7030, 0.5
    ).setDepth(954).setScrollFactor(0);
    this._add(sep);

    // ── Варианты ответа ────────────────────────────────────────────────
    const styleColor = { default: '#C9A84C', attack: '#E05050', threat: '#E08030', retreat: '#888888' };
    const styleHover = { default: '#FFD700', attack: '#FF8080', threat: '#FFB060', retreat: '#BBBBBB' };

    const choiceStartY_s = sepY_s + 14;
    const choiceGapY_s   = 28;

    (cfg.choices || []).forEach((ch, i) => {
      const color = styleColor[ch.style || 'default'] || styleColor.default;
      const hover = styleHover[ch.style || 'default'] || styleHover.default;
      const btn = scene.add.text(
        s(textL_s),
        s(choiceStartY_s + i * choiceGapY_s),
        `${i + 1}. ${ch.label}`,
        {
          fontFamily:      'serif',
          fontSize:        `${Math.round(15 / zoom)}px`,
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

    // ── Fade-in ────────────────────────────────────────────────────────
    this._group.getChildren().forEach(obj => {
      obj.setAlpha(0);
      scene.tweens.add({ targets: obj, alpha: obj === bg ? 0.93 : 1, duration: 200, ease: 'Power1' });
    });
  }

  _drawPortrait(scene, x, y, w, h, key, name, portH) {
    const img = scene.add.image(x, y, key).setDepth(953).setScrollFactor(0);
    img.setScale(Math.min(w / img.width, h / img.height));
    this._add(img);

    if (name) {
      const zoom = scene.cameras.main.zoom || 1;
      const label = scene.add.text(x, y + (portH || h) / 2 + 6, name, {
        fontFamily:      'serif',
        fontSize:        `${Math.round(11 / zoom)}px`,
        color:           '#BB5555',
        stroke:          '#000',
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
  _add(obj)    { this._group.add(obj); }
}
