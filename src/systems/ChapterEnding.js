export const CHAPTER_END_PENDING = 'chapterEndPending';

const RETURN_TO_COURTYARD = { fromMapKey: 'tavern_map', fromSpawnId: 'tavern_exit' };

export function chapterEndingRoute(registry, savedMapKey) {
  const stage = registry.get(CHAPTER_END_PENDING);
  if (stage === 'cinema') {
    return {
      key: 'CinemaScene',
      data: {
        id: registry.get('seal_worn') ? 'end_seal' : 'end_road',
        next: 'ChapterEndScene',
        nextData: RETURN_TO_COURTYARD,
      },
    };
  }

  // Старое сохранение с решённой дверью могло остаться в подвале между роликом и выходом.
  const legacyPending = savedMapKey === 'tavern_cellar' && !registry.get('chapter1_done')
    && (registry.get('basement_cleared') || registry.get('basement_left_closed'));
  if (stage === 'summary' || legacyPending) {
    return { key: 'ChapterEndScene', data: RETURN_TO_COURTYARD };
  }
  return null;
}
