/**
 * CombatRules: все боевые формулы ревизии 2026-10 в одном месте (01_БАЛАНС, раздел 2;
 * 11_ПРОМПТ, блок Б). Unit, SkillSystem, BattleGrid и EnemyUnit вызывают эти функции,
 * JS-симулятор (test/battle_sim.mjs) тоже. Без Phaser, без eventBus: чистые функции.
 */

export const RULES = {
  HIT_MIN: 40,
  HIT_MAX: 95,
  HIT_SPEED_WEIGHT: 2,
  CRIT_BASE: 5,
  CRIT_CAP: 20,
  CRIT_MULT: 1.6,
  DEFEND_MULT: 0.5,
  MARKED_DEFAULT: 1.25,
  GUARDED_DEFAULT: 0.8,
  ARMOR_CAP_PLAYER: 60,
  ARMOR_CAP_ENEMY: 50,
  FLANK_MIN_FRONT: 2,      // передний ряд закрывает задний только при >= 2 живых
  FLANK_MULT: 0.75,        // ближний удар в задний ряд через тонкий строй
  STAGGER_MULT: 0.5,
  ROOT_SPEED: 4,
  ROOT_SPEED_BOSS: 2,
  SURRENDER_HP: 0.2,
  BOSS_FURY_HP: 0.5,
  INJURY_MULT: 0.8,        // Хроника: рана до отдыха
};

export const clamp = (lo, hi, v) => Math.max(lo, Math.min(hi, v));

/** Шанс попадания в процентах: clamp(40, 95, точность + 2 × (иниц. атакующего − иниц. цели)). */
export function hitChance(attacker, target) {
  const acc = attacker.accuracy ?? 75;
  return clamp(RULES.HIT_MIN, RULES.HIT_MAX,
    acc + RULES.HIT_SPEED_WEIGHT * ((attacker.speed || 0) - (target.speed || 0)));
}

/** Шанс крита в процентах: min(20, 5 + иниц.). Одна формула для ударов и навыков. */
export function critChance(attacker) {
  return Math.min(RULES.CRIT_CAP, RULES.CRIT_BASE + (attacker.speed || 0));
}

export function rollHit(attacker, target, rng = Math.random) {
  return rng() * 100 <= hitChance(attacker, target);
}

export function rollCrit(attacker, rng = Math.random) {
  return rng() * 100 < critChance(attacker);
}

export function armorCap(unit) {
  return unit.type === 'player' ? RULES.ARMOR_CAP_PLAYER : RULES.ARMOR_CAP_ENEMY;
}

/** Броня с потолком 60 у игрока и 50 у врагов. */
export function effectiveArmor(unit) {
  return Math.min(Math.max(0, unit.armor || 0), armorCap(unit));
}

/** Сколько «живых» в переднем ряду для правила тонкого строя (hold_the_line считается за двоих). */
export function frontLineStrength(units) {
  return units
    .filter(u => isActive(u) && u.position?.row === 0)
    .reduce((s, u) => s + ((u.passives || []).includes('hold_the_line') ? 2 : 1), 0);
}

/** Активный боец: жив и не сдался. */
export function isActive(u) {
  return !!u && u.isAlive !== false && !u.surrendered;
}

/**
 * Может ли атакующий бить цель и с каким множителем.
 * Возвращает { ok, flank }. flank = true значит удар через тонкий строй (×0.75).
 */
export function meleeReach(attacker, target, targetAllies) {
  if (attacker.ranged || attacker.ignoreRows) return { ok: true, flank: false };
  if (target.position?.row !== 1) return { ok: true, flank: false };
  const front = frontLineStrength(targetAllies);
  if (front >= RULES.FLANK_MIN_FRONT) return { ok: false, flank: false };
  // Передний ряд пуст: задний полностью открыт, без штрафа. Один впереди: штраф за обход.
  const anyFront = targetAllies.some(u => isActive(u) && u.position?.row === 0);
  return { ok: true, flank: anyFront };
}

