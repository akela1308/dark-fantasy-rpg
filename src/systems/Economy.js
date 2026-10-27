import itemsData from '../data/items.json';
import booksData from '../data/books.json';
import shopsData from '../data/shops.json';
import unitsData from '../data/units.json';
import { SaveSystem } from '../utils/SaveSystem.js';
import { PartySystem } from './PartySystem.js';

/**
 * Экономика мира (МИР_РАСШИРЕНИЕ_v1.0): цены, лавки, использование предметов на карте, варка, эффекты книг.
 * Чистые функции поверх registry (WorldState): MapScene и ShopWindow только показывают результат.
 *
 * Предмет (items.json): { id, name, cat, price, use?, recipe? }
 *   use: { heal, healAll, cureInjury, oncePerRest, battleBuff: { target: 'one'|'party'|'hero', type, value, duration,
 *          immuneWeakened, pistol, initiative } }
 *   recipe: { needs: [{ id, n }], unlockFlag? }
 * Лавка (shops.json): { id, keeper, markup, sellRate, buys:[cat], likes:[cat], discountIf:[{flag,mult}], stock:[{id,n|null}],
 *   books:[bookId], craft, craftFee }
 */
export const ITEMS = Object.fromEntries(itemsData.map(i => [i.id, i]));
export const BOOKS = Object.fromEntries(booksData.map(b => [b.id, b]));
export const SHOPS = Object.fromEntries(shopsData.map(s => [s.id, s]));

export const CAT_NAMES = {
  food: 'еда', medicine: 'лечение', tonic: 'перед боем', ingredient: 'травы и снадобья', valuable: 'ценности',
  book: 'книги', quest: 'дело', currency: 'монеты', equipment: 'снаряжение',
};
const UNSELLABLE_TYPES = new Set(['quest', 'equipment', 'book', 'currency', 'note']);

// Иконки, которых ещё нет (поток арта рисует ui/items/*.png), заменяются общей по категории
const FALLBACK_ICON = {
  food: 'item_withered_apple', medicine: 'icon_healing_potion', tonic: 'icon_drop', ingredient: 'icon_drop',
  valuable: 'icon_gold', book: 'item_book_road_houses', currency: 'icon_gold',
};
export function iconKey(scene, item) {
  if (!item) return 'icon_hand';
  if (item.icon && scene.textures.exists(item.icon)) return item.icon;
  const fb = FALLBACK_ICON[item.cat || item.type] || 'icon_hand';
  return scene.textures.exists(fb) ? fb : 'icon_hand';
}

/** Описание предмета по id; книги как book_<id>. */
export function itemDef(id) {
  if (ITEMS[id]) return ITEMS[id];
  const bid = id?.startsWith('book_') ? id.slice(5) : null;
  const b = bid && BOOKS[bid];
  if (b) return { id, name: b.shortName || b.title, type: 'book', cat: 'book', icon: b.icon, bookId: b.id, price: b.price || 10, description: b.description };
  return null;
}

const plural = (n, one, few, many) => {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
};
export const coins = n => `${n} ${plural(n, 'монета', 'монеты', 'монет')}`;

/** Что делает предмет, одной строкой (подсказки инвентаря и лавки). */
export function useSummary(item) {
  const u = item?.use;
  if (!u) return '';
  const parts = [];
  if (u.heal) parts.push(`+${u.heal} HP одному`);
  if (u.healAll) parts.push(`+${u.healAll} HP всем`);
  if (u.cureInjury) parts.push('снимает рану');
  const b = u.battleBuff;
  if (b) parts.push('действует в следующем бою');
  return parts.join(', ');
}

// ── Цены ───────────────────────────────────────────────────────────────────
export function priceMult(shop, ws) {
  let m = shop?.markup ?? 1;
  (shop?.discountIf || []).forEach(d => { if (ws.flag(d.flag)) m *= d.mult; });
  if (ws.rep('word') >= 3) m *= 0.9;   // Слово отряда весит на дороге: торгуются мягче
  return m;
}
export function buyPrice(shop, id, ws) {
  const def = itemDef(id);
  return Math.max(1, Math.ceil((def?.price || 1) * priceMult(shop, ws)));
}
export function canSell(shop, id) {
  const def = itemDef(id);
  if (!def || def.quest || UNSELLABLE_TYPES.has(def.type) || !def.price) return false;
  return !shop?.buys || shop.buys.includes(def.cat);
}
export function sellPrice(shop, id) {
  const def = itemDef(id);
  const rate = shop?.likes?.includes(def?.cat) ? Math.max(0.55, shop.sellRate ?? 0.4) : (shop?.sellRate ?? 0.4);
  return Math.max(1, Math.floor((def?.price || 1) * rate));
}

