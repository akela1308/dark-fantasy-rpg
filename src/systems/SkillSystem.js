import eventBus from '../utils/eventBus.js';
import { getClassDef } from './ClassProgression.js';
import { RULES, isActive } from './CombatRules.js';

/**
 * SkillSystem - регистрирует скиллы и применяет их эффекты.
 * Урон навыков идёт через Unit.attack: те же попадание, крит (CombatRules) и броня, что у удара.
 */
export class SkillSystem {
  constructor() {
    this._skills = {};
  }

  register(skillDef) {
    this._skills[skillDef.id] = skillDef;
  }

  get(skillId) {
    return this._skills[skillId] || null;
  }

  canUse(skillId, caster) {
    const skill = this._skills[skillId];
    if (!skill || !caster) return false;
    if (caster.isOnCooldown?.(skillId)) return false;
    if (skill.oncePerBattle && caster._usedOnce?.has(skillId)) return false;
    return this._hasRequiredResources(skill, caster);
  }

  /** Почему навык недоступен (для подписи на кнопке). null, если доступен. */
  unavailableReason(skillId, caster) {
    const skill = this._skills[skillId];
    if (!skill) return 'нет навыка';
    if (caster.isOnCooldown?.(skillId)) return `откат ${caster.cooldowns[skillId]}`;
    if (skill.oncePerBattle && caster._usedOnce?.has(skillId)) return 'уже использован в этом бою';
    if (skill.usesResource && (caster.resources?.[skill.usesResource] || 0) <= 0) return 'нет зарядов';
    const lack = Object.entries(skill.resourceCost || {}).find(([id, n]) => (caster.resources?.[id] || 0) < n);
    if (lack) {
      const name = getClassDef(caster)?.resource?.id === lack[0] ? getClassDef(caster).resource.name : lack[0];
      return `нужно ${name} ${lack[1]}`;
    }
    return null;
  }

  // Применить скилл. Возвращает true если успешно.
  use(skillId, caster, target) {
    const skill = this._skills[skillId];
    if (!skill) {
      console.warn(`SkillSystem: скилл "${skillId}" не найден`);
      return false;
    }

    if (skill.oncePerBattle && caster._usedOnce?.has(skillId)) {
      eventBus.emit('log', `«${skill.name}» уже использован в этом бою`);
      return false;
    }
    if (!this._hasRequiredResources(skill, caster)) {
      eventBus.emit('log', `Не хватает ресурса для «${skill.name}»`);
      return false;
    }

    // Финишер тратит весь Темп: запоминаем до списания
    const tempoBefore = caster.resources?.tempo || 0;
    this._spendResources(skill, caster);
    if (skill.effect === 'finisher') caster.resources.tempo = 0;

    if (typeof skill.effect === 'function') {
      skill.effect(caster, target, eventBus);
    } else {
      this._applyBuiltin(skill, caster, target, { tempoBefore });
    }

    this._gainResources(skill, caster);
    if (skill.oncePerBattle) caster._usedOnce?.add(skillId);
    if (skill.cooldown > 0) caster.setCooldown(skillId, skill.cooldown);

    eventBus.emit('skill_used', { caster, skillId, target });
    return true;
  }

  /** Сила лечения навыка с ростом по уровню и перками. */
  healPower(skill, caster) {
    const lvl = caster.level || 1;
    let amount = (skill.healAmount || 0) + (skill.healPerLevel || 0) * (lvl - 1);
    if (skill.id === 'bandage') amount += caster.healBonus || 0;
    return Math.max(1, Math.round(amount * (caster.staggerMult?.() ?? 1)));
  }

