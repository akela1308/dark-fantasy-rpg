import { REP_NAMES } from './WorldState.js';

/**
 * Условия и эффекты вариантов диалога (11_ПРОМПТ, блок Г; 06_КВЕСТЫ 2).
 * Проверки детерминированные: вариант либо доступен, либо серый с подписью, чего не хватает.
 *
 * requires / showIf: {
 *   flag, notFlag (строка или массив), rep_law, rep_fear, rep_word (минимум), level, gold,
 *   trait, companion (в партии), notCompanion, recruited (в отряде или запасе), item,
 *   any: [условия...] (хватит одного), all: [условия...]
 * }
 */

const arr = v => (v == null ? [] : Array.isArray(v) ? v : [v]);

const COMPANION_NAMES = {
  companion_brawler: 'Ворнаг', companion_healer: 'Тая', holt: 'Хольт', tiss_recruit: 'Тисс',
  mirko: 'Мирко', bran: 'Бран', ressa: 'Ресса',
};
const TRAIT_NAMES = {
  commander: 'Командование', own_road: 'Своя дорога', second_strike: 'Второй выпад',
  shooting_knack: 'Стрелковая сноровка', secret_literacy: 'Тайная грамота', first_signs: 'Первые знаки',
};

/** Проверить одно условие. Возвращает { ok, reason }. */
export function checkRequires(req, ws) {
  if (!req) return { ok: true, reason: null };
  const fails = [];
  if (req.any) {
    const parts = req.any.map(r => checkRequires(r, ws));
    if (!parts.some(p => p.ok)) fails.push(parts.map(p => p.reason).filter(Boolean).join(' или ') || null);
  }
  if (req.all) req.all.forEach(r => { const c = checkRequires(r, ws); if (!c.ok) fails.push(c.reason); });
  arr(req.flag).forEach(f => { if (!ws.flag(f)) fails.push(null); });
  arr(req.notFlag).forEach(f => { if (ws.flag(f)) fails.push(null); });
  for (const kind of ['law', 'fear', 'word']) {
    const need = req[`rep_${kind}`];
    if (need != null && ws.rep(kind) < need) fails.push(`${REP_NAMES[kind]} ${need}`);
  }
  if (req.level != null && ws.level() < req.level) fails.push(`уровень ${req.level}`);
  if (req.gold != null && ws.gold() < req.gold) fails.push(`${req.gold} монет`);
  if (req.goldBelow != null && ws.gold() >= req.goldBelow) fails.push(null);
  if (req.levelBelow != null && ws.level() >= req.levelBelow) fails.push(null);
  arr(req.trait).forEach(t => { if (!ws.hasTrait(t)) fails.push(`черта «${TRAIT_NAMES[t] || t}»`); });
  arr(req.companion).forEach(c => { if (!ws.party().includes(c)) fails.push(`${COMPANION_NAMES[c] || c} в отряде`); });
  arr(req.notCompanion).forEach(c => { if (ws.party().includes(c)) fails.push(null); });
  arr(req.recruited).forEach(c => { if (!ws.roster().includes(c)) fails.push(null); });
  arr(req.notRecruited).forEach(c => { if (ws.roster().includes(c)) fails.push(null); });
  arr(req.item).forEach(i => { if (!ws.hasItem(i)) fails.push(`нужен предмет`); });
  if (req.partyFree && ws.party().length >= (ws.registry.get('partySlots') || 1)) fails.push('нет места в отряде');
  if (!fails.length) return { ok: true, reason: null };
  const named = fails.filter(Boolean);
  return { ok: false, reason: named.length ? `нужно: ${named.join(', ')}` : null };
}

/**
 * Применить эффекты варианта или узла. hooks: { giveXp(n), recruit(id), dismiss(id), refresh() }.
 * Бой, переходы и next обрабатывает DialogueRunner.
 */
export function applyEffects(e, ws, hooks = {}) {
  if (!e) return;
  arr(e.setFlag).forEach(f => ws.setFlag(f, true));
  arr(e.clearFlag).forEach(f => ws.clearFlag(f));
  if (e.rep) {
    Object.entries(e.rep).forEach(([k, v]) => ws.addRep(k, v));
  }
  if (e.cost) ws.addGold(-Math.abs(e.cost));
  if (e.giveGold) ws.addGold(e.giveGold);
  if (e.giveItem) arr(e.giveItem).forEach(i => ws.giveItem(typeof i === 'string' ? i : i.id, i.n || 1));
  if (e.takeItem) arr(e.takeItem).forEach(i => ws.takeItem(typeof i === 'string' ? i : i.id, i.n || 1));
  if (e.counter) arr(e.counter).forEach(c => { const v = ws.inc(c); ws.setFlag(`cnt_${c}_${v}`, true); });
  if (e.recruit) arr(e.recruit).forEach(id => hooks.recruit?.(id));
  if (e.dismiss) arr(e.dismiss).forEach(id => hooks.dismiss?.(id));
  if (e.giveXp) hooks.giveXp?.(e.giveXp);
  if (e.rest) hooks.rest?.(e.rest);
  if (e.dismissForever) arr(e.dismissForever).forEach(id => hooks.dismissForever?.(id));
  if (e.loseTrait) hooks.loseTrait?.();
  if (e.chapterEnd) hooks.chapterEnd?.();
  hooks.refresh?.();
}

/** Подпись условия для кнопки: своя (reason) важнее собранной. */
export function lockReason(choice, check) {
  return choice.reason || check.reason || 'пока недоступно';
}
