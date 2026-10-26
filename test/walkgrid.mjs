// Проверка сеток ходьбы: спавны стоят на проходимых клетках, у каждого выхода есть проходимая клетка,
// и все спавны и выходы карты достижимы друг из друга (одна связная область).
import fs from 'node:fs';
import { WalkableZones, CELL } from '../src/systems/WalkableZones.js';

const read = p => JSON.parse(fs.readFileSync(new URL(p, import.meta.url)));

export function loadWalkData() {
  return { maps: read('../src/data/maps.json'), grids: read('../src/data/walkgrid.json') };
}

/** Клетки внутри прямоугольника выхода, где может стоять герой. */
function exitCells(w, z) {
  const out = [];
  for (let y = Math.floor(z.y / CELL) * CELL + CELL / 2; y <= z.y + z.h; y += CELL) {
    for (let x = Math.floor(z.x / CELL) * CELL + CELL / 2; x <= z.x + z.w; x += CELL) {
      if (x >= z.x && y >= z.y && w.isWalkable(x, y)) out.push(w.cellOf(x, y));
    }
  }
  return out;
}

export function checkMap(key, cfg, grid) {
  const w = new WalkableZones(key, cfg.walk, grid);
  const errors = [];
  const spawns = Object.entries(cfg.spawnPoints || {});
  const bad = spawns.filter(([, p]) => !w.isWalkable(p.x, p.y));
  bad.forEach(([id, p]) => errors.push(`спавн ${id} (${p.x},${p.y}) на непроходимой клетке`));
  // Главная область: где стоит спавн default (или первый проходимый)
  const ok = spawns.filter(([, p]) => w.isWalkable(p.x, p.y));
  const ref = ok.find(([id]) => id === 'default') ?? ok[0];
  if (!ref) return errors;
  const main = w.comp[w.cellOf(ref[1].x, ref[1].y)];
  ok.forEach(([id, p]) => { if (w.comp[w.cellOf(p.x, p.y)] !== main) errors.push(`спавн ${id} не связан со спавном ${ref[0]}`); });
  const exits = [...(cfg.exits || []), ...(cfg.tavernEntry ? [cfg.tavernEntry] : [])];
  for (const e of exits) {
    const cells = exitCells(w, e.zone);
    if (!cells.length) errors.push(`выход → ${e.toMap} без проходимых клеток`);
    else if (!cells.some(i => w.comp[i] === main)) errors.push(`выход → ${e.toMap} недостижим от спавна ${ref[0]}`);
  }
  return errors;
}

export function checkAll({ maps, grids }) {
  const result = {};
  for (const [key, cfg] of Object.entries(maps)) result[key] = { hand: !!grids[key], errors: checkMap(key, cfg, grids[key]) };
  return result;
}
