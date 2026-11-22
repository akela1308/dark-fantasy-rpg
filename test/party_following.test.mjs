import { test } from 'node:test';
import assert from 'node:assert/strict';
import { advanceMapMovement } from '../src/systems/MapMovement.js';
import { PartyFollowing } from '../src/systems/PartyFollowing.js';
import { WalkableZones } from '../src/systems/WalkableZones.js';

const gap = 55;
const walkable = () => new WalkableZones('test', [{ x: 0, y: 0, w: 1400, h: 300 }]);
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function unit(x, y) {
  return {
    sprite: { x, y }, targetX: x, targetY: y, moving: false,
    get x() { return this.sprite.x; },
    get y() { return this.sprite.y; },
    followPath(points) {
      this._path = points.slice(1);
      this.targetX = points[0].x;
      this.targetY = points[0].y;
    },
    tick() { this.moving = advanceMapMovement(this, 130 / 60).travelled > 0.001; },
  };
}

test('Спутники идут строем по фактическому расстоянию и собираются после остановки', () => {
  const system = new PartyFollowing(walkable(), gap);
  const group = [unit(290, 150), unit(200, 150), unit(120, 150), unit(40, 150)];
  const hero = group[0];
  hero.followPath([{ x: 940, y: 150 }]);
  for (let frame = 0; frame < 380; frame++) {
    hero.tick();
    for (let i = 1; i < group.length; i++) system.follow(group[i], group[i - 1]);
    for (const follower of group.slice(1)) {
      const x = follower.x;
      follower.tick();
      assert.ok(follower.x - x <= 130 / 60 + 0.001, 'скорость шага');
    }
    if (frame === 270) assert.ok(distance(hero, group[1]) < 95, 'интервал на ходу');
  }
  for (let i = 1; i < group.length; i++) {
    assert.ok(distance(group[i], group[i - 1]) >= gap - 0.01);
    assert.ok(distance(group[i], group[i - 1]) <= gap + 8);
    assert.equal(group[i].moving, false);
  }
});

test('Спутник догоняет стоящего героя с расстояния больше 400 px', () => {
  const system = new PartyFollowing(walkable(), gap);
  const hero = unit(560, 150);
  const follower = unit(110, 150);
  for (let frame = 0; frame < 250; frame++) {
    system.follow(follower, hero);
    follower.tick();
  }
  assert.ok(distance(hero, follower) <= gap + 8);
  assert.equal(follower.moving, false);
});

test('Обход остаётся проходимым, начатый маршрут сохраняется при смещении цели', () => {
  const grid = new WalkableZones('test', [
    { x: 0, y: 0, w: 144, h: 264 },
    { x: 264, y: 0, w: 144, h: 264 },
    { x: 0, y: 192, w: 408, h: 72 },
  ]);
  const system = new PartyFollowing(grid, gap);
  const follower = unit(84, 84);
  const leader = unit(324, 84);
  assert.equal(grid.lineClear(follower.x, follower.y, leader.x, leader.y, 4), false);
  system.follow(follower, leader);
  const detour = follower._path;
  assert.ok(detour.length);
  leader.sprite.y += 24;
  system.follow(follower, leader);
  assert.equal(follower._path, detour);
  for (let frame = 0; frame < 300; frame++) {
    system.follow(follower, leader);
    follower.tick();
    assert.equal(grid.isWalkable(follower.x, follower.y), true);
  }
  assert.ok(distance(follower, leader) <= gap + 8);
  assert.equal(follower.moving, false);
});

test('Маршрут разведения и другие назначенные цели сохраняются', () => {
  const system = new PartyFollowing(walkable(), gap);
  const follower = unit(84, 84);
  const leader = unit(360, 84);
  follower.followPath([{ x: 84, y: 108 }, { x: 108, y: 108 }]);
  const assigned = follower._path;
  system.follow(follower, leader);
  assert.equal(follower._path, assigned);
  assert.deepEqual([follower.targetX, follower.targetY], [84, 108]);
});
