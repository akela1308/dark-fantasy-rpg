import eventBus from '../utils/eventBus.js';
import { isActive } from './CombatRules.js';

/**
 * ClassPassives: поздние узлы веток (уровни 8-12) и механика Следопыта и Носителя Запрета.
 * Unit и SkillSystem вызывают эти функции в своих точках; числа, которые относятся к правилам,
 * живут здесь, числа навыков лежат в skills.json, ресурсы в classes.json.
 */

/** Что снимают припарка и Чистые руки. */
export const BAD_STATUSES = ['weakened', 'marked', 'rooted', 'armor_broken', 'poison', 'branded', 'staggered'];

/** Выстрелы Дуэлянта: на них срабатывают Дымная завеса и зарядные узлы. */
const PISTOL_SKILLS = new Set(['pistol_shot', 'two_barrels']);
const SHOT_SKILLS = new Set([...PISTOL_SKILLS, 'last_argument_shot']);

const PARRY_CHANCE = 0.2;
const PARRY_TEMPO = 2;
const BARRIER_HP = 0.3;
const LEECH_HP = 0.3;
const ROT_MULT = 1.15;
const CLEAN_TARGET_MULT = 0.85;   // Кормилец топи: цена за чистую цель
const THIN_BLOOD_HP = 0.5;
const THIN_BLOOD_MULT = 1.25;
const SMOKE_ACCURACY = 15;
const FIELD_TRAP_ROOT = 2;
const VOICE_TAINT = 2;

export const has = (unit, id) => (unit?.passives || []).includes(id);

const teammates = unit => (unit._allies || [unit]);
const melee = (src, opts) => !!src && !src.ranged && !src.ignoreRows && !opts.ranged;

export const isPistolShot = skill => PISTOL_SKILLS.has(skill?.id);

/** Стоимость навыка с учётом Горькой цены. */
export function skillCost(skill, caster) {
  const cost = skill?.resourceCost || {};
  if (skill?.id !== 'bandage' || !has(caster, 'bitter_price')) return cost;
  const { supplies, ...rest } = cost;
  return rest;
}

/** Цена здоровьем: навык с hpCost и Перевязка при Горькой цене. */
export function skillHpCost(skill, caster) {
  if (skill?.id === 'bandage' && has(caster, 'bitter_price')) return 5;
  const c = skill?.hpCost;
  return c ? c.base + (c.perLevel || 0) * (caster.level || 1) : 0;
}

// ─── Шанс попасть и отбить ──────────────────────────────────────────────────

/** Дымная завеса: минус к точности тех, кто целится в героя. */
export function accuracyPenalty(target) {
  return target.getEffect?.('smoke_screen')?.value || 0;
}

/** Парирование и Последний барьер: true, если ближний удар отбит. */
export function parries(target, attacker, opts, rng = Math.random) {
  if (attacker.ranged || attacker.ignoreRows || opts.ignoreRows || opts.ranged) return false;
  if (target.hasEffect?.('last_barrier')) return true;
  return has(target, 'parry') && (target.resources?.tempo || 0) >= PARRY_TEMPO && rng() < PARRY_CHANCE;
}

// ─── Множители урона ────────────────────────────────────────────────────────

/** Что усиливает или ослабляет исходящий удар. */
export function outgoingMult(unit, target) {
  let mult = 1;
  const res = unit.classResource?.();
  const perPoint = res?.damagePerPoint || 0;
  if (perPoint) mult *= 1 + perPoint * (unit.resources?.[res.id] || 0);
  if (has(unit, 'thin_blood') && isThinBlooded(unit)) mult *= THIN_BLOOD_MULT;
  if (has(unit, 'mire_feeder') && !isMired(target)) mult *= CLEAN_TARGET_MULT;
  return mult;
}

/** Порча: ослабленная цель получает больше, пока Знахарка с этим умением в строю. */
export function incomingMult(unit) {
  if (!unit.hasEffect('weakened')) return 1;
  return (unit._foes || []).some(f => isActive(f) && has(f, 'rot')) ? ROT_MULT : 1;
}

const isMired = u => !!u.hasEffect?.('poison') || !!u.hasEffect?.('rooted');
export const isThinBlooded = u => u.hp < u.maxHp * THIN_BLOOD_HP;

