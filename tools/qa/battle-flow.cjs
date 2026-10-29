// Run against a dev server. MORTIS_PUPPETEER may point to an isolated installation.
const puppeteer = require(process.env.MORTIS_PUPPETEER || 'puppeteer-core');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const out = path.resolve('assets/generated/_qa/codex-2026-10-29');
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
  // Real hit and completion events, with a deterministic lethal fixture.
  await battle({mode:'iron'});
  await page.evaluate(() => {
   const s=window.__game.scene.getScene('BattleScene'), a=s.playerUnits[0];
   s.enemyUnits.forEach((u,i)=>{u.hp=i?0:1;u.isAlive=!i;});
   const t=s.enemyUnits[0]; t.armor=0; a.accuracy=1000;
   window.__flow={maxFrame:0,blocked:true};
   const oldRandom=Math.random; let seed=42; Math.random=()=>((seed=(1664525*seed+1013904223)>>>0)/4294967296);
   const key=a._animCfg.anims.slash.key;
   const end=s._endBattle;
   s._endBattle=function(result){window.__flow.endFrame=window.__flow.maxFrame;Math.random=oldRandom;return end.call(this,result);};
   s._onEnemyClick(t);
   a._animSprite.on('animationupdate',(anim,frame)=>{if(anim.key===key) window.__flow.maxFrame=Math.max(window.__flow.maxFrame,frame.index);});
   const active=s.turnManager.active;
   s._onSkillSelect('dueling_stance'); s._onEnemyClick(t);
   window.__flow.blocked=s._animLock&&active===s.turnManager.active&&!a.effects.some(e=>e.type==='dodge_boost');
  });
  await page.waitForFunction(()=>window.__game.scene.getScene('BattleScene').battleOver,{timeout:10000});
  const victorySave=await page.evaluate(()=>JSON.parse(localStorage.getItem('darkfantasy_ironman_v1')));
  assert.equal(victorySave.inBattle,undefined);assert.equal(victorySave.world.partyXp,25);
  const lethal=await page.evaluate(()=>({...window.__flow,lock:window.__game.scene.getScene('BattleScene')._animLock}));
  assert.equal(lethal.endFrame,23);assert.equal(lethal.blocked,true);assert.equal(lethal.lock,false);
  await pause(1000);await page.screenshot({path:path.join(out,'victory.png')});results.push({name:'lethal strike finishes all 23 frames; repeated input blocked',...lethal});
  // Support action: no healing before impact, one resource spent, cast completes before next turn.
  await battle({party:['hero_duelist','companion_healer']});
  await page.evaluate(()=>{
   const s=window.__game.scene.getScene('BattleScene'), h=s.playerUnits.find(u=>u.id==='companion_healer'), t=s.playerUnits[0];
   s.turnManager.index=s.turnManager.queue.indexOf(h);s.turnManager.active=h;s.turnManager._setPhase(h);s._renderAll();
   t.hp=20;window.__heal={before:t.hp,supply:h.resources.supplies};
   s._onSkillSelect('bandage');s._onAllyClick(t);
   window.__heal.initial=t.hp;window.__heal.anim=h._animSprite.anims.currentAnim.key;
  });
  await pause(350);await page.screenshot({path:path.join(out,'bandage-cast.png')});
  await page.waitForFunction(()=>!window.__game.scene.getScene('BattleScene')._animLock,{timeout:10000});
  const healing=await page.evaluate(()=>{const s=window.__game.scene.getScene('BattleScene');return {...window.__heal,after:s.playerUnits[0].hp,remaining:s.playerUnits[1].resources.supplies};});
  assert.equal(healing.initial,healing.before);assert.ok(healing.anim.includes('cast2'));assert.ok(healing.after>healing.before);assert.equal(healing.remaining,healing.supply-1);results.push({name:'bandage casts before healing, spends once',...healing});
  await battle();
  await page.evaluate(()=>{const s=window.__game.scene.getScene('BattleScene');s._onSkillSelect('dueling_stance');window.__stance={anim:s.playerUnits[0]._animSprite.anims.currentAnim.key,lock:s._animLock};});
  await pause(180);await page.screenshot({path:path.join(out,'stance.png')});
  assert.ok((await page.evaluate(()=>window.__stance.anim)).includes('block'));
  await page.waitForFunction(()=>!window.__game.scene.getScene('BattleScene')._animLock,{timeout:10000});assert.equal(await page.evaluate(()=>window.__game.scene.getScene('BattleScene').playerUnits[0].getEffect('dodge_boost')?.value),0.3);results.push({name:'self skill plays stance; dodge survives into enemy turn'});
  // No sheet ready: the fallback still locks input until its motion finishes.
  await battle();
  const fallback=await page.evaluate(()=>{const s=window.__game.scene.getScene('BattleScene');let count=0;s._performAction(s.playerUnits[0],s.enemyUnits[0],null,()=>count++);s._onEnemyClick(s.enemyUnits[0]);return {count,lock:s._animLock};});
  assert.deepEqual(fallback,{count:1,lock:true});await page.waitForFunction(()=>!window.__game.scene.getScene('BattleScene')._animLock);results.push({name:'fallback animation blocks repeated action'});
  // A death interrupt must retain the action completion callback.
  await battle({mode:'iron'});
  await page.evaluate(()=>{const s=window.__game.scene.getScene('BattleScene'),a=s.playerUnits[0];s._performAction(a,s.enemyUnits[0],s._actionAnim(a,'basic'),()=>a.takeDamage(100000,{ignoreArmor:1}));});
  await page.waitForFunction(()=>window.__game.scene.getScene('BattleScene').battleOver,{timeout:10000});
  assert.equal(await page.evaluate(()=>window.__game.scene.getScene('BattleScene')._animLock),false);
  await pause(1400);assert.equal(await page.evaluate(()=>localStorage.getItem('darkfantasy_ironman_v1')),null);
  await page.screenshot({path:path.join(out,'iron-defeat.png')});results.push({name:'death interrupts action safely; Iron defeat deletes save'});
  await battle({ambush:true});
  await page.waitForFunction(()=>window.__game.scene.getScene('BattleScene').turnManager.isPlayerTurn(),{timeout:15000});
  results.push({name:'ambush starts AI automatically and returns control'});
  // Iron reload in battle resolves at the title, isolated from the real user's saves.
  await battle({mode:'iron'});await page.reload();
  await page.waitForFunction(()=>typeof window.__game?.scene.getScene('BootScene')._enter==='function',{timeout:60000});
  assert.equal(await page.evaluate(()=>localStorage.getItem('darkfantasy_ironman_v1')),null);results.push({name:'Iron reload during battle deletes save'});
  // Full first encounter with real stats, AI, skill costs and hit rolls. No HP/damage fixtures.
  for (const mode of ['chronicle','iron']) {
   await battle({mode});
   await page.evaluate(()=>{const s=window.__game.scene.getScene('BattleScene'),end=s._endBattle;s._endBattle=function(result){window.__actualResult=result;return end.call(this,result);};window.__actualResult=null;});
   const deadline=Date.now()+90000;let actions=0;
   while(Date.now()<deadline){
    const state=await page.evaluate(()=>{const s=window.__game.scene.getScene('BattleScene');if(s.battleOver)return 'done';if(s._animLock||!s.turnManager.isPlayerTurn())return 'wait';const a=s.turnManager.active,foes=s.enemyUnits.filter(u=>u.isAlive&&!u.surrendered);const target=foes.reduce((a,b)=>a.hp<b.hp?a:b);const skill=['pistol_shot','rapier_strike'].find(id=>a.skills.includes(id)&&s.skillSystem.canUse(id,a));if(skill)s._onSkillSelect(skill);s._onEnemyClick(target);return 'acted';});
    if(state==='done')break;if(state==='acted')actions++;await pause(120);
   }
   assert.equal(await page.evaluate(()=>window.__game.scene.getScene('BattleScene').battleOver),true);
   await pause(1400);const result=await page.evaluate(()=>({result:window.__actualResult,hp:window.__game.scene.getScene('BattleScene').playerUnits[0].hp,save:!!localStorage.getItem('darkfantasy_ironman_v1')}));
   await page.screenshot({path:path.join(out,`natural-${mode}.png`)});results.push({name:'full first encounter, unmodified combat stats',mode,actions,...result});console.log('Natural battle',mode,result);
  }
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(out,'battle-results.json'),JSON.stringify({results,errors},null,2));
  console.log(JSON.stringify({results,errors},null,2));
 } catch(e) { const pages=await browser.pages(); const p=pages.at(-1); console.log('Browser diagnostics',errors,await p.evaluate(()=>({scenes:window.__game?.scene.getScenes(true).map(s=>s.scene.key),texts:window.__game?.scene.getScenes(true).flatMap(s=>s.children.list.filter(x=>x.text).map(x=>x.text))})));await p.screenshot({path:path.join(out,'failure.png')});throw e; } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
