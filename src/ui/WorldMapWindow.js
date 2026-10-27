/**
 * «Карта» (этап 6): схема мест, где отряд уже был, по графу выходов maps.json.
 * Места раскладываются по сторонам выходов (выход вправо ставит соседа правее), двери и спуски ниже.
 * Соседние места, где ещё не были, показаны тёмными нишами с «?».
 */
import { Frame } from './Frame.js';
import { COLOR, HEX, FONT } from './Theme.js';
import { MAP_W, MAP_H } from '../systems/WalkableZones.js';

const VEC = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };

function exitDir(z) {
  if (z.x <= 6) return 'left';
  if (z.x + z.w >= MAP_W - 6) return 'right';
  if (z.y <= 6) return 'up';
  if (z.y + z.h >= MAP_H - 6) return 'down';
  return null;
}

/** Раскладка: { key: [col, row] } для посещённых и их соседей. */
export function layoutWorld(maps, visited, start) {
  const pos = { [start]: [0, 0] };
  const taken = new Set(['0,0']);
  const free = (c, r) => !taken.has(`${c},${r}`);
  const place = (key, c, r) => {
    for (let ring = 0; ring < 6; ring++) {
      for (let dc = -ring; dc <= ring; dc++) for (let dr = -ring; dr <= ring; dr++) {
        if (Math.max(Math.abs(dc), Math.abs(dr)) !== ring) continue;
        if (free(c + dc, r + dr)) { pos[key] = [c + dc, r + dr]; taken.add(`${c + dc},${r + dr}`); return; }
      }
    }
  };
  const queue = [start];
  const edges = [];
  while (queue.length) {
    const a = queue.shift();
    if (!visited.has(a)) continue;   // от непосещённых дальше не идём
    const cfg = maps[a] || {};
    const exits = [...(cfg.exits || []), ...(cfg.tavernEntry ? [cfg.tavernEntry] : [])];
    exits.forEach(e => {
      const b = e.toMap;
      if (!maps[b]) return;
      edges.push([a, b]);
      if (pos[b]) return;
      const d = e.dir || exitDir(e.zone) || 'down';
      const [dc, dr] = VEC[d];
      place(b, pos[a][0] + dc, pos[a][1] + dr);
      queue.push(b);
    });
  }
  return { pos, edges };
}

export function openWorldMap(scene, { maps, visited, current, start }) {
  const f = new Frame(scene, { w: 1040, h: 600, title: 'Карта', y: 340, backdropDepth: 7990 });
  const { pos, edges } = layoutWorld(maps, visited, start);
  const keys = Object.keys(pos);
  const cs = keys.map(k => pos[k][0]), rs = keys.map(k => pos[k][1]);
  const c0 = Math.min(...cs), c1 = Math.max(...cs), r0 = Math.min(...rs), r1 = Math.max(...rs);
  const { x, y, w, h } = f.inner;
  const NW = 138, NH = 36;
  const stepX = Math.min(170, (w - NW) / Math.max(1, c1 - c0));
  const stepY = Math.min(70, (h - 30 - NH) / Math.max(1, r1 - r0));
  const ox = x + w / 2 - ((c1 - c0) * stepX) / 2, oy = y + (h - 24) / 2 - ((r1 - r0) * stepY) / 2;
  const at = k => [ox + (pos[k][0] - c0) * stepX, oy + (pos[k][1] - r0) * stepY];
  const s = f.s;
  const g = f.add(scene.add.graphics());
  const seen = new Set();
  edges.forEach(([a, b]) => {
    const id = [a, b].sort().join('|');
    if (seen.has(id) || !pos[a] || !pos[b]) return;
    seen.add(id);
    const [ax, ay] = at(a), [bx, by] = at(b);
    const known = visited.has(a) && visited.has(b);
    g.lineStyle(s(known ? 2 : 1), HEX.gold, known ? 0.55 : 0.2).lineBetween(s(ax), s(ay), s(bx), s(by));
  });
  keys.forEach(k => {
    const [nx, ny] = at(k);
    const been = visited.has(k);
    const here = k === current;
    const bw = been ? NW : 54;
    const box = f.add(scene.add.rectangle(s(nx), s(ny), s(bw), s(NH), here ? 0x2a2114 : 0x15110c, been ? 0.95 : 0.7)
      .setStrokeStyle(s(here ? 2 : 1), here ? HEX.gold : HEX.bronze, been ? 1 : 0.5), 6);
    const name = been ? (maps[k].name || k) : '?';
    const t = f.add(scene.add.text(s(nx), s(ny), name, {
      fontFamily: FONT, fontSize: `${s(12)}px`, color: here ? COLOR.goldHi : been ? COLOR.text : COLOR.dim,
      align: 'center', wordWrap: { width: s(NW - 10), useAdvancedWrap: true }, stroke: '#000', strokeThickness: s(1.5),
    }).setOrigin(0.5), 7);
    if (t.height * (scene.cameras.main.zoom || 1) > NH - 4) t.setFontSize(s(11));
    box.setDepth(t.depth - 1);
  });
  f.text(x + w / 2, y + h - 14, 'Золотая рамка: вы здесь. «?»: место рядом, где отряд ещё не был.', 'small').setOrigin(0.5, 0);
  return f;
}