/** Жидкая кровь режет любое лечение, пока Ресса ниже половины здоровья. */
export function incomingHealMult(unit) {
  return has(unit, 'thin_blood') && isThinBlooded(unit) ? 0.5 : 1;
}

/** Жидкая кровь усиливает лечение ценой крови (Кровавый заём). */
export function healerMult(skill, caster) {
  return skill.hpCost && has(caster, 'thin_blood') && isThinBlooded(caster) ? THIN_BLOOD_MULT : 1;
}

// ─── Перенаправление ────────────────────────────────────────────────────────

/** Последний заслон: кто забирает на себя удар по этому союзнику. */
export function bulwarkFor(unit) {
  return teammates(unit).find(a => a !== unit && isActive(a) && a.hasEffect?.('last_bulwark')) || null;
}

// ─── После попадания ────────────────────────────────────────────────────────

/** Полевой устав: обычный выстрел копит Сосредоточение только по метке. */
export function basicGainAllowed(unit, target) {
  return !has(unit, 'field_orders') || target.hasEffect?.('marked');
}

export function onLanded(unit, target) {
  if (has(unit, 'mire_feeder') && isMired(target)) unit.gainResource('focus', 1);
  if (has(unit, 'field_orders') && target.hasEffect?.('marked')) unit.gainResource('focus', 1);
  if (!target.isAlive) onKill(unit);
}

/** Жажда: цель умерла от руки Бойца. */
export function onKill(unit) {
  if (!has(unit, 'thirst')) return;
  unit.gainResource('might', 1);
  eventBus.emit('log', `${unit.label}: жажда, +1 Мощь`);
}

/** Клеймо вины: заклеймённый платит за каждый свой удар. */
export function payBrand(attacker, opts) {
  const brand = attacker.getEffect?.('branded');
  if (!brand || opts.reaction || !attacker.isAlive) return;
  eventBus.emit('log', `${attacker.label}: клеймо жжёт`);
  attacker.loseHp(brand.value || 1, { lethal: true });
}

// ─── Реакции на полученный удар ─────────────────────────────────────────────

/** Всё, что срабатывает после удара по живому бойцу. actual: снятое здоровье. */
export function afterHit(unit, opts, actual) {
  triggerBarrier(unit);
  const src = opts.source;
  if (!opts.reaction && src) {
    // Каждая реакция могла свалить обидчика: следующая проверяет его сама
    [
      () => springTrap(unit, src, opts),
      () => fireOverwatch(unit, src),
      () => returnDebt(unit, src, actual),
      () => answerFromBeyond(unit, src),
    ].forEach(react => { if (isActive(src)) react(); });
  }
  if (unit.isAlive) leechResponse(unit);
}

function triggerBarrier(unit) {
  if (!has(unit, 'last_barrier') || unit._usedOnce?.has('last_barrier')) return;
  if (unit.hp >= unit.maxHp * BARRIER_HP) return;
  unit._usedOnce.add('last_barrier');
  unit.addEffect({ type: 'last_barrier', duration: 99, untilRoundEnd: true });
  eventBus.emit('log', `${unit.label}: последний барьер, ближние удары отбиты до конца раунда`);
}

function springTrap(unit, src, opts) {
  const trap = unit.getEffect('trap');
  if (!trap || !melee(src, opts)) return;
  unit.removeEffectInstance(trap);
  src.addEffect({ type: 'rooted', duration: FIELD_TRAP_ROOT, sourceId: trap.sourceId });
  src.addEffect({ type: 'staggered', duration: 99, sourceId: trap.sourceId });
  eventBus.emit('log', `${src.label} попадает в силок`);
}

function fireOverwatch(unit, src) {
  const shooter = teammates(unit).find(a => isActive(a) && a.hasEffect?.('overwatch'));
  if (!shooter) return;
  const watch = shooter.getEffect('overwatch');
  shooter.removeEffectInstance(watch);
  eventBus.emit('log', `${shooter.label}: выстрел из дозора`);
  shooter.attack(src, { reaction: true, ignoreRows: true, mult: watch.value || 1 });
}

function returnDebt(unit, src, actual) {
  if (!has(unit, 'debt_returned') || unit._reactionUsed) return;
  unit._reactionUsed = true;
  const back = Math.max(1, Math.round(actual / 2));
  eventBus.emit('log', `${unit.label}: долг назад, ${src.label} получает ${back}`);
  src.takeDamage(back, { ignoreArmor: 1, reaction: true, source: unit, ranged: true });
  unit.gainResource('taint', 1);
}

