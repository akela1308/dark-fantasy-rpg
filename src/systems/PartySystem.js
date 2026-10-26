import unitsData from '../data/units.json';
import { PlayerUnit } from '../entities/PlayerUnit.js';
import { SaveSystem } from '../utils/SaveSystem.js';
import progression from '../data/progression.json';
import { statsAtLevel, applyLevelGrowth } from './ClassProgression.js';

export const LEVEL_CAP = 12;

/**
 * PartySystem: кто в партии, кто ждёт в таверне, сколько слотов.
 * Хранит всё в registry (его целиком сохраняет SaveSystem):
 *   party      - id юнитов в активной партии (герой всегда первый)
 *   roster     - все завербованные (включая героя)
 *   partySlots - сколько мест в партии (1 на старте, 2 с уровня 2, +1 за Командование, потолок 4)
 * Решения: 02_ДИЗАЙН 2.2, 09_МИР 5.
 */
export const HERO_ID = 'hero_duelist';
export const MAX_SLOTS = 4;

// Где стоят по умолчанию (ряд 0 передний, 1 задний). Новые спутники ставятся на свободную клетку.
const PREFERRED = {
  hero_duelist: { row: 0, col: 0 },
  companion_brawler: { row: 0, col: 2 },
  companion_healer: { row: 1, col: 1 },
};

function startParty() {
  return unitsData.filter(u => u.startsInParty).map(u => u.id);
}

