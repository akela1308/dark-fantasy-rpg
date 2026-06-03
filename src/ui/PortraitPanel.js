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
    this._cards      = []; // { unit, barFill, barBg, hpText, portrait }
  }

  // Вызов в preload()
  preload() {
    const all = [...this.playerUnits, ...this.enemyUnits];
    all.forEach(u => {
      this.scene.load.image(`portrait_${u.id}`, `portraits/${u.id}.png`);
    });
  }

  // Вызов в create()
  create() {
    this._buildSide(this.playerUnits, 'left');
    this._buildSide(this.enemyUnits,  'right');
  }

  // Перестроить все карточки (вызывать после каждого хода)
  update() {
    this._cards.forEach(card => {
      const { unit, barFill, barBg, hpText, dimOverlay } = card;
      const pct = Math.max(0, unit.hp / unit.maxHp);
      const barW = 88;

      // Обновляем ширину заполнения
      barFill.setDisplaySize(Math.max(1, barW * pct), 6);
      barFill.setX(card.barX + (barW * pct) / 2);

      // Цвет HP
      const color = pct > 0.5 ? 0x44CC44 : pct > 0.25 ? 0xCCAA00 : 0xCC2222;
      barFill.setFillStyle(color);

      // HP текст
      hpText.setText(`${Math.max(0, unit.hp)}/${unit.maxHp}`);

      // Затемнение мёртвого
      dimOverlay.setAlpha(unit.isAlive ? 0 : 0.7);
    });
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

      // Фон карточки
      this.scene.add.rectangle(cx, cy, cardW, cardH, 0x0a0810, 0.88)
        .setStrokeStyle(1, isLeft ? 0x334466 : 0x663333)
        .setDepth(depth);

      // Портрет
      const portrait = this.scene.add.image(cx, cy - 14, `portrait_${unit.id}`)
        .setDisplaySize(cardW - 4, cardH - 36)
        .setDepth(depth + 1);

      // HP бар фон
      const barX   = isLeft ? panelX + 4 : panelX - cardW + 4;
      const barY   = cy + cardH / 2 - 22;
      this.scene.add.rectangle(barX + 44, barY, 88, 6, 0x111111, 0.9)
        .setDepth(depth + 1);

      // HP бар заполнение
      const pct     = unit.hp / unit.maxHp;
      const barColor = pct > 0.5 ? 0x44CC44 : pct > 0.25 ? 0xCCAA00 : 0xCC2222;
      const barFill = this.scene.add.rectangle(barX + 44, barY, 88 * pct, 6, barColor)
        .setOrigin(0.5)
        .setDepth(depth + 2);

      // HP текст
      const hpText = this.scene.add.text(cx, barY + 9, `${unit.hp}/${unit.maxHp}`, {
        fontSize: '10px', color: '#AAAAAA', fontFamily: 'monospace'
      }).setOrigin(0.5, 0).setDepth(depth + 2);

      // Затемнение мёртвого
      const dimOverlay = this.scene.add.rectangle(cx, cy, cardW, cardH, 0x000000, 0)
        .setDepth(depth + 3);

      this._cards.push({
        unit, barFill, hpText, dimOverlay,
        barX: barX + 4,
      });
    });
  }
}
