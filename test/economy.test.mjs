// Экономика, лавки, книги (МИР_РАСШИРЕНИЕ_v1.0): данные согласованы, цены продажи ниже покупки,
// предметы лечат на карте, книги дают эффект один раз.
import './_json_hook.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// Хранилище сохранений в памяти (SaveSystem пишет в localStorage)
const mem = new Map();
globalThis.localStorage = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k) };

const E = await import('../src/systems/Economy.js');
const { WorldState } = await import('../src/systems/WorldState.js');
const { SaveSystem } = await import('../src/utils/SaveSystem.js');
const { PartySystem } = await import('../src/systems/PartySystem.js');
const { applyItemBonuses } = await import('../src/systems/Items.js');
const read = p => JSON.parse(fs.readFileSync(new URL(p, import.meta.url), 'utf8'));
const items = read('../src/data/items.json');
const books = read('../src/data/books.json');
const shops = read('../src/data/shops.json');
const skills = new Set(read('../src/data/skills.json').map(s => s.id));
const units = new Set(read('../src/data/units.json').map(u => u.id));
const maps = read('../src/data/maps.json');

class Reg { constructor() { this.list = {}; } get(k) { return this.list[k]; } set(k, v) { this.list[k] = v; } remove(k) { delete this.list[k]; } }

test('предметы: 50-70, у каждого цена и описание, рецепты из существующих трав', () => {
  assert.ok(items.length >= 50 && items.length <= 70, `предметов ${items.length}`);
  const ids = new Set(items.map(i => i.id));
  assert.equal(ids.size, items.length, 'повтор id');
  const bad = [];
  items.forEach(i => {
    if (!i.name || !i.description) bad.push(`${i.id}: имя/описание`);
    if (i.cat && i.price == null) bad.push(`${i.id}: нет цены`);
    (i.recipe?.needs || []).forEach(n => { if (!ids.has(n.id)) bad.push(`${i.id}: трава ${n.id}`); });
  });
  assert.deepEqual(bad, []);
});

test('лавки: товар и книги существуют, продажа дешевле покупки, лавки открываются из диалогов', () => {
  const ids = new Set(items.map(i => i.id));
  const bookIds = new Set(books.map(b => b.id));
  const ws = new WorldState(new Reg());
  const bad = [];
  shops.forEach(s => {
    s.stock.forEach(x => { if (!ids.has(x.id)) bad.push(`${s.id}: ${x.id}`); });
    (s.books || []).forEach(b => { if (!bookIds.has(b)) bad.push(`${s.id}: книга ${b}`); });
    items.filter(i => i.price > 1 && E.canSell(s, i.id)).forEach(i => {
      if (E.sellPrice(s, i.id) >= E.buyPrice(s, i.id, ws)) bad.push(`${s.id}: ${i.id} продажа не ниже покупки`);
    });
  });
  const opened = new Set();
  fs.readdirSync(new URL('../src/data/dialogues/', import.meta.url)).forEach(f => {
    const txt = fs.readFileSync(new URL(`../src/data/dialogues/${f}`, import.meta.url), 'utf8');
    [...txt.matchAll(/"openShop":\s*"([a-z_]+)"/g)].forEach(m => opened.add(m[1]));
  });
  opened.forEach(id => { if (!E.SHOPS[id]) bad.push(`openShop ${id}: нет лавки`); });
  shops.forEach(s => { if (!opened.has(s.id)) bad.push(`лавка ${s.id} не открывается ни из одного диалога`); });
  assert.deepEqual(bad, []);
});

test('купить и продать: золото, остаток, нельзя продать квестовое', () => {
  const ws = new WorldState(new Reg());
  ws.registry.set('playerGold', 50);
  const vorn = E.SHOPS.vorn;
  const p = E.buyPrice(vorn, 'healing_potion', ws);
  assert.ok(E.buy(vorn, 'healing_potion', ws).ok);
  assert.equal(ws.gold(), 50 - p);
  assert.ok(ws.hasItem('healing_potion'));
  E.buy(vorn, 'healing_potion', ws);
  assert.equal(E.buy(vorn, 'healing_potion', ws).ok, false, 'у Ворна только две склянки');
  ws.giveItem('letter');
  assert.equal(E.sell(vorn, 'letter', ws).ok, false);
  const g = ws.gold();
  assert.ok(E.sell(vorn, 'healing_potion', ws).ok === false || ws.gold() > g);
});

test('книги: 25-30, 2-4 страницы, эффекты ссылаются на существующие навыки, рецепты и бойцов, подборы на картах', () => {
  assert.ok(books.length >= 25 && books.length <= 30, `книг ${books.length}`);
  const bad = [];
  const ids = new Set(books.map(b => b.id));
  books.forEach(b => {
    if (!(b.pages?.length >= 2 && b.pages.length <= 4)) bad.push(`${b.id}: страниц ${b.pages?.length}`);
    if (b.readFlag !== `book_${b.id}_read` && !['lame_stag_song'].includes(b.id) && !b.readFlag) bad.push(`${b.id}: readFlag`);
    const e = b.effects || {};
    if (e.learnSkill) {
      if (!skills.has(e.learnSkill.skill)) bad.push(`${b.id}: навык ${e.learnSkill.skill}`);
      [].concat(e.learnSkill.units).forEach(u => { if (!units.has(u)) bad.push(`${b.id}: боец ${u}`); });
    }
    [].concat(e.unlockRecipe || []).forEach(r => {
      if (E.ITEMS[r]?.recipe?.unlockFlag !== `recipe_${r}`) bad.push(`${b.id}: рецепт ${r}`);
    });
    [].concat(e.giveItem || []).forEach(i => { if (!E.ITEMS[typeof i === 'string' ? i : i.id]) bad.push(`${b.id}: предмет`); });
  });
  Object.entries(maps).forEach(([k, m]) => (m.bookPickups || []).forEach(p => { if (!ids.has(p.bookId)) bad.push(`${k}: книга ${p.bookId}`); }));
  assert.deepEqual(bad, []);
  assert.ok(books.filter(b => b.effects).length >= 12, 'эффект есть хотя бы у 12 книг');
});

