// Ссылки между данными и флаги сюжета: быстрая проверка без запуска игры.
// 1) id предметов, боёв, карт, спавнов, NPC, книг, навыков и узлов диалогов существуют.
// 2) Флаг, который где-то читается, кто-то ставит: данные, код или динамические шаблоны.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = f => JSON.parse(fs.readFileSync(path.join(root, 'src/data', f), 'utf8'));
const arr = v => (v == null ? [] : Array.isArray(v) ? v : [v]);

const maps = read('maps.json');
const quests = read('quests.json');
const battles = read('battles.json');
const items = read('items.json');
const books = read('books.json');
const shops = read('shops.json');
const skills = read('skills.json');
const units = read('units.json');
const dialogues = Object.fromEntries(fs.readdirSync(path.join(root, 'src/data/dialogues'))
  .filter(f => f.endsWith('.json'))
  .map(f => { const d = read(`dialogues/${f}`); return [d.id, d]; }));

const itemIds = new Set(items.map(i => i.id));
const bookIds = new Set(books.map(b => b.id));
const battleIds = new Set(battles.map(b => b.id));
const skillIds = new Set(skills.map(s => s.id));
const unitIds = new Set(units.map(u => u.id));
const shopIds = new Set(shops.map(s => s.id));
/** Книга в инвентаре и в наградах записывается как book_<id> (Economy снимает префикс). */
const hasItem = id => itemIds.has(id) || (id.startsWith('book_') && bookIds.has(id.slice(5)));
const itemId = i => (typeof i === 'string' ? i : i?.id);

/** Обойти все условия, эффекты и варианты диалога. */
function forEachDialogueBit(cb) {
  for (const [did, d] of Object.entries(dialogues)) {
    (d.start || []).forEach((s, i) => cb({ where: `${did}.start[${i}]`, did, cond: s.showIf }));
    for (const [nid, n] of Object.entries(d.nodes)) {
      const where = `${did}.${nid}`;
      cb({ where, did, nid, effects: n.effects });
      arr(n.text).forEach(t => cb({ where, did, cond: t?.showIf }));
      (n.lines || []).forEach(l => { cb({ where, did, cond: l.showIf }); arr(l.text).forEach(t => cb({ where, did, cond: t?.showIf })); });
      (n.goto || []).forEach(g => cb({ where, did, cond: g.showIf }));
      (n.choices || []).forEach(c => {
        cb({ where, did, cond: c.showIf });
        cb({ where, did, cond: c.requires });
        cb({ where, did, effects: c.effects });
        cb({ where, did, choice: c });
      });
    }
  }
}

/** Условие showIf/requires/doneIf: все упомянутые флаги. */
function condFlags(c, out = []) {
  if (!c) return out;
  arr(c.flag).forEach(f => out.push(f));
  arr(c.notFlag).forEach(f => out.push(f));
  arr(c.any).forEach(x => condFlags(x, out));
  arr(c.all).forEach(x => condFlags(x, out));
  return out;
}

function condItems(c, out = []) {
  if (!c) return out;
  arr(c.item).forEach(i => out.push(itemId(i)));
  arr(c.any).forEach(x => condItems(x, out));
  arr(c.all).forEach(x => condItems(x, out));
  return out;
}

function condCompanions(c, out = []) {
  if (!c) return out;
  for (const k of ['companion', 'notCompanion', 'recruited', 'notRecruited']) arr(c[k]).forEach(u => out.push(u));
  arr(c.any).forEach(x => condCompanions(x, out));
  arr(c.all).forEach(x => condCompanions(x, out));
  return out;
}

function mapConds(m) {
  const conds = [];
  (m.npcs || []).forEach(n => conds.push(n.showIf));
  (m.encounters || []).forEach(e => conds.push(e.showIf));
  (m.onEnter || []).forEach(e => conds.push(e.showIf));
  (m.doors || []).forEach(e => conds.push(e.showIf));
  (m.exits || []).forEach(e => conds.push(e.showIf));
  (m.inspectables || []).forEach(e => conds.push(e.showIf));
  return conds.filter(Boolean);
}

