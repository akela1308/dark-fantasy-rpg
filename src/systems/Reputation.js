import { REP_KEYS, REP_NAMES, REP_MAX } from './WorldState.js';

/**
 * Репутация: три шкалы 0..5 (03_ДИАЛОГИ 2, 02_ДИЗАЙН 6). Не добро и зло, а то, как о вас говорят.
 * Слова для листа персонажа.
 */
const WORDS = {
  law:  ['никто', 'приезжий', 'с бумагой', 'по уставу', 'судья', 'закон дороги'],
  fear: ['незаметный', 'чужак', 'опасный', 'страшный', 'гроза', 'смерть на дороге'],
  word: ['пустой', 'новый', 'держит слово', 'надёжный', 'поручитель', 'слово твёрже печати'],
};

export function repWord(kind, value) {
  const list = WORDS[kind] || [];
  return list[Math.max(0, Math.min(REP_MAX, value))] || '';
}

/** Строки для листа персонажа: «Закон 2: с бумагой». */
export function repLines(registry) {
  return Object.keys(REP_KEYS).map(kind => {
    const v = registry.get(REP_KEYS[kind]) || 0;
    return `${REP_NAMES[kind]} ${v}: ${repWord(kind, v)}`;
  });
}

/** Доминирующая шкала (для концовок). */
export function dominantRep(registry) {
  const entries = Object.keys(REP_KEYS).map(k => [k, registry.get(REP_KEYS[k]) || 0]);
  entries.sort((a, b) => b[1] - a[1]);
  return entries[0][1] > 0 ? entries[0][0] : null;
}
