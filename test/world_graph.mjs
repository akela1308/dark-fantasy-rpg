// Проверка графа мира: все 59 локаций, симметричные выходы, всё достижимо с south_post,
// ровно два тупика (forest_altar, north_frontier). Запуск: node test/world_graph.mjs
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

export const EXPECTED_DEAD_ENDS = ['forest_altar', 'north_frontier'];

export function checkWorld(maps) {
  const errors = [];
  const ids = Object.keys(maps);
  const neighbors = id => {
    const m = maps[id];
    const list = (m.exits || []).map(e => ({ to: e.toMap, spawn: e.spawnId, zone: e.zone }));
    if (m.tavernEntry?.toMap) list.push({ to: m.tavernEntry.toMap, spawn: m.tavernEntry.spawnId, zone: m.tavernEntry.zone });
    return list;
  };
  const inZone = (p, z) => p.x >= z.x && p.x <= z.x + z.w && p.y >= z.y && p.y <= z.y + z.h;

  for (const id of ids) {
    const m = maps[id];
    if (!m.spawnPoints?.default) errors.push(`${id}: нет точки default`);
    for (const ex of neighbors(id)) {
      const t = maps[ex.to];
      if (!t) { errors.push(`${id} -> ${ex.to}: такой карты нет`); continue; }
      if (!t.spawnPoints?.[ex.spawn]) errors.push(`${id} -> ${ex.to}: нет точки ${ex.spawn}`);
      if (!neighbors(ex.to).some(b => b.to === id)) errors.push(`${id} -> ${ex.to}: нет выхода обратно`);
      // точка появления не должна стоять в зоне выхода (иначе сразу уйдёт обратно)
      const sp = t.spawnPoints?.[ex.spawn];
      if (sp && neighbors(ex.to).some(b => inZone(sp, b.zone))) errors.push(`${ex.to}.${ex.spawn}: точка стоит в зоне выхода`);
    }
  }

  const seen = new Set(['south_post']);
  const queue = ['south_post'];
  while (queue.length) {
    const c = queue.shift();
    for (const ex of neighbors(c)) if (maps[ex.to] && !seen.has(ex.to)) { seen.add(ex.to); queue.push(ex.to); }
  }
  ids.filter(id => !seen.has(id)).forEach(id => errors.push(`${id}: недостижима с south_post`));

  const outdoor = id => (maps[id].kind || 'outdoor') === 'outdoor';
  const dead = ids.filter(id => outdoor(id) && new Set(neighbors(id).map(n => n.to)).size === 1).sort();
  if (JSON.stringify(dead) !== JSON.stringify([...EXPECTED_DEAD_ENDS].sort())) {
    errors.push(`тупики: ${dead.join(', ')} (ждали ${EXPECTED_DEAD_ENDS.join(', ')})`);
  }
  return { count: ids.length, reachable: seen.size, deadEnds: dead, errors };
}

export function loadMaps() {
  return JSON.parse(fs.readFileSync(new URL('../src/data/maps.json', import.meta.url), 'utf8'));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const r = checkWorld(loadMaps());
  console.log(`карт ${r.count}, достижимо ${r.reachable}, тупики: ${r.deadEnds.join(', ')}`);
  r.errors.forEach(e => console.log('  ОШИБКА', e));
  process.exit(r.errors.length || r.count !== 59 ? 1 : 0);
}
