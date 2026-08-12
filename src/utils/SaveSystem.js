// ─────────────────────────────────────────────────────────────────────────────
//  ЖЕЛЕЗНЫЙ РЕЖИМ — одно сохранение, смерть = начало заново
// ─────────────────────────────────────────────────────────────────────────────

const SAVE_KEY = 'darkfantasy_ironman_v1';

// Все флаги реестра, которые нужно сохранять
const REGISTRY_FLAGS = [
  'bandit_0_defeated',
  'commander_unlocked',
  'drunkman_talked',
  'book_road_houses_collected',
  'book_road_houses_read',
  'book_lame_stag_song_collected',
  'book_lame_stag_song_read',
  'book_forgotten_seals_collected',
  'book_forgotten_seals_read',
  'book_korvin_tolls_collected',
  'book_korvin_tolls_read',
  'book_lowland_herbal_collected',
  'book_lowland_herbal_read',
  'inspect_map1_road_satchel_collected',
];

export const SaveSystem = {

  // Полное сохранение после боя
  save(playerUnits, mapKey, spawnId, registry) {
    try {
      const state = {
        schemaVersion: 2,
        units: playerUnits.map(u => ({
          id:        u.id,
          classId:   u.classId,
          originId:  u.originId,
          branchId:  u.branchId,
          isCommander: u.isCommander,
          commanderTraits: [...(u.commanderTraits || [])],
          commanderTags: [...(u.commanderTags || [])],
          commanderChoices: { ...(u.commanderChoices || {}) },
          hp:        u.hp,
          maxHp:     u.maxHp,
          damage:    { ...u.damage },
          armor:     u.armor,
          xp:        u.xp,
          level:     u.level,
          skills:    [...(u.skills || [])],
          passives:  [...(u.passives || [])],
          classTags: [...(u.classTags || [])],
          classChoices: { ...(u.classChoices || {}) },
          resources: { ...u.resources },
          _cdReduction: u._cdReduction || 0,
        })),
        mapKey,
        spawnId,
        gold:  registry.get('playerGold') ?? 0,
        flags: Object.fromEntries(
          REGISTRY_FLAGS
            .filter(k => registry.get(k))
            .map(k => [k, registry.get(k)])
        ),
        savedAt: Date.now(),
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      console.warn('[SaveSystem] Не удалось сохранить:', e);
      return false;
    }
  },

  // Обновить только позицию на карте (без перезаписи юнитов)
  updatePosition(mapKey, spawnId) {
    try {
      const save = this.load();
      if (!save) return;
      save.mapKey  = mapKey;
      save.spawnId = spawnId;
      localStorage.setItem(SAVE_KEY, JSON.stringify(save));
    } catch (e) {
      console.warn('[SaveSystem] Не удалось обновить позицию:', e);
    }
  },

  // Загрузить сохранение (null если нет)
  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      console.warn('[SaveSystem] Не удалось загрузить:', e);
      return null;
    }
  },

  // Удалить сохранение (при смерти — всё начинается заново)
  deleteSave() {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch (e) {
      console.warn('[SaveSystem] Не удалось удалить:', e);
    }
  },

  hasSave() {
    try {
      return localStorage.getItem(SAVE_KEY) !== null;
    } catch (e) {
      return false;
    }
  },

  // Восстановить флаги реестра из сохранения
  applyFlagsToRegistry(registry) {
    const save = this.load();
    if (!save) {
      registry.set('playerGold', 7); // стартовое золото для новой игры
      return;
    }
    registry.set('playerGold', save.gold ?? 7);
    Object.entries(save.flags || {}).forEach(([k, v]) => registry.set(k, v));
  },

  // Добавить золото и сохранить
  addGold(amount, registry) {
    const current = registry.get('playerGold') ?? 0;
    registry.set('playerGold', current + amount);
    // Обновляем gold в текущем сохранении не перезаписывая остальное
    try {
      const save = this.load();
      if (save) {
        save.gold = current + amount;
        localStorage.setItem('darkfantasy_ironman_v1', JSON.stringify(save));
      }
    } catch (e) {}
  },

  getGold(registry) {
    return registry.get('playerGold') ?? 0;
  },

  // Выставить флаг и обновить его в текущем сохранении, если оно уже есть
  setFlag(key, value, registry) {
    registry.set(key, value);
    if (!REGISTRY_FLAGS.includes(key)) return;
    try {
      const save = this.load();
      if (save) {
        save.flags = save.flags || {};
        if (value) save.flags[key] = value;
        else delete save.flags[key];
        localStorage.setItem(SAVE_KEY, JSON.stringify(save));
      }
    } catch (e) {}
  },

  // Применить сохранённые статы к массиву PlayerUnit
  applyToUnits(playerUnits) {
    const save = this.load();
    if (!save) return;
    playerUnits.forEach(u => {
      const s = save.units.find(sv => sv.id === u.id);
      if (!s) return;
      u.hp        = s.hp;
      u.maxHp     = s.maxHp;
      u.damage    = { ...s.damage };
      u.armor     = s.armor;
      u.xp        = s.xp;
      u.level     = s.level;
      u.classId   = s.classId ?? u.classId;
      u.originId  = s.originId ?? u.originId;
      u.branchId  = s.branchId ?? u.branchId;
      u.isCommander = s.isCommander ?? u.isCommander;
      u.commanderTraits = Array.isArray(s.commanderTraits) ? [...s.commanderTraits] : u.commanderTraits;
      u.commanderTags = Array.isArray(s.commanderTags) ? [...s.commanderTags] : u.commanderTags;
      u.commanderChoices = s.commanderChoices ? { ...s.commanderChoices } : u.commanderChoices;
      u.skills    = Array.isArray(s.skills) ? [...s.skills] : u.skills;
      u.passives  = Array.isArray(s.passives) ? [...s.passives] : u.passives;
      u.classTags = Array.isArray(s.classTags) ? [...s.classTags] : u.classTags;
      u.classChoices = s.classChoices ? { ...s.classChoices } : u.classChoices;
      u.resources = { ...u.resources, ...s.resources };
      u._cdReduction = s._cdReduction ?? u._cdReduction ?? 0;
    });
  },
};
