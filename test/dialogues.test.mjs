// Целостность диалогов: все переходы ведут в существующие узлы, бои и рекруты существуют,
// длинного тире нет, у каждой карты с NPC-диалогом есть такой файл.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const dir = new URL('../src/data/dialogues/', import.meta.url);
const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
const D = Object.fromEntries(files.map(f => { const d = JSON.parse(fs.readFileSync(new URL(f, dir), 'utf8')); return [d.id, d]; }));
const battles = new Set(JSON.parse(fs.readFileSync(new URL('../src/data/battles.json', import.meta.url), 'utf8')).map(b => b.id));
const units = new Set(JSON.parse(fs.readFileSync(new URL('../src/data/units.json', import.meta.url), 'utf8')).map(u => u.id));
const maps = JSON.parse(fs.readFileSync(new URL('../src/data/maps.json', import.meta.url), 'utf8'));

test('переходы, бои и рекруты в диалогах существуют', () => {
  const bad = [];
  for (const [id, d] of Object.entries(D)) {
    const has = n => !!d.nodes[n];
    (d.start || []).forEach(s => { if (!has(s.node)) bad.push(`${id}: start -> ${s.node}`); });
    for (const [nid, n] of Object.entries(d.nodes)) {
      if (n.next && !has(n.next)) bad.push(`${id}.${nid}: next ${n.next}`);
      (n.goto || []).forEach(g => { if (!has(g.node)) bad.push(`${id}.${nid}: goto ${g.node}`); });
      const effs = [n.effects, ...(n.choices || []).map(c => c.effects)].filter(Boolean);
      effs.forEach(e => [].concat(e.recruit || []).forEach(r => { if (!units.has(r)) bad.push(`${id}.${nid}: recruit ${r}`); }));
      (n.choices || []).forEach(c => {
        if (c.next && !has(c.next)) bad.push(`${id}.${nid}: choice next ${c.next}`);
        if (c.startBattle) {
          if (!battles.has(c.startBattle.battleId)) bad.push(`${id}.${nid}: бой ${c.startBattle.battleId}`);
          if (c.startBattle.onWin && !has(c.startBattle.onWin)) bad.push(`${id}.${nid}: onWin ${c.startBattle.onWin}`);
        }
        if (c.transition && !maps[c.transition.map]) bad.push(`${id}.${nid}: карта ${c.transition.map}`);
      });
    }
  }
  assert.deepEqual(bad, []);
});

test('NPC на картах ссылаются на существующие диалоги и узлы', () => {
  const bad = [];
  for (const [mid, m] of Object.entries(maps)) {
    (m.npcs || []).forEach(n => {
      if (!n.dialogue) return;
      if (!D[n.dialogue]) bad.push(`${mid}/${n.name}: нет диалога ${n.dialogue}`);
      else if (n.dialogueStart && !D[n.dialogue].nodes[n.dialogueStart]) bad.push(`${mid}/${n.name}: нет узла ${n.dialogueStart}`);
    });
    (m.encounters || []).forEach(e => { if (!battles.has(e.battleId)) bad.push(`${mid}: встреча ${e.id} без боя ${e.battleId}`); });
  }
  assert.deepEqual(bad, []);
});

test('в текстах данных нет длинного тире', () => {
  const dataDir = new URL('../src/data/', import.meta.url);
  const all = [...fs.readdirSync(dataDir).filter(f => f.endsWith('.json')).map(f => new URL(f, dataDir)), ...files.map(f => new URL(f, dir))];
  const bad = all.filter(u => fs.readFileSync(u, 'utf8').includes(String.fromCharCode(0x2014))).map(u => u.pathname.split('/').pop());
  assert.deepEqual(bad, []);
});
