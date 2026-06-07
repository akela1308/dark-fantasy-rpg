/**
 * PortraitPanel — панели портретов в стиле Disciples II.
 * Игрок: слева, 3 портрета сверху вниз.
 * Враги: справа, 3 портрета сверху вниз.
 * Под каждым: HP бар + "HP/maxHP".
 */
export class PortraitPanel {
  constructor(scene, playerUnits, enemyUnits) {
    this.scene       = scene;
    this.playerUnits = playerUnits;
    this.enemyUnits  = enemyUnits;
    this._cards      = []; // { unit, barFill, barBg, hpText, portrait, activeBorder, activePulse }
    this._activeTween = null;
    this._activeUnit  = null;
  }

  // Вызов в preload()
  preload() {
    const all = [...this.playerUnits, ...this.enemyUnits];
    all.forEach(u => {
      this.scene.load.image(`portrait_${u.id}`, `portraits/${u.id}.png`);
    });
    if (!this.scene.textures.exists('portrait_frame')) {
      this.scene.load.image('portrait_frame', 'ui/portrait_frame.png');
    }
    if (!this.scene.textures.exists('hp_bar_frame')) {
      this.scene.load.image('hp_bar_frame', 'ui/hp_bar_frame.png');
    }
  }

  // Вызов в create()
  create() {
    this._buildSide(this.playerUnits, 'left');
    this._buildSide(this.enemyUnits,  'right');
  }

  // Перестроить все карточки (вызывать после каждого хода)
  update(activeUnit) {
    this._cards.forEach(card => {
      const { unit, barFill, hpText, dimOverlay, activeBorder, portrait, baseScale } = card;
      const pct = Math.max(0, unit.hp / unit.maxHp);
      const barW = 88;

      // HP бар
      barFill.setDisplaySize(Math.max(1, barW * pct), 6);
      barFill.setX(card.barX + (barW * pct) / 2);
      const color = pct > 0.5 ? 0x44CC44 : pct > 0.25 ? 0xCCAA00 : 0xCC2222;
      barFill.setFillStyle(color);
      hpText.setText(`${Math.max(0, unit.hp)}/${unit.maxHp}`);
      dimOverlay.setAlpha(unit.isAlive ? 0 : 0.7);

      // PERMANENT: no active borders, no stroke — never render colored borders on portraits
      const isActive = activeUnit && unit === activeUnit;

      // Масштаб портрета при активном ходе
      const targetScale = isActive ? baseScale * 1.06 : baseScale;
      if (Math.abs(portrait.scaleX - targetScale) > 0.001) {
        this.scene.tweens.add({
          targets: portrait, scaleX: targetScale, scaleY: targetScale,
          duration: 150, ease: 'Sine.easeOut',
        });
      }
    });

    if (activeUnit && activeUnit !== this._activeUnit) {
      this._activeUnit = activeUnit;
    }
  }

  _buildSide(units, side) {
    const isLeft   = side === 'left';
    const panelX   = isLeft ? 4 : 1280 - 4;  // привязка к краю
    const cardW    = 96;
    const cardH    = 130;
    const startY   = 175;
    const gapY     = 138;
    const depth    = 5;

    units.forEach((unit, i) => {
      const cx = isLeft ? panelX + cardW / 2 : panelX - cardW / 2;
      const cy = startY + i * gapY;

      // Фон карточки (прозрачный)
      this.scene.add.rectangle(cx, cy, cardW, cardH, 0x0a0810, 0)
        .setDepth(depth);

      // Портрет
      const portrait = this.scene.add.image(cx, cy - 14, `portrait_${unit.id}`)
        .setDepth(depth + 1);
      const maxW = cardW - 4;
      const maxH = cardH - 36;
      const baseScale = Math.min(maxW / portrait.width, maxH / portrait.height);
      portrait.setScale(baseScale);

      // Готическая рамка поверх портрета
      const frameImg = this.scene.add.image(cx, cy - 4, 'portrait_frame')
        .setDepth(depth + 2)
        .setDisplaySize(cardW + 8, cardH + 12);

      // activeBorder убран
      const activeBorder = null;

      // HP бар фон
      const barX = isLeft ? panelX + 4 : panelX - cardW + 4;
      const barY = cy + cardH / 2 - 22;
      this.scene.add.rectangle(barX + 44, barY, 88, 6, 0x111111, 0.9)
        .setDepth(depth + 1);

      // HP бар заполнение
      const pct      = unit.hp / unit.maxHp;
      const barColor = pct > 0.5 ? 0x44CC44 : pct > 0.25 ? 0xCCAA00 : 0xCC2222;
      const barFill  = this.scene.add.rectangle(barX + 44, barY, 88 * pct, 6, barColor)
        .setOrigin(0.5).setDepth(depth + 2);

      // Готическая рамка HP-бара поверх
      this.scene.add.image(barX + 44, barY, 'hp_bar_frame')
        .setDisplaySize(92, 14).setDepth(depth + 3);

      // HP текст
      const hpText = this.scene.add.text(cx, barY + 9, `${unit.hp}/${unit.maxHp}`, {
        fontSize: '10px', color: '#AAAAAA', fontFamily: 'monospace'
      }).setOrigin(0.5, 0).setDepth(depth + 4);

      // Затемнение мёртвого
      const dimOverlay = this.scene.add.rectangle(cx, cy, cardW, cardH, 0x000000, 0)
        .setDepth(depth + 3);

      this._cards.push({
        unit, barFill, hpText, dimOverlay, activeBorder, portrait, baseScale,
        barX: barX + 4,
      });
    });
  }
}
