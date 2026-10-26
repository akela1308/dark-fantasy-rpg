// ─────────────────────────────────────────────────────────────────────────────
//  Сохранение (schemaVersion 3). Одно сохранение в localStorage.
//  Сохраняется всё состояние мира из registry без белых списков (флаги, репутация,
//  партия, опыт, золото, режим), плюс статы юнитов. Режим Хроника: поражение
//  возвращает к последнему отдыху. Режим Железо: поражение стирает сохранение.
// ─────────────────────────────────────────────────────────────────────────────

const SAVE_KEY = 'darkfantasy_ironman_v1';
const REST_KEY = 'darkfantasy_rest_v3';   // снимок на последнем отдыхе (Хроника)
export const START_GOLD = 12;
export const START_MAP = 'south_post';
export const START_SPAWN = 'default';

// Ключи registry, которые не сохраняются (звук, служебное)
const TRANSIENT = new Set(['bgMusic', 'musicStarted', 'bgMusicIndex', '_sessionLoaded']);

function isPlain(v) {
  if (v === null) return true;
  const t = typeof v;
  if (t === 'string' || t === 'number' || t === 'boolean') return true;
  if (Array.isArray(v)) return v.every(isPlain);
  if (t === 'object' && Object.getPrototypeOf(v) === Object.prototype) return Object.values(v).every(isPlain);
  return false;
}

function registryEntries(registry) {
  const list = registry?.list || registry?.values || {};
  return Object.entries(list);
}

function serializeUnit(u) {
  return {
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
    baseMaxHp: u.baseMaxHp ?? u.maxHp,
    damage:    { ...u.damage },
    speed:     u.speed,
    armor:     u.armor,
    accuracy:  u.accuracy,
    lifesteal: u.lifesteal,
    regen:     u.regen,
    xp:        u.xp,
    level:     u.level,
    injured:   !!u.injured,
    skills:    [...(u.skills || [])],
    passives:  [...(u.passives || [])],
    classTags: [...(u.classTags || [])],
    classChoices: { ...(u.classChoices || {}) },
    resources: { ...u.resources },
    resourceMax: { ...(u.resourceMax || {}) },
    resourceBonus: { ...(u.resourceBonus || {}) },
    healBonus: u.healBonus || 0,
    _cdReduction: u._cdReduction || 0,
  };
}

function write(key, obj) {
  localStorage.setItem(key, JSON.stringify(obj));
}

