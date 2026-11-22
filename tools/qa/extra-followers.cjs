const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const url = process.env.MORTIS_URL || 'http://127.0.0.1:5178/dark-fantasy-rpg/';
const timeout = 60000;
const heroId = 'hero_duelist';
const saveKey = 'darkfantasy_ironman_v1';
const existing = { tiss_recruit: 29, mirko: 27, bran: 26 };
const ids = [...Object.keys(existing), 'holt', 'ressa'];

async function ready(page, mapKey) {
  await page.waitForFunction(mapKey => {
    const scene = window.__game?.scene.getScene('MapScene');
    return scene?.scene.isActive() && scene.mapKey === mapKey && scene._runner
      && !scene._transitioning && !scene._progressionPending;
  }, { timeout }, mapKey);
}

async function continueGame(page, mapKey) {
  await page.waitForFunction(() => {
    const boot = window.__game?.scene.getScene('BootScene');
    return boot?.scene.isActive() && boot._enter
      && boot.children.list.some(item => item.text === 'Продолжить' && item.alpha > 0.8);
  }, { timeout });
  await page.mouse.click(640, 580);
  await ready(page, mapKey);
}

// One isolated browser context per fixture. Only the setup writes a seeded save.
async function start(page, mapKey, partySlots, followers = []) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
  await page.evaluate(({ key, mapKey, party, partySlots }) => {
    const mode = 'chronicle';
    localStorage.setItem(key, JSON.stringify({
      schemaVersion: 3, mapKey, spawnId: 'default', units: [], mode, gold: 12,
      world: { party, roster: party, partySlots, partyLevel: 1, gameMode: mode },
    }));
  }, { key: saveKey, mapKey, party: [heroId, ...followers], partySlots });
  await reload(page, mapKey);
}

async function reload(page, mapKey) {
  await page.reload({ waitUntil: 'domcontentloaded', timeout });
  await continueGame(page, mapKey);
}

async function talk(page, id) {
  await page.evaluate(id => {
    const scene = window.__game.scene.getScene('MapScene');
    const npc = scene._npcs.find(n => n.cfg.id === id);
    if (!npc) throw new Error('NPC absent: ' + id);
    npc.sprite.emit('pointerdown');
  }, id);
  await page.waitForFunction(() => window.__game.scene.getScene('MapScene')._dialogue.active, { timeout });
}

async function choose(page, label, { disabled = false } = {}) {
  const choice = await page.waitForFunction(label => {
    const scene = window.__game.scene.getScene('MapScene');
    const frame = scene._dialogue._frame;
    const button = frame?.objs.find(item => item.visible && item.alpha > 0.8
      && typeof item.text === 'string' && /^\d+\. /.test(item.text) && item.text.includes(label));
    if (!button) return false;
    scene._qaChoiceFrame = frame;
    const bounds = button.getBounds();
    const zoom = scene.cameras.main.zoom;
    return { x: bounds.centerX * zoom, y: bounds.centerY * zoom, text: button.text };
  }, { timeout }, label);
  const point = await choice.jsonValue();
  await choice.dispose();
  if (disabled) assert.match(point.text, /место в отряде откроется/);
  await page.mouse.click(point.x, point.y);
  if (!disabled) {
    await page.waitForFunction(() => {
      const scene = window.__game.scene.getScene('MapScene');
      return scene._dialogue._frame !== scene._qaChoiceFrame;
    }, { timeout });
  }
}

async function savedParty(page, mapKey, party, roster) {
  const state = await page.evaluate(key => {
    const scene = window.__game.scene.getScene('MapScene');
    const save = JSON.parse(localStorage.getItem(key));
    return {
      mapKey: scene.mapKey,
      party: scene.registry.get('party'),
      roster: scene.registry.get('roster'),
      extras: scene._extraFollowers.map(f => f.id).sort(),
      savedMap: save?.mapKey,
      savedParty: save?.world?.party,
      savedRoster: save?.world?.roster,
    };
  }, saveKey);
  assert.equal(state.mapKey, mapKey);
  assert.equal(state.savedMap, mapKey);
  assert.deepEqual(state.party, party);
  assert.deepEqual(state.savedParty, party);
  assert.deepEqual(state.roster, roster);
  assert.deepEqual(state.savedRoster, roster);
  assert.deepEqual(state.extras, party.filter(id => ids.includes(id)).sort());
  return state;
}

