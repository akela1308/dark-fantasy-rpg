import classesData from '../data/classes.json';
import eventBus from '../utils/eventBus.js';

/**
 * Прогрессия классов: базовый рост статов за уровень (01_БАЛАНС 5) и узлы levelPlan
 * на уровни 2-12 (02_ДИЗАЙН 4). Узлы с implemented: false в игре не показываются.
 */

const pyRound = x => {
  const f = Math.floor(x);
  if (Math.abs(x - f - 0.5) < 1e-9) return f % 2 === 0 ? f : f + 1;
  return Math.round(x);
};

export function getClassDef(unit) {
  if (!unit) return null;
  return classesData.find(cls => cls.id === unit.classId || cls.unitId === unit.id) || null;
}

export function getClassById(classId) {
  return classesData.find(c => c.id === classId) || null;
}

/** Базовые статы класса на уровне (без перков). */
export function statsAtLevel(classId, level) {
  const c = getClassById(classId);
  if (!c?.base || !c?.growth) return null;
  const b = c.base, g = c.growth, n = level - 1;
  const s = {
    hp: b.hp + g.hp * n,
    dmin: pyRound(b.dmin + g.dmin * n),
    dmax: pyRound(b.dmax + g.dmax * n),
    speed: b.speed + (g.speedAt || []).filter(L => L <= level).length,
    armor: Math.min(g.armorCap ?? 60, b.armor + g.armor * n),
    accuracy: Math.min(95, b.accuracy + g.accuracy * n),
  };
  if (g.healBase != null) {
    s.heal = g.healBase + g.healPerLevel * n;
    s.supplies = 3 + (g.suppliesAt || []).filter(L => L <= level).length;
  }
  if (g.pistolBase) s.pistol = [g.pistolBase[0] + g.pistolPerLevel * n, g.pistolBase[1] + g.pistolPerLevel * n];
  return s;
}

/**
 * Рост статов при переходе на уровень newLevel: прибавляется разница базовых таблиц,
 * так перки и черты, взятые раньше, не теряются.
 */
export function applyLevelGrowth(unit, newLevel) {
  const cls = getClassDef(unit);
  if (!cls) return false;
  const prev = statsAtLevel(cls.id, newLevel - 1);
  const next = statsAtLevel(cls.id, newLevel);
  if (!prev || !next) return false;
  const dHp = next.hp - prev.hp;
  unit.baseMaxHp = (unit.baseMaxHp ?? unit.maxHp) + dHp;
  unit.maxHp += unit.injured ? Math.round(dHp * 0.8) : dHp;
  unit.hp = Math.min(unit.maxHp, unit.hp + dHp);
  unit.damage = {
    min: unit.damage.min + (next.dmin - prev.dmin),
    max: unit.damage.max + (next.dmax - prev.dmax),
  };
  unit.speed += next.speed - prev.speed;
  unit.armor = Math.min(cls.growth.armorCap ?? 60, (unit.armor || 0) + (next.armor - prev.armor));
  unit.accuracy = Math.min(95, (unit.accuracy ?? 75) + (next.accuracy - prev.accuracy));
  if (next.supplies != null && next.supplies > prev.supplies) {
    unit.resourceMax = { ...(unit.resourceMax || {}), supplies: next.supplies + (unit.resourceBonus?.supplies || 0) };
    unit.resources.supplies = (unit.resources.supplies || 0) + (next.supplies - prev.supplies);
  }
  return true;
}

function nodeVisible(unit, node) {
  if (!node || typeof node !== 'object') return true;
  if (node.implemented === false) return false;
  if (node.branchId && node.branchId !== unit.branchId) return false;
  return true;
}

/** Узлы уровня, которые выдаются сами (навык ветки и т.п.). */
export function getAutoNodes(unit, level) {
  const cls = getClassDef(unit);
  const plan = cls?.levelPlan?.[String(level)] || [];
  return plan.filter(n => typeof n === 'object' && n.auto && nodeVisible(unit, n));
}

/** Выбор на следующем уровне (null, если выбирать нечего). */
export function getClassProgressionChoices(unit, level = null) {
  const cls = getClassDef(unit);
  if (!cls?.levelPlan) return null;
  const nextLevel = String(level ?? (unit.level || 1) + 1);
  const choices = cls.levelPlan[nextLevel];
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const list = choices
    .filter(c => !(typeof c === 'object' && c.auto))
    .filter(c => nodeVisible(unit, c))
    .map(choice => normalizeChoice(cls, choice))
    .filter(Boolean);
  return list.length ? list : null;
}

