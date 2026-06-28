import commanderTraits from '../data/commanderTraits.json';
import eventBus from '../utils/eventBus.js';

export function getCommanderTraitChoices(unit) {
  if (!unit?.isCommander) return null;
  const nextLevel = (unit.level || 1) + 1;
  if (nextLevel !== 2) return null;

  const learned = new Set(unit.commanderTraits || []);
  const choices = commanderTraits
    .filter(trait => trait.unlockLevel === nextLevel && !learned.has(trait.id))
    .map(trait => ({
      key: trait.id,
      type: 'commanderTrait',
      label: trait.name,
      desc: trait.desc,
      traitId: trait.id,
      effects: trait.effects || [],
      tags: trait.tags || [],
    }));

  return choices.length ? choices : null;
}

export function applyCommanderTraitChoice(unit, choice, registry) {
  if (!unit?.isCommander || choice?.type !== 'commanderTrait') return false;

  unit.commanderTraits = unit.commanderTraits || [];
  unit.commanderTags = unit.commanderTags || [];
  unit.commanderChoices = unit.commanderChoices || {};

  if (!unit.commanderTraits.includes(choice.traitId)) {
    unit.commanderTraits.push(choice.traitId);
  }

  (choice.effects || []).forEach(effect => applyEffect(unit, effect, registry));

  const levelKey = String(unit.level);
  unit.commanderChoices[levelKey] = choice.traitId;
  eventBus.emit('log', `${unit.name}: черта "${choice.label}"`);
  return true;
}

function applyEffect(unit, effect, registry) {
  if (!effect?.type) return;

  if (effect.type === 'registryFlag' && effect.key) {
    registry?.set(effect.key, effect.value ?? true);
    return;
  }

  if (effect.type === 'damage') {
    const dmg = unit.damage || { min: 0, max: 0 };
    unit.damage = {
      min: dmg.min + (effect.min || 0),
      max: dmg.max + (effect.max || 0),
    };
    return;
  }

  if (effect.type === 'resource' && effect.resourceId) {
    unit.resources = unit.resources || {};
    unit.resources[effect.resourceId] = (unit.resources[effect.resourceId] || 0) + (effect.amount || 0);
    return;
  }

  if (effect.type === 'tag' && effect.tag && !unit.commanderTags.includes(effect.tag)) {
    unit.commanderTags.push(effect.tag);
  }
}
