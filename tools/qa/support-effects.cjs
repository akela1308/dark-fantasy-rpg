// Run against a dev server. MORTIS_PUPPETEER may point to an isolated installation.
const puppeteer = require(process.env.MORTIS_PUPPETEER || 'puppeteer-core');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const out = path.resolve('assets/generated/_qa/codex-2026-10-30-chapter');
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
  await battle({party:['hero_duelist','companion_brawler','companion_healer']});
  await page.evaluate(()=>{const s=window.__game.scene.getScene('BattleScene'),h=s.playerUnits[0],t=s.playerUnits[2];h.armor=7;s.skillSystem._status(h,{type:'armor_broken',value:10,duration:2},s.enemyUnits[0]);s.turnManager.active=t;s.turnManager._setPhase(t);s._onSkillSelect('bitter_poultice');s.ui.showTarget(h);});
  await page.screenshot({path:path.join(out,'armor-before-cleanse.png')});
  await page.evaluate(()=>{const s=window.__game.scene.getScene('BattleScene');s._onAllyClick(s.playerUnits[0]);});
  await page.waitForFunction(()=>!window.__game.scene.getScene('BattleScene')._animLock,{timeout:15000});
  const cleaned=await page.evaluate(async()=>{const s=window.__game.scene.getScene('BattleScene'),h=s.playerUnits[0];s.ui.showTarget(h);const {SaveSystem}=await import('/dark-fantasy-rpg/src/utils/SaveSystem.js');SaveSystem.save(s.playerUnits,'south_post','default',s.game.registry);return{armor:h.armor,broken:h._armorBroken,status:h.hasEffect('armor_broken'),saved:SaveSystem.load().units.find(u=>u.id===h.id).armor};});
  assert.deepEqual(cleaned,{armor:7,broken:0,status:false,saved:7});
  await page.screenshot({path:path.join(out,'armor-after-cleanse.png')});
  const repeat=await page.evaluate(async()=>{
   const {MapEncounters}=await import('/dark-fantasy-rpg/src/systems/MapEncounters.js');
   const {WorldState}=await import('/dark-fantasy-rpg/src/systems/WorldState.js');
   const maps=(await import('/dark-fantasy-rpg/src/data/maps.json?import')).default;
   const ws=new WorldState(new Map()),cfg=maps.chapel_inside.encounters.find(e=>e.id==='chapel_cult');
   const it={cfg,state:'idle'},obj=Object.create(MapEncounters.prototype);let talks=0,finished=0;
   Object.assign(obj,{ws,scene:{},list:[it],_cooldown:0,hooks:{talk:()=>talks++},finish:()=>{it.state='done';finished++;}});
   obj._onClick(it);ws.setFlag('chapel_peaceful');obj._onClick(it);obj.update(16,{x:0,y:0});obj._onClick(it);
   return{talks,finished};
  });assert.deepEqual(repeat,{talks:1,finished:1});
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'support-results.json'),JSON.stringify({cleaned,repeat,errors},null,2));console.log(JSON.stringify({cleaned,repeat,errors},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
