/**
 * DialoguePanel — in-world диалоговый UI (Section 8 North Star doc).
 * Использует готическую рамку dialog_frame как полноэкранный overlay.
 * Рамка 666×375 RGBA масштабируется до 1280×720 (1:1 соотношение).
 */
export class DialoguePanel {
  constructor(scene) {
    this.scene   = scene;
    this._group  = scene.add.group();
    this._active = false;
  }

  /**
   * @param {object} cfg
   * @param {string}   cfg.portraitLeft   — ключ текстуры: герой
   * @param {string}   cfg.portraitRight  — ключ текстуры: NPC
   * @param {string}   cfg.speakerName    — имя говорящего
   * @param {string}   cfg.text           — реплика NPC
   * @param {Array}    cfg.choices        — [{label, style?, onSelect}]
   *   style: 'default' | 'attack' | 'threat' | 'retreat'
   */
  show(cfg) {
    this.hide();
    this._active = true;

    const scene = this.scene;
    const W = 1280, H = 720;

    // ── Затемнение за рамкой ──────────────────────────────────────────
    const overlay = scene.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.55)
      .setDepth(78).setScrollFactor(0);
    this._add(overlay);

    // ── Рамка — полноэкранная ─────────────────────────────────────────
    const frame = scene.add.image(W / 2, H / 2, 'dialog_frame')
      .setDepth(79).setScrollFactor(0);
    // Масштабируем чтобы точно покрыть 1280×720
    frame.setScale(W / frame.width, H / frame.height);
    this._add(frame);

    // ── Портреты ──────────────────────────────────────────────────────
    //    Левый (герой): внутри левой части рамки
    //    Правый (NPC):  внутри правой части рамки
    const portW = 190, portH = 230;
    const portY  = H / 2 - 20;

    // Левый портрет
    const leftX = 118;
    const leftBg = scene.add.rectangle(leftX, portY, portW, portH, 0x06080f, 0.9)
      .setStrokeStyle(1, 0x3a4a6a, 0.8).setDepth(80).setScrollFactor(0);
    this._add(leftBg);

    if (scene.textures.exists(cfg.portraitLeft)) {
      const lp = scene.add.image(leftX, portY, cfg.portraitLeft)
        .setDepth(81).setScrollFactor(0);
      lp.setScale(Math.min((portW - 6) / lp.width, (portH - 6) / lp.height));
      this._add(lp);
    }

    // Правый портрет
    const rightX = W - 118;
    const rightBg = scene.add.rectangle(rightX, portY, portW, portH, 0x0f0606, 0.9)
      .setStrokeStyle(1, 0x6a3a3a, 0.8).setDepth(80).setScrollFactor(0);
    this._add(rightBg);

    if (scene.textures.exists(cfg.portraitRight)) {
      const rp = scene.add.image(rightX, portY, cfg.portraitRight)
        .setDepth(81).setScrollFactor(0);
      rp.setScale(Math.min((portW - 6) / rp.width, (portH - 6) / rp.height));
      this._add(rp);
    }

    // Имя NPC под правым портретом
    if (cfg.speakerName) {
      const nameLabel = scene.add.text(rightX, portY + portH / 2 + 16, cfg.speakerName, {
        fontFamily: 'serif', fontSize: '13px', color: '#BB5555',
        stroke: '#000', strokeThickness: 2,
      }).setOrigin(0.5, 0).setDepth(82).setScrollFactor(0);
      this._add(nameLabel);
    }

    // ── Реплика NPC ───────────────────────────────────────────────────
    const textX    = leftX  + portW / 2 + 30;
    const textMaxW = rightX - portW / 2 - 30 - textX;
    const textY    = H / 2 - 115;

    const speechText = scene.add.text(textX, textY, cfg.text || '', {
      fontFamily: 'serif',
      fontSize:   '18px',
      color:      '#E8E2D4',
      wordWrap:   { width: textMaxW },
      lineSpacing: 6,
      stroke:     '#000000',
      strokeThickness: 1,
    }).setDepth(82).setScrollFactor(0);
    this._add(speechText);

    // ── Разделитель между репликой и вариантами ───────────────────────
    const sepY = H / 2 + 28;
    const sep  = scene.add.rectangle(W / 2, sepY, textMaxW + 60, 1, 0x7a6530, 0.6)
      .setDepth(81).setScrollFactor(0);
    this._add(sep);

    // ── Варианты ответа ───────────────────────────────────────────────
    const styleColor = {
      default: '#C9A84C',
      attack:  '#E05050',
      threat:  '#E08030',
      retreat: '#888888',
    };
    const styleHover = {
      default: '#FFD700',
      attack:  '#FF8080',
      threat:  '#FFB060',
      retreat: '#BBBBBB',
    };

    const choiceStartY = sepY + 22;
    const choiceGapY   = 34;

    (cfg.choices || []).forEach((ch, i) => {
      const color = styleColor[ch.style || 'default'] || styleColor.default;
      const hover = styleHover[ch.style || 'default'] || styleHover.default;

      const btn = scene.add.text(textX, choiceStartY + i * choiceGapY, `${i + 1}. ${ch.label}`, {
        fontFamily: 'serif',
        fontSize:   '17px',
        color,
        stroke:     '#000000',
        strokeThickness: 2,
      })
        .setDepth(83).setScrollFactor(0)
        .setInteractive({ useHandCursor: true });

      btn.on('pointerover', () => btn.setColor(hover));
      btn.on('pointerout',  () => btn.setColor(color));
      btn.on('pointerdown', () => {
        this.hide();
        if (ch.onSelect) ch.onSelect();
      });

      this._add(btn);
    });

    // ── Fade in ───────────────────────────────────────────────────────
    this._group.getChildren().forEach(obj => {
      const targetAlpha = (obj === overlay) ? 0.55 : 1;
      obj.setAlpha(0);
      scene.tweens.add({
        targets: obj, alpha: targetAlpha, duration: 220, ease: 'Power1',
      });
    });
  }

  hide() {
    this._group.getChildren().forEach(obj => obj.destroy());
    this._group.clear(true, true);
    this._active = false;
  }

  get active() { return this._active; }

  _add(obj) { this._group.add(obj); }
}
