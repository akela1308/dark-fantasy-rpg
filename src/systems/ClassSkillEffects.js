import eventBus from '../utils/eventBus.js';
import { isActive } from './CombatRules.js';
import { onKill } from './ClassPassives.js';

/**
 * ClassSkillEffects: особые эффекты поздних навыков. Поле effect в skills.json выбирает функцию.
 * Каждая получает { skill, caster, target, hit, spent } и возвращает снятое здоровье.
 * hit: готовые параметры удара, spent: сколько ресурса потратил навык со spendAll.
 */

const foesOf = caster => (caster._foes || []).filter(isActive);
const tokenLabel = skill => `«${skill.name}»`;

/** Удар по цели и соседу по ряду. Если соседей двое, берётся более раненый. */
function sweep({ skill, caster, target, hit }) {
  const col = target.position?.col ?? 0;
  const near = foesOf(caster).filter(u => u !== target
    && u.position?.row === target.position?.row && Math.abs((u.position?.col ?? 0) - col) === 1);
  const second = near.reduce((a, b) => (!a || b.hp < a.hp ? b : a), null);
  return [target, second].filter(Boolean)
    .reduce((sum, foe) => sum + caster.attack(foe, { ...hit, mult: skill.damageMult }), 0);
}

/** Добивание: удар, и если цель была ниже порога, она падает. Босса так не свалить: он получает обычный удар. */
function execute({ skill, caster, target, hit }) {
  const low = !target.isBoss && target.hp < target.maxHp * skill.executeBelow;
  const landed = caster.attack(target, hit);
  if (!(landed > 0) || !low || !target.isAlive) return landed;
  eventBus.emit('log', `${caster.label}: ${tokenLabel(skill)}, ${target.label} падает`);
  target.loseHp(target.hp, { lethal: true });
  onKill(caster);
  return landed;
}

/** Поднять последнего упавшего союзника. */
function revive({ skill, caster }) {
  const fallen = fallenAlly(caster);
  if (!fallen) return 0;
  fallen.revive(skill.reviveHp);
  eventBus.emit('log', `${caster.label}: ${tokenLabel(skill)}, ${fallen.label} снова в строю`);
  eventBus.emit('unit_revived', fallen);
  return 0;
}

/** Залп по приказу: по метке верно и сильно, по чистой цели обычный выстрел. */
function orderedVolley({ skill, caster, target, hit }) {
  const marked = target.hasEffect('marked');
  return caster.attack(target, { ...hit, mult: marked ? skill.markedMult : 1, cannotMiss: marked });
}

/** Королевский залп: все враги, множитель растёт от потраченного ресурса, меченым не уйти. */
function finalVolley({ skill, caster, hit, spent }) {
  const mult = skill.volleyBase + skill.volleyPerPoint * spent;
  eventBus.emit('log', `${caster.label}: ${tokenLabel(skill)}`);
  return foesOf(caster).reduce((sum, foe) => {
    const marked = foe.hasEffect('marked');
    return sum + caster.attack(foe, { ...hit, mult, cannotMiss: marked, ignoreArmor: marked ? skill.markedIgnoreArmor : 0 });
  }, 0);
}

/** Дурная кровь: вся Скверна уходит в цель, половина возвращается здоровьем. */
function badBlood({ skill, caster, target, spent }) {
  const dmg = (skill.perPoint + (caster.level || 1)) * spent;
  const actual = target.takeDamage(dmg, { ignoreArmor: 1, source: caster, ranged: true });
  eventBus.emit('log', `${caster.label} → ${target.label}: ${tokenLabel(skill)}, −${actual}`);
  if (actual > 0) caster.heal(Math.max(1, Math.round(actual / 2)));
  return actual;
}

/** Чёрная литания: вся Скверна бьёт по всем врагам, броня не спасает. */
function blackLitany({ skill, caster, spent }) {
  const dmg = (skill.perPoint + Math.floor((caster.level || 1) / 2)) * spent;
  eventBus.emit('log', `${caster.label}: ${tokenLabel(skill)}`);
  return foesOf(caster).reduce((sum, foe) => sum + foe.takeDamage(dmg, { ignoreArmor: 1, source: caster, ranged: true }), 0);
}

/** Последний пакт: половина своей крови уходит каждому союзнику. */
function finalPact({ skill, caster }) {
  const price = Math.floor(caster.hp / 2);
  if (price < 1) return 0;
  caster.loseHp(price);
  (caster._allies || []).filter(a => a !== caster && a.isAlive).forEach(a => a.heal(price));
  eventBus.emit('log', `${caster.label}: ${tokenLabel(skill)}, союзники +${price} HP`);
  return 0;
}

export const CLASS_EFFECTS = {
  sweep, execute, revive,
  ordered_volley: orderedVolley,
  final_volley: finalVolley,
  bad_blood: badBlood,
  black_litany: blackLitany,
  final_pact: finalPact,
};

/** Последний, кто упал: его и поднимает Последняя настойка. */
export function fallenAlly(caster) {
  const fallen = (caster._allies || []).filter(u => u !== caster && !u.isAlive);
  return fallen.reduce((a, b) => (!a || (b._fellAt || 0) > (a._fellAt || 0) ? b : a), null);
}