function answerFromBeyond(unit, src) {
  if (!has(unit, 'voice_beyond') || unit._reactionUsed) return;
  if ((unit.resources?.taint || 0) < VOICE_TAINT) return;
  unit._reactionUsed = true;
  unit.resources.taint -= 1;
  src.removeEffect('branded');
  src.addEffect({ type: 'branded', value: 3 + (unit.level || 1), duration: 2, sourceId: unit.id });
  eventBus.emit('log', `${src.label}: клеймо, голос за порогом ответил`);
}

function leechResponse(unit) {
  if (unit.hp >= unit.maxHp * LEECH_HP) return;
  const healer = teammates(unit).find(a => a !== unit && isActive(a) && has(a, 'leech_response') && !a._leechUsed);
  if (!healer) return;
  healer._leechUsed = true;
  const amount = 10 + (healer.level || 1);
  unit.heal(amount);
  eventBus.emit('log', `${healer.label}: пиявочный отклик, ${unit.label} +${amount} HP`);
}

// ─── Гибель ─────────────────────────────────────────────────────────────────

/** Гнилая кровь: яд с павшего уходит к соседу по ряду, а если соседей нет, к любому живому. */
export function onDeath(unit) {
  const poison = unit.getEffect('poison');
  if (!poison) return;
  const carrier = (unit._foes || []).find(f => f.id === poison.sourceId && isActive(f) && has(f, 'rotten_blood'));
  if (!carrier) return;
  const live = (unit._allies || []).filter(a => a !== unit && isActive(a) && !a.hasEffect('poison'));
  if (!live.length) return;
  const row = unit.position?.row, col = unit.position?.col ?? 0;
  const near = (a, b) => Math.abs((a.position?.col ?? 0) - col) - Math.abs((b.position?.col ?? 0) - col);
  const next = live.filter(a => a.position?.row === row).sort(near)[0] || live[0];
  next.addEffect({ type: 'poison', value: poison.value, duration: 2, sourceId: poison.sourceId });
  eventBus.emit('log', `${next.label}: яд перешёл с павшего`);
}

// ─── Конец хода ─────────────────────────────────────────────────────────────

/** Яд тикает в конце хода носителя и броню не спрашивает. */
export function tickPoison(unit) {
  const poison = unit.getEffect('poison');
  if (!poison || !unit.isAlive) return;
  eventBus.emit('log', `${unit.label}: яд, −${poison.value}`);
  unit.loseHp(poison.value, { lethal: true });
}

/** Чистые руки: с союзника снимается один статус в конце его хода. */
export function cleanHands(unit) {
  if (!teammates(unit).some(a => a !== unit && isActive(a) && has(a, 'clean_hands'))) return;
  const st = BAD_STATUSES.filter(t => t !== 'staggered').map(t => unit.getEffect(t)).find(Boolean);
  if (!st) return;
  unit.removeEffectInstance(st);
  eventBus.emit('log', `${unit.label}: чистые руки сняли статус`);
}

/** Скверна через край: на пределе Ресса платит здоровьем в конце своего хода. */
export function taintOverflow(unit) {
  const res = unit.classResource?.();
  if (!res?.overflowHpPct || !unit.isAlive) return;
  const cap = unit.resourceMax?.[res.id] ?? res.max;
  if ((unit.resources?.[res.id] || 0) < cap) return;
  let loss = unit.maxHp * res.overflowHpPct / 100;
  if (has(unit, 'overbrim')) loss *= 2;
  if ((unit.classTags || []).includes('steel_gut')) loss /= 2;
  eventBus.emit('log', `${unit.label}: ${res.name} через край`);
  unit.loseHp(Math.max(1, Math.round(loss)));
}

/** Дымная завеса висит до конца раунда. */
export function afterShot(skill, caster) {
  if (!SHOT_SKILLS.has(skill.id) || !has(caster, 'smoke_screen')) return;
  if (caster.hasEffect('smoke_screen')) return;
  caster.addEffect({ type: 'smoke_screen', value: SMOKE_ACCURACY, duration: 99, untilRoundEnd: true });
  eventBus.emit('log', `${caster.label}: дымная завеса`);
}