async function follower(page, id, key) {
  await page.waitForFunction((id, key) => {
    const scene = window.__game.scene.getScene('MapScene');
    const matches = scene._extraFollowers.filter(f => f.id === id);
    const unit = matches[0]?.unit;
    return matches.length === 1 && unit._useWalkFrames && unit._walkSpriteKey === key
      && scene.textures.exists(key);
  }, { timeout }, id, key);
}

async function takeExit(page, from, to) {
  await page.waitForFunction(() => window.__game.scene.getScene('MapScene')._exitCooldown <= 0, { timeout });
  assert.equal(await page.evaluate((from, to) => {
    const scene = window.__game.scene.getScene('MapScene');
    const exit = scene._exitMarkers.items.find(item => item.exit.toMap === to)?.exit;
    if (scene.mapKey !== from || !exit || scene._exitLocked(exit)) return false;
    scene._qaDepartureHero = scene.hero;
    return scene._walkToExit(exit);
  }, from, to), true, from + ' -> ' + to);
  await page.waitForFunction(to => {
    const game = window.__game;
    const scene = game.scene.getScene('MapScene');
    return game.scene.isActive('CinemaScene') || (scene.scene.isActive() && scene.mapKey === to);
  }, { timeout }, to);
  if (await page.evaluate(() => window.__game.scene.isActive('CinemaScene'))) {
    await page.keyboard.press('Escape');
  }
  await ready(page, to);
  assert.equal(await page.evaluate(() => {
    const scene = window.__game.scene.getScene('MapScene');
    return scene.hero !== scene._qaDepartureHero;
  }), true);
}

async function motion(page, id, config) {
  const expected = config.walk;
  const result = await page.evaluate((id, numberOfFrames, fps) => {
    const scene = window.__game.scene.getScene('MapScene');
    const unit = scene._extraFollowers.find(f => f.id === id).unit;
    const sprite = unit.sprite;
    const pose = () => ({
      key: sprite.texture.key, x: unit.x, y: unit.y, moving: unit.moving,
      flipX: sprite.flipX, originX: sprite.originX, originY: sprite.originY, scale: sprite.scaleY,
    });
    const visibleBounds = () => {
      const frame = sprite.frame;
      const canvas = document.createElement('canvas');
      canvas.width = frame.cutWidth;
      canvas.height = frame.cutHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(frame.source.image, frame.cutX, frame.cutY, frame.cutWidth, frame.cutHeight,
        0, 0, canvas.width, canvas.height);
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let top = canvas.height;
      let bottom = 0;
      for (let y = 0; y < canvas.height; y++) {
        for (let x = 0; x < canvas.width; x++) {
          if (pixels[(y * canvas.width + x) * 4 + 3] <= 128) continue;
          top = Math.min(top, y);
          bottom = Math.max(bottom, y + 1);
        }
      }
      return {
        height: (bottom - top) * Math.abs(sprite.scaleY),
        footY: (bottom - sprite.originY * canvas.height) * sprite.scaleY,
      };
    };

    // Synchronous probe: the real unit and animation clock use a controlled step.
    unit.stopMove();
    const idle = pose();
    const idleBounds = visibleBounds();
    unit.followPath([{ x: idle.x + 8, y: idle.y }]);
    unit.update(16);
    const right = pose();
    const frames = [Number(sprite.frame.name)];
    const walkBounds = [visibleBounds()];
    const frameSize = [sprite.frame.cutWidth, sprite.frame.cutHeight];
    const loadedFps = sprite.anims.currentAnim?.frameRate;
    const tick = 1000 / fps + 0.001;
    for (let i = 1; i <= numberOfFrames; i++) {
      sprite.anims.update(i * tick, tick);
      frames.push(Number(sprite.frame.name));
      if (i < numberOfFrames) walkBounds.push(visibleBounds());
    }
    unit.followPath([{ x: unit.x - 8, y: unit.y }]);
    unit.update(16);
    const left = pose();
    unit.followPath([{ x: unit.x, y: unit.y + 8 }]);
    unit.update(16);
    const vertical = pose();
    unit.update(100);
    unit.update(16);
    const stopped = pose();
    const remaining = Math.hypot(unit.x - unit.targetX, unit.y - unit.targetY);
    return { idle, idleBounds, right, frames, walkBounds, frameSize, loadedFps, left, vertical, stopped, remaining };
  }, id, expected.frames, expected.fps);

  const originX = config.walkOriginX ?? expected.originX;
  const originY = config.walkOriginY ?? expected.originY;
  assert.equal(result.right.key, expected.key, id + ' walk texture');
  assert.equal(result.loadedFps, expected.fps, id + ' frame rate');
  assert.deepEqual(result.frameSize, [expected.frameWidth, expected.frameHeight], id + ' frame size');
  assert.deepEqual(result.frames, [...Array.from({ length: expected.frames }, (_, i) => i), 0], id + ' cycle and wrap');
  assert.equal(result.right.moving, true, id + ' starts on an 8 px step');
  assert.ok(result.right.x > result.idle.x);
  assert.equal(result.right.flipX, config.facesLeft);
  assert.equal(result.left.flipX, !config.facesLeft);
  assert.equal(result.vertical.flipX, result.left.flipX);
  for (const pose of [result.right, result.left, result.vertical]) {
    assert.ok(Math.abs(pose.originX - (pose.flipX ? 1 - originX : originX)) < 1e-6, id + ' horizontal origin');
    assert.ok(Math.abs(pose.originY - originY) < 1e-6, id + ' foot origin');
  }
  assert.equal(result.stopped.key, result.idle.key, id + ' returns to hold pose');
  assert.equal(result.stopped.moving, false);
  assert.equal(result.stopped.flipX, true, id + ' stays facing left in hold pose');
  assert.ok(Math.abs(result.stopped.originY - (config.staticOriginY ?? 1)) < 1e-6);
  assert.ok(result.remaining < 0.001);
  for (const bounds of result.walkBounds) {
    const ratio = bounds.height / result.idleBounds.height;
    assert.ok(ratio > 0.88 && ratio < 1.12, id + ' visible height ratio: ' + ratio);
  }
  return result;
}

