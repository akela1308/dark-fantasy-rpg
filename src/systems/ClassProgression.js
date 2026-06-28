import classesData from '../data/classes.json';
import eventBus from '../utils/eventBus.js';

export function getClassDef(unit) {
  if (!unit) return null;
  return classesData.find(cls => cls.id === unit.classId || cls.unitId === unit.id) || null;
}

export function getClassProgressionChoices(unit) {
  const cls = getClassDef(unit);
  if (!cls?.levelPlan) return null;

  const nextLevel = String((unit.level || 1) + 1);
  const choices = cls.levelPlan[nextLevel];
  if (!Array.isArray(choices) || choices.length === 0) return null;

  return choices
    .map(choice => normalizeChoice(cls, choice))
    .filter(Boolean);
}

export function applyProgressionChoice(unit, choice) {
  if (!unit || !choice?.type) return false;

  if (choice.type === 'skill') {
    if (choice.skillId && !unit.skills.includes(choice.skillId)) {
      unit.skills.push(choice.skillId);
      eventBus.emit('log', `${unit.name}: изучен навык "${choice.label}"`);
    }
    markChoice(unit, choice);
    return true;
  }

  if (choice.type === 'passive') {
    if (choice.passiveId && !unit.passives.includes(choice.passiveId)) {
      unit.passives.push(choice.passiveId);
      eventBus.emit('log', `${unit.name}: открыта пассивка "${choice.label}"`);
    }
    markChoice(unit, choice);
    return true;
  }

  if (choice.type === 'branch') {
    unit.branchId = choice.branchId || choice.key;
    eventBus.emit('log', `${unit.name}: выбран путь "${choice.label}"`);
    markChoice(unit, choice);
    return true;
  }

  if (choice.type === 'resource') {
    const resourceId = choice.resourceId;
    if (resourceId) {
      const current = unit.resources[resourceId] || 0;
      unit.resources[resourceId] = current + (choice.amount || 0);
      eventBus.emit('log', `${unit.name}: ${choice.label}`);
    }
    markChoice(unit, choice);
    return true;
  }

  return false;
}

function normalizeChoice(cls, choice) {
  if (!choice) return null;
  if (typeof choice === 'object') return choice;

  const branch = cls.branches?.find(b => b.id === choice);
  if (branch) {
    return {
      key: branch.id,
      type: 'branch',
      branchId: branch.id,
      label: branch.name,
      desc: branch.description || 'Выбрать классовую ветку',
    };
  }

  return null;
}

function markChoice(unit, choice) {
  unit.classChoices = unit.classChoices || {};
  const levelKey = String(unit.level);
  unit.classChoices[levelKey] = choice.key || choice.skillId || choice.passiveId || choice.branchId;
}
