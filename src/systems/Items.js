/**
 * Свойства предметов главы 1 в бою (06_КВЕСТЫ 8: каждый даёт одно понятное свойство).
 * Предметы лежат в registry.items (WorldState). Бонусы временные, на один бой, не сохраняются.
 */
export function applyItemBonuses(units, registry) {
  const items = registry?.get('items') || {};
  const hero = units.find(u => u.id === 'hero_duelist');
  if (!hero) return;
  if (items.post_pistol) hero.resources.pistol_charges = (hero.resources.pistol_charges || 0) + 1;
  if (items.rune_hide) hero.itemArmor = 4;
  if (items.reader_chain) hero.immuneWeakened = true;
}
