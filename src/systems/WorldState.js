import { PartySystem } from './PartySystem.js';
import { SaveSystem } from '../utils/SaveSystem.js';

/**
 * WorldState: единая точка доступа к состоянию мира поверх Phaser registry.
 * Флаги, репутация Закон/Страх/Слово (0..5), счётчики, золото, предметы, партия.
 * SaveSystem сохраняет registry целиком, поэтому всё, что здесь, переживает перезагрузку.
 */
export const REP_KEYS = { law: 'rep_law', fear: 'rep_fear', word: 'rep_word' };
export const REP_NAMES = { law: 'Закон', fear: 'Страх', word: 'Слово' };
export const REP_MAX = 5;

export class WorldState {
  constructor(registry) {
    this.registry = registry;
  }

  // ── Флаги ────────────────────────────────────────────────────────────────
  flag(key) { return !!this.registry.get(key); }
  setFlag(key, value = true) { this.registry.set(key, value); }
  clearFlag(key) { this.registry.remove ? this.registry.remove(key) : this.registry.set(key, false); }

  // ── Репутация ────────────────────────────────────────────────────────────
  rep(kind) { return this.registry.get(REP_KEYS[kind]) || 0; }
  addRep(kind, delta) {
    const key = REP_KEYS[kind];
    if (!key) return 0;
    const v = Math.max(0, Math.min(REP_MAX, this.rep(kind) + delta));
    this.registry.set(key, v);
    return v;
  }
  reputation() {
    return { law: this.rep('law'), fear: this.rep('fear'), word: this.rep('word') };
  }

  // ── Счётчики ─────────────────────────────────────────────────────────────
  counter(key) { return this.registry.get(`cnt_${key}`) || 0; }
  inc(key, by = 1) { const v = this.counter(key) + by; this.registry.set(`cnt_${key}`, v); return v; }

  // ── Деньги и предметы ────────────────────────────────────────────────────
  gold() { return SaveSystem.getGold(this.registry); }
  addGold(n) { SaveSystem.addGold(n, this.registry); }
  items() { return { ...(this.registry.get('items') || {}) }; }
  hasItem(id, n = 1) { return (this.items()[id] || 0) >= n; }
  giveItem(id, n = 1) {
    const it = this.items(); it[id] = (it[id] || 0) + n; this.registry.set('items', it);
  }
  takeItem(id, n = 1) {
    const it = this.items(); it[id] = Math.max(0, (it[id] || 0) - n);
    if (!it[id]) delete it[id];
    this.registry.set('items', it);
  }

  // ── Партия ───────────────────────────────────────────────────────────────
  level() { return PartySystem.getLevel(this.registry); }
  party() { return PartySystem.getParty(this.registry); }
  roster() { return PartySystem.getRoster(this.registry); }
  hasTrait(traitId) {
    const hero = (SaveSystem.load()?.units || []).find(u => u.id === 'hero_duelist');
    return (hero?.commanderTraits || []).includes(traitId) || this.flag(`trait_${traitId}`);
  }

  // ── Режим и прочее ───────────────────────────────────────────────────────
  mode() { return this.registry.get('gameMode') || 'chronicle'; }
}
