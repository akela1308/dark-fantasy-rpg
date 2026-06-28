import * as Phaser from 'phaser/dist/phaser.esm.js';
import { SaveSystem } from '../utils/SaveSystem.js';
import { applyProgressionChoice, getClassProgressionChoices } from '../systems/ClassProgression.js';
import { applyCommanderTraitChoice, getCommanderTraitChoices } from '../systems/CommanderTraits.js';
import eventBus from '../utils/eventBus.js';

const CLASS_BONUSES = {
  hero_duelist: [
    { key: 'damage',    label: 'Мастерство',  desc: '+3 к урону' },
    { key: 'speed',     label: 'Инициатива',  desc: '+1 к инициативе' },
    { key: 'hp',        label: 'Выдержка',     desc: '+20 к максимальному HP' },
  ],
  companion_brawler: [
    { key: 'hp',        label: 'Закалённость', desc: '+25 к максимальному HP' },
    { key: 'armor',     label: 'Стойкость',    desc: '+5% к броне' },
    { key: 'berserk',   label: 'Берсерк',      desc: '+5 к максимальному урону' },
  ],
  companion_healer: [
    { key: 'hp',        label: 'Выносливость',  desc: '+20 к максимальному HP' },
    { key: 'armor',     label: 'Оберег',        desc: '+3% к броне' },
    { key: 'cooldown',  label: 'Концентрация',  desc: '-1 к откату всех навыков' },
  ],
};

export class LevelUpScene extends Phaser.Scene {
  constructor() {
    super({ key: 'LevelUpScene' });
  }

  init(data) {
    this.leveledUnits   = data.leveledUnits   || [];
    this.allPlayerUnits = data.allPlayerUnits || [];
    this.fromMapKey     = data.fromMapKey     || 'map1';
    this.fromSpawnId    = data.fromSpawnId    || 'default';
  }

  create() {
    this._showForUnits([...this.leveledUnits]);
  }

