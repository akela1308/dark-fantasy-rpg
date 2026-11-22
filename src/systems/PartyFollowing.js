import { findPath } from './Pathfinding.js';

const START_SLACK = 8;
const ARRIVAL_EPSILON = 0.01;
const RETRY_DISTANCE = 12;

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// Обрезаем последние gap пикселей пути, чтобы остановиться позади предыдущего спутника.
function trimAfterGap(from, points, gap, slack) {
  let remaining = -gap;
  let previous = from;
  for (const point of points) {
    remaining += distance(previous, point);
    previous = point;
  }
  if (remaining <= slack) return [];

  const route = [];
  previous = from;
  for (const point of points) {
    const length = distance(previous, point);
    if (length >= remaining) {
      const t = remaining / length;
      route.push({ x: previous.x + (point.x - previous.x) * t, y: previous.y + (point.y - previous.y) * t });
      break;
    }
    route.push(point);
    remaining -= length;
    previous = point;
  }
  return route;
}

export class PartyFollowing {
  constructor(walkable, gap) {
    this.walkable = walkable;
    this.gap = gap;
    this.commands = new WeakMap();
    this.blockedAttempts = new WeakMap();
  }

  follow(unit, leader) {
    const command = this.commands.get(unit);
    const pending = unit._path?.length || Math.hypot(unit.x - unit.targetX, unit.y - unit.targetY) > ARRIVAL_EPSILON;
    // Путь после разведения или иной команды и уже начатый обход идут до конца.
    if (pending && (!command || command.path !== unit._path || command.detour)) return;

    const slack = unit.moving ? ARRIVAL_EPSILON : START_SLACK;
    if (this.walkable.lineClear(unit.x, unit.y, leader.x, leader.y, 4)) {
      this.blockedAttempts.delete(unit);
      const length = distance(unit, leader);
      if (length - this.gap > slack) {
        const t = (length - this.gap) / length;
        this.#assign(unit, [{ x: unit.x + (leader.x - unit.x) * t, y: unit.y + (leader.y - unit.y) * t }], false);
      } else if (pending) {
        this.#assign(unit, [{ x: unit.x, y: unit.y }], false);
      }
      return;
    }

    // Не пересчитываем A* каждый кадр у неподвижной стены или непроходимого зазора.
    const attempt = this.blockedAttempts.get(unit);
    if (attempt && attempt.cells === this.walkable.cells
      && distance(attempt.from, unit) < RETRY_DISTANCE && distance(attempt.to, leader) < RETRY_DISTANCE) return;

    const path = findPath(this.walkable, unit.x, unit.y, leader.x, leader.y, { maxSnap: 0 });
    const route = path ? trimAfterGap(unit, path.points, this.gap, slack) : [];
    this.blockedAttempts.set(unit, {
      cells: this.walkable.cells,
      from: { x: unit.x, y: unit.y },
      to: { x: leader.x, y: leader.y },
    });
    if (route.length) this.#assign(unit, route, true);
  }

  #assign(unit, route, detour) {
    unit.followPath(route);
    this.commands.set(unit, { path: unit._path, detour });
  }
}
