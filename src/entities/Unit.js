import eventBus from '../utils/eventBus.js';

/**
 * Unit — базовый класс для всех юнитов (игрок и враги).
 * Содержит: HP, урон, скорость, навыки, позицию, откаты.
 */
export class Unit {
  constructor(data) {
    this.id       = data.id;
    this.name     = data.name;
    this.type     = data.type; // 'player' | 'enemy'
    this.hp       = data.hp;
    this.maxHp    = data.maxHp;
    this.damage   = { ...data.damage };
    this.speed    = data.speed;
    this.position = { ...data.position }; // { row, col }
    this.skills   = [...(data.skills || [])];
    this.resources = { ...(data.resources || {}) };
    this.ranged   = data.ranged || false;
    this.ignoreRows = data.ignoreRows || false;
    this.lifesteal  = data.lifesteal || 0;
    this.color    = data.color || 0xFFFFFF;
    this.isBoss   = data.isBoss || false;

    this.cooldowns  = {};   // { skillId: turnsLeft }
    this.movesLeft  = 1;
    this.isAlive    = true;
    this.effects    = [];   // [ { type, value, duration } ]
  }

  // --- Урон ---
  takeDamage(amount, opts = {}) {
    const isCrit = opts.isCrit || false;

    // Эффект прикрытия — Боец принимает удар вместо союзника
    const cover = this.effects.find(e => e.type === 'covered_by' && e.coveredBy?.isAlive);
    if (cover) {
      this.effects = this.effects.filter(e => e !== cover);
      eventBus.emit('log', `${cover.coveredBy.name} принимает удар вместо ${this.name}!`);
      return cover.coveredBy.takeDamage(amount, opts);
    }

    // Проверка уклонения
    const dodge = this.effects.find(e => e.type === 'dodge_boost');
    if (dodge && Math.random() < dodge.value) {
      eventBus.emit('log', `${this.name} уклоняется!`);
      return 0;
    }

    const actual = Math.max(0, amount);
    this.hp = Math.max(0, this.hp - actual);

    eventBus.emit('unit_damaged', { unit: this, amount: actual, isCrit });

    if (this.hp <= 0) {
      this.isAlive = false;
      eventBus.emit('unit_died', this);
    }

    return actual;
  }

  // --- Лечение ---
  heal(amount) {
    const before = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + amount);
    const actual = this.hp - before;
    eventBus.emit('unit_healed', { unit: this, amount: actual });
    return actual;
  }

  // --- Вычислить урон удара ---
  rollDamage() {
    const { min, max } = this.damage;
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  // --- Базовая атака ---
  attack(target) {
    // ── Шанс попадания (на основе разницы скоростей) ──
    const hitChance = Math.max(50, Math.min(95, 70 + (this.speed - target.speed) * 4));
    if (Math.random() * 100 > hitChance) {
      eventBus.emit('log', `${this.name} промахивается по ${target.name}!`);
      eventBus.emit('unit_missed', { unit: target });
      return 0;
    }

    // ── Критический удар: 8% + бонус скорости ──
    const critChance = 8 + Math.max(0, this.speed - 5) * 1.5;
    const isCrit = Math.random() * 100 < critChance;
    const dmg  = Math.round(this.rollDamage() * (isCrit ? 1.8 : 1));

    const actual = target.takeDamage(dmg, { isCrit });
    const msg = isCrit
      ? `💥 ${this.name} КРИТ по ${target.name} — ${actual} урона!`
      : `${this.name} атакует ${target.name} — ${actual} урона`;
    eventBus.emit('log', msg);

    // Lifesteal
    if (this.lifesteal > 0 && actual > 0) {
      this.heal(this.lifesteal);
    }

    return actual;
  }

  // --- Откаты скиллов ---
  tickCooldowns() {
    for (const id in this.cooldowns) {
      if (this.cooldowns[id] > 0) this.cooldowns[id]--;
    }
  }

  isOnCooldown(skillId) {
    return (this.cooldowns[skillId] || 0) > 0;
  }

  setCooldown(skillId, turns) {
    this.cooldowns[skillId] = turns;
  }

  // --- Эффекты ---
  addEffect(effect) {
    this.effects.push({ ...effect });
    eventBus.emit('effect_added', { unit: this, effect });
  }

  tickEffects() {
    this.effects = this.effects
      .map(e => ({ ...e, duration: e.duration - 1 }))
      .filter(e => e.duration > 0);
  }

  // --- Конец хода ---
  endTurn() {
    this.tickCooldowns();
    this.tickEffects();
  }

  // --- Сброс на новый бой ---
  resetForBattle() {
    this.hp       = this.maxHp;
    this.isAlive  = true;
    this.cooldowns = {};
    this.movesLeft = 1;
    this.effects  = [];
  }
}