  _showForUnits(units) {
    const unit      = units[0];
    const remaining = units.slice(1);
    const W = this.scale.width;
    const H = this.scale.height;
    const elements = [];
    const bonuses = getCommanderTraitChoices(unit) || getClassProgressionChoices(unit) || CLASS_BONUSES[unit.id] || [
      { key: 'hp',     label: 'Закалённость', desc: '+20 к максимальному HP' },
      { key: 'damage', label: 'Мастерство',   desc: '+3 к урону' },
      { key: 'speed',  label: 'Инициатива',   desc: '+1 к инициативе' },
    ];
    const compact = bonuses.length > 3;
    const panelH = compact ? 520 : 420;
    const panelTop = H/2 - panelH/2;

    const overlay = this.add.rectangle(W/2, H/2, W, H, 0x000000, 0.7)
      .setDepth(90).setScrollFactor(0);
    elements.push(overlay);

    const panel = this.add.rectangle(W/2, H/2, 580, panelH, 0x07060a)
      .setDepth(91).setScrollFactor(0).setAlpha(0.97);
    elements.push(panel);

    // Золотая рамка
    const gfx = this.add.graphics().setDepth(92).setScrollFactor(0);
    gfx.lineStyle(2, 0xd4a832, 0.9);
    gfx.strokeRect(W/2 - 290, panelTop, 580, panelH);
    const corners = this.add.graphics().setDepth(92).setScrollFactor(0);
    corners.lineStyle(3, 0xd4a832, 1);
    const cx = W/2 - 290, cy = panelTop, cw = 580, ch = panelH, ca = 18;
    corners.lineBetween(cx,      cy,      cx + ca,      cy);
    corners.lineBetween(cx,      cy,      cx,            cy + ca);
    corners.lineBetween(cx + cw, cy,      cx + cw - ca,  cy);
    corners.lineBetween(cx + cw, cy,      cx + cw,       cy + ca);
    corners.lineBetween(cx,      cy + ch, cx + ca,       cy + ch);
    corners.lineBetween(cx,      cy + ch, cx,            cy + ch - ca);
    corners.lineBetween(cx + cw, cy + ch, cx + cw - ca,  cy + ch);
    corners.lineBetween(cx + cw, cy + ch, cx + cw,       cy + ch - ca);
    elements.push(gfx, corners);

    elements.push(this.add.text(W/2, H/2 - 178, '❖ УРОВЕНЬ ПОВЫШЕН ❖', {
      fontSize: '20px', color: '#d4a832', fontFamily: 'serif',
    }).setOrigin(0.5).setDepth(92).setScrollFactor(0));

    const divGfx = this.add.graphics().setDepth(92).setScrollFactor(0);
    divGfx.lineStyle(1, 0xd4a832, 0.4);
    divGfx.lineBetween(W/2 - 220, H/2 - 155, W/2 + 220, H/2 - 155);
    elements.push(divGfx);

    elements.push(this.add.text(W/2, H/2 - 130, unit.name, {
      fontSize: '26px', color: '#FFFFFF', fontFamily: 'serif',
      stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(92).setScrollFactor(0));

    elements.push(this.add.text(W/2, H/2 - 98, `★ Уровень ${unit.level + 1} ★`, {
      fontSize: '15px', color: '#aaaaaa', fontFamily: 'serif',
    }).setOrigin(0.5).setDepth(92).setScrollFactor(0));

    elements.push(this.add.text(W/2, H/2 - 62, 'Выберите бонус:', {
      fontSize: '13px', color: '#888888', fontFamily: 'serif',
    }).setOrigin(0.5).setDepth(92).setScrollFactor(0));

    const cleanup = () => elements.forEach(e => { try { e.destroy(); } catch (_) {} });

    bonuses.forEach((bonus, i) => {
      const by = H/2 + (compact ? -42 : -10) + i * (compact ? 58 : 75);
      const btnH = compact ? 50 : 60;

      const btn = this.add.rectangle(W/2, by, 490, btnH, 0x110e0a)
        .setDepth(92).setScrollFactor(0).setInteractive({ useHandCursor: true });

      const btnBorder = this.add.graphics().setDepth(92).setScrollFactor(0);
      btnBorder.lineStyle(1, 0x4a3a1a, 0.7);
      btnBorder.strokeRect(W/2 - 245, by - btnH/2, 490, btnH);

      const lbl = this.add.text(W/2, by - 10, bonus.label, {
        fontSize: compact ? '15px' : '16px', color: '#d4a832', fontFamily: 'serif',
      }).setOrigin(0.5).setDepth(93).setScrollFactor(0);

      const desc = this.add.text(W/2, by + 13, bonus.desc, {
        fontSize: compact ? '11px' : '12px', color: '#887755', fontFamily: 'serif',
      }).setOrigin(0.5).setDepth(93).setScrollFactor(0);

      elements.push(btn, btnBorder, lbl, desc);

      btn.on('pointerover', () => {
        btn.setFillStyle(0x2a1e0a);
        btnBorder.clear();
        btnBorder.lineStyle(1, 0xd4a832, 0.8);
        btnBorder.strokeRect(W/2 - 245, by - btnH/2, 490, btnH);
        lbl.setColor('#FFD700');
      });
      btn.on('pointerout', () => {
        btn.setFillStyle(0x110e0a);
        btnBorder.clear();
        btnBorder.lineStyle(1, 0x4a3a1a, 0.7);
        btnBorder.strokeRect(W/2 - 245, by - btnH/2, 490, btnH);
        lbl.setColor('#d4a832');
      });
      btn.on('pointerdown', () => {
        this._applyBonus(unit, bonus);
        eventBus.emit('level_up', { unit, choice: bonus.key });
        cleanup();
        if (remaining.length > 0) {
          this._showForUnits(remaining);
        } else {
          this._showMapButton();
        }
      });
    });

    panel.setAlpha(0);
    overlay.setAlpha(0);
    this.tweens.add({ targets: [overlay, panel], alpha: { from: 0, to: 1 }, duration: 300 });
  }

  _applyBonus(unit, bonus) {
    unit.level++;
    unit.xp = 0;
    if (applyCommanderTraitChoice(unit, bonus, this.game.registry)) {
      return;
    }

    if (applyProgressionChoice(unit, bonus)) {
      return;
    }

    if (bonus.key === 'hp') {
      const gain = unit.id === 'companion_brawler' ? 25 : 20;
      unit.maxHp += gain;
      unit.hp = Math.min(unit.hp + gain, unit.maxHp);
      eventBus.emit('log', `${unit.name}: +${gain} к максимальному HP`);
    } else if (bonus.key === 'damage') {
      const dmg = unit.damage || { min: 10, max: 16 };
      unit.damage = { min: dmg.min + 3, max: dmg.max + 3 };
      eventBus.emit('log', `${unit.name}: +3 к урону`);
    } else if (bonus.key === 'speed') {
      unit.speed = (unit.speed || 5) + 1;
      eventBus.emit('log', `${unit.name}: +1 к инициативе`);
    } else if (bonus.key === 'armor') {
      const gain = unit.id === 'companion_healer' ? 3 : 5;
      unit.armor = Math.min(90, (unit.armor || 0) + gain);
      eventBus.emit('log', `${unit.name}: +${gain}% к броне`);
    } else if (bonus.key === 'berserk') {
      unit.damage = { min: unit.damage.min, max: unit.damage.max + 5 };
      eventBus.emit('log', `${unit.name}: +5 к максимальному урону`);
    } else if (bonus.key === 'cooldown') {
      unit._cdReduction = (unit._cdReduction || 0) + 1;
      eventBus.emit('log', `${unit.name}: откаты навыков -1`);
    }
  }

  _showMapButton() {
    SaveSystem.save(this.allPlayerUnits, this.fromMapKey, this.fromSpawnId, this.game.registry);

    const W = this.scale.width;
    const H = this.scale.height;

    const btn = this.add.text(W/2, H/2 + 80, '[ На карту ]', {
      fontFamily: 'serif', fontSize: '26px', color: '#C9A84C',
    }).setOrigin(0.5).setDepth(95).setScrollFactor(0).setInteractive({ useHandCursor: true });

    btn.on('pointerover', () => btn.setColor('#FFD700'));
    btn.on('pointerout',  () => btn.setColor('#C9A84C'));
    btn.on('pointerdown', () => {
      eventBus.clear();
      if (this.scene.isActive('BattleScene')) this.scene.stop('BattleScene');
      this.scene.start('LoadingScene', {
        destination: 'MapScene',
        destinationData: { mapKey: this.fromMapKey, spawnId: this.fromSpawnId },
      });
    });
  }
}