async function spacing(page, id, key, gap) {
  const result = await page.evaluate((id, key, gap) => {
    const scene = window.__game.scene.getScene('MapScene');
    const { hero, walkable } = scene;
    const unit = scene._extraFollowers.find(f => f.id === id).unit;
    const coords = () => [hero.x, hero.y, unit.x, unit.y];
    const move = (actor, x, y) => {
      actor.sprite.setPosition(x, y);
      actor.stopMove();
    };
    const original = coords();
    const safeCell = walkable.cells.findIndex((open, i) => {
      if (!open) return false;
      const { x, y } = walkable.center(i);
      return x > 200 && x < 1400 && walkable.lineClear(x, y, x + gap + 16, y, 4);
    });
    if (safeCell < 0) throw new Error('No room for a controlled spacing probe');
    const { x, y } = walkable.center(safeCell);
    try {
      move(hero, x, y);
      move(unit, x + 10, y);
      const stopped = coords();
      scene._separateParty();
      const afterPlan = coords();
      const destination = { x: unit.targetX, y: unit.targetY };
      unit.update(16);
      const afterStep = coords();
      unit.followPath([{ x: x + 12, y }, { x: x + gap + 16, y }]);
      const moving = coords();
      const route = JSON.stringify([unit.targetX, unit.targetY, unit._path]);
      scene._separateParty();
      const afterMovingPlan = coords();
      const afterRoute = JSON.stringify([unit.targetX, unit.targetY, unit._path]);
      // Run the map update at the actual scene positions, away from the probe cells.
      move(hero, original[0], original[1]);
      move(unit, original[2], original[3]);
      unit.followPath([{ x: unit.x + 32, y: unit.y }]);
      unit.update(16);
      scene.update(scene.time.now, 16);
      const continues = unit.moving && unit.sprite.texture.key === key;
      return { stopped, afterPlan, destination, afterStep, moving, afterMovingPlan, route, afterRoute, continues };
    } finally {
      move(hero, original[0], original[1]);
      move(unit, original[2], original[3]);
      unit.update(0);
    }
  }, id, key, gap);
  assert.deepEqual(result.afterPlan, result.stopped, id + ' standing separation does not teleport');
  assert.equal(result.destination.x, result.stopped[0] + gap);
  assert.equal(result.destination.y, result.stopped[1]);
  assert.ok(result.afterStep[2] > result.stopped[2] && result.afterStep[2] < result.destination.x);
  assert.deepEqual(result.afterMovingPlan, result.moving, id + ' no shove');
  assert.equal(result.afterRoute, result.route, id + ' moving route preserved');
  assert.equal(result.continues, true, id + ' continues after hero stops');
  return result;
}

