import commanderTraits from '../data/commanderTraits.json';
import eventBus from '../utils/eventBus.js';
import { PartySystem, MAX_SLOTS } from './PartySystem.js';

/**
 * Черты Героя на уровнях 2, 5, 8 (02_ДИЗАЙН 5). Командование и Своя дорога
 * берутся повторно, Первые знаки дважды (второй раз Слово Печати), остальные по разу.
 */
export const TRAIT_LEVELS = [2, 5, 8];

export function traitRanks(unit, traitId) {
  return (unit.commanderTraits || []).filter(t => t === traitId).length;
}

export function getCommanderTraitChoices(unit, level = null, registry = null) {
  if (!unit?.isCommander) return null;
  const lvl = level ?? (unit.level || 1) + 1;
  if (!TRAIT_LEVELS.includes(lvl)) return null;

  const choices = commanderTraits
    .filter(trait => (trait.levels || [trait.unlockLevel]).includes(lvl))
    .filter(trait => {
      const ranks = traitRanks(unit, trait.id);
      if (!trait.repeatable) return ranks === 0;
      if (trait.maxRanks && ranks >= trait.maxRanks) return false;
      if (trait.id === 'commander' && registry && PartySystem.getSlots(registry) >= MAX_SLOTS) return false;
      return true;
    })
    .map(trait => {
      const ranks = traitRanks(unit, trait.id);
      return {
        key: trait.id,
        type: 'commanderTrait',
        label: ranks ? `${trait.name} (ранг ${ranks + 1})` : trait.name,
        desc: trait.desc,
        traitId: trait.id,
        effects: trait.effects || [],
        tags: trait.tags || [],
      };
    });

  return choices.length ? choices : null;
}

export function applyCommanderTraitChoice(unit, choice, registry) {
  if (!unit?.isCommander || choice?.type !== 'commanderTrait') return false;

  unit.commanderTraits = unit.commanderTraits || [];
  unit.commanderTags = unit.commanderTags || [];
  unit.commanderChoices = unit.commanderChoices || {};

  unit.commanderTraits.push(choice.traitId);
  registry?.set(`trait_${choice.traitId}`, true);   // для проверок в диалогах
  const rank = traitRanks(unit, choice.traitId);

  (choice.effects || []).forEach(effect => applyEffect(unit, effect, registry, rank));

  const levelKey = String(unit.level);
  unit.commanderChoices[levelKey] = choice.traitId;
  eventBus.emit('log', `${unit.name}: черта "${choice.label}"`);
  return true;
}

function applyEffect(unit, effect, registry, rank) {
  if (!effect?.type) return;

  if (effect.type === 'registryFlag' && effect.key) {
    registry?.set(effect.key, effect.value ?? true);
    return;
  }

  if (effect.type === 'partySlot' && registry) {
    PartySystem.addSlot(registry);
    return;
  }

  if (effect.type === 'scaleHero') {
    const k = 1 + (effect.hp || 0);
    const kd = 1 + (effect.damage || 0);
    const base = unit.baseMaxHp ?? unit.maxHp;
    unit.baseMaxHp = Math.round(base * k);
    unit.maxHp = Math.round(unit.maxHp * k);
    unit.hp = Math.min(unit.maxHp, Math.round(unit.hp * k));
    unit.damage = { min: Math.round(unit.damage.min * kd), max: Math.round(unit.damage.max * kd) };
    return;
  }

  if (effect.type === 'damage') {
    const dmg = unit.damage || { min: 0, max: 0 };
    unit.damage = { min: dmg.min + (effect.min || 0), max: dmg.max + (effect.max || 0) };
    return;
  }

  if (effect.type === 'resourceBonus' && effect.resourceId) {
    unit.resourceBonus = unit.resourceBonus || {};
    unit.resourceBonus[effect.resourceId] = (unit.resourceBonus[effect.resourceId] || 0) + (effect.amount || 0);
    unit.resources[effect.resourceId] = (unit.resources[effect.resourceId] || 0) + (effect.amount || 0);
    return;
  }

  if (effect.type === 'resource' && effect.resourceId) {
    unit.resources = unit.resources || {};
    unit.resources[effect.resourceId] = (unit.resources[effect.resourceId] || 0) + (effect.amount || 0);
    return;
  }

  if (effect.type === 'skillByRank') {
    const skill = effect.skills?.[Math.min(rank, effect.skills.length) - 1];
    if (skill && !unit.skills.includes(skill)) unit.skills.push(skill);
    return;
  }

  if (effect.type === 'tag' && effect.tag && !unit.commanderTags.includes(effect.tag)) {
    unit.commanderTags.push(effect.tag);
  }
}