// ── Лавки ──────────────────────────────────────────────────────────────────
/** Остаток товара: registry shop_<id>_stock, пополняется после каждого отдыха отряда (счётчик rests). */
export function shopStock(shop, registry) {
  const key = `shop_${shop.id}_stock`;
  const rests = registry.get('cnt_rests') || 0;
  let st = registry.get(key);
  if (!st || registry.get(`shop_${shop.id}_rest`) !== rests) {
    const prev = st || {};
    st = {};
    (shop.stock || []).forEach(s => { st[s.id] = s.n == null ? -1 : s.n; });
    // Проданное игроком остаётся на полке и после пополнения
    Object.entries(prev).forEach(([id, n]) => { if (st[id] === undefined && n > 0) st[id] = n; });
    registry.set(key, st);
    registry.set(`shop_${shop.id}_rest`, rests);
  }
  return { ...st };
}

export function buy(shop, id, ws) {
  const reg = ws.registry;
  const st = shopStock(shop, reg);
  const left = st[id];
  if (left === undefined || left === 0) return { ok: false, reason: 'кончилось' };
  const p = buyPrice(shop, id, ws);
  if (ws.gold() < p) return { ok: false, reason: `нужно ${coins(p)}` };
  ws.addGold(-p);
  ws.giveItem(id, 1);
  if (left > 0) { st[id] = left - 1; reg.set(`shop_${shop.id}_stock`, st); }
  return { ok: true, price: p };
}

export function sell(shop, id, ws) {
  if (!canSell(shop, id)) return { ok: false, reason: 'не берут' };
  if (!ws.hasItem(id)) return { ok: false, reason: 'нечего продать' };
  const p = sellPrice(shop, id);
  ws.takeItem(id, 1);
  ws.addGold(p);
  const reg = ws.registry;
  const st = shopStock(shop, reg);
  if (st[id] !== -1) { st[id] = (st[id] || 0) + 1; reg.set(`shop_${shop.id}_stock`, st); }
  return { ok: true, price: p };
}

/** Книги на прилавке: каждая одна, купленная становится собранной (collectFlag). */
export function shopBooks(shop, ws) {
  return (shop.books || []).map(id => BOOKS[id]).filter(b => b && !(b.collectFlag && ws.flag(b.collectFlag)));
}
export function bookPrice(shop, book, ws) {
  return Math.max(1, Math.ceil((book.price || 12) * priceMult(shop, ws)));
}
export function buyBook(shop, bookId, ws) {
  const b = BOOKS[bookId];
  if (!b) return { ok: false, reason: 'нет книги' };
  if (b.collectFlag && ws.flag(b.collectFlag)) return { ok: false, reason: 'уже есть' };
  const p = bookPrice(shop, b, ws);
  if (ws.gold() < p) return { ok: false, reason: `нужно ${coins(p)}` };
  ws.addGold(-p);
  if (b.collectFlag) ws.setFlag(b.collectFlag, true);
  return { ok: true, price: p, book: b };
}

// ── Варка: Тая в отряде или травница за плату ──────────────────────────────
export const CRAFTER = 'companion_healer';
export function recipes(ws, { all = false } = {}) {
  return itemsData.filter(i => i.recipe && (all || !i.recipe.unlockFlag || ws.flag(i.recipe.unlockFlag)));
}
export function canCraft(id, ws) {
  const r = ITEMS[id]?.recipe;
  return !!r && r.needs.every(x => ws.hasItem(x.id, x.n));
}
export function craft(id, ws, fee = 0) {
  if (!canCraft(id, ws)) return { ok: false, reason: 'не хватает трав' };
  if (fee && ws.gold() < fee) return { ok: false, reason: `нужно ${coins(fee)}` };
  if (fee) ws.addGold(-fee);
  ITEMS[id].recipe.needs.forEach(x => ws.takeItem(x.id, x.n));
  ws.giveItem(id, 1);
  return { ok: true };
}

// ── Использование на карте ─────────────────────────────────────────────────
function rosterAndParty(registry) {
  const units = PartySystem.buildRosterUnits(registry);
  const party = PartySystem.getParty(registry);
  return { units, inParty: units.filter(u => party.includes(u.id)) };
}
const unitLabel = u => u.personalName || unitsData.find(d => d.id === u.id)?.personalName || (u.id === 'hero_duelist' ? 'Дуэлянт' : u.name);

/**
 * Использовать предмет. unitId: кому (выбранная вкладка окна отряда). Возвращает { ok, text }.
 * place: { mapKey, spawnId } для сохранения.
 */
