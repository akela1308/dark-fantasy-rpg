/**
 * Pathfinding: A* по сетке ходьбы (WalkableZones), 8 направлений, без срезания углов.
 * Путь сглаживается: лишние точки выкидываются, пока прямая между соседними остаётся на проходимых клетках,
 * так что герой идёт ровными отрезками, а не «лесенкой» по клеткам.
 */
import { CELL } from './WalkableZones.js';

// Клик дальше этого от любой достижимой клетки считается кликом «в никуда» (небо, лес, крыша): герой стоит
export const MAX_SNAP = 120;
// Сглаженный путь держится хотя бы на столько px от закрытых клеток (меньше половины клетки)
const SMOOTH_MARGIN = 6;

/**
 * Путь от (sx, sy) к (tx, ty).
 * Возвращает { points: [{x,y}, ...] без стартовой точки, snapped: цель сдвинута к ближайшей достижимой клетке }
 * или null, если идти некуда.
 */
export function findPath(walk, sx, sy, tx, ty, { maxSnap = MAX_SNAP } = {}) {
  let start = walk.cellOf(sx, sy);
  if (!walk.open(start)) start = walk.nearestCell(sx, sy);
  if (start < 0) return null;
  const comp = walk.comp[start];

  // Цель: та же клетка, если она проходима и в той же области, иначе ближайшая достижимая
  let goal = walk.cellOf(tx, ty);
  let end = { x: tx, y: ty };
  let snapped = false;
  if (!walk.open(goal) || walk.comp[goal] !== comp) {
    goal = walk.nearestCell(tx, ty, comp);
    if (goal < 0) return null;
    end = walk.center(goal);
    if (Math.hypot(end.x - tx, end.y - ty) > maxSnap) return null;
    snapped = true;
  }
  if (goal === start) return { points: [end], snapped };

  const cells = astar(walk, start, goal);
  if (!cells) return null;
  // Старт и финиш точные, промежуточные точки в центрах клеток
  const raw = [{ x: sx, y: sy }, ...cells.slice(1, -1).map(i => walk.center(i)), end];
  return { points: smooth(walk, raw).slice(1), snapped };
}

function astar(walk, start, goal) {
  const n = walk.cells.length;
  const g = new Float32Array(n).fill(Infinity);
  const from = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const gp = walk.center(goal);
  // Октильная эвристика в клетках
  const h = i => {
    const p = walk.center(i);
    const dx = Math.abs(p.x - gp.x) / CELL, dy = Math.abs(p.y - gp.y) / CELL;
    return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
  };
  const heap = new MinHeap();
  g[start] = 0;
  heap.push(start, h(start));
  while (heap.size) {
    const cur = heap.pop();
    if (cur === goal) break;
    if (closed[cur]) continue;
    closed[cur] = 1;
    walk.neighbors(cur, (nb, cost) => {
      if (closed[nb]) return;
      const ng = g[cur] + cost;
      if (ng < g[nb]) { g[nb] = ng; from[nb] = cur; heap.push(nb, ng + h(nb)); }
    });
  }
  if (from[goal] < 0) return null;
  const path = [goal];
  for (let i = goal; i !== start; i = from[i]) path.push(from[i]);
  return path.reverse();
}

// Тянем нить: от текущей точки берём самую дальнюю, до которой видно по прямой
function smooth(walk, pts) {
  if (pts.length <= 2) return pts;
  const out = [pts[0]];
  let i = 0;
  while (i < pts.length - 1) {
    let j = pts.length - 1;
    while (j > i + 1 && !walk.lineClear(pts[i].x, pts[i].y, pts[j].x, pts[j].y, SMOOTH_MARGIN)) j--;
    out.push(pts[j]);
    i = j;
  }
  return out;
}

class MinHeap {
  constructor() { this.k = []; this.v = []; }
  get size() { return this.k.length; }
  push(key, pri) {
    const k = this.k, v = this.v;
    k.push(key); v.push(pri);
    let i = k.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (v[p] <= v[i]) break;
      [k[p], k[i]] = [k[i], k[p]]; [v[p], v[i]] = [v[i], v[p]];
      i = p;
    }
  }
  pop() {
    const k = this.k, v = this.v;
    const top = k[0];
    const lk = k.pop(), lv = v.pop();
    if (k.length) {
      k[0] = lk; v[0] = lv;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < k.length && v[l] < v[m]) m = l;
        if (r < k.length && v[r] < v[m]) m = r;
        if (m === i) break;
        [k[m], k[i]] = [k[i], k[m]]; [v[m], v[i]] = [v[i], v[m]];
        i = m;
      }
    }
    return top;
  }
}