test('ссылки диалогов: предметы, бои, карты, спавны, лавки, узлы', () => {
  const bad = [];
  forEachDialogueBit(({ where, did, cond, effects, choice }) => {
    condItems(cond).forEach(i => { if (!hasItem(i)) bad.push(`${where}: условие на предмет ${i}`); });
    condCompanions(cond).forEach(u => { if (!unitIds.has(u)) bad.push(`${where}: спутник ${u}`); });
    if (effects) {
      [...arr(effects.giveItem), ...arr(effects.takeItem)].forEach(i => { if (!hasItem(itemId(i))) bad.push(`${where}: предмет ${itemId(i)}`); });
      [...arr(effects.recruit), ...arr(effects.dismiss), ...arr(effects.dismissForever)].forEach(u => { if (!unitIds.has(u)) bad.push(`${where}: спутник ${u}`); });
      if (effects.openShop && !shopIds.has(effects.openShop)) bad.push(`${where}: лавка ${effects.openShop}`);
      if (String(effects.giveXp).startsWith('battle:') && !battleIds.has(effects.giveXp.slice(7))) bad.push(`${where}: опыт за бой ${effects.giveXp}`);
    }
    if (choice?.transition) {
      const m = maps[choice.transition.map];
      if (!m) bad.push(`${where}: карта ${choice.transition.map}`);
      else if (choice.transition.spawn && !m.spawnPoints?.[choice.transition.spawn]) bad.push(`${where}: спавн ${choice.transition.map}/${choice.transition.spawn}`);
    }
    if (choice?.startBattle) {
      const { battleId, onWin, onLose } = choice.startBattle;
      if (!battleIds.has(battleId)) bad.push(`${where}: бой ${battleId}`);
      [onWin, onLose].filter(Boolean).forEach(n => { if (!dialogues[did].nodes[n]) bad.push(`${where}: узел ${n}`); });
    }
  });
  assert.deepEqual(bad, []);
});

test('ссылки карт: выходы, спавны, бои, книги, диалоги, награды', () => {
  const bad = [];
  const dlgNode = (where, d, n) => {
    if (!d) return;
    if (!dialogues[d]) bad.push(`${where}: диалог ${d}`);
    else if (n && !dialogues[d].nodes[n]) bad.push(`${where}: узел ${d}/${n}`);
  };
  for (const [mid, m] of Object.entries(maps)) {
    [...(m.exits || []), m.tavernEntry].filter(Boolean).forEach(e => {
      if (!maps[e.toMap]) bad.push(`${mid}: выход на ${e.toMap}`);
      else if (e.spawnId && !maps[e.toMap].spawnPoints?.[e.spawnId]) bad.push(`${mid}: спавн ${e.toMap}/${e.spawnId}`);
    });
    (m.npcs || []).forEach(n => dlgNode(`${mid}/${n.id}`, n.dialogue, n.dialogueStart));
    (m.doors || []).forEach(n => dlgNode(`${mid}/${n.id}`, n.dialogue, n.node));
    (m.onEnter || []).forEach(n => dlgNode(`${mid}/onEnter`, n.dialogue, n.node));
    (m.encounters || []).forEach(e => {
      if (!battleIds.has(e.battleId)) bad.push(`${mid}/${e.id}: бой ${e.battleId}`);
      dlgNode(`${mid}/${e.id}`, e.dialogue, e.dialogueStart);
      dlgNode(`${mid}/${e.id}`, e.preDialogue, e.preNode);
    });
    (m.bookPickups || []).forEach(b => { if (!bookIds.has(b.bookId)) bad.push(`${mid}: книга ${b.bookId}`); });
    (m.inspectables || []).forEach(i => (i.rewards || []).forEach(r => {
      // Награда с полем name описана на месте, ей запись в items.json не нужна
      if (r.id !== 'gold' && !r.name && !hasItem(r.id)) bad.push(`${mid}/${i.id}: награда ${r.id}`);
    }));
    mapConds(m).forEach(c => condItems(c).forEach(i => { if (!hasItem(i)) bad.push(`${mid}: условие на предмет ${i}`); }));
  }
  assert.deepEqual(bad, []);
});

