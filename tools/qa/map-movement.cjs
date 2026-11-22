// Локальный Vite :5178; изолированный Chrome. Проверка короткого шага и движения отряда.
const puppeteer = require(process.env.MORTIS_PUPPETEER || 'puppeteer-core');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const out = `${process.cwd()}/assets/generated/_qa/movement-2026-11-15`;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true, args: ['--use-angle=metal'],
    defaultViewport: { width: 1280, height: 720, deviceScaleFactor: 1 },
  });
  try {
    const page = await browser.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('http://127.0.0.1:5178/dark-fantasy-rpg/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__game?.scene.getScene('BootScene')?._enter, { timeout: 60000 });
    await pause(3000);
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.__game?.scene.getScene('MapScene')?.hero, { timeout: 60000 });
    await page.evaluate(() => {
      const s = window.__game.scene.getScene('MapScene');
      const ids = ['hero_duelist', 'companion_brawler', 'companion_healer'];
      s.registry.set('party', ids); s.registry.set('roster', ids); s.registry.set('partySlots', 3);
      s._applyPartyVisibility(true);
    });
    const shortStep = await page.evaluate(() => {
      const s = window.__game.scene.getScene('MapScene'), h = s.hero;
      s.scene.pause(); h.stopMove();
      const x = h.x, y = h.y;
      h.followPath([{ x: x - 8, y }]); h.update(16);
      const result = { moving: h.moving, animation: h.sprite.anims.currentAnim.key, travel: x - h.x };
      h.update(100); h.update(16);
      result.stopped = !h.moving; result.remainder = Math.abs(h.x - (x - 8));
      s.scene.resume(); return result;
    });
    assert.equal(shortStep.moving, true);
    assert.match(shortStep.animation, /walk/);
    assert.equal(shortStep.stopped, true);
    assert.ok(shortStep.remainder < 0.001);
    for (const [i, goal] of [[0, [1044, 488]], [1, [900, 560]], [2, [1120, 450]]]) {
      assert.equal(await page.evaluate(([x, y]) => window.__game.scene.getScene('MapScene')._walkHeroTo(x, y), goal), true);
      await pause(1500);
      await page.screenshot({ path: `${out}/walk-${i}.png` });
    }
    assert.deepEqual(errors, []);
    fs.writeFileSync(`${out}/results.json`, JSON.stringify({ shortStep, errors }, null, 2));
    console.log(JSON.stringify({ shortStep, errors, out }));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