async function detour(page, id) {
  const result = await page.evaluate(id => {
    const scene = window.__game.scene.getScene('MapScene');
    const unit = scene._extraFollowers.find(f => f.id === id).unit;
    const grid = scene.walkable;
    const sample = [];
    for (let i = 0; i < grid.cells.length; i += 2) {
      const point = grid.center(i);
      if (grid.open(i) && point.x > 200 && point.x < 1450) sample.push({ ...point, index: i });
    }
    for (const from of sample) {
      for (const to of sample) {
        const distance = Math.hypot(to.x - from.x, to.y - from.y);
        if (distance < 72 || distance > 240 || grid.comp[from.index] !== grid.comp[to.index]) continue;
        if (grid.lineClear(from.x, from.y, to.x, to.y, 4)) continue;
        const start = { x: unit.x, y: unit.y };
        try {
          unit.sprite.setPosition(from.x, from.y);
          unit.stopMove();
          scene._walkCompanionTo(unit, to.x, to.y);
          if (!unit._path?.length) continue;
          const waypoints = [{ x: unit.targetX, y: unit.targetY }, ...unit._path];
          let crossedBlockedCell = false;
          let playedWalk = false;
          let stopped = false;
          for (let step = 0; step < 500; step++) {
            unit.update(16);
            if (!grid.open(grid.cellOf(unit.x, unit.y))) crossedBlockedCell = true;
            if (unit.moving && unit.sprite.texture.key === unit._walkSpriteKey) playedWalk = true;
            stopped = !unit.moving && Math.hypot(unit.x - to.x, unit.y - to.y) < 0.001;
            if (stopped) break;
          }
          return { from, to, waypoints, crossedBlockedCell, playedWalk, stopped };
        } finally {
          unit.sprite.setPosition(start.x, start.y);
          unit.stopMove();
          unit.update(0);
        }
      }
    }
    return null;
  }, id);
  assert.ok(result, id + ' has a connected route around an obstruction');
  assert.equal(result.crossedBlockedCell, false, id + ' stays on the walkable grid');
  assert.equal(result.playedWalk, true);
  assert.equal(result.stopped, true);
  return result;
}

async function liveTrail(page, id, key, capture) {
  const goal = await page.evaluate(id => {
    const scene = window.__game.scene.getScene('MapScene');
    const unit = scene._extraFollowers.find(f => f.id === id).unit;
    const { hero, walkable } = scene;
    const start = walkable.cellOf(hero.x, hero.y);
    const candidates = [];
    for (let i = 0; i < walkable.cells.length; i++) {
      if (!walkable.open(i) || walkable.comp[i] !== walkable.comp[start]) continue;
      const point = walkable.center(i);
      const distance = Math.hypot(point.x - hero.x, point.y - hero.y);
      if (distance < 320 || distance > 650 || !walkable.lineClear(hero.x, hero.y, point.x, point.y, 4)) continue;
      if (scene._exitMarkers.items.some(item => scene._inZone(point.x, point.y, item.zone))) continue;
      candidates.push({ ...point, distance });
    }
    candidates.sort((a, b) => b.distance - a.distance);
    const target = candidates[0];
    if (!target) throw new Error('No continuous walk route from this spawn');
    const trace = { from: { x: unit.x, y: unit.y }, samples: [] };
    let lastSample = -Infinity;
    const collect = () => {
      if (scene.time.now - lastSample < 35) return;
      lastSample = scene.time.now;
      trace.samples.push({
        time: lastSample, x: unit.x, y: unit.y, heroX: hero.x, heroY: hero.y,
        moving: unit.moving, heroMoving: hero.moving, texture: unit.sprite.texture.key, frame: unit.sprite.frame.name,
      });
    };
    scene.events.on('postupdate', collect);
    scene._qaTrail = trace;
    scene._qaStopTrace = () => scene.events.off('postupdate', collect);
    if (!scene._walkHeroTo(target.x, target.y)) {
      scene._qaStopTrace();
      throw new Error('Hero route rejected');
    }
    return target;
  }, id);

  try {
    await page.waitForFunction((id, key) => {
      const scene = window.__game.scene.getScene('MapScene');
      return scene.hero.moving && scene._extraFollowers.some(({ id: unitId, unit }) =>
        unitId === id && unit.moving && unit.sprite.texture.key === key);
    }, { timeout }, id, key);
    await capture(id + '-walking');
    await page.waitForFunction((id, x, y) => {
      const scene = window.__game.scene.getScene('MapScene');
      const unit = scene._extraFollowers.find(f => f.id === id)?.unit;
      return unit && !scene.hero.moving && !unit.moving
        && Math.hypot(scene.hero.x - x, scene.hero.y - y) < 1
        && Math.hypot(unit.x - unit.targetX, unit.y - unit.targetY) < 1
        && Math.hypot(unit.x - scene._qaTrail.from.x, unit.y - scene._qaTrail.from.y) > 20;
    }, { timeout }, id, goal.x, goal.y);
    await capture(id + '-stopped');
    const trace = await page.evaluate(() => window.__game.scene.getScene('MapScene')._qaTrail);
    const walking = trace.samples.filter(sample => sample.moving && sample.texture === key);
    assert.ok(new Set(walking.map(sample => sample.frame)).size > 1, id + ' uses changing frames on the real route');
    return { goal, ...trace };
  } finally {
    await page.evaluate(() => window.__game.scene.getScene('MapScene')._qaStopTrace?.());
  }
}

