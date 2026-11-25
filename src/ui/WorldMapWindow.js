/**
 * «Карта» (этап 6): схема мест, где отряд уже был, по графу выходов maps.json.
 * Места раскладываются по сторонам выходов (выход вправо ставит соседа правее), двери и спуски ниже.
 * Соседние места, где ещё не были, показаны тёмными нишами с «?».
 */
import { Frame } from './Frame.js';
import { plate } from './Plate.js';
import { COLOR, HEX, FONT } from './Theme.js';
import { MAP_W, MAP_H } from '../systems/WalkableZones.js';
import { checkRequires } from '../systems/DialogueConditions.js';

const VEC = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };

function exitDir(z) {
  if (z.x <= 6) return 'left';
  if (z.x + z.w >= MAP_W - 6) return 'right';
  if (z.y <= 6) return 'up';
  if (z.y + z.h >= MAP_H - 6) return 'down';
  return null;
}

/** Раскладка: { key: [col, row] } для посещённых и их соседей. */
export function layoutWorld(maps, visited, start, current = start) {
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
  while (queue.length || (maps[current] && !pos[current])) {
    // Старое сохранение может не содержать посещённой цепочки до текущего места.
    if (!queue.length) {
      place(current, Math.max(...Object.values(pos).map(([col]) => col)) + 1, 0);
      queue.push(current);
    }
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

const STANDARD = { width: 216, minHeight: 84, inset: 24, nameSize: 18, statusSize: 16 };
const COMPACT = { width: 166, minHeight: 64, inset: 16, nameSize: 16, statusSize: 14 };
const UNKNOWN_WIDTH = 62;
const TILE_GAP_X = 16;
const TILE_GAP_Y = 14;
const VIEW_PADDING = 8;
const STATUS_GAP = 3;
const PAN_STEP = 64;

function columnsFor(pos, visited, tileWidth) {
  const widths = new Map();
  for (const [key, [col]] of Object.entries(pos)) {
    widths.set(col, Math.max(widths.get(col) || 0, visited.has(key) ? tileWidth : UNKNOWN_WIDTH));
  }
  const centers = new Map();
  let left = VIEW_PADDING;
  for (const col of [...widths.keys()].sort((a, b) => a - b)) {
    centers.set(col, left + widths.get(col) / 2);
    left += widths.get(col) + TILE_GAP_X;
  }
  return { centers, width: left - TILE_GAP_X + VIEW_PADDING };
}

function panBounds(viewStart, viewSize, graphSize) {
  const middle = viewStart + (viewSize - graphSize) / 2;
  const min = Math.min(middle, viewStart + viewSize - graphSize);
  const max = Math.max(middle, viewStart);
  return { min, max, clamp: offset => Math.max(min, Math.min(max, offset)) };
}

function bindMapPan(scene, f, view, getOffset, moveTo) {
  const input = scene.input;
  const keyboard = input.keyboard;
  const s = f.s;
  const zone = f.add(scene.add.zone(s(view.x + view.w / 2), s(view.y + view.h / 2), s(view.w), s(view.h))
    .setInteractive({ cursor: 'grab' }), 8);
  let drag = null;
  const start = pointer => {
    if (drag || pointer.rightButtonDown()) return;
    drag = { pointer, x: pointer.x, y: pointer.y, offset: getOffset() };
  };
  const move = pointer => {
    if (pointer !== drag?.pointer || !pointer.isDown) return;
    moveTo(drag.offset.x + pointer.x - drag.x, drag.offset.y + pointer.y - drag.y);
  };
  const end = pointer => {
    if (pointer === drag?.pointer) drag = null;
  };
  const directions = { ArrowLeft: VEC.left, ArrowRight: VEC.right, ArrowUp: VEC.up, ArrowDown: VEC.down };
  const keydown = event => {
    const direction = directions[event.key];
    if (!direction || event.altKey || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    const offset = getOffset();
    moveTo(offset.x - direction[0] * PAN_STEP, offset.y - direction[1] * PAN_STEP);
  };
  zone.on('pointerdown', start);
  input.on('pointermove', move);
  input.on('pointerup', end);
  input.on('pointerupoutside', end);
  keyboard?.on('keydown', keydown);
  return () => {
    drag = null;
    input.off('pointermove', move);
    input.off('pointerup', end);
    input.off('pointerupoutside', end);
    keyboard?.off('keydown', keydown);
  };
}

export function openWorldMap(scene, { maps, visited, current, start, ws }) {
  let cleanup;
  const f = new Frame(scene, {
    w: 1040, h: 600, title: 'Карта', y: 340, backdropDepth: 7990,
    onClose: () => cleanup?.(),
  });
  const { pos, edges } = layoutWorld(maps, visited, start, current);
  const keys = Object.keys(pos);
  const rows = keys.map(k => pos[k][1]);
  const firstRow = Math.min(...rows), lastRow = Math.max(...rows);
  const { x, y, w, h } = f.inner;
  const graphHeight = tileHeight => (lastRow - firstRow) * (tileHeight + TILE_GAP_Y) + tileHeight + 2 * VIEW_PADDING;
  let sizing = STANDARD;
  let columns = columnsFor(pos, visited, sizing.width);
  if (columns.width > w || graphHeight(sizing.minHeight) > h - 24) {
    const compactColumns = columnsFor(pos, visited, COMPACT.width);
    if (compactColumns.width <= w && graphHeight(COMPACT.minHeight) <= h - 24) {
      sizing = COMPACT;
      columns = compactColumns;
    }
  }
  const s = f.s;
  const zoom = 1 / s(1);
  const graph = [];
  const add = (obj, depth) => {
    graph.push(f.add(obj, depth));
    return obj;
  };
  const lines = add(scene.add.graphics(), 5);
  const tileText = (str, size, color) => add(scene.add.text(0, 0, str, {
    fontFamily: FONT, fontSize: `${Math.round(s(size))}px`, color,
    align: 'center', wordWrap: { width: s(sizing.width - 2 * sizing.inset), useAdvancedWrap: true },
    stroke: '#000', strokeThickness: s(1.5), lineSpacing: s(2),
  }).setOrigin(0.5, 0), 7);

  // Сначала измеряем переносы. Шаг строк зависит от самой высокой плашки.
  const nodes = keys.map(key => {
    const been = visited.has(key);
    const here = key === current;
    const name = tileText(been ? (maps[key].name || key) : '?', sizing.nameSize, here ? COLOR.goldHi : been ? COLOR.text : COLOR.dim);
    const result = been && maps[key].worldMapStatus?.find(({ showIf }) => checkRequires(showIf, ws).ok);
    const status = result ? tileText(result.text, sizing.statusSize, COLOR.bone) : null;
    const textHeight = (name.height + (status?.height || 0)) * zoom + (status ? STATUS_GAP : 0);
    return { key, been, here, name, status, textHeight };
  });

  const tileHeight = Math.max(sizing.minHeight, ...nodes.map(node => Math.ceil(node.textHeight + 20)));
  const stepY = tileHeight + TILE_GAP_Y;
  const graphW = columns.width;
  const graphH = graphHeight(tileHeight);
  const at = key => [
    columns.centers.get(pos[key][0]),
    VIEW_PADDING + tileHeight / 2 + (pos[key][1] - firstRow) * stepY,
  ];
  const overflow = graphW > w || graphH > h - 24;
  const view = { x, y, w, h: h - (overflow ? 44 : 24) };
  const boundsX = panBounds(x, w, graphW);
  const boundsY = panBounds(y, view.h, graphH);

  const seen = new Set();
  for (const [a, b] of edges) {
    const id = [a, b].sort().join('|');
    if (seen.has(id) || !pos[a] || !pos[b]) continue;
    seen.add(id);
    const [ax, ay] = at(a);
    const [bx, by] = at(b);
    const known = visited.has(a) && visited.has(b);
    lines.lineStyle(s(known ? 2 : 1), HEX.gold, known ? 0.55 : 0.2)
      .lineBetween(s(ax), s(ay), s(bx), s(by));
  }
  for (const { key, been, here, name, status, textHeight } of nodes) {
    const [nx, ny] = at(key);
    const box = add(plate(scene, here ? 'button' : 'label', s(nx), s(ny),
      s(been ? sizing.width : UNKNOWN_WIDTH), s(tileHeight)).setAlpha(been ? 1 : 0.6), 6);
    if (here) box.setTint?.(0xffe2b0);
    const top = s(ny - textHeight / 2);
    name.setPosition(s(nx), top);
    status?.setPosition(s(nx), top + name.height + s(STATUS_GAP));
  }

  const positions = graph.map(obj => ({ obj, x: obj.x, y: obj.y }));
  let offset;
  const moveTo = (x, y) => {
    offset = { x: boundsX.clamp(x), y: boundsY.clamp(y) };
    for (const entry of positions) {
      entry.obj.setPosition(entry.x + s(offset.x), entry.y + s(offset.y));
    }
  };
  const [focusX, focusY] = at(pos[current] ? current : start);
  moveTo(view.x + view.w / 2 - focusX, view.y + view.h / 2 - focusY);

  if (overflow) {
    const shape = f.add(scene.add.graphics().setVisible(false));
    shape.fillStyle(0xffffff).fillRect(s(view.x), s(view.y), s(view.w), s(view.h));
    const mask = shape.createGeometryMask();
    graph.forEach(obj => obj.setMask(mask));
    const unbind = bindMapPan(scene, f, view, () => offset, moveTo);
    cleanup = () => {
      unbind();
      mask.destroy();
      scene.events.off('shutdown', cleanup);
    };
    scene.events.once('shutdown', cleanup);
    f.text(x + w / 2, y + h - 34, 'Перетащите карту или используйте стрелки', 'small').setOrigin(0.5, 0);
  }
  f.text(x + w / 2, y + h - 14, 'Золотая рамка: вы здесь. «?»: место рядом, где отряд ещё не был.', 'small').setOrigin(0.5, 0);
  return f;
}
