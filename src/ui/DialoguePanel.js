/**
 * DialoguePanel — нижняя диалоговая полоса в стиле RPG.
 * Использует dialog_frame.png как декоративную рамку.
 * Портреты снаружи рамки по бокам.
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
    const zoom  = scene.cameras.main.zoom || 1;
    const s     = v => v / zoom;

    const SW = 1280, SH = 720;

    const hasLeft  = !!(cfg.portraitLeft  && scene.textures.exists(cfg.portraitLeft));
    const hasRight = !!(cfg.portraitRight && scene.textures.exists(cfg.portraitRight));

    // Портреты: 160×200 screen px, выступают выше панели
    const portW_s  = 160;
    const portH_s  = 200;
    const barH_s   = 260;
    const barTop_s = SH - barH_s;
    const barCY_s  = SH - barH_s / 2;

    // Зоны текста (screen px)
    const padPort  = 20;  // отступ текста от портрета
    let textLeft_s  = 40;
    let textRight_s = SW - 40;

    if (hasLeft)  textLeft_s  = padPort + portW_s + 20;      // ~200
    if (hasRight) textRight_s = SW - padPort - portW_s - 20; // ~1080

    const textW_s = textRight_s - textLeft_s;

    // ── Тёмный полупрозрачный фон (full width) ─────────────────────────
    const bg = scene.add.rectangle(
      s(SW / 2), s(barCY_s), s(SW), s(barH_s), 0x020305, 0.92
    ).setDepth(950).setScrollFactor(0);
    this._add(bg);

    // ── Декоративная рамка — растягивается по текстовой области ────────
    if (scene.textures.exists('dialog_frame')) {
      const frameX_s = (textLeft_s + textRight_s) / 2;
      const framePad_s = 30; // небольшой выход рамки за текст
      const frameW_s  = textW_s + framePad_s * 2;
      const frameH_s  = barH_s + 10; // чуть выше панели — украшение выступает

      const frame = scene.add.image(s(frameX_s), s(barCY_s), 'dialog_frame')
        .setDisplaySize(s(frameW_s), s(frameH_s))
        .setDepth(951).setScrollFactor(0).setAlpha(0.95);
      this._add(frame);
    }

    // ── Портреты — снаружи рамки, по краям панели ──────────────────────
    const portCY_s = barTop_s + barH_s * 0.45; // центр портрета

    if (hasLeft) {
      const lx_s = padPort + portW_s / 2;
      this._drawPortrait(scene, s(lx_s), s(portCY_s), s(portW_s), s(portH_s),
                         cfg.portraitLeft, null);
    }

    if (hasRight) {
      const rx_s = SW - padPort - portW_s / 2;
      this._drawPortrait(scene, s(rx_s), s(portCY_s), s(portW_s), s(portH_s),
                         cfg.portraitRight, cfg.speakerName, s(portH_s));
    }

    // ── Текст реплики ──────────────────────────────────────────────────
    const textY_s   = barTop_s + 22;
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

    // ── Разделитель ────────────────────────────────────────────────────
    const sepY_s = barTop_s + 108;
    const sep = scene.add.rectangle(
      s((textLeft_s + textRight_s) / 2), s(sepY_s), s(textW_s - 40), s(1), 0x8a7030, 0.5
    ).setDepth(954).setScrollFactor(0);
    this._add(sep);

    // ── Варианты ответа ────────────────────────────────────────────────
    const styleColor = { default: '#C9A84C', attack: '#E05050', threat: '#E08030', retreat: '#888888' };
    const styleHover = { default: '#FFD700', attack: '#FF8080', threat: '#FFB060', retreat: '#BBBBBB' };
    const choiceStartY_s = sepY_s + 16;
    const choiceGapY_s   = 30;

    (cfg.choices || []).forEach((ch, i) => {
      const color = styleColor[ch.style || 'default'] || styleColor.default;
      const hover = styleHover[ch.style || 'default'] || styleHover.default;

      const btn = scene.add.text(
        s(textLeft_s + 8),
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

    // ── Fade-in ────────────────────────────────────────────────────────
    this._group.getChildren().forEach(obj => {
      const target = obj === bg ? 0.92 : (obj.type === 'Image' && obj.texture?.key === 'dialog_frame') ? 0.95 : 1;
      obj.setAlpha(0);
      scene.tweens.add({ targets: obj, alpha: target, duration: 220, ease: 'Power1' });
    });
  }

  _drawPortrait(scene, x, y, w, h, key, name, portH) {
    const img = scene.add.image(x, y, key).setDepth(953).setScrollFactor(0);
    img.setScale(Math.min(w / img.width, h / img.height));
    this._add(img);

    if (name) {
      const zoom = scene.cameras.main.zoom || 1;
      const label = scene.add.text(x, y + (portH || h) / 2 + 8, name, {
        fontFamily:      'serif',
        fontSize:        `${Math.round(12 / zoom)}px`,
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

  _add(obj) { this._group.add(obj); }
}
