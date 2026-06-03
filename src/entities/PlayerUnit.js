import { Unit } from './Unit.js';
import eventBus from '../utils/eventBus.js';

/**
 * PlayerUnit — юнит под управлением игрока.
 * Добавляет: обработку выбора действий, level up.
 */
export class PlayerUnit extends Unit {
  constructor(data) {
    super(data);
    this.xp = 0;
    this.level = 1;
  }

  // Вызывается при выборе игроком действия "Атака"
  handleAttack(target, skillSystem) {
    return this.attack(target);
  }

  // Вызывается при выборе скилла
  handleSkill(skillId, target, skillSystem) {
    if (this.isOnCooldown(skillId)) {
      eventBus.emit('log', `Скилл на перезарядке!`);
      return false;
    }
    return skillSystem.use(skillId, this, target);
  }

  // Использовать заряд пистолета
  handlePistolShot(target, skillSystem) {
    if ((this.resources.pistol_charges || 0) <= 0) {
      eventBus.emit('log', `Нет зарядов пистолета!`);
      return false;
    }
    this.resources.pistol_charges--;
    return skillSystem.use('pistol_shot', this, target);
  }

  // Переместиться
  move(newRow, newCol, grid) {
    if (this.movesLeft <= 0) {
      eventBus.emit('log', `${this.name} уже двигался в этом бою`);
      return false;
    }
    if (!grid.isValidMove(this, newRow, newCol)) {
      return false;
    }
    grid.moveUnit(this, newRow, newCol);
    this.movesLeft--;
    eventBus.emit('unit_moved', this);
    return true;
  }

  addXP(amount) {
    this.xp += amount;
    eventBus.emit('xp_gained', { unit: this, amount });
  }

  canLevelUp(threshold) {
    return this.xp >= threshold;
  }

  levelUp(choice) {
    this.level++;
    this.xp = 0;

    switch (choice) {
      case 'hp':
        this.maxHp += 15;
        this.hp = Math.min(this.hp + 15, this.maxHp);
        eventBus.emit('log', `${this.name}: +15 HP`);
        break;
      case 'pistol':
        this.resources.pistol_charges = (this.resources.pistol_charges || 0) + 2;
        eventBus.emit('log', `${this.name}: +2 заряда пистолета`);
        break;
      case 'move':
        this.movesLeft = 2;
        eventBus.emit('log', `${this.name}: 2 перемещения за бой`);
        break;
      // 'skill' — добавляется через отдельный метод
    }

    eventBus.emit('level_up', { unit: this, choice });
  }
}
