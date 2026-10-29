import { PartySystem } from './PartySystem.js';
import { SaveSystem } from '../utils/SaveSystem.js';

/** Saved party XP may be ahead of units when the page closes during level choices. */
export function pendingProgression(registry) {
  const roster = PartySystem.buildRosterUnits(registry);
  const toLevel = PartySystem.getLevel(registry);
  const pending = roster.filter(unit => (unit.level || 1) < toLevel);
  return { roster, pending, toLevel };
}

/** Keep map input and encounters stopped until all level choices are committed. */
export function openMapProgression(scene, roster, toLevel, onComplete) {
  if (scene._progressionPending || scene.scene.isActive('LevelUpScene')) return false;
  scene._progressionPending = true;
  scene.hero.stopMove();
  scene.input.enabled = false;
  // Store earned XP before opening choices, but keep the last fully completed unit state.
  SaveSystem.saveWorld(scene.game.registry, scene.mapKey, scene.spawnId);
  const cleanup = () => scene.events.off('levelup_done', done);
  const done = () => {
    scene.events.off('shutdown', cleanup);
    scene._progressionPending = false;
    scene.input.enabled = true;
    scene._applyPartyVisibility(true);
    onComplete?.();
  };
  scene.events.once('levelup_done', done);
  scene.events.once('shutdown', cleanup);
  scene.scene.launch('LevelUpScene', {
    leveledUnits: roster, allPlayerUnits: roster, toLevel,
    fromMapKey: scene.mapKey, fromSpawnId: scene.spawnId,
  });
  return true;
}

export function recoverMapProgression(scene, onComplete) {
  const { roster, pending, toLevel } = pendingProgression(scene.game.registry);
  return pending.length ? openMapProgression(scene, roster, toLevel, onComplete) : false;
}