  _applyBuiltin(skill, caster, target, ctx = {}) {
    const passives = caster.passives || [];
    let landed = 0;
    const hitOpts = {
      cannotMiss: !!skill.cannotMiss,
      ignoreRows: !!skill.ignoreRows,
      ignoreArmor: skill.ignoreArmor || 0,
      skillId: skill.id,
    };

    // Урон × множитель (Укол, Тяжёлый удар, навыки врагов)
    if (skill.damageMultiplier && target) {
      let ignoreArmor = hitOpts.ignoreArmor;
      if (skill.id === 'heavy_strike' && passives.includes('crushing_blow')) ignoreArmor = Math.max(ignoreArmor, 0.5);
      landed = caster.attack(target, { ...hitOpts, ignoreArmor, mult: skill.damageMultiplier });
      if (landed > 0 && skill.id === 'heavy_strike') {
        if (passives.includes('breaking_blow')) this._status(target, { type: 'staggered', duration: 99, label: 'шатается' }, caster);
        if (passives.includes('crushing_blow')) this._status(target, { type: 'armor_broken', value: 10, duration: 2, label: 'броня проломлена' }, caster);
      }
    }

    // Фиксированный урон (пистоль): 20-26 +2 за уровень
    if (skill.damage && target) {
      const lvl = caster.level || 1;
      const per = (skill.damagePerLevel || 0) * (lvl - 1);
      const knack = (caster.commanderTraits || []).includes('shooting_knack') && skill.id === 'pistol_shot' ? 0.25 : 0;
      landed = caster.attack(target, {
        ...hitOpts, ignoreArmor: Math.max(hitOpts.ignoreArmor, knack),
        fixed: { min: skill.damage.min + per, max: skill.damage.max + per },
      });
      if (landed > 0 && skill.id === 'pistol_shot' && passives.includes('point_blank')) {
        this._status(target, { type: 'staggered', duration: 99, label: 'шатается' }, caster);
      }
    }

    // Финишер: урон × (1 + 0.5 × потраченный Темп), без брони
    if (skill.effect === 'finisher' && target) {
      const mult = 1 + (skill.finisherPerTempo || 0.5) * (ctx.tempoBefore || 0);
      landed = caster.attack(target, { ...hitOpts, mult, ignoreArmor: 1 });
      eventBus.emit('log', `${caster.label}: «${skill.name}» (Темп ${ctx.tempoBefore})`);
    }

    // Лечение одной цели
    if (skill.healAmount && target && !skill.effect) {
      const amount = this.healPower(skill, caster);
      target.heal(amount);
      eventBus.emit('log', `${caster.label} → ${target.label}: +${amount} HP`);
    }

    // Снять статус и подлечить
    if (skill.effect === 'cleanse_heal' && target) {
      const bad = ['weakened', 'staggered', 'marked', 'rooted', 'armor_broken'];
      const st = target.effects.find(e => bad.includes(e.type));
      if (st) target.effects = target.effects.filter(e => e !== st);
      const amount = this.healPower(skill, caster);
      target.heal(amount);
      eventBus.emit('log', `${caster.label}: «${skill.name}» → ${target.label}`);
    }

    // Лечение всех союзников долей Перевязки
    if (skill.effect === 'heal_all') {
      const base = this._skills[skill.healFrom || 'bandage'];
      const amount = Math.max(1, Math.round(this.healPower(base, caster) * (skill.healFraction || 0.5)));
      (caster._allies || [caster]).filter(u => u.isAlive).forEach(u => u.heal(amount));
      eventBus.emit('log', `${caster.label}: «${skill.name}», все союзники +${amount} HP`);
    }

    // Слово Печати: 8 + уровень по всему заднему ряду врага, без брони
    if (skill.effect === 'seal_word') {
      const foes = caster._foes || [];
      const back = foes.filter(u => isActive(u) && u.position?.row === 1);
      const dmg = 8 + (caster.level || 1);
      back.forEach(u => u.takeDamage(dmg, { ignoreArmor: 1, source: caster, ranged: true }));
      eventBus.emit('log', `${caster.label}: «${skill.name}»`);
    }

    if (skill.effect === 'dodge_boost') {
      caster.addEffect({ type: 'dodge_boost', value: skill.effectValue, duration: skill.duration });
      eventBus.emit('log', `${caster.label}: «${skill.name}», уклонение +${skill.effectValue * 100}%`);
    }

    if (skill.effect === 'cover' && target) {
      target.addEffect({ type: 'covered_by', coveredBy: caster, duration: 1 });
      eventBus.emit('log', `${caster.label} прикрывает: ${target.label}`);
    }

    this._applyStatuses(skill, caster, target, landed);
  }

  _status(receiver, status, caster) {
    let value = status.value;
    let type = status.type;
    // На боссе корни дают только −2 инициативы (01_БАЛАНС 2)
    if (type === 'rooted' && receiver.isBoss) value = RULES.ROOT_SPEED_BOSS;
    if (type === 'armor_broken') {
      receiver.armor = Math.max(0, (receiver.armor || 0) - value);
      receiver._armorBroken = (receiver._armorBroken || 0) + value;
    }
    receiver.addEffect({ type, value, duration: status.duration ?? 1, sourceId: caster.id });
    const STATUS_RU = { guarded: 'под прикрытием', marked: 'метка', weakened: 'ослаблен', staggered: 'оглушён', rooted: 'опутан', bleed: 'кровотечение', challenged: 'вызов', enraged: 'ярость', dodge_boost: 'уклонение', armor_broken: 'броня пробита' };
    if (status.log !== false) eventBus.emit('log', `${receiver.label}: ${status.label || STATUS_RU[type] || type}`);
  }

  _hasRequiredResources(skill, caster) {
    if (skill.usesResource && (caster.resources?.[skill.usesResource] || 0) <= 0) {
      return false;
    }
    const cost = skill.resourceCost || {};
    return Object.entries(cost).every(([resourceId, amount]) => (
      (caster.resources?.[resourceId] || 0) >= amount
    ));
  }

  _spendResources(skill, caster) {
    caster.resources = caster.resources || {};
    if (skill.usesResource) {
      caster.resources[skill.usesResource] = Math.max(0, (caster.resources[skill.usesResource] || 0) - 1);
    }
    Object.entries(skill.resourceCost || {}).forEach(([resourceId, amount]) => {
      caster.resources[resourceId] = Math.max(0, (caster.resources[resourceId] || 0) - amount);
    });
  }

  _gainResources(skill, caster) {
    caster.resources = caster.resources || {};
    Object.entries(skill.resourceGain || {}).forEach(([resourceId, amount]) => {
      if (caster.gainResource) caster.gainResource(resourceId, amount);
      else caster.resources[resourceId] = (caster.resources[resourceId] || 0) + amount;
    });
  }

  _applyStatuses(skill, caster, target, landed) {
    const statuses = Array.isArray(skill.appliesStatus) ? skill.appliesStatus : [];
    statuses.forEach(status => {
      const receiver = status.target === 'self' ? caster : target;
      if (!receiver) return;
      if (status.onHit && !(landed > 0)) return;   // метка ложится только при попадании
      this._status(receiver, status, caster);
    });
  }

  registerAll(skillsData) {
    skillsData.forEach(s => {
      this._skills[s.id] = s;
    });

    // Особый скилл босса (кастомная логика)
    this._skills['commanders_roar'] = {
      id: 'commanders_roar',
      name: 'Боевой рёв',
      cooldown: 3,
      effect: (caster, target, bus) => {
        bus.emit('log', `${caster.label} издаёт БОЕВОЙ РЁВ! Все враги усиливаются!`);
        (caster._allies || []).filter(u => u.isAlive && u !== caster).forEach(u => {
          u.addEffect({ type: 'enraged', value: 5, duration: 2 });
        });
        bus.emit('commanders_roar', caster);
      },
    };
  }
}
