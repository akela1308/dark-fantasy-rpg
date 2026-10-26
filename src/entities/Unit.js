import eventBus from '../utils/eventBus.js';
import { getClassDef } from '../systems/ClassProgression.js';
import {
  RULES, rollHit, rollCrit, effectiveArmor, effectiveSpeed, meleeReach, isActive,
} from '../systems/CombatRules.js';

/**
 * Unit - базовый класс для всех юнитов (игрок и враги).
 * Формулы боя живут в CombatRules.js, здесь только их применение.
 * _allies: массив своей стороны (ставит BattleScene и симулятор) для правила тонкого строя.
 */
export class Unit {
  constructor(data) {
    this.id       = data.id;
    this.name     = data.name;
    this.type     = data.type; // 'player' | 'enemy'
    this.hp       = data.hp;
    this.maxHp    = data.maxHp;
    this.baseMaxHp = data.baseMaxHp ?? data.maxHp;
    this.damage   = { ...data.damage };
    this.speed    = data.speed;
    this.position = { ...data.position }; // { row, col }
    this.classId  = data.classId || null;
    this.arch     = data.arch || null;
    this.originId = data.originId || null;
    this.branchId = data.branchId || null;
    this.isCommander = data.isCommander || false;
    this.commanderTraits = [...(data.commanderTraits || [])];
    this.commanderTags = [...(data.commanderTags || [])];
    this.commanderChoices = { ...(data.commanderChoices || {}) };
    this.skills   = [...(data.skills || [])];
    this.passives = [...(data.passives || [])];
    this.classTags = [...(data.classTags || [])];
    this.classChoices = { ...(data.classChoices || {}) };
    this.resources = { ...(data.resources || {}) };
    this.resourceBonus = { ...(data.resourceBonus || {}) };
    this.resourceMax = { ...(data.resourceMax || {}) };
    this.ranged   = data.ranged || false;
    this.ignoreRows = data.ignoreRows || false;
    this.lifesteal  = data.lifesteal || 0;
    this.armor    = data.armor    || 0;   // % редукция урона, потолок в CombatRules
    this.xpKill   = data.xpKill  || 15;
    this.regen    = data.regen    || 0;   // % HP восстанавливается в конце хода
    this.accuracy = data.accuracy ?? 75;
    this.color     = data.color || 0xFFFFFF;
    this.isBoss    = data.isBoss || false;
    this.canSurrender = data.canSurrender || false;
    this.commanderId  = data.commanderId || null;
    this.surrendered  = false;
    this.tags      = [...(data.tags || [])];
    this.spriteKey = data.spriteKey || null;
    this.injured   = data.injured || false;

    this.cooldowns  = {};   // { skillId: turnsLeft }
    this.movesLeft  = 1;
    this.isAlive    = true;
    this.effects    = [];   // [ { type, value, duration } ]
    this._usedOnce  = new Set();
    this._reactionUsed = false;
    this._allies    = null;
  }

  // --- Урон ---
  takeDamage(amount, opts = {}) {
    const isCrit = opts.isCrit || false;

    // Прикрытие: Боец принимает удар вместо союзника
    const cover = this.effects.find(e => e.type === 'covered_by' && e.coveredBy?.isAlive);
    if (cover) {
      this.effects = this.effects.filter(e => e !== cover);
      eventBus.emit('log', `${cover.coveredBy.name} принимает удар вместо ${this.name}!`);
      return cover.coveredBy.takeDamage(amount, { ...opts, coveredAlly: this });
    }

    const dodge = this.effects.find(e => e.type === 'dodge_boost');
    if (dodge && Math.random() < dodge.value) {
      eventBus.emit('log', `${this.name} уклоняется!`);
      eventBus.emit('unit_missed', { unit: this });
      return 0;
    }

    let reduced = amount;
    // Удар в задний ряд через тонкий строй
    if (opts.flank) reduced = Math.max(1, Math.round(reduced * RULES.FLANK_MULT));

    const defending = this.effects.find(e => e.type === 'defending');
    if (defending) reduced = Math.round(reduced * RULES.DEFEND_MULT);

    const marked = this.effects.find(e => e.type === 'marked');
    if (marked) reduced = Math.round(reduced * (marked.value ?? RULES.MARKED_DEFAULT));

    const guarded = this.effects.find(e => e.type === 'guarded');
    if (guarded) reduced = Math.round(reduced * (guarded.value ?? RULES.GUARDED_DEFAULT));

    // Броня с потолком 60/50 и частичным пробитием
    const armor = effectiveArmor(this) * (1 - Math.min(1, opts.ignoreArmor || 0));
    if (armor > 0) reduced = Math.max(1, Math.round(reduced * (1 - armor / 100)));

    const actual = Math.max(1, reduced);
    this.hp = Math.max(0, this.hp - actual);

    eventBus.emit('unit_damaged', { unit: this, amount: actual, isCrit });

    if (this.hp <= 0) {
      this.isAlive = false;
      eventBus.emit('unit_died', this);
    } else {
      this._reactToHit(opts);
    }

    return actual;
  }

