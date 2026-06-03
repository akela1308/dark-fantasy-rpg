import { Unit } from './Unit.js';
import eventBus from '../utils/eventBus.js';

/**
 * EnemyUnit — юнит под управлением ИИ.
 * Логика: атаковать слабейшего доступного игрового юнита.
 */
export class EnemyUnit extends Unit {
  constructor(data) {
    super(data);
    this.passive = data.passive || null;
    this.passiveBonus = data.passiveBonus || 0;
  }

  // Определить цель: слабейший живой игровой юнит в досягаемости
  findTarget(playerUnits, grid) {
    const alive = playerUnits.filter(u => u.isAlive);
    if (!alive.length) return null;

    // Если дальнобойный или игнорирует ряды — бьёт всех
    if (this.ranged || this.ignoreRows) {
      return alive.sort((a, b) => a.hp - b.hp)[0];
    }

    // Ближний бой: сначала передний ряд (row 0)
    const front = alive.filter(u => u.position.row === 0);
    if (front.length) return front.sort((a, b) => a.hp - b.hp)[0];

    // Если переднего ряда нет — задний
    return alive.sort((a, b) => a.hp - b.hp)[0];
  }

  // ИИ-ход: выбрать действие и выполнить
  decideAction(playerUnits, skillSystem, grid) {
    const target = this.findTarget(playerUnits, grid);
    if (!target) return;

    // Мини-босс: Боевой рёв при HP < 50%
    if (this.isBoss && this.hp < this.maxHp * 0.5 && !this.isOnCooldown('commanders_roar')) {
      skillSystem.use('commanders_roar', this, null);
      return;
    }

    // Базовая атака
    this.attack(target);
  }
}