export const SaveSystem = {

  // Полное сохранение: юниты (сливаются с уже сохранёнными по id) + всё состояние мира
  save(playerUnits, mapKey, spawnId, registry) {
    try {
      const prev = this.load();
      const units = [...(prev?.units || [])];
      (playerUnits || []).forEach(u => {
        const s = serializeUnit(u);
        const i = units.findIndex(x => x.id === u.id);
        if (i >= 0) units[i] = s; else units.push(s);
      });
      const world = {};
      registryEntries(registry).forEach(([k, v]) => {
        if (!TRANSIENT.has(k) && isPlain(v)) world[k] = v;
      });
      const state = {
        schemaVersion: 3,
        units,
        mapKey: mapKey ?? prev?.mapKey ?? START_MAP,
        spawnId: spawnId ?? prev?.spawnId ?? START_SPAWN,
        gold: registry?.get('playerGold') ?? 0,
        mode: registry?.get('gameMode') || 'chronicle',
        world,
        savedAt: Date.now(),
      };
      write(SAVE_KEY, state);
      return true;
    } catch (e) {
      console.warn('[SaveSystem] Не удалось сохранить:', e);
      return false;
    }
  },

  // Сохранить только мир (флаги, золото, партию), юниты не трогать
  saveWorld(registry, mapKey, spawnId) {
    return this.save([], mapKey, spawnId, registry);
  },

  // Обновить только позицию на карте (без перезаписи юнитов)
  updatePosition(mapKey, spawnId) {
    try {
      const save = this.load();
      if (!save) return;
      save.mapKey  = mapKey;
      save.spawnId = spawnId;
      write(SAVE_KEY, save);
    } catch (e) {
      console.warn('[SaveSystem] Не удалось обновить позицию:', e);
    }
  },

  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      console.warn('[SaveSystem] Не удалось загрузить:', e);
      return null;
    }
  },

  deleteSave() {
    try {
      localStorage.removeItem(SAVE_KEY);
      localStorage.removeItem(REST_KEY);
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

  // ── Отдых (Хроника): снимок, к которому возвращает поражение ──────────────
  saveRestPoint() {
    try {
      const save = this.load();
      if (save) write(REST_KEY, save);
    } catch (e) {}
  },

  loadRestPoint() {
    try {
      const raw = localStorage.getItem(REST_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  },

  /** Поражение в Хронике: откат к последнему отдыху (или к началу, если отдыха не было). */
  restoreRestPoint() {
    const rest = this.loadRestPoint();
    try {
      if (rest) write(SAVE_KEY, rest);
      else localStorage.removeItem(SAVE_KEY);
    } catch (e) {}
    return rest;
  },

  // ── Состояние мира в registry ─────────────────────────────────────────────

  /** Чистое состояние новой игры. */
  newGame(registry, { mode = 'chronicle' } = {}) {
    this.deleteSave();
    registryEntries(registry).forEach(([k]) => { if (!TRANSIENT.has(k)) registry.remove?.(k); });
    registry.set('playerGold', START_GOLD);
    registry.set('gameMode', mode);
    registry.set('north_closed', true);
    registry.set('items', { letter: 1 });
    registry.set('_sessionLoaded', true);
  },

  /** Загрузить сохранение в registry (один раз за сессию, если не force). */
  applyFlagsToRegistry(registry, { force = false } = {}) {
    if (!force && registry.get('_sessionLoaded')) return;
    const save = this.load();
    if (!save) {
      if (registry.get('playerGold') === undefined) registry.set('playerGold', START_GOLD);
      if (registry.get('gameMode') === undefined) registry.set('gameMode', 'chronicle');
      if (registry.get('north_closed') === undefined) registry.set('north_closed', true);
      registry.set('_sessionLoaded', true);
      return;
    }
    if (force) registryEntries(registry).forEach(([k]) => { if (!TRANSIENT.has(k)) registry.remove?.(k); });
    Object.entries(save.world || {}).forEach(([k, v]) => registry.set(k, v));
    Object.entries(save.flags || {}).forEach(([k, v]) => registry.set(k, v));   // схема 2
    registry.set('playerGold', save.gold ?? registry.get('playerGold') ?? START_GOLD);
    registry.set('gameMode', save.mode || registry.get('gameMode') || 'chronicle');
    if (registry.get('north_closed') === undefined) registry.set('north_closed', true);
    registry.set('_sessionLoaded', true);
  },

  addGold(amount, registry) {
    const current = registry.get('playerGold') ?? 0;
    registry.set('playerGold', Math.max(0, current + amount));
    try {
      const save = this.load();
      if (save) {
        save.gold = registry.get('playerGold');
        if (save.world) save.world.playerGold = save.gold;
        write(SAVE_KEY, save);
      }
    } catch (e) {}
  },

  getGold(registry) {
    return registry.get('playerGold') ?? 0;
  },

  setFlag(key, value, registry) {
    registry.set(key, value);
    try {
      const save = this.load();
      if (save) {
        save.world = save.world || {};
        if (value) save.world[key] = value;
        else delete save.world[key];
        write(SAVE_KEY, save);
      }
    } catch (e) {}
  },

  // Применить сохранённые статы к массиву PlayerUnit
  applyToUnits(playerUnits) {
    const save = this.load();
    if (!save) return;
    playerUnits.forEach(u => {
      const s = (save.units || []).find(sv => sv.id === u.id);
      if (!s) return;
      u.hp        = s.hp;
      u.maxHp     = s.maxHp;
      u.baseMaxHp = s.baseMaxHp ?? s.maxHp;
      u.damage    = { ...s.damage };
      if (s.speed != null) u.speed = s.speed;
      u.armor     = s.armor;
      if (s.accuracy != null) u.accuracy = s.accuracy;
      if (s.lifesteal != null) u.lifesteal = s.lifesteal;
      if (s.regen != null) u.regen = s.regen;
      u.xp        = s.xp;
      u.level     = s.level;
      u.injured   = !!s.injured;
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
      u.resourceMax = { ...(u.resourceMax || {}), ...(s.resourceMax || {}) };
      u.resourceBonus = { ...(u.resourceBonus || {}), ...(s.resourceBonus || {}) };
      u.healBonus = s.healBonus || 0;
      u._cdReduction = s._cdReduction ?? u._cdReduction ?? 0;
    });
  },
};