  // Кара непрошенных (Живая Стена, ур. 5): ответ на ближний удар по себе или прикрытому
  _reactToHit(opts) {
    const src = opts.source;
    if (!src || opts.reaction || !src.isAlive || src.ranged || opts.ranged) return;
    if (!this.passives.includes('punish_intruders') || this._reactionUsed || !isActive(this)) return;
    this._reactionUsed = true;
    eventBus.emit('log', `${this.name}: кара непрошенным!`);
    this.attack(src, { reaction: true, basic: true, ignoreReach: true });
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
    const base = Math.floor(Math.random() * (max - min + 1)) + min;
    const rage  = this.effects.find(e => e.type === 'enraged');
    const weakened = this.effects.find(e => e.type === 'weakened');
    const weakenedMultiplier = weakened ? (weakened.value ?? 0.75) : 1;
    return Math.max(1, Math.round((base + (rage ? rage.value : 0)) * weakenedMultiplier));
  }

  /** Множитель «шатания»: следующее действие наносит/лечит вдвое меньше. */
  staggerMult() {
    return this.hasEffect('staggered') ? RULES.STAGGER_MULT : 1;
  }

  /**
   * Атака (базовая или навыком). opts:
   *   mult        множитель урона навыка
   *   fixed       {min,max} фиксированный урон (пистоль)
   *   cannotMiss  без броска попадания
   *   ignoreArmor доля брони, которую пробивает удар (0..1)
   *   ignoreRows  дальний удар (без штрафа тонкого строя)
   *   basic       базовая атака (копит ресурс класса)
   *   reaction    ответный удар (не вызывает новых реакций)
   *   onHit(actual) колбэк при попадании
   * Возвращает нанесённый урон (0 при промахе).
   */
  attack(target, opts = {}) {
    const rangedHit = this.ranged || this.ignoreRows || opts.ignoreRows;
    // Штраф ×0.75 за удар в задний ряд мимо живого переднего получает любой не-стрелок,
    // в том числе выстрел пистолем «через строй» (так в модели balance/sim.py)
    const unitRanged = this.ranged || this.ignoreRows;
    const reach = unitRanged
      ? { ok: true, flank: false }
      : { ok: true, flank: target.position?.row === 1 && (target._allies || []).some(u => isActive(u) && u.position?.row === 0) };
    const challenged = target.effects.find(e => e.type === 'challenged' && e.sourceId === this.id);

    const atk = { accuracy: this.accuracy + (opts.accuracyBonus || 0), speed: effectiveSpeed(this) };
    const tgt = { speed: effectiveSpeed(target) };
    if (!opts.cannotMiss && !challenged && !rollHit(atk, tgt)) {
      eventBus.emit('log', `${this.name} промахивается по ${target.name}!`);
      eventBus.emit('unit_missed', { unit: target });
      target._reactToMiss?.(this, opts);
      return 0;
    }

    const isCrit = rollCrit({ speed: this.speed });
    let base;
    if (opts.fixed) {
      const { min, max } = opts.fixed;
      base = Math.floor(Math.random() * (max - min + 1)) + min;
    } else {
      base = this.rollDamage();
    }
    let dmg = Math.round(base * (opts.mult || 1) * (isCrit ? RULES.CRIT_MULT : 1));
    if (challenged) dmg = Math.round(dmg * (challenged.value ?? 1.4));
    if (this.hasEffect('staggered')) dmg = Math.max(1, Math.round(dmg * RULES.STAGGER_MULT));
    // Тайная грамота: +10% по «забытым» (тени, эхо, чтецы)
    if ((this.commanderTraits || []).includes('secret_literacy') && (target.tags || []).includes('forgotten')) {
      dmg = Math.round(dmg * 1.1);
    }

    const actual = target.takeDamage(dmg, {
      isCrit, flank: reach.flank, ignoreArmor: opts.ignoreArmor, source: this,
      reaction: opts.reaction, ranged: rangedHit,
    });
    const msg = isCrit
      ? `💥 ${this.name} КРИТ по ${target.name}: ${actual} урона!`
      : `${this.name} атакует ${target.name}: ${actual} урона`;
    eventBus.emit('log', msg);

    if (this.lifesteal > 0 && actual > 0) this.heal(this.lifesteal);

    // Накопление ресурса класса базовой атакой (Боец: Мощь)
    if (opts.basic) {
      const cls = getClassDef(this);
      const gain = cls?.resource?.gainOnBasicAttack;
      if (gain && actual > 0) this.gainResource(cls.resource.id, gain);
    }
    if (actual > 0) opts.onHit?.(actual);

    // Второй выпад (черта): базовая атака убила цель, действие ещё раз (раз в раунд)
    if (opts.basic && !opts.reaction && !target.isAlive && (this.commanderTraits || []).includes('second_strike') && !this._secondStrikeUsed) {
      this._secondStrikeUsed = true;
      this._extraAction = true;
      eventBus.emit('log', `${this.name}: второй выпад!`);
    }
    return actual;
  }

