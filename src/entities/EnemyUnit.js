import { Unit } from './Unit.js';
import eventBus from '../utils/eventBus.js';
import { reachableTargets, isActive } from '../systems/CombatRules.js';

/**
 * EnemyUnit - юнит под управлением ИИ (01_БАЛАНС 2, модель balance/sim.py).
 * Цель: самый раненый из досягаемых; дальние предпочитают задний ряд.
 */
export class EnemyUnit extends Unit {
  constructor(data) {
    super(data);
    this.passive = data.passive || null;
    this.passiveBonus = data.passiveBonus || 0;
  }

  findTarget(playerUnits) {
    const targets = reachableTargets(this, playerUnits);
    if (!targets.length) return null;
    const weakest = list => list.reduce((a, b) => (b.hp < a.hp ? b : a));
    if (this.ranged || this.ignoreRows) {
      const back = targets.filter(t => t.position.row === 1);
      if (back.length) return weakest(back);
    }
    return weakest(targets);
  }

  /**
   * Ход ИИ. Возвращает описание действия { type, target } или null.
   * allies: своя сторона (для рёва и лечения Шептуна).
   */
  decideAction(playerUnits, skillSystem, grid, allies = null) {
    const own = allies || this._allies || [this];
    const target = this.findTarget(playerUnits);
    if (!target) return null;

    // Босс: боевой рёв при HP < 50%
    if (this.isBoss && this.hp < this.maxHp * 0.5 && !this.isOnCooldown('commanders_roar')) {
      skillSystem.use('commanders_roar', this, null);
      return { type: 'roar', target: null };
    }

    // Шептун: лечит самого раненого союзника ниже 60%
    if (this.arch === 'whisperer' && !this.isOnCooldown('enemy_heal')) {
      const wounded = own.filter(a => isActive(a) && a.hp / a.maxHp < 0.6);
      if (wounded.length) {
        const w = wounded.reduce((a, b) => (b.hp / b.maxHp < a.hp / a.maxHp ? b : a));
        const amount = Math.round(w.maxHp * 0.15);
        w.heal(amount);
        this.cooldowns.enemy_heal = 2;
        eventBus.emit('log', `${this.label} → ${w.label}: +${amount} HP`);
        return { type: 'heal', target: w };
      }
    }

    // Навыки архетипа с вероятностью и откатом
    for (const id of ['enemy_heavy', 'enemy_volley']) {
      if (!this.skills.includes(id) || this.isOnCooldown(id)) continue;
      const sk = skillSystem.get(id);
      if (sk && Math.random() < (sk.ai?.chance ?? 0.5)) {
        skillSystem.use(id, this, target);
        return { type: 'skill', skillId: id, target };
      }
    }

    this.attack(target, { basic: true });
    return { type: 'attack', target };
  }
}
