const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const puppeteer = require(process.env.MORTIS_PUPPETEER || 'puppeteer-core');

const url = process.env.MORTIS_URL || 'http://127.0.0.1:5178/dark-fantasy-rpg/';
const out = process.env.MORTIS_QA_OUT || fs.mkdtempSync(path.join(os.tmpdir(), 'mortis-battle-result-'));
const timeout = 60000;
const experience = { icon: 'icon_luck_horseshoe', text: 'Опыт отряда: +468', color: '#e8e2d4' };
const loot = { icon: 'icon_gold', text: 'Добыча: 48 монет', color: '#d4a832' };
const wound = { icon: 'icon_drop', text: 'Падший Дуэлянт: рана, до отдыха здоровье не выше 84', color: '#d08a6a' };
const level = { icon: 'icon_might', text: 'Новый уровень отряда: 6', color: '#f0d890' };
const cases = [
  { name: 'victory', rows: [experience, loot], labels: ['На карту'] },
  { name: 'victory-wound', rows: [experience, loot, wound], labels: ['На карту'], wrapped: 2 },
  { name: 'victory-many-rows', rows: [experience, loot, wound, wound, wound, wound, level], labels: ['Новый уровень'], wrapped: 2 },
  {
    name: 'defeat-note', victory: false, rows: [], labels: ['К последнему привалу', 'На карту'],
    note: 'Дорога оборвалась.\nВы очнулись у последнего привала.',
  },
];

async function main() {
  fs.mkdirSync(out, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true, args: ['--use-angle=metal'], defaultViewport: { width: 1280, height: 720 },
  });
  const results = [], errors = [];
  try {
    const page = await browser.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__game?.scene.isActive('BootScene'), { timeout });
    await page.evaluate(() => window.__game.scene.getScene('BootScene').scene.start('LoadingScene', {
      destination: 'MapScene', destinationData: { mapKey: 'tavern_cellar', spawnId: 'default' },
    }));
    await page.waitForFunction(() => {
      const scene = window.__game.scene.getScene('MapScene');
      return scene.scene.isActive() && scene._runner;
    }, { timeout });

    for (const { name, rows, labels, note, victory, wrapped } of cases) {
      const layout = await page.evaluate(async config => {
        const { showBattleResult } = await import(new URL('src/ui/BattleResultWindow.js', location.href).href);
        const scene = window.__game.scene.getScene('MapScene');
        scene.cameras.main.setZoom(1);
        window.battleResultSmokeClicks = [];
        const buttons = config.labels.map(label => ({ label, onClick: () => window.battleResultSmokeClicks.push(label) }));
        const frame = showBattleResult(scene, { ...config, buttons });
        const bounds = object => {
          const { left, top, right, bottom, height, centerX, centerY } = object.getBounds();
          return { left, top, right, bottom, height, centerX, centerY };
        };
        const texts = frame.objs.filter(object => object.type === 'Text');
        const rowTexts = texts.filter(t => config.rows.some(r => r.text === t.text));
        const icons = frame.objs.filter(object => config.rows.some(row => object.texture?.key === row.icon));
        const noteText = texts.find(t => t.text === config.note);
        const buttonLabels = texts.filter(t => config.labels.includes(t.text)).map(bounds);
        const buttonTargets = frame.objs.filter(object => object.type === 'Rectangle' && object.input
          && (object.width === 200 || object.width === 240)).map(bounds);
        return {
          frame: frame.rect, inner: frame.inner, rows: rowTexts.map(bounds), icons: icons.map(bounds),
          note: noteText ? bounds(noteText) : null, buttonLabels, buttonTargets,
        };
      }, { rows, labels, note, victory });
      results.push({ name, ...layout });
      await page.screenshot({ path: path.join(out, name + '.png') });

      assert.equal(layout.rows.length, rows.length, name);
      assert.equal(layout.icons.length, rows.length, name);
      assert.equal(layout.buttonLabels.length, labels.length, name);
      assert.equal(layout.buttonTargets.length, labels.length, name);
      const { inner } = layout;
      const textBodies = [...layout.rows, ...(layout.note ? [layout.note] : [])];
      const buttonTop = Math.min(...layout.buttonTargets.map(button => button.top));
      for (const body of textBodies) {
        assert.ok(body.left >= inner.x && body.right <= inner.x + inner.w, name + ' text fits horizontally');
        assert.ok(body.top >= inner.y && body.bottom < buttonTop, name + ' text clears buttons');
      }
      layout.icons.forEach((icon, i) => {
        assert.ok(icon.right < layout.rows[i].left && icon.bottom < buttonTop, name + ' icon fits its gutter');
        if (i === 0) return;
        const previousBottom = Math.max(layout.rows[i - 1].bottom, layout.icons[i - 1].bottom);
        assert.ok(previousBottom < Math.min(icon.top, layout.rows[i].top), name + ' rows do not overlap');
      });
      if (wrapped !== undefined) assert.ok(layout.rows[wrapped].height > layout.rows[0].height, name + ' wound wraps');
      if (note) assert.ok(layout.note, name + ' note exists');
      assert.ok(layout.frame.y >= 0 && layout.frame.y + layout.frame.h <= 720, name + ' frame fits viewport');
      for (const [i, button] of layout.buttonTargets.entries()) {
        const label = layout.buttonLabels[i];
        assert.ok(button.left >= layout.frame.x && button.right <= layout.frame.x + layout.frame.w);
        assert.ok(button.bottom <= layout.frame.y + layout.frame.h);
        assert.ok(label.left >= button.left && label.right <= button.right, name + ' label fits button width');
        assert.ok(label.top >= button.top && label.bottom <= button.bottom, name + ' label fits button height');
        await page.mouse.click(button.centerX, button.centerY);
        assert.equal(await page.evaluate(() => window.battleResultSmokeClicks.at(-1)), labels[i]);
      }
    }
    assert.deepEqual(errors, []);
    console.log('Battle result UI smoke passed at 1280x720. Evidence:', out);
  } catch (error) {
    errors.push(error.message);
    throw error;
  } finally {
    fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ results, errors }, null, 2));
    await browser.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