test('ссылки лавок, боёв, квестов и предметов', () => {
  const bad = [];
  for (const s of shops) {
    if (s.map && !maps[s.map]) bad.push(`лавка ${s.id}: карта ${s.map}`);
    (s.stock || []).forEach(x => { if (!hasItem(itemId(x))) bad.push(`лавка ${s.id}: товар ${itemId(x)}`); });
    (s.books || []).forEach(b => { if (!bookIds.has(itemId(b))) bad.push(`лавка ${s.id}: книга ${itemId(b)}`); });
  }
  for (const b of battles) {
    const lists = [b.enemies, ...Object.values(b.enemiesBySize || {})].filter(Boolean);
    lists.flat().forEach(e => (e.skills || []).forEach(sk => { if (!skillIds.has(sk)) bad.push(`бой ${b.id}/${e.id}: навык ${sk}`); }));
  }
  for (const b of books) {
    const e = b.effects || {};
    arr(e.unlockRecipe).forEach(r => { if (!itemIds.has(r)) bad.push(`книга ${b.id}: рецепт ${r}`); });
    arr(e.giveItem).forEach(i => { if (!hasItem(itemId(i))) bad.push(`книга ${b.id}: предмет ${itemId(i)}`); });
    if (e.learnSkill && !skillIds.has(e.learnSkill.skill)) bad.push(`книга ${b.id}: навык ${e.learnSkill.skill}`);
  }
  for (const i of items) (i.recipe?.needs || []).forEach(n => { if (!hasItem(n.id)) bad.push(`рецепт ${i.id}: ${n.id}`); });
  for (const u of units) (u.skills || []).forEach(sk => { if (!skillIds.has(sk)) bad.push(`юнит ${u.id}: навык ${sk}`); });
  for (const q of quests) {
    [q.startIf, q.doneIf, ...(q.stages || []).map(s => s.doneIf)].forEach(c => {
      condItems(c).forEach(i => { if (!hasItem(i)) bad.push(`квест ${q.id}: предмет ${i}`); });
      condCompanions(c).forEach(u => { if (!unitIds.has(u)) bad.push(`квест ${q.id}: спутник ${u}`); });
    });
    (q.links || []).forEach(l => { if (!quests.some(x => x.id === l)) bad.push(`квест ${q.id}: ссылка ${l}`); });
  }
  assert.deepEqual(bad, []);
});

/** Динамические флаги: их ставит код по шаблону. */
const DYNAMIC = [
  /^book_.+_(read|collected|fx)$/,
  /^.+_visited$/,
  /^cnt_/,
  /^enc_.+_done$/,
  /^dead_/,
  /^surrendered_/,
  /^brawler_/,
  /^trait_/,
];

