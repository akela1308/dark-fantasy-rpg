/**
 * DialoguePanel — нижняя диалоговая полоса в стиле RPG.
 * Расположена вплотную к нижнему краю (y 500–720). Портреты внутри панели.
 */
export class DialoguePanel {
  constructor(scene) {
    this.scene  = scene;
    this._group = scene.add.group();
    this._active = false;
  }

  /**
   * @param {object} cfg
   * @param {string}  [cfg.portraitLeft]  — текстура портрета слева (герой)
   * @param {string}  [cfg.portraitRight] — текстура портрета справа (NPC)
   * @param {string}  [cfg.speakerName]   — имя говорящего
   * @param {string}  cfg.text            — текст реплики
   * @param {Array}   cfg.choices         — [{label, style?, onSelect}]
   */
  show(cfg) {
    this.hide();
    this._active = true;

    const scene = this.scene;
    const W = 1280, H = 720;

    const hasLeft  = !!(cfg.portraitLeft  && scene.textures.exists(cfg.portraitLeft));
    const hasRight = !!(cfg.portraitRight && scene.textures.exists(cfg.portraitRight));

    // ── Нижняя панель ─────────────────────────────────────────────────
    const barH   = 220;
    const barTop = 500;          // H - barH = 720 - 220 = 500
    const barCY  = 610;          // barTop + barH/2 = 500 + 110 = 610

    // Фон панели — без обводки
    const bg = scene.add.rectangle(W / 2, barCY, W, barH, 0x040608, 0.95)
      .setDepth(950).setScrollFactor(0);
    this._add(bg);

    // Верхняя золотая линия (2px)
    const topLine = scene.add.rectangle(W / 2, barTop, W, 2, 0xc0a040, 1)
      .setDepth(951).setScrollFactor(0);
    this._add(topLine);

    // ── Портреты (внутри панели) ───────────────────────────────────────
    const portW = 160, portH = 190;
    const portCY = barCY;  // центр портрета совпадает с центром панели

    let textLeft  = 20;
    let textRight = W - 20;

    // Левый портрет (герой) — x=95, без рамки
    if (hasLeft) {
      const lx = 95;
      this._drawPortrait(scene, lx, portCY, portW, portH, cfg.portraitLeft, null);
      textLeft = lx + portW / 2 + 10; // 185
    }

    // Правый портрет (NPC) — x=1185, без рамки
    if (hasRight) {
      const rx = 1185;
      this._drawPortrait(scene, rx, portCY, portW, portH, cfg.portraitRight, cfg.speakerName);
      textRight = rx - portW / 2 - 10; // 1095
    }

    // ── Текст реплики ─────────────────────────────────────────────────
    const textAreaW = textRight - textLeft;
    const textY     = barTop + 16;

    const speech = scene.add.text(textLeft, textY, cfg.text || '', {
      fontFamily:      'serif',
      fontSize:        '17px',
      color:           '#E8E2D4',
      wordWrap:        { width: textAreaW },
      lineSpacing:     5,
      stroke:          '#000000',
      strokeThickness: 1,
    }).setDepth(955).setScrollFactor(0);
    this._add(speech);

    // ── Разделитель ───────────────────────────────────────────────────
    const sepY = barTop + 100;
    const sep  = scene.add.rectangle(
      (textLeft + textRight) / 2, sepY, textAreaW, 1, 0x8a7030, 0.6
    ).setDepth(954).setScrollFactor(0);
    this._add(sep);

    // ── Варианты ответа ───────────────────────────────────────────────
    const styleColor = { default: '#C9A84C', attack: '#E05050', threat: '#E08030', retreat: '#888888' };
    const styleHover = { default: '#FFD700', attack: '#FF8080', threat: '#FFB060', retreat: '#BBBBBB' };
    const choiceStartY = sepY + 16;
    const choiceGapY   = 30;

    (cfg.choices || []).forEach((ch, i) => {
      const color = styleColor[ch.style || 'default'] || styleColor.default;
      const hover = styleHover[ch.style || 'default'] || styleHover.default;

      const btn = scene.add.text(
        textLeft,
        choiceStartY + i * choiceGapY,
        `${i + 1}. ${ch.label}`,
        { fontFamily: 'serif', fontSize: '16px', color, stroke: '#000', strokeThickness: 2 }
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

  // name передаётся только для NPC (правый портрет)
  _drawPortrait(scene, x, y, w, h, key, name) {
    // Изображение напрямую, без фонового прямоугольника и без рамки
    const img = scene.add.image(x, y, key).setDepth(953).setScrollFactor(0);
    img.setScale(Math.min(w / img.width, h / img.height));
    this._add(img);

    // Имя под портретом (только для NPC)
    if (name) {
      const label = scene.add.text(x, y + h / 2 + 8, name, {
        fontFamily: 'serif', fontSize: '12px', color: '#BB5555',
        stroke: '#000', strokeThickness: 2,
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