export const PartySystem = {
  getParty(registry) {
    const p = registry?.get('party');
    if (Array.isArray(p) && p.length) return [...p];
    return startParty();
  },

  getRoster(registry) {
    const r = registry?.get('roster');
    if (Array.isArray(r) && r.length) return [...r];
    return startParty();
  },

  getSlots(registry) {
    return Math.min(MAX_SLOTS, Math.max(1, registry?.get('partySlots') ?? 1));
  },

  setSlots(registry, n) {
    registry.set('partySlots', Math.min(MAX_SLOTS, Math.max(1, n)));
  },

  addSlot(registry) {
    this.setSlots(registry, this.getSlots(registry) + 1);
  },

  size(registry) {
    return this.getParty(registry).length;
  },

  inParty(registry, id) {
    return this.getParty(registry).includes(id);
  },

  hasFreeSlot(registry) {
    return this.size(registry) < this.getSlots(registry);
  },

  /** Завербовать: в roster всегда, в партию если есть место. Возвращает 'party' | 'reserve' | false. */
  recruit(registry, id) {
    if (!unitsData.find(u => u.id === id)) return false;
    const roster = this.getRoster(registry);
    if (!roster.includes(id)) roster.push(id);
    registry.set('roster', roster);
    const party = this.getParty(registry);
    if (party.includes(id)) return 'party';
    if (party.length < this.getSlots(registry)) {
      party.push(id);
      registry.set('party', party);
      return 'party';
    }
    registry.set('party', party);
    return 'reserve';
  },

  /** Убрать из активной партии (остаётся в roster, ждёт в таверне). Героя убрать нельзя. */
  bench(registry, id) {
    if (id === HERO_ID) return false;
    const party = this.getParty(registry).filter(x => x !== id);
    registry.set('party', party);
    return true;
  },

  /** Взять из запаса в партию, если есть место. */
  activate(registry, id) {
    if (!this.getRoster(registry).includes(id)) return false;
    const party = this.getParty(registry);
    if (party.includes(id)) return true;
    if (party.length >= this.getSlots(registry)) return false;
    party.push(id);
    registry.set('party', party);
    return true;
  },

  /** Распустить совсем: уходит и из roster. */
  dismiss(registry, id) {
    if (id === HERO_ID) return false;
    registry.set('roster', this.getRoster(registry).filter(x => x !== id));
    registry.set('party', this.getParty(registry).filter(x => x !== id));
    return true;
  },

  // ── Общий опыт партии (01_БАЛАНС 3-4) ───────────────────────────────────
  getXp(registry) { return registry?.get('partyXp') || 0; },
  getLevel(registry) { return registry?.get('partyLevel') || 1; },

  /** Сколько опыта всего нужно для уровня L. */
  xpTotalFor(level) { return progression.XP_TOTAL[String(level)] ?? Infinity; },

  /** Добавить опыт партии. Возвращает { from, to } уровней. */
  addXp(registry, amount) {
    const from = this.getLevel(registry);
    const xp = this.getXp(registry) + Math.max(0, Math.round(amount || 0));
    registry.set('partyXp', xp);
    let lvl = from;
    while (lvl < LEVEL_CAP && xp >= this.xpTotalFor(lvl + 1)) lvl++;
    if (lvl !== from) registry.set('partyLevel', lvl);
    // Первый слот открывается сам на 2 уровне (02_ДИЗАЙН 2.2)
    if (lvl >= 2 && this.getSlots(registry) < 2) this.setSlots(registry, 2);
    return { from, to: lvl };
  },

  /** Опыт до следующего уровня (для HUD). */
  xpProgress(registry) {
    const lvl = this.getLevel(registry);
    const xp = this.getXp(registry);
    if (lvl >= LEVEL_CAP) return { level: lvl, have: xp, need: xp };
    return { level: lvl, have: xp - this.xpTotalFor(lvl), need: this.xpTotalFor(lvl + 1) - this.xpTotalFor(lvl) };
  },

  /** Юниты всех завербованных (партия и запас). existing: уже созданные в бою, чтобы не терять HP и раны. */
  buildRosterUnits(registry, existing = []) {
    const ids = this.getRoster(registry);
    const fresh = ids
      .filter(id => !existing.some(u => u.id === id))
      .map(id => unitsData.find(u => u.id === id))
      .filter(Boolean)
      .map(d => new PlayerUnit(JSON.parse(JSON.stringify(d))));
    SaveSystem.applyToUnits(fresh);
    return [...existing.filter(u => ids.includes(u.id)), ...fresh];
  },

  /** Новичок входит на уровне партии: базовый рост до текущего уровня (выборы покажет экран уровня). */
  catchUpUnit(unit, level) {
    while ((unit.level || 1) < level && statsAtLevel(unit.classId, (unit.level || 1) + 1)) {
      applyLevelGrowth(unit, (unit.level || 1) + 1);
      unit.level = (unit.level || 1) + 1;
    }
    return unit;
  },

  /** Отдых: полное HP, Сборы, раны сняты, точка возврата для Хроники. */
  restAll(registry, mapKey, spawnId) {
    const units = this.buildRosterUnits(registry);
    units.forEach(u => {
      u.maxHp = u.baseMaxHp ?? u.maxHp;
      u.injured = false;
      u.hp = u.maxHp;
      const sup = unitsData.find(d => d.id === u.id)?.resources?.supplies;
      if (sup != null) u.resources.supplies = u.resourceMax?.supplies ?? sup;
    });
    SaveSystem.save(units, mapKey, spawnId, registry);
    SaveSystem.saveRestPoint();
    return units;
  },

  /** PlayerUnit для активной партии с применённым сохранением и без наложений на сетке. */
  buildPlayerUnits(registry, { applySave = true } = {}) {
    const ids = this.getParty(registry);
    const units = ids
      .map(id => unitsData.find(u => u.id === id))
      .filter(Boolean)
      .map(d => new PlayerUnit(JSON.parse(JSON.stringify(d))));
    if (applySave) SaveSystem.applyToUnits(units);
    this.assignPositions(units);
    return units;
  },

  assignPositions(units) {
    const taken = new Set();
    const key = (r, c) => `${r}:${c}`;
    const order = [[0, 0], [0, 2], [0, 1], [1, 1], [1, 0], [1, 2]];
    units.forEach(u => {
      const pref = PREFERRED[u.id] || u.position || { row: 0, col: 1 };
      let pos = pref;
      if (taken.has(key(pos.row, pos.col))) {
        const sameRow = order.filter(([r]) => r === pref.row);
        const other = order.filter(([r]) => r !== pref.row);
        const free = [...sameRow, ...other].find(([r, c]) => !taken.has(key(r, c)));
        pos = { row: free[0], col: free[1] };
      }
      taken.add(key(pos.row, pos.col));
      u.position = { ...pos };
    });
    return units;
  },
};
