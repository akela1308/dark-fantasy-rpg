import { PHASE } from '../utils/constants.js';
import eventBus from '../utils/eventBus.js';
import { effectiveSpeed, isActive } from './CombatRules.js';

/**
 * TurnManager - управляет очерёдностью ходов.
 * Сортирует юниты по speed DESC, передаёт управление игроку или ИИ.
 */
export class TurnManager {
  constructor() {
    this.queue  = [];   // все живые юниты, отсортированные по speed
    this.index  = 0;   // текущая позиция в очереди
    this.turn   = 0;   // номер хода с начала боя
    this.phase  = PHASE.END;
    this.active = null; // текущий юнит
  }

  // Инициализировать очередь из всех юнитов
  init(allUnits) {
    this.all = [...allUnits];
    this.queue = this._order();
    this.index = 0;
    this.turn  = 0;
    this.phase = PHASE.PLAYER_INPUT;
    eventBus.emit('log', 'Бой начался');
    this._advanceToNextAlive();
  }

  // Начать следующий ход
  nextTurn() {
    if (this.active) {
      this.active.endTurn();
    }

    this.index++;
    if (this.index >= this.queue.length) {
      // Новый раунд: порядок пересчитывается (корни меняют инициативу)
      this.index = 0;
      this.turn++;
      (this.all || []).forEach(u => { u._initiativeBonus = 0; });
      this.queue = this._order();
    }

    this._advanceToNextAlive();
  }

  // Пропустить мёртвых
  _advanceToNextAlive() {
    let attempts = 0;
    while (attempts < this.queue.length) {
      const unit = this.queue[this.index];
      if (unit && isActive(unit)) {
        this.active = unit;
        this._setPhase(unit);
        eventBus.emit('turn_started', unit);
        return;
      }
      this.index = (this.index + 1) % this.queue.length;
      attempts++;
    }
    // Все мертвы - конец
    this.phase = PHASE.END;
    eventBus.emit('all_dead');
  }

  _order() {
    return [...(this.all || this.queue)].sort((a, b) => effectiveSpeed(b) - effectiveSpeed(a));
  }

  _setPhase(unit) {
    this.phase = unit.type === 'player' ? PHASE.PLAYER_INPUT : PHASE.AI_THINKING;
    eventBus.emit('phase_changed', this.phase);
  }

  skipTurn(silent = false) {
    if (!silent) eventBus.emit('log', `${this.active?.name} пропускает ход`);
    this.nextTurn();
  }

  isPlayerTurn() {
    return this.phase === PHASE.PLAYER_INPUT;
  }
}
