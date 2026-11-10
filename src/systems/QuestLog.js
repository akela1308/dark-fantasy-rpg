import quests from '../data/quests.json';
import { checkRequires } from './DialogueConditions.js';

/**
 * Журнал квестов главы 1 (06_КВЕСТЫ). Квест открыт, если выполнено startIf,
 * завершён по doneIf. Текущий этап: первый, чьё doneIf ещё не выполнено.
 * Состояние не хранится отдельно: всё читается из флагов WorldState.
 */
export function questStatus(q, ws) {
  if (q.doneIf && checkRequires(q.doneIf, ws).ok) return 'done';
  if (!q.startIf || checkRequires(q.startIf, ws).ok) {
    // квест без условия старта показывается, когда пройден хотя бы один этап или есть явный старт
    if (!q.startIf && !q.stages.some(s => checkRequires(s.doneIf, ws).ok)) return 'hidden';
    return 'active';
  }
  return 'hidden';
}

export function currentStage(q, ws) {
  return q.stages.find(s => !checkRequires(s.doneIf, ws).ok) || null;
}

export function journal(ws) {
  return quests.map(q => ({ quest: q, status: questStatus(q, ws), stage: currentStage(q, ws) }))
    .filter(e => e.status !== 'hidden');
}

export function outcomesSeen(q, ws) {
  return (q.outcomes || []).filter(o => ws.flag(o.flag)).map(o => o.text);
}

/**
 * Предметы-награды закрытых квестов, которые ещё не выданы. Выдаёт журнал только то, что помечено
 * reward.grantItem (остальное приходит из диалогов). itemIf: исход, при котором предмет вообще достаётся.
 */
export function unclaimedItemRewards(ws) {
  return quests.filter(q => q.reward?.grantItem && q.reward.item
    && questStatus(q, ws) === 'done' && !ws.flag(`quest_item_${q.id}`));
}

export function rewardItemEarned(q, ws) {
  return !q.reward?.itemIf || checkRequires(q.reward.itemIf, ws).ok;
}
