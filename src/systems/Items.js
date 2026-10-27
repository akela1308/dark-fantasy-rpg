import { applyStat } from './Economy.js';

/**
 * Свойства предметов главы 1 в бою (06_КВЕСТЫ 8: каждый даёт одно понятное свойство).
 * Предметы лежат в registry.items (WorldState). Бонусы временные, на один бой, не сохраняются.
 *
 * Плюс (МИР_РАСШИРЕНИЕ_v1.0):
 *  - next_battle_buffs: выпитое на карте перед боем (эффекты с длительностью, иммунитет, заряд, инициатива), тратится этим боем;
 *  - book_skills: навыки из прочитанных книг (добавляются, если их ещё нет);
 *  - book_stats_pending: прибавки из книг тем, кто пришёл в отряд после чтения (один раз, дальше живут в сохранении).
 */
export function applyItemBonuses(units, registry) {
  const items = registry?.get('items') || {};
  const hero = units.find(u => u.id === 'hero_duelist');
  if (hero) {
    if (items.post_pistol) hero.resources.pistol_charges = (hero.resources.pistol_charges || 0) + 1;
    if (items.rune_hide) hero.itemArmor = 4;
    if (items.reader_chain) hero.immuneWeakened = true;
  }
  if (!registry) return;

  const skills = registry.get('book_skills') || {};
  units.forEach(u => (skills[u.id] || []).forEach(s => { if (!u.skills.includes(s)) u.skills.push(s); }));

  const pending = { ...(registry.get('book_stats_pending') || {}) };
  let pendingChanged = false;
  units.forEach(u => {
    if (!pending[u.id]) return;
    pending[u.id].forEach(st => applyStat(u, st));
    delete pending[u.id];
    pendingChanged = true;
  });
  if (pendingChanged) registry.set('book_stats_pending', pending);

  const buffs = registry.get('next_battle_buffs') || [];
  if (!buffs.length) return;
  buffs.forEach(b => {
    const targets = b.target === 'party' ? units
      : b.target === 'hero' ? units.filter(u => u.id === 'hero_duelist')
      : units.filter(u => u.id === b.unit);
    targets.forEach(u => {
      if (b.type) u.addEffect?.({ type: b.type, value: b.value, duration: b.duration ?? 2, label: b.item });
      if (b.immuneWeakened) u.immuneWeakened = true;
      if (b.pistol) u.resources.pistol_charges = (u.resources.pistol_charges || 0) + b.pistol;
      if (b.initiative) u._initiativeBonus = (u._initiativeBonus || 0) + b.initiative;
    });
  });
  registry.set('next_battle_buffs', []);
}