/** Строковые флаги, которые ставит или читает код: reg.set('x'), setFlag('x'). */
function flagsFromCode() {
  const out = new Set();
  const walk = dir => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== 'data') walk(p); continue; }
      if (!e.name.endsWith('.js')) continue;
      const src = fs.readFileSync(p, 'utf8');
      for (const m of src.matchAll(/(?:\.set|setFlag)\(\s*['"`]([a-z0-9_]+)['"`]/gi)) out.add(m[1]);
    }
  };
  walk(path.join(root, 'src'));
  return out;
}

function flagsSet() {
  const set = flagsFromCode();
  forEachDialogueBit(({ effects }) => {
    if (!effects) return;
    arr(effects.setFlag).forEach(f => set.add(f));
    arr(effects.finishEncounter).forEach(id => set.add(`enc_${id}_done`));
  });
  battles.forEach(b => { if (b.victoryFlag) set.add(b.victoryFlag); });
  books.forEach(b => { [b.collectFlag, b.readFlag].filter(Boolean).forEach(f => set.add(f)); });
  items.forEach(i => { arr(i.setFlag).forEach(f => set.add(f)); });
  for (const m of Object.values(maps)) {
    (m.onEnter || []).forEach(e => { if (e.once) set.add(e.once); });
    (m.inspectables || []).forEach(i => { if (i.collectFlag) set.add(i.collectFlag); arr(i.setFlag).forEach(f => set.add(f)); });
    (m.bookPickups || []).forEach(b => { if (b.theftFlag) set.add(b.theftFlag); });
    (m.encounters || []).forEach(e => { if (e.triggerFlag) set.add(e.triggerFlag); });
  }
  return set;
}

function flagsRead() {
  const read = new Map();
  const add = (f, where) => { if (!read.has(f)) read.set(f, where); };
  forEachDialogueBit(({ where, cond }) => condFlags(cond).forEach(f => add(f, where)));
  for (const q of quests) {
    const where = `квест ${q.id}`;
    [q.startIf, q.doneIf, ...(q.stages || []).map(s => s.doneIf)].forEach(c => condFlags(c).forEach(f => add(f, where)));
    (q.outcomes || []).forEach(o => add(o.flag, where));
  }
  for (const [mid, m] of Object.entries(maps)) {
    mapConds(m).forEach(c => condFlags(c).forEach(f => add(f, mid)));
    (m.npcs || []).forEach(n => {
      [n.showIfFlag, n.hideIfFlag, n.altRoot?.requiresFlag].filter(Boolean).forEach(f => add(f, `${mid}/${n.id}`));
      // Старые диалоги прямо в maps.json: requiresFlag, setFlag живут там же
    });
    (m.exits || []).forEach(e => [e.requiresFlag, e.lockedIfFlag].filter(Boolean).forEach(f => add(f, mid)));
    (m.bookPickups || []).forEach(b => { if (b.allowedFlag) add(b.allowedFlag, mid); });
  }
  for (const s of shops) (s.discountIf || []).forEach(d => condFlags(d).forEach(f => add(f, `лавка ${s.id}`)));
  return read;
}

test('каждый читаемый флаг кто-то ставит', () => {
  const set = flagsSet();
  const inlineSet = new Set();
  for (const m of Object.values(maps)) {
    (m.npcs || []).forEach(n => {
      JSON.stringify(n.dialogues || []).replace(/"setFlag":"([a-z0-9_]+)"/g, (_, f) => { inlineSet.add(f); return _; });
    });
  }
  const bad = [];
  for (const [f, where] of flagsRead()) {
    if (set.has(f) || inlineSet.has(f) || DYNAMIC.some(r => r.test(f))) continue;
    bad.push(`${f} (читает ${where})`);
  }
  assert.deepEqual(bad, []);
});

test('Д26: у каждой сделки с Корвином есть исход в лагере и срок', () => {
  const debt = dialogues.korvin.nodes.debt;
  const deals = ['bandit_deal_altar', 'bandit_deal_cloaks', 'bandit_deal_vorn', 'bandit_deal_legitimize'];
  const answers = deals.map(d => debt.choices.find(c => c.showIf?.flag === d));
  assert.ok(answers.every(Boolean), 'ответ на каждую сделку');
  answers.forEach(c => {
    assert.ok(c.requires, 'ответ только после выполнения');
    assert.ok(arr(dialogues.korvin.nodes[c.next].effects?.setFlag).includes('korvin_debt_paid'));
  });
  const npc = maps.forest_camp.npcs.find(n => n.dialogueStart === 'debt');
  assert.ok(npc?.showIf, 'Корвин ждёт в лагере');
  const once = maps.forest1.onEnter.map(e => e.once);
  assert.equal(once.at(-1), 'korvin_debt_overdue');
  assert.equal(new Set(once).size, once.length, 'каждая ступень срока срабатывает один раз');
});