export function useItem(id, unitId, ws, place = {}) {
  const reg = ws.registry;
  const def = ITEMS[id];
  const u = def?.use;
  if (!u) return { ok: false, text: 'Это нельзя использовать.' };
  if (!def.unlimited && !ws.hasItem(id)) return { ok: false, text: 'Не осталось.' };
  if (u.oncePerRest && reg.get(`${id}_used`)) return { ok: false, text: `${def.name}: пусто до привала.` };

  const { units, inParty } = rosterAndParty(reg);
  const target = inParty.find(x => x.id === unitId) || inParty[0];
  const lines = [];
  let changed = false;
  const healOne = (x, n) => {
    const before = x.hp;
    x.hp = Math.min(x.maxHp, x.hp + n);
    if (x.hp > before) { changed = true; lines.push(`${unitLabel(x)}: +${x.hp - before} HP`); }
  };
  if (u.cureInjury && target?.injured) {
    target.injured = false;
    target.maxHp = target.baseMaxHp ?? target.maxHp;
    changed = true;
    lines.push(`${unitLabel(target)}: рана перевязана`);
  }
  if (u.heal && target) healOne(target, u.heal);
  if (u.healAll) inParty.forEach(x => healOne(x, u.healAll));
  if (u.battleBuff) {
    const b = { ...u.battleBuff, item: id };
    if (b.target === 'one') b.unit = target?.id;
    const list = [...(reg.get('next_battle_buffs') || []), b];
    reg.set('next_battle_buffs', list);
    lines.push(`${def.name}: подействует в следующем бою${b.unit ? ` (${unitLabel(target)})` : ''}`);
    changed = true;
  }
  if (!changed) return { ok: false, text: u.heal || u.healAll ? 'Все и так целы.' : 'Сейчас это не нужно.' };

  if (u.heal || u.healAll || u.cureInjury) SaveSystem.save(units, place.mapKey, place.spawnId, reg);
  if (u.oncePerRest) reg.set(`${id}_used`, true);
  if (!def.unlimited) ws.takeItem(id, 1);
  SaveSystem.saveWorld(reg, place.mapKey, place.spawnId);
  return { ok: true, text: lines.join(', ') };
}

/** Отдых: фляга снова полна (oncePerRest), лавки пополняются. */
export function onRest(registry) {
  itemsData.filter(i => i.use?.oncePerRest).forEach(i => registry.set(`${i.id}_used`, false));
  registry.set('cnt_rests', (registry.get('cnt_rests') || 0) + 1);
}

// ── Эффекты книг (books.json → effects), один раз при первом прочтении ─────
/**
 * ctx: { ws, giveXp(n), mapKey, spawnId }. Возвращает строки для тоста или [] (уже применено / эффектов нет).
 */
export function applyBookEffects(book, ctx) {
  const { ws } = ctx;
  const reg = ws.registry;
  const e = book?.effects;
  const fxFlag = `book_${book?.id}_fx`;
  if (!e || reg.get(fxFlag)) return [];
  reg.set(fxFlag, true);
  const out = [];
  const arr = v => (v == null ? [] : Array.isArray(v) ? v : [v]);
  arr(e.setFlag).forEach(f => ws.setFlag(f, true));
  if (e.rep) Object.entries(e.rep).forEach(([k, v]) => ws.addRep(k, v));
  if (e.trait) ws.setFlag(`trait_${e.trait}`, true);
  arr(e.unlockRecipe).forEach(r => { ws.setFlag(`recipe_${r}`, true); out.push(`рецепт: ${ITEMS[r]?.name || r}`); });
  arr(e.giveItem).forEach(i => ws.giveItem(typeof i === 'string' ? i : i.id, i.n || 1));

  // Навык: запоминается в registry (book_skills) и добавляется сразу тем, кто уже в отряде или запасе;
  // кто придёт позже, получит его в первом бою (Items.applyItemBonuses)
  if (e.learnSkill) {
    const map = { ...(reg.get('book_skills') || {}) };
    arr(e.learnSkill.units).forEach(uid => { map[uid] = [...new Set([...(map[uid] || []), e.learnSkill.skill])]; });
    reg.set('book_skills', map);
  }
  // Прибавка к характеристикам: сразу в сохранение; тем, кого ещё нет, при первом бою (book_stats_pending)
  if (e.stat || e.learnSkill) {
    const units = PartySystem.buildRosterUnits(reg);
    if (e.stat) {
      const targets = e.stat.units === 'party' ? units.map(u => u.id) : arr(e.stat.units);
      const pending = { ...(reg.get('book_stats_pending') || {}) };
      targets.forEach(uid => {
        const u = units.find(x => x.id === uid);
        if (u) applyStat(u, e.stat);
        else if (e.stat.units !== 'party') pending[uid] = [...(pending[uid] || []), e.stat];
      });
      reg.set('book_stats_pending', pending);
    }
    const skills = reg.get('book_skills') || {};
    units.forEach(u => (skills[u.id] || []).forEach(s => { if (!u.skills.includes(s)) u.skills.push(s); }));
    SaveSystem.save(units, ctx.mapKey, ctx.spawnId, reg);
  }
  if (e.giveXp) ctx.giveXp?.(e.giveXp);
  if (book.effectText) out.unshift(book.effectText);
  return out;
}

/** Постоянная прибавка из книги к юниту (accuracy, maxHp, armor, healBonus). */
export function applyStat(u, s) {
  if (s.accuracy) u.accuracy = Math.min(95, (u.accuracy ?? 75) + s.accuracy);
  if (s.armor) u.armor = (u.armor || 0) + s.armor;
  if (s.healBonus) u.healBonus = (u.healBonus || 0) + s.healBonus;
  if (s.maxHp) {
    u.maxHp += s.maxHp;
    u.baseMaxHp = (u.baseMaxHp ?? u.maxHp - s.maxHp) + s.maxHp;
    u.hp = Math.min(u.maxHp, (u.hp || 0) + s.maxHp);
  }
}