test('предмет лечит на карте, повязка снимает рану, баффы уходят в следующий бой', () => {
  mem.clear();
  const reg = new Reg();
  SaveSystem.newGame(reg);
  const ws = new WorldState(reg);
  const [hero] = PartySystem.buildRosterUnits(reg);
  hero.hp = 10; hero.injured = true; hero.baseMaxHp = hero.maxHp; hero.maxHp = Math.round(hero.maxHp * 0.8);
  SaveSystem.save([hero], 'south_post', 'default', reg);
  ws.giveItem('swamp_bandage', 1);
  const r = E.useItem('swamp_bandage', 'hero_duelist', ws, { mapKey: 'south_post', spawnId: 'default' });
  assert.ok(r.ok, r.text);
  const saved = SaveSystem.load().units.find(u => u.id === 'hero_duelist');
  assert.equal(saved.injured, false);
  assert.equal(saved.maxHp, saved.baseMaxHp);
  assert.equal(saved.hp, 20);
  assert.equal(ws.hasItem('swamp_bandage'), false);

  ws.giveItem('whetstone', 1);
  assert.ok(E.useItem('whetstone', 'hero_duelist', ws, {}).ok);
  const battle = PartySystem.buildPlayerUnits(reg);
  battle.forEach(u => u.prepareForBattle({}));
  applyItemBonuses(battle, reg);
  assert.ok(battle[0].effects.some(e => e.type === 'enraged' && e.value === 3));
  assert.deepEqual(reg.get('next_battle_buffs'), []);
});

test('книга даёт эффект один раз: навык и рецепт', () => {
  mem.clear();
  const reg = new Reg();
  SaveSystem.newGame(reg);
  const ws = new WorldState(reg);
  let xp = 0;
  const duel = E.BOOKS.duel_law;
  const out = E.applyBookEffects(duel, { ws, giveXp: n => { xp += n; } });
  assert.ok(out.length > 0);
  const hero = SaveSystem.load().units.find(u => u.id === 'hero_duelist');
  assert.ok(hero.skills.includes('last_word'));
  assert.deepEqual(E.applyBookEffects(duel, { ws }), [], 'второй раз эффекта нет');
  E.applyBookEffects(E.BOOKS.lowland_herbal, { ws });
  assert.ok(ws.flag('recipe_swamp_bandage'));
  assert.ok(E.recipes(ws).some(r => r.id === 'swamp_bandage'));
  ws.giveItem('black_sedge', 1); ws.giveItem('linen', 1);
  assert.ok(E.craft('swamp_bandage', ws).ok);
  assert.ok(ws.hasItem('swamp_bandage'));
});

test('пиво усиливает выпившего, переживает F5 до боя и расходуется одним боем', () => {
  mem.clear();
  const reg = new Reg(); SaveSystem.newGame(reg);
  reg.set('roster', ['hero_duelist', 'companion_brawler']);
  reg.set('party', ['hero_duelist', 'companion_brawler']); reg.set('partySlots', 2);
  const ws = new WorldState(reg);
  ws.giveItem('dark_beer', 1);
  assert.ok(E.useItem('dark_beer', 'companion_brawler', ws, { mapKey: 'south_post' }).ok);
  const pending = reg.get('next_battle_buffs');
  assert.equal(pending[0].unit, 'companion_brawler');
  assert.equal(ws.hasItem('dark_beer'), false);
  const persisted = SaveSystem.load().world.next_battle_buffs;
  assert.deepEqual(persisted, pending);
  reg.set('next_battle_buffs', structuredClone(persisted));
  const battle = PartySystem.buildPlayerUnits(reg);
  battle.forEach(u => u.prepareForBattle({})); applyItemBonuses(battle, reg);
  const hero = battle.find(u => u.id === 'hero_duelist'), brawler = battle.find(u => u.id === 'companion_brawler');
  assert.equal(hero.hasEffect('enraged'), false);
  assert.equal(brawler.getEffect('enraged')?.value, 1);
  brawler.damage = { min: 10, max: 10 };
  assert.equal(brawler.rollDamage(), 11);
  brawler.endTurn(); assert.equal(brawler.rollDamage(), 11);
  brawler.endTurn(); assert.equal(brawler.rollDamage(), 10);
  const next = PartySystem.buildPlayerUnits(reg);
  next.forEach(u => u.prepareForBattle({})); applyItemBonuses(next, reg);
  assert.ok(next.every(u => !u.hasEffect('enraged')));
});