export function applyProgressionChoice(unit, choice) {
  if (!unit || !choice?.type) return false;

  if (choice.type === 'skill') {
    if (choice.skillId && !unit.skills.includes(choice.skillId)) {
      unit.skills.push(choice.skillId);
      eventBus.emit('log', `${unit.label || unit.name}: изучен навык «${choice.label}»`);
    }
    markChoice(unit, choice);
    return true;
  }

  if (choice.type === 'passive') {
    if (choice.passiveId && !unit.passives.includes(choice.passiveId)) {
      unit.passives.push(choice.passiveId);
      eventBus.emit('log', `${unit.label || unit.name}: открыто умение «${choice.label}»`);
    }
    markChoice(unit, choice);
    return true;
  }

  if (choice.type === 'branch') {
    unit.branchId = choice.branchId || choice.key;
    eventBus.emit('log', `${unit.label || unit.name}: выбран путь «${choice.label}»`);
    // Первый навык ветки приходит вместе с веткой
    const first = choice.firstNode;
    if (first?.skillId && !unit.skills.includes(first.skillId)) unit.skills.push(first.skillId);
    if (first?.passiveId && !unit.passives.includes(first.passiveId)) unit.passives.push(first.passiveId);
    markChoice(unit, choice);
    return true;
  }

  if (choice.type === 'perk') {
    applyPerk(unit, choice.effects || {});
    unit.classTags = unit.classTags || [];
    unit.classTags.push(choice.key);
    eventBus.emit('log', `${unit.label || unit.name}: ${choice.label}`);
    markChoice(unit, choice);
    return true;
  }

  if (choice.type === 'resource') {
    const resourceId = choice.resourceId;
    if (resourceId) {
      const current = unit.resources[resourceId] || 0;
      unit.resources[resourceId] = current + (choice.amount || 0);
      eventBus.emit('log', `${unit.label || unit.name}: ${choice.label}`);
    }
    markChoice(unit, choice);
    return true;
  }

  return false;
}

export function applyPerk(unit, e) {
  if (e.hp) {
    unit.maxHp += e.hp; unit.hp += e.hp;
    unit.baseMaxHp = (unit.baseMaxHp ?? unit.maxHp - e.hp) + e.hp;
  }
  if (e.dmg) unit.damage = { min: unit.damage.min + e.dmg, max: unit.damage.max + e.dmg };
  if (e.dmgMax) unit.damage = { ...unit.damage, max: unit.damage.max + e.dmgMax };
  if (e.armor) unit.armor = Math.min(getClassDef(unit)?.growth?.armorCap ?? 60, (unit.armor || 0) + e.armor);
  if (e.accuracy) unit.accuracy = Math.min(95, (unit.accuracy ?? 75) + e.accuracy);
  if (e.cdReduction) unit._cdReduction = (unit._cdReduction || 0) + e.cdReduction;
  if (e.regen) unit.regen = (unit.regen || 0) + e.regen;
  if (e.lifestealSet) unit.lifesteal = e.lifestealSet;
  if (e.healBonus) unit.healBonus = (unit.healBonus || 0) + e.healBonus;
  if (e.resourceMax) unit.resourceMax = { ...(unit.resourceMax || {}), ...e.resourceMax };
  if (e.resourceBase) {
    unit.resourceBonus = unit.resourceBonus || {};
    Object.entries(e.resourceBase).forEach(([k, v]) => {
      unit.resourceBonus[k] = (unit.resourceBonus[k] || 0) + v;
      unit.resources[k] = (unit.resources[k] || 0) + v;
      if (k === 'supplies') unit.resourceMax = { ...(unit.resourceMax || {}), supplies: (unit.resourceMax?.supplies ?? 3) + v };
    });
  }
  if (e.tag) {
    unit.classTags = unit.classTags || [];
    if (!unit.classTags.includes(e.tag)) unit.classTags.push(e.tag);
  }
}

function normalizeChoice(cls, choice) {
  if (!choice) return null;
  if (typeof choice === 'object') return choice;

  const branch = cls.branches?.find(b => b.id === choice);
  if (branch) {
    const first = branch.firstNode?.label ? ` Сразу: ${branch.firstNode.label}.` : '';
    return {
      key: branch.id,
      type: 'branch',
      branchId: branch.id,
      label: branch.name,
      desc: (branch.description || 'Выбрать классовую ветку') + first,
      firstNode: branch.firstNode || null,
    };
  }

  return null;
}

function markChoice(unit, choice) {
  unit.classChoices = unit.classChoices || {};
  const levelKey = String(unit.level);
  unit.classChoices[levelKey] = choice.key || choice.skillId || choice.passiveId || choice.branchId;
}
