const puppeteer = require(process.env.MORTIS_PUPPETEER || 'puppeteer-core');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const out = 'assets/generated/_qa/followers-2026-11-17';
const pause = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true, args: ['--use-angle=metal'], defaultViewport: { width: 1280, height: 720 } });
  try {
    const page = await browser.newPage(), errors = [], results = [];
    page.on('pageerror', e => { errors.push(e.message); console.log('browser error', e.message); });
    await page.goto('http://127.0.0.1:5178/dark-fantasy-rpg/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__game?.scene.getScene('BootScene')?._enter, { timeout: 60000 });
    await pause(3000); await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.__game.scene.isActive('CinemaScene') || window.__game.scene.isActive('LoadingScene'), { timeout: 15000 });
    if (await page.evaluate(() => window.__game.scene.isActive('CinemaScene'))) await page.keyboard.press('Escape');
    console.log('intro skipped');
    await page.waitForFunction(() => window.__game?.scene.getScene('MapScene')?.hero, { timeout: 60000 });
    for (const id of ['tiss_recruit', 'mirko', 'bran']) {
      await page.evaluate(id => {
        const s = window.__game.scene.getScene('MapScene');
        s.registry.set('partySlots', 3); s.registry.set('party', ['hero_duelist', id]);
        s.registry.set('roster', ['hero_duelist', id]); s._applyPartyVisibility(true);
      }, id);
      await page.waitForFunction(id => window.__game.scene.getScene('MapScene')._extraFollowers.some(f => f.id === id), { timeout: 30000 }, id);
      const checks = await page.evaluate(id => {
        const s = window.__game.scene.getScene('MapScene'), u = s._extraFollowers.find(f => f.id === id).unit;
        s.scene.pause();
        u.stopMove(); const x = u.x, y = u.y;
        const visibleHeight = () => {
          const f = u.sprite.frame, c = document.createElement('canvas');
          c.width = f.cutWidth; c.height = f.cutHeight;
          const ctx = c.getContext('2d', { willReadFrequently: true });
          ctx.drawImage(f.source.image, f.cutX, f.cutY, f.cutWidth, f.cutHeight, 0, 0, c.width, c.height);
          const pixels = ctx.getImageData(0, 0, c.width, c.height).data;
          let top = c.height, bottom = 0;
          for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
            if (pixels[(y * c.width + x) * 4 + 3] > 128) { top = Math.min(top, y); bottom = Math.max(bottom, y + 1); }
          }
          return (bottom - top) * Math.abs(u.sprite.scaleY);
        };
        const idleHeight = visibleHeight();
        u.followPath([{ x: x + 100, y }]); u.update(16);
        const heightRatio = visibleHeight() / idleHeight;
        const right = { texture: u.sprite.texture.key, flip: u.sprite.flipX, moving: u.moving };
        const frames = new Set();
        for (let i = 0; i < 35; i++) { u.sprite.anims.update(i * 42, 42); frames.add(u.sprite.frame.name); }
        u.followPath([{ x: x - 100, y }]); u.update(16);
        const left = u.sprite.flipX;
        const before = [s.hero.x, s.hero.y, u.x, u.y];
        s._separateParty();
        const after = [s.hero.x, s.hero.y, u.x, u.y];
        u.stopMove(); s.hero.stopMove();
        u.followPath([{ x: u.x + 80, y: u.y }]);
        s.update(0, 16);
        const afterHeroStops = { moving: u.moving, texture: u.sprite.texture.key };
        u.stopMove(); s.scene.resume();
        return { id, right, left, frames: frames.size, before, after, afterHeroStops, heightRatio };
      }, id);
      assert.ok(checks.heightRatio > 0.88 && checks.heightRatio < 1.12, `scale ${id}: ${checks.heightRatio}`);
      assert.match(checks.right.texture, /walk/); assert.equal(checks.right.moving, true);
      assert.notEqual(checks.right.flip, checks.left); assert.ok(checks.frames > 20);
      assert.deepEqual(checks.before, checks.after);
      assert.equal(checks.afterHeroStops.moving, true);
      assert.match(checks.afterHeroStops.texture, /walk/);
      results.push(checks);
      await page.evaluate(id => {
        const s = window.__game.scene.getScene('MapScene'), u = s._extraFollowers.find(f => f.id === id).unit;
        s.hero.stopMove(); u.followPath([{ x: u.x + 100, y: u.y }]);
      }, id);
      await pause(350);
      assert.equal(await page.evaluate(id => {
        const u = window.__game.scene.getScene('MapScene')._extraFollowers.find(f => f.id === id).unit;
        return u.moving && u.sprite.texture.key === u._walkSpriteKey;
      }, id), true);
      await page.screenshot({ path: `${out}/${id}-walking.png` });
      await page.evaluate(() => window.__game.scene.getScene('MapScene')._walkHeroTo(900, 560));
      await pause(3000); await page.screenshot({ path: `${out}/${id}-game.png` });
      // Карта перезапускается с тем же спутником: проверяем загрузку и сохранение состава.
      await page.evaluate(() => {
        const s = window.__game.scene.getScene('MapScene');
        s._qaOldHero = s.hero;
        s.scene.start('LoadingScene', { destination: 'MapScene', destinationData: { mapKey: 'map1', spawnId: 'default' } });
      });
      await page.waitForFunction(id => {
        const s = window.__game.scene.getScene('MapScene');
        return s.scene.isActive() && s.hero !== s._qaOldHero && s.mapKey === 'map1' && s._extraFollowers.some(f => f.id === id && f.unit._useWalkFrames);
      }, { timeout: 60000 }, id);
      console.log('verified', id);
    }
    await page.evaluate(() => {
      const s = window.__game.scene.getScene('MapScene');
      s.registry.set('party', ['hero_duelist']); s._applyPartyVisibility();
    });
    assert.equal(await page.evaluate(() => window.__game.scene.getScene('MapScene')._extraFollowers.length), 0);
    assert.deepEqual(errors, []);
    fs.writeFileSync(`${out}/results.json`, JSON.stringify({ results, errors }, null, 2));
    console.log(JSON.stringify({ results, errors }));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
