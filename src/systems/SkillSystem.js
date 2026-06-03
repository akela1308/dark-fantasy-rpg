import eventBus from '../utils/eventBus.js';

/**
 * SkillSystem — регистрирует скиллы и применяет их эффекты.
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

  // Применить скилл. Возвращает true если успешно.
  use(skillId, caster, target) {
    const skill = this._skills[skillId];
    if (!skill) {
      console.warn(`SkillSystem: скилл "${skillId}" не найден`);
      return false;
    }

    // Проверка ресурса
    if (skill.usesResource) {
      const res = caster.resources[skill.usesResource] || 0;
      if (res <= 0) {
        eventBus.emit('log', `Нет ресурса: ${skill.usesResource}`);
        return false;
      }
      caster.resources[skill.usesResource]--;
    }

    // Выполнить эффект
    if (skill.effect) {
      skill.effect(caster, target, eventBus);
    } else {
      this._applyBuiltin(skill, caster, target);
    }

    // Установить откат
    if (skill.cooldown > 0) {
      caster.setCooldown(skillId, skill.cooldown);
    }

    eventBus.emit('skill_used', { caster, skillId, target });
    return true;
  }

  _applyBuiltin(skill, caster, target) {
    // Урон × множитель
    if (skill.damageMultiplier && target) {
      const base = caster.rollDamage();
      const dmg  = Math.round(base * skill.damageMultiplier);
      target.takeDamage(dmg);
      eventBus.emit('log', `${caster.name} использует "${skill.name}" — ${dmg} урона!`);
    }

    // Фиксированный урон (пистолет)
    if (skill.damage && target) {
      const { min, max } = skill.damage;
      const dmg = Math.floor(Math.random() * (max - min + 1)) + min;
      target.takeDamage(dmg);
      eventBus.emit('log', `${caster.name}: "${skill.name}" — ${dmg} урона!`);
    }

    // Лечение
    if (skill.healAmount && target) {
      target.heal(skill.healAmount);
      eventBus.emit('log', `${caster.name} лечит ${target.name} на ${skill.healAmount} HP`);
    }

    // Эффект на себя (dodge_boost)
    if (skill.effect === 'dodge_boost') {
      caster.addEffect({ type: 'dodge_boost', value: skill.effectValue, duration: skill.duration });
      eventBus.emit('log', `${caster.name}: "${skill.name}" — уклонение +${skill.effectValue * 100}%`);
    }

    // Прикрыть союзника
    if (skill.effect === 'cover' && target) {
      target.addEffect({ type: 'covered_by', coveredBy: caster, duration: 1 });
      eventBus.emit('log', `${caster.name} прикрывает ${target.name}!`);
    }
  }

  // Зарегистрировать все скиллы из JSON
  registerAll(skillsData) {
    skillsData.forEach(s => {
      // Скиллы из JSON не имеют функции effect — используем _applyBuiltin
      this._skills[s.id] = s;
    });

    // Особый скилл мини-босса (кастомная логика)
    this._skills['commanders_roar'] = {
      id: 'commanders_roar',
      name: 'Боевой рёв',
      cooldown: 3,
      effect: (caster, target, bus) => {
        bus.emit('log', `${caster.name} издаёт БОЕВОЙ РЁВ! Все враги усиливаются!`);
        bus.emit('commanders_roar', caster);
      }
    };
  }
}
