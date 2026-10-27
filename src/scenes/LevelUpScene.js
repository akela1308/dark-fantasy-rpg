import * as Phaser from 'phaser/dist/phaser.esm.js';
import { SaveSystem } from '../utils/SaveSystem.js';
import { applyProgressionChoice, getClassProgressionChoices, applyLevelGrowth, getAutoNodes } from '../systems/ClassProgression.js';
import { applyCommanderTraitChoice, getCommanderTraitChoices } from '../systems/CommanderTraits.js';
import { PartySystem } from '../systems/PartySystem.js';
import eventBus from '../utils/eventBus.js';
import { Frame } from '../ui/Frame.js';
import { nicheButton } from '../ui/NicheButton.js';
import { FONT, COLOR, HEX } from '../ui/Theme.js';

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
    // units: все, кого касается повышение (партия и запас); toLevel: уровень партии
    this.allPlayerUnits = data.allPlayerUnits || data.units || [];
    this.leveledUnits   = data.leveledUnits   || this.allPlayerUnits;
    this.toLevel        = data.toLevel || null;
    this.fromMapKey     = data.fromMapKey     || 'map1';
    this.fromSpawnId    = data.fromSpawnId    || 'default';
  }

  create() {
    // Шаги (юнит, уровень) считаются лениво: ветка, выбранная на 3 уровне, нужна для узлов 5 уровня
    const target = this.toLevel || PartySystem.getLevel(this.game.registry);
    this._steps = [];
    this.leveledUnits.forEach(unit => {
      for (let L = (unit.level || 1) + 1; L <= target; L++) this._steps.push({ unit, level: L });
    });
    this._screens = [];
    this._next();
  }

  /**
   * Следующий экран. Для нового шага уровня: базовый рост и узлы «автоматически» сразу,
   * затем экраны выбора (черта героя на 2/5/8, ветка, перк) или короткая сводка.
   */
  _next() {
    if (!this._screens.length) {
      const step = this._steps.shift();
      if (!step) { this._showMapButton(); return; }
      const { unit, level: L } = step;
      applyLevelGrowth(unit, L);
      unit.level = L;
      unit.xp = 0;
      const autos = getAutoNodes(unit, L);
      autos.forEach(n => applyProgressionChoice(unit, n));
      const notes = autos.map(n => n.label);
      const trait = getCommanderTraitChoices(unit, L, this.game.registry);
      if (trait) this._screens.push({ unit, level: L, choices: trait, kind: 'trait' });
      // Выбор класса считается после черты (на случай, если от черты что-то зависит)
      this._screens.push({ unit, level: L, kind: 'class', notes, lazy: true });
    }
    let item = this._screens.shift();
    if (item.lazy) {
      const cls = getClassProgressionChoices(item.unit, item.level);
      if (cls) item = { ...item, choices: cls };
      else if (this._screens.length || item.kind === 'class' && this._hadTrait(item)) { this._next(); return; }
      else item = { ...item, kind: 'info', choices: [{ key: 'ok', type: 'info', label: 'Дальше', desc: item.notes?.length ? `Новое: ${item.notes.join(', ')}` : 'Рост здоровья, урона и точности' }] };
    }
    this._current = item;
    this._lastShown = item;
    this._showForUnits([item.unit]);
  }

  _hadTrait(item) {
    return this._lastShown && this._lastShown.unit === item.unit && this._lastShown.level === item.level && this._lastShown.kind === 'trait';
  }

  _showForUnits(units) {
    const unit = units[0];
    const bonuses = this._current?.choices || CLASS_BONUSES[unit.id] || [];
    const choiceKind = bonuses.some(b => b.type === 'branch')
      ? 'Выберите путь класса'
      : bonuses.some(b => b.type === 'commanderTrait')
        ? 'Выберите черту героя'
        : bonuses.some(b => b.type === 'info') ? 'Отряд окреп' : 'Выберите улучшение';
    // Карточки: при 4 и больше вариантах сетка в две колонки (6 вариантов: 2×3)
    const W = 780;
    const cols = bonuses.length > 3 ? 2 : 1;
    const innerW = W - 2 * (52 + 24);
    const cardW = cols === 2 ? (innerW - 16) / 2 : innerW;
    const mk = (str, size, color, width, extra = {}) => this.add.text(0, 0, str, {
      fontFamily: FONT, fontSize: `${size}px`, color, stroke: '#000', strokeThickness: 1.5, lineSpacing: 2,
      wordWrap: { width, useAdvancedWrap: true }, ...extra,
    }).setVisible(false);
    const cards = bonuses.map(b => ({ b, lbl: mk(b.label, 16, COLOR.gold, cardW - 28), desc: mk(b.desc || '', 12, COLOR.bone, cardW - 28) }));
    cards.forEach(c => { c.h = c.lbl.height + c.desc.height + 26; });
    const rowsH = [];
    for (let i = 0; i < cards.length; i += cols) rowsH.push(Math.max(...cards.slice(i, i + cols).map(c => c.h)));
    const headH = 150;
    const bodyH = rowsH.reduce((a, h) => a + h + 10, 0);
    const H = Math.min(700, 150 + headH + bodyH);

    const f = new Frame(this, { w: W, h: H, title: 'Новый уровень', closable: false, closeOnOutside: false, depth: 90 });
    const { x, y } = f.inner;
    // Портрет и личное имя
    const pk = `portrait_${unit.spriteKey ?? unit.id}`;
    if (this.textures.exists(pk)) {
      const img = f.add(this.add.image(x + 55, y + 62, pk));
      img.setScale(Math.min(110 / img.width, 130 / img.height));
    }
    const name = unit.label || unit.personalName || unit.name;
    f.text(x + 130, y + 10, name, 'title', { size: 24, letterSpacing: 1 });
    f.text(x + 130, y + 46, `Уровень ${this._current?.level ?? unit.level}${unit.personalName ? `, ${unit.name.toLowerCase()}` : ''}`, 'body', { color: COLOR.muted });
    f.text(x + 130, y + 76, choiceKind, 'small', { size: 13, color: COLOR.gold, letterSpacing: 1 });

    let cy = y + headH - 10;
    cards.forEach((c, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      if (col === 0 && i > 0) cy += rowsH[row - 1] + 10;
      const cx = x + col * (cardW + 16);
      const h = rowsH[row];
      const bg = f.add(this.add.rectangle(cx, cy, cardW, h, 0x15110c, 0.95).setOrigin(0).setInteractive({ useHandCursor: true }));
      const g = f.add(this.add.graphics());
      const border = on => {
        g.clear();
        g.lineStyle(2, HEX.bronze, 1).strokeRect(cx, cy, cardW, h);
        g.lineStyle(1, HEX.gold, on ? 0.75 : 0.25).strokeRect(cx + 4, cy + 4, cardW - 8, h - 8);
      };
      border(false);
      f.add(c.lbl.setPosition(cx + 14, cy + 10).setVisible(true), 7);
      f.add(c.desc.setPosition(cx + 14, cy + 14 + c.lbl.height).setVisible(true), 7);
      bg.on('pointerover', () => { bg.setFillStyle(0x2a2114, 0.95); border(true); c.lbl.setColor(COLOR.goldHi); });
      bg.on('pointerout', () => { bg.setFillStyle(0x15110c, 0.95); border(false); c.lbl.setColor(COLOR.gold); });
      bg.on('pointerdown', () => {
        this._applyBonus(unit, c.b);
        eventBus.emit('level_up', { unit, choice: c.b.key });
        f.close();
        this._next();
      });
    });
  }

  _applyBonus(unit, bonus) {
    if (bonus.type === 'info') return;
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
      eventBus.emit('log', `${unit.label || unit.name}: +${gain} к максимальному HP`);
    } else if (bonus.key === 'damage') {
      const dmg = unit.damage || { min: 10, max: 16 };
      unit.damage = { min: dmg.min + 3, max: dmg.max + 3 };
      eventBus.emit('log', `${unit.label || unit.name}: +3 к урону`);
    } else if (bonus.key === 'speed') {
      unit.speed = (unit.speed || 5) + 1;
      eventBus.emit('log', `${unit.label || unit.name}: +1 к инициативе`);
    } else if (bonus.key === 'armor') {
      const gain = unit.id === 'companion_healer' ? 3 : 5;
      unit.armor = Math.min(90, (unit.armor || 0) + gain);
      eventBus.emit('log', `${unit.label || unit.name}: +${gain}% к броне`);
    } else if (bonus.key === 'berserk') {
      unit.damage = { min: unit.damage.min, max: unit.damage.max + 5 };
      eventBus.emit('log', `${unit.label || unit.name}: +5 к максимальному урону`);
    } else if (bonus.key === 'cooldown') {
      unit._cdReduction = (unit._cdReduction || 0) + 1;
      eventBus.emit('log', `${unit.label || unit.name}: откаты навыков -1`);
    }
  }

  _showMapButton() {
    SaveSystem.save(this.allPlayerUnits, this.fromMapKey, this.fromSpawnId, this.game.registry);
    // Запуск с карты (мирное решение, найм): просто закрываем экран
    if (!this.scene.isActive('BattleScene') && this.scene.isActive('MapScene')) {
      this.scene.get('MapScene')?.events.emit('levelup_done');
      this.scene.stop();
      return;
    }

    const f = new Frame(this, { w: 520, h: 280, title: 'Отряд готов', closable: false, closeOnOutside: false, depth: 90 });
    f.text(640, f.inner.y + 8, 'Новые силы записаны. Дорога ждёт.', 'body', { color: COLOR.muted }).setOrigin(0.5, 0);
    const btn = nicheButton(this, 640, f.rect.y + f.rect.h - 80, 'На карту', { w: 240, depth: 100, onClick: () => {
      eventBus.clear();
      if (this.scene.isActive('BattleScene')) this.scene.stop('BattleScene');
      this.scene.start('LoadingScene', {
        destination: 'MapScene',
        destinationData: { mapKey: this.fromMapKey, spawnId: this.fromSpawnId },
      });
    } });
    btn.objs.forEach(o => f.add(o, 10));
  }
}
