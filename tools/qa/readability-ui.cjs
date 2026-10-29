// Run against a dev server. MORTIS_PUPPETEER may point to an isolated installation.
const puppeteer = require(process.env.MORTIS_PUPPETEER || 'puppeteer-core');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const out = path.resolve('assets/generated/_qa/codex-2026-10-30');
fs.mkdirSync(out, { recursive: true });
const pause = ms => new Promise(r => setTimeout(r, ms));
(async () => {
 const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--enable-unsafe-swiftshader'], defaultViewport: { width: 1280, height: 720 } });
 const results = [], errors = [];
 try {
  const page = await browser.newPage();
  page.on('pageerror', e => {errors.push(e.stack || e.message);console.log('PAGE ERROR', e.stack);});
  page.on('response', r => { if (r.status() >= 400 && !r.url().endsWith('favicon.ico')) errors.push(`${r.status()} ${r.url()}`); });
  await page.goto(process.env.MORTIS_URL || 'http://127.0.0.1:5178/dark-fantasy-rpg/');
  await page.waitForFunction(() => typeof window.__game?.scene.getScene('BootScene')._enter === 'function', { timeout: 60000 });
  console.log('Title ready'); await page.waitForFunction(()=>window.__game.scene.getScene('BootScene').time.now > 1900); await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__game?.scene.getScene('MapScene')._runner, { timeout: 60000 });
  console.log('Map ready'); await pause(500);
  await page.screenshot({path: path.join(out,'start.png')});
  async function battle({ party = ['hero_duelist'], ambush = false, mode = 'chronicle' } = {}) {
   await page.evaluate(async ({ party, ambush, mode }) => {
    const { SaveSystem } = await import('/dark-fantasy-rpg/src/utils/SaveSystem.js');
    const g = window.__game;
    for (const s of g.scene.getScenes(true)) g.scene.stop(s.scene.key);
    SaveSystem.newGame(g.registry, {mode});
    g.registry.set('party', party); g.registry.set('roster', party); g.registry.set('partySlots', party.length);
    SaveSystem.saveWorld(g.registry, 'south_post','default');
    g.registry.set('battleAmbush', ambush);
    g.scene.start('BattleScene', {battleId:'road_looters',fromMapKey:'south_post'});
   }, {party,ambush,mode});
   await page.waitForFunction(() => { const s=window.__game.scene.getScene('BattleScene'); return s.scene.isActive() && s.playerUnits?.[0]?._animSprite?.active && !s.load.isLoading(); }, {timeout:60000});
   console.log('Battle ready', {party,ambush,mode});
  }
  // Readouts and target rings reflect resources and reachable rows.
  await battle({party:['hero_duelist','companion_brawler','companion_healer']});
  const readout=await page.evaluate(()=>{const s=window.__game.scene.getScene('BattleScene'),a=s.playerUnits[0];s.turnManager.active=a;s.turnManager.index=s.turnManager.queue.indexOf(a);s.turnManager._setPhase(a);
   s.enemyUnits.forEach((u,i)=>u.position={row:i>=2?1:0,col:i%2});s._renderAll();
   const melee=s.ui._rings.length; a.resources.tempo=1;s._onSkillSelect('pistol_shot');const pistol=s.ui._rings.length;
   return {melee,pistol,enemies:s.enemyUnits.length,text:s.ui._stateLabel.text};});
  assert.equal(readout.melee,2);assert.equal(readout.pistol,readout.enemies);assert.ok(readout.text.includes('Темп 1/3'));assert.ok(readout.text.includes('Пистоль 2'));
  await page.screenshot({path:path.join(out,'battle-readout-targets.png')});results.push({name:'resource readout and reachable targets',...readout});
  await page.evaluate(()=>{const s=window.__game.scene.getScene('BattleScene');s._cancelPendingSkill();s.enemyUnits[2]._animSprite.emit('pointerover');});
  await pause(200);await page.screenshot({path:path.join(out,'target-blocked.png')});
  assert.ok(await page.evaluate(()=>window.__game.scene.getScene('BattleScene').ui.tip.objs.some(o=>o.text?.includes('закрыта'))));
  await page.evaluate(()=>{const s=window.__game.scene.getScene('BattleScene'),h=s.playerUnits.find(u=>u.id==='companion_healer'),a=s.playerUnits[0];a.hp=a.maxHp-3;s.turnManager.active=h;s.turnManager._setPhase(h);s._onSkillSelect('bandage');a._animSprite.emit('pointerover');});
  await pause(200);await page.screenshot({path:path.join(out,'target-heal.png')});
  assert.ok(await page.evaluate(()=>window.__game.scene.getScene('BattleScene').ui.tip.objs.some(o=>o.text?.includes('3 HP'))));
  // Reader fixture: verify the actual book effects and repeat reading, separate from the natural route.
  await page.evaluate(()=>{const g=window.__game;g.scene.stop('BattleScene');g.scene.start('LoadingScene',{targetScene:'MapScene',mapKey:'south_post'});});
  await page.waitForFunction(()=>{const s=window.__game.scene.getScene('MapScene');return s.scene.isActive()&&s._runner;},{timeout:60000});await pause(1200);
  await page.evaluate(()=>window.__game.scene.getScene('MapScene')._showBookReader('lowland_herbal'));await pause(400);
  for(let i=0;i<10;i++)await page.evaluate(()=>{const s=window.__game.scene.getScene('MapScene');s._bookOverlay.getChildren().find(o=>o.text==='Дальше ›').emit('pointerdown');});
  await page.screenshot({path:path.join(out,'book-knowledge.png')});
  assert.ok(await page.evaluate(()=>window.__game.scene.getScene('MapScene')._bookOverlay.getChildren().some(o=>o.text?.includes('Открыт рецепт'))));
  await page.evaluate(()=>{const s=window.__game.scene.getScene('MapScene');s._bookOverlay.getChildren().find(o=>o.text==='×').emit('pointerdown');s._toggleJournal();});
  await pause(300);await page.screenshot({path:path.join(out,'journal-start.png')});
  // Long-text fixture: completed stages and outcomes must stay within the frame while scrolling.
  await page.evaluate(async()=>{const s=window.__game.scene.getScene('MapScene');const {Frame}=await import('/dark-fantasy-rpg/src/ui/Frame.js');Frame.closeCurrent(s);const {JournalWindow}=await import('/dark-fantasy-rpg/src/ui/JournalWindow.js');const qs=(await import('/dark-fantasy-rpg/src/data/quests.json?import')).default;qs.find(q=>q.id==='letter').stages.forEach(st=>st.text=st.text+' '+st.text+' '+st.text);['courier_letter_found','vorn_letter_seen','korvin_resolved','basement_journal_read','letter_opened','korvin_witness','wornag_loyal'].forEach(f=>s._ws.setFlag(f));window.__qaJournal=new JournalWindow(s,s._ws);window.__qaJournal.select('letter');});
  await pause(5000);await page.screenshot({path:path.join(out,'journal-long-top.png')});
  await page.mouse.move(900,400);await page.mouse.wheel({deltaY:600});await pause(200);
  assert.ok(await page.evaluate(()=>window.__qaJournal.detailScroll>0));
  await page.screenshot({path:path.join(out,'journal-long-scroll.png')});
  assert.deepEqual(errors,[]);console.log(JSON.stringify({results,errors},null,2));
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
