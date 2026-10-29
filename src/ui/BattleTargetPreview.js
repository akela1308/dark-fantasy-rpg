import UI from '../data/ui.json';
import { effectiveArmor, meleeReach, RULES } from '../systems/CombatRules.js';
import { statusSummary } from './BattleReadout.js';

/** Read-only description of the selected action. Never rolls damage or spends resources. */
export function targetPreview(scene, target) {
  const t = UI.targetPreview, actor = scene.turnManager.active;
  const skill = scene._pendingSkill ? scene.skillSystem.get(scene._pendingSkill) : null;
  const body = [`${t.hp}: ${target.hp}/${target.maxHp}`, `${t.armor}: ${effectiveArmor(target)}% · ${target.position?.row === 1 ? t.back : t.front}`];
  const status = statusSummary(target);
  if (status) body.push(status);
  let reason = '';
  if (!scene.turnManager.isPlayerTurn() || scene._animLock) reason = t.wait;
  else if (skill?.targetType === 'self' && target !== actor) reason = t.self;
  else if ((skill?.targetType || 'enemy_single') === 'enemy_single' && target.type === actor.type) reason = t.enemy;
  else if (skill?.targetType === 'ally_single' && target.type !== actor.type) reason = t.ally;
  else if (target.type !== actor.type) {
    const reach = meleeReach({ ...actor, ignoreRows: actor.ignoreRows || skill?.ignoreRows }, target, scene.enemyUnits);
    if (!reach.ok) reason = t.blocked;
    else if (reach.flank) body.push(t.flank);
  }
  if (!reason && skill) reason = scene.skillSystem.unavailableReason(skill.id, actor) || '';
  if (!reason && skill?.healAmount && (!skill.effect || skill.effect === 'cleanse_heal')) {
    const amount = Math.max(0, Math.min(target.maxHp - target.hp, scene.skillSystem.healPower(skill, actor)));
    body.push(amount ? `${t.heal}: ${amount} HP (${target.hp} → ${target.hp + amount})` : t.full);
  }
  if (target.type !== actor?.type) {
    for (const e of target.effects || []) {
      if (e.type === 'marked') body.push(`${t.marked}${e.value ?? RULES.MARKED_DEFAULT}`);
      if (e.type === 'defending') body.push(t.defending);
      if (e.type === 'dodge_boost') body.push(`${t.dodge}: ${Math.round(e.value * 100)}%`);
      if (e.type === 'covered_by' && e.coveredBy?.isAlive) body.push(`${t.covered}: ${e.coveredBy.label}`);
    }
  }
  return { title: target.label || target.name, body: body.join('\n'), action: reason || `${skill?.name || t.attack}\n${t.ready}` };
}