/** Список досягаемых целей для атакующего. */
export function reachableTargets(attacker, enemies) {
  return enemies.filter(t => isActive(t) && meleeReach(attacker, t, enemies).ok);
}

/** Инициатива с учётом rooted (−4, у босса −2). */
export function effectiveSpeed(unit) {
  const bonus = unit._initiativeBonus || 0;   // засада: враги ходят первыми в первом раунде
  const root = (unit.effects || []).find(e => e.type === 'rooted');
  if (!root) return (unit.speed || 0) + bonus;
  return (unit.speed || 0) + bonus - (unit.isBoss ? RULES.ROOT_SPEED_BOSS : RULES.ROOT_SPEED);
}

/** Должен ли враг сдаться: canSurrender, HP < 20%, командир мёртв или сдался. */
export function shouldSurrender(unit, allies) {
  if (!unit.canSurrender || unit.surrendered || unit.isAlive === false) return false;
  if (unit.hp >= unit.maxHp * RULES.SURRENDER_HP) return false;
  if (!unit.commanderId) return true;
  const cmd = allies.find(a => a.id === unit.commanderId && a !== unit);
  return !cmd || cmd.isAlive === false || !!cmd.surrendered;
}

/** Ярость босса: второе действие в раунд при HP < 50%. */
export function hasFury(unit) {
  return !!unit.isBoss && unit.isAlive !== false && !unit.surrendered && unit.hp < unit.maxHp * RULES.BOSS_FURY_HP;
}

// ─── Состав врагов по размеру партии (02_ДИЗАЙН 2.2, 09_МИР 5) ──────────────

const threat = e => (e.hp || 1) * (((e.damage?.min || 0) + (e.damage?.max || 0)) / 2);

/**
 * Состав врагов под размер партии. Явный enemiesBySize важнее. Иначе правило:
 * для задуманного размера как есть; меньше: убрать самого слабого дальнего, потом самого слабого;
 * для одного остаются двое; больше: добавить ещё одного ближнего. Боссы не убираются.
 */
export function enemiesForParty(cfg, partySize) {
  const explicit = cfg?.enemiesBySize?.[String(partySize)];
  if (explicit) return clone(explicit);
  const base = clone(cfg?.enemies || []);
  const intended = cfg?.intendedPartySize || 3;
  if (!base.length || partySize === intended || !cfg?.intendedPartySize) return base;

  if (partySize < intended) {
    const target = Math.max(partySize === 1 ? 2 : partySize, base.filter(e => e.isBoss).length);
    let list = base;
    let first = true;
    while (list.length > target) {
      const removable = list.filter(e => !e.isBoss);
      if (!removable.length) break;
      const ranged = removable.filter(e => e.ranged);
      const pool = first && ranged.length ? ranged : removable;
      const weakest = pool.reduce((a, b) => (threat(b) < threat(a) ? b : a));
      list = list.filter(e => e !== weakest);
      first = false;
    }
    return list;
  }

  const list = base;
  for (let k = intended; k < partySize; k++) {
    const melee = list.filter(e => !e.ranged && !e.isBoss);
    const src = (melee.length ? melee : list.filter(e => !e.isBoss))[0] || list[0];
    const add = JSON.parse(JSON.stringify(src));
    add.id = `${src.id}_extra${k}`;
    if (!add.spriteKey && src.id) add.spriteKey = src.spriteKey || src.id;
    add.position = freeCell(list, 0);
    list.push(add);
  }
  return list;
}

function freeCell(list, preferRow) {
  const taken = new Set(list.map(e => `${e.position?.row}:${e.position?.col}`));
  for (const row of [preferRow, 1 - preferRow]) {
    for (const col of [1, 0, 2]) if (!taken.has(`${row}:${col}`)) return { row, col };
  }
  return { row: preferRow, col: 1 };
}

function clone(x) { return JSON.parse(JSON.stringify(x)); }

/** Добыча с одного врага: 4 + 2 × уровень (01_БАЛАНС 9). */
export function lootPerEnemy(level) {
  return 4 + 2 * (level || 1);
}
