/**
 * DialoguePanel — in-world диалоговый UI (Section 8 North Star doc).
 * Отображается поверх карты без смены сцены.
 *
 * Использование:
 *   this._dialogue = new DialoguePanel(scene);
 *   this._dialogue.show({ ... });
 *   this._dialogue.hide();
 */
export class DialoguePanel {
  /**
   * @param {Phaser.Scene} scene
   */
  constructor(scene) {
    this.scene   = scene;
    this._group  = scene.add.group();
    this._active = false;
  }

  /**
   * @param {object} cfg
   * @param {string}   cfg.portraitLeft   — ключ текстуры левого портрета (герой)
   * @param {string}   cfg.portraitRight  — ключ текстуры правого портрета (NPC)
   * @param {string}   cfg.speakerName    — имя говорящего (NPC)
   * @param {string}   cfg.text           — реплика NPC
   * @param {Array}    cfg.choices        — [{label, style?, onSelect}]
   *   style: 'default' | 'attack' | 'threat' | 'retreat'
   */
  show(cfg) {
    this.hide(); // Очистим предыдущий если был
    this._active = true;

    const scene = this.scene;
    const W = 1280, H = 720;
    const panelH = 230;
    const panelY = H - panelH;

    // ── Полупрозрачный фон панели ─────────────────────────────────────
    const bg = scene.add.rectangle(W / 2, panelY + panelH / 2, W, panelH, 0x0a0810, 0.94)
      .setDepth(80).setScrollFactor(0);
    this._add(bg);

    // Верхняя граница — золотая линия
    const line = scene.add.rectangle(W / 2, panelY + 1, W, 2, 0x8B6914, 1)
      .setDepth(81).setScrollFactor(0);
    this._add(line);

    // ── Портрет левый (герой) ─────────────────────────────────────────
    const portSize = 170;
    const portPad  = 12;

    const leftBg = scene.add.rectangle(portPad + portSize / 2, panelY + panelH / 2, portSize, portSize, 0x0d1020, 0.95)
      .setStrokeStyle(2, 0x445577).setDepth(81).setScrollFactor(0);
    this._add(leftBg);

    if (scene.textures.exists(cfg.portraitLeft)) {
      const lp = scene.add.image(portPad + portSize / 2, panelY + panelH / 2, cfg.portraitLeft)
        .setDepth(82).setScrollFactor(0);
      const sc = Math.min((portSize - 8) / lp.width, (portSize - 8) / lp.height);
      lp.setScale(sc);
      this._add(lp);
    }

    // ── Портрет правый (NPC) ──────────────────────────────────────────
    const rightX = W - portPad - portSize / 2;
    const rightBg = scene.add.rectangle(rightX, panelY + panelH / 2, portSize, portSize, 0x0d0a0a, 0.95)
      .setStrokeStyle(2, 0x553333).setDepth(81).setScrollFactor(0);
    this._add(rightBg);

    if (scene.textures.exists(cfg.portraitRight)) {
      const rp = scene.add.image(rightX, panelY + panelH / 2, cfg.portraitRight)
        .setDepth(82).setScrollFactor(0);
      const sc = Math.min((portSize - 8) / rp.width, (portSize - 8) / rp.height);
      rp.setScale(sc);
      this._add(rp);
    }

    // Имя NPC
    const nameLabel = scene.add.text(rightX, panelY + panelH - 14, cfg.speakerName || '', {
      fontFamily: 'serif', fontSize: '12px', color: '#CC6666',
    }).setOrigin(0.5, 1).setDepth(82).setScrollFactor(0);
    this._add(nameLabel);

    // ── Текст реплики ─────────────────────────────────────────────────
    const textX    = portPad + portSize + 16;
    const textMaxW = W - portSize * 2 - portPad * 2 - 32;

    const speechText = scene.add.text(textX, panelY + 18, cfg.text || '', {
      fontFamily: 'serif',
      fontSize:   '17px',
      color:      '#E8E8E8',
      wordWrap:   { width: textMaxW },
      lineSpacing: 4,
    }).setDepth(82).setScrollFactor(0);
    this._add(speechText);

    // ── Варианты ответа ───────────────────────────────────────────────
    const choiceColors = {
      default: '#C9A84C',
      attack:  '#FF4444',
      threat:  '#FF8C00',
      retreat: '#888888',
    };
    const choiceHover = {
      default: '#FFD700',
      attack:  '#FF7777',
      threat:  '#FFB347',
      retreat: '#BBBBBB',
    };

    const choiceStartY = panelY + 85;
    const choiceGap    = 32;

    (cfg.choices || []).forEach((ch, i) => {
      const style  = ch.style || 'default';
      const color  = choiceColors[style] || choiceColors.default;
      const hover  = choiceHover[style]  || choiceHover.default;

      const btn = scene.add.text(textX, choiceStartY + i * choiceGap, `${i + 1}. ${ch.label}`, {
        fontFamily: 'serif',
        fontSize:   '16px',
        color,
        stroke:     '#000000',
        strokeThickness: 2,
      })
        .setDepth(83)
        .setScrollFactor(0)
        .setInteractive({ useHandCursor: true });

      btn.on('pointerover',  () => btn.setColor(hover));
      btn.on('pointerout',   () => btn.setColor(color));
      btn.on('pointerdown',  () => {
        this.hide();
        if (ch.onSelect) ch.onSelect();
      });

      this._add(btn);
    });

    // Появление — лёгкий fade in
    this._group.getChildren().forEach(obj => {
      obj.setAlpha(0);
      scene.tweens.add({ targets: obj, alpha: { from: 0, to: obj === bg ? 0.94 : 1 }, duration: 200 });
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