async function main() {
  const { followers, spacing: gap } = JSON.parse(fs.readFileSync('src/data/party_motion.json', 'utf8'));
  for (const id of ids) {
    assert.ok(followers[id]?.walk, 'Missing walk configuration for ' + id);
    assert.equal(typeof followers[id].facesLeft, 'boolean', id + ' source direction');
    assert.ok(Number.isInteger(followers[id].walk.frames) && followers[id].walk.frames > 1);
    assert.ok(followers[id].walk.fps > 0);
    if (existing[id]) {
      assert.equal(followers[id].walk.frames, existing[id]);
      assert.equal(followers[id].walk.fps, 24);
    }
  }
  const out = process.env.MORTIS_QA_OUT
    ? path.resolve(process.env.MORTIS_QA_OUT)
    : fs.mkdtempSync(path.join(os.tmpdir(), 'mortis-followers-results-'));
  fs.mkdirSync(out, { recursive: true });

  const puppeteer = require(process.env.MORTIS_PUPPETEER || 'puppeteer-core');
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true, args: ['--use-angle=metal'], defaultViewport: { width: 1280, height: 720 },
  });
  const errors = [];
  const results = {};
  const scenario = async (name, run) => {
    const context = await browser.createBrowserContext();
    let page;
    try {
      page = await context.newPage();
      page.on('pageerror', error => errors.push({ name, error: error.message }));
      page.on('response', response => {
        if (response.status() >= 400 && !new URL(response.url()).pathname.endsWith('/favicon.ico')) {
          errors.push({ name, status: response.status(), url: response.url() });
        }
      });
      const capture = label => page.screenshot({ path: path.join(out, label + '.png') });
      const captureTrail = async (id, key) => {
        const recorder = process.env.MORTIS_QA_VIDEO === '1' && !existing[id]
          ? await page.screencast({ path: path.join(out, id + '-route.webm'), fps: 30 })
          : null;
        try {
          return await liveTrail(page, id, key, capture);
        } finally {
          await recorder?.stop();
        }
      };
      results[name] = await run(page, capture, captureTrail);
      console.log('Verified:', name);
    } catch (error) {
      errors.push({ name, error: error.stack });
      console.error('Scenario failed:', name, error.stack);
      await page?.screenshot({ path: path.join(out, name + '-failure.png') }).catch(() => {});
    } finally {
      await context.close();
    }
  };

  try {
    for (const id of Object.keys(existing)) {
      await scenario(id, async (page, _capture, captureTrail) => {
        const key = followers[id].walk.key;
        await start(page, 'map1', 2, [id]);
        await follower(page, id, key);
        const visuals = await motion(page, id, followers[id]);
        const separation = await spacing(page, id, key, gap);
        const trail = await captureTrail(id, key);
        await takeExit(page, 'map1', 'three_pillars');
        await follower(page, id, key);
        const active = await savedParty(page, 'three_pillars', [heroId, id], [heroId, id]);
        await page.evaluate(() => window.__game.scene.getScene('MapScene')._showPartyManager());
        await choose(page, 'пусть ждёт в «Хромом Лосе»');
        await choose(page, 'Готово.');
        const reserve = await savedParty(page, 'three_pillars', [heroId], [heroId, id]);
        return { visuals, separation, trail, active, reserve };
      });
    }

    await scenario('holt', async (page, capture, captureTrail) => {
      const id = 'holt', key = followers[id].walk.key;
      await start(page, 'three_pillars_inside', 2);
      await talk(page, id);
      await choose(page, 'Мне нужен человек с арбалетом.');
      await choose(page, '«Идём.»');
      await follower(page, id, key);
      assert.equal(await page.evaluate(() => window.__game.registry.get('holt_recruited')), true);
      const hired = await savedParty(page, 'three_pillars_inside', [heroId, id], [heroId, id]);
      const visuals = await motion(page, id, followers[id]);
      await capture('holt-interior');
      await takeExit(page, 'three_pillars_inside', 'three_pillars');
      await follower(page, id, key);
      await reload(page, 'three_pillars');
      await follower(page, id, key);
      const restored = await savedParty(page, 'three_pillars', [heroId, id], [heroId, id]);
      const separation = await spacing(page, id, key, gap);
      const trail = await captureTrail(id, key);
      return { hired, visuals, restored, separation, trail };
    });

    await scenario('ressa', async (page, _capture, captureTrail) => {
      const id = 'ressa', key = followers[id].walk.key;
      await start(page, 'elf_boloto', 1);
      await talk(page, id);
      await choose(page, 'Идём со мной.');
      await choose(page, 'Уйти.');
      assert.equal(await page.evaluate(() => window.__game.registry.get('ressa_recruited')), true);
      const hiredInReserve = await savedParty(page, 'elf_boloto', [heroId], [heroId, id]);
      await page.evaluate(() => window.__game.scene.getScene('MapScene')._showPartyManager());
      await choose(page, 'Ресса: взять в отряд', { disabled: true });
      assert.deepEqual(await page.evaluate(() => window.__game.registry.get('party')), [heroId]);
      await page.evaluate(() => {
        // Fixture opens a slot without walking an XP route. The manager still changes the actual party.
        const scene = window.__game.scene.getScene('MapScene');
        scene.registry.set('partySlots', 2);
        scene._showPartyManager();
      });
      await choose(page, 'Ресса: взять в отряд');
      await follower(page, id, key);
      await choose(page, 'Готово.');
      const active = await savedParty(page, 'elf_boloto', [heroId, id], [heroId, id]);
      const visuals = await motion(page, id, followers[id]);
      const separation = await spacing(page, id, key, gap);
      const obstacle = await detour(page, id);
      const trail = await captureTrail(id, key);
      await takeExit(page, 'elf_boloto', 'le_house');
      await follower(page, id, key);
      await reload(page, 'le_house');
      await follower(page, id, key);
      const restored = await savedParty(page, 'le_house', [heroId, id], [heroId, id]);
      await page.evaluate(id => {
        const scene = window.__game.scene.getScene('MapScene');
        const { sprite, shadow } = scene._extraFollowers.find(f => f.id === id).unit;
        scene._qaRemovedFollower = { sprite, shadow };
        scene._showPartyManager();
      }, id);
      await choose(page, 'Ресса: пусть ждёт');
      await choose(page, 'Готово.');
      assert.equal(await page.evaluate(() => {
        const { sprite, shadow } = window.__game.scene.getScene('MapScene')._qaRemovedFollower;
        return !sprite.scene && !shadow.scene;
      }), true, 'bench destroys follower sprite and shadow');
      const reserve = await savedParty(page, 'le_house', [heroId], [heroId, id]);
      await reload(page, 'le_house');
      const restoredReserve = await savedParty(page, 'le_house', [heroId], [heroId, id]);
      return { hiredInReserve, active, visuals, separation, obstacle, trail, restored, reserve, restoredReserve };
    });

    assert.deepEqual(errors, []);
  } finally {
    fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ url, results, errors }, null, 2));
    console.log('Evidence:', out);
    await browser.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