  // Ответный выпад (Кодекс Чести, ур. 3): враг промахнулся, вы бьёте в ответ
  _reactToMiss(attacker, opts) {
    if (opts.reaction || !this.passives.includes('riposte') || this._reactionUsed) return;
    if (!isActive(this) || !attacker.isAlive || attacker.ranged || opts.ignoreRows) return;
    this._reactionUsed = true;
    eventBus.emit('log', `${this.name}: ответный выпад!`);
    this.attack(attacker, { reaction: true, basic: true, ignoreRows: true });
  }

  gainResource(id, amount) {
    const cls = getClassDef(this);
    const cap = this.resourceMax?.[id] ?? (cls?.resource?.id === id ? cls.resource.max : null);
    const next = (this.resources[id] || 0) + amount;
    this.resources[id] = cap != null ? Math.min(cap, next) : next;
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
    const reduced = Math.max(1, turns - (this._cdReduction || 0));
    this.cooldowns[skillId] = reduced;
  }

  // --- Эффекты ---
  addEffect(effect) {
    if (effect.type === 'staggered' && this.passives.includes('unyielding')) return;
    if (effect.type === 'weakened' && this.passives.includes('unyielding')) return;
    this.effects.push({ ...effect });
    eventBus.emit('effect_added', { unit: this, effect });
  }

  hasEffect(type) {
    return this.effects.some(e => e.type === type);
  }

  getEffect(type) {
    return this.effects.find(e => e.type === type) || null;
  }

  removeEffect(type) {
    const before = this.effects.length;
    this.effects = this.effects.filter(e => e.type !== type);
    return before !== this.effects.length;
  }

  tickEffects() {
    const next = this.effects.map(e => ({ ...e, duration: e.duration - 1 }));
    // Проломленная броня возвращается, когда эффект кончился
    next.filter(e => e.duration <= 0 && e.type === 'armor_broken').forEach(e => {
      this.armor += e.value || 0;
      this._armorBroken = Math.max(0, (this._armorBroken || 0) - (e.value || 0));
    });
    this.effects = next.filter(e => e.duration > 0);
  }

  // --- Конец хода ---
  endTurn() {
    this.tickCooldowns();
    this.removeEffect('staggered');   // шатание действует на одно действие
    this.tickEffects();
    this._reactionUsed = false;
    this._secondStrikeUsed = false;
    if (this.regen > 0 && this.isAlive && this.hp < this.maxHp) {
      const amount = Math.max(1, Math.round(this.maxHp * this.regen / 100));
      this.heal(amount);
      eventBus.emit('log', `${this.name} восстанавливает ${amount} HP (регенерация)`);
    }
  }

  /**
   * Подготовка к бою: боевые ресурсы (Темп, Мощь, заряды, прикрытия) на стартовые значения,
   * Сборы не трогаются (восстанавливаются только отдыхом).
   */
  prepareForBattle(baseResources = {}) {
    this.cooldowns = {};
    this.effects = [];
    this.surrendered = false;
    this._usedOnce = new Set();
    this._reactionUsed = false;
    const perBattle = ['tempo', 'might', 'pistol_charges', 'cover_uses'];
    perBattle.forEach(k => {
      if (k in baseResources || k in this.resources) {
        this.resources[k] = (baseResources[k] ?? 0) + (this.resourceBonus?.[k] || 0);
      }
    });
    const cls = getClassDef(this);
    if (cls?.resource && cls.resource.id !== 'supplies') this.resources[cls.resource.id] = cls.resource.startsCombat ?? 0;
  }

  resetForBattle() {
    this.hp       = this.maxHp;
    this.isAlive  = true;
    this.cooldowns = {};
    this.movesLeft = 1;
    this.effects  = [];
  }
}
