import data from '../data/archetypes.json';
import progression from '../data/progression.json';

/**
 * Враги из архетипа по уровню (линейный рост), элита и босс множителями.
 * Формулы как в balance/model.py (enemy, xp_for_encounter).
 */
const pyRound = x => {
  // round() Питона: половина к чётному. Нужен, чтобы статы совпали с таблицами 01_БАЛАНС.
  const f = Math.floor(x);
  const d = x - f;
  if (Math.abs(d - 0.5) < 1e-9) return f % 2 === 0 ? f : f + 1;
  return Math.round(x);
};
export { pyRound };

export function xpForEncounter(level, kind = 'standard') {
  const base = progression.XP_TO_NEXT[String(Math.min(level, 11))];
  return pyRound(base * progression.ENCOUNTER_XP_MULT[kind]);
}

export function makeEnemy(arch, level, { name = null, boss = false, elite = false, pos = [0, 0], id = null } = {}) {
  const a = data.archetypes[arch];
  if (!a) throw new Error(`нет архетипа ${arch}`);
  const lin = t => t[0] + t[1] * (level - 1);
  let hp = pyRound(lin(a.hp));
  let dmin = pyRound(lin(a.dmin));
  let dmax = pyRound(lin(a.dmax));
  let armor = Math.min(a.armorCap ?? data.armorCapDefault, pyRound(lin(a.armor)));
  let speed = a.speed;
  const skills = [...a.skills];
  if (elite) {
    hp = pyRound(hp * data.elite.hp); dmin = pyRound(dmin * data.elite.dmg); dmax = pyRound(dmax * data.elite.dmg);
    armor = Math.min(50, armor + data.elite.armor);
  }
  if (boss) {
    hp = pyRound(hp * data.boss.hp); dmin = pyRound(dmin * data.boss.dmg); dmax = pyRound(dmax * data.boss.dmg);
    speed += data.boss.speed; armor = Math.min(50, armor + data.boss.armor);
    skills.push(...data.boss.skills);
  }
  const xp = pyRound(xpForEncounter(level, 'standard') / 3 * a.xpW * (boss ? 2 : 1));
  return {
    id: id || `${arch}_${level}`, name: name || a.name, type: 'enemy', arch, classId: arch,
    hp, maxHp: hp, damage: { min: dmin, max: dmax }, speed, armor,
    accuracy: pyRound(lin(a.acc)), regen: a.regen || 0, xpKill: xp,
    position: { row: pos[0], col: pos[1] }, skills, ranged: a.ranged, isBoss: boss,
  };
}

/** Встреча: список [arch, boss, name, elite], ряды раскладываются автоматически. */
export function makeEncounter(level, spec) {
  const cols = { 0: 0, 1: 0 };
  return spec.map(([arch, boss = false, name = null, elite = false], i) => {
    const r = data.archetypes[arch].row;
    const e = makeEnemy(arch, level, { name, boss, elite, pos: [r, [0, 2, 1][cols[r]]] });
    cols[r]++;
    e.id = `${arch}_${i}`;
    return e;
  });
}
