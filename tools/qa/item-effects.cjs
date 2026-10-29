// Controlled inventory fixture; real useItem, localStorage reload and BattleScene initialization.
const puppeteer=require(process.env.MORTIS_PUPPETEER||'puppeteer-core');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const out=path.resolve('assets/generated/_qa/codex-2026-10-30-effects');fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--enable-unsafe-swiftshader'],defaultViewport:{width:1280,height:720}});
 const errors=[];
 try{
  const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.stack));
  page.on('response',r=>{if(r.status()>=400&&!r.url().endsWith('favicon.ico'))errors.push(`${r.status()} ${r.url()}`)});
  const boot=async()=>{await page.waitForFunction(()=>window.__game?.scene.getScene('BootScene')._enter&&window.__game.scene.getScene('BootScene').time.now>1900,{timeout:60000});await page.keyboard.press('Enter');await page.waitForFunction(()=>window.__game.scene.getScene('MapScene').scene.isActive()&&window.__game.scene.getScene('MapScene')._runner,{timeout:60000});};
  await page.goto(process.env.MORTIS_URL||'http://127.0.0.1:5178/dark-fantasy-rpg/');await boot();
  const used=await page.evaluate(async()=>{
   const g=window.__game,s=g.scene.getScene('MapScene'),E=await import('/dark-fantasy-rpg/src/systems/Economy.js');
   g.registry.set('party',['hero_duelist','companion_brawler']);g.registry.set('roster',['hero_duelist','companion_brawler']);g.registry.set('partySlots',2);
   s._ws.giveItem('dark_beer',1);
   const result=E.useItem('dark_beer','companion_brawler',s._ws,{mapKey:'south_post',spawnId:'default'});
   return {result,pending:g.registry.get('next_battle_buffs')};
  });
  assert.equal(used.result.ok,true);assert.equal(used.pending[0].unit,'companion_brawler');
  await page.reload();await boot();
  assert.deepEqual(await page.evaluate(()=>window.__game.registry.get('next_battle_buffs')),used.pending);
  await page.evaluate(()=>{const g=window.__game;g.scene.stop('MapScene');g.scene.start('BattleScene',{battleId:'road_looters',fromMapKey:'south_post'});});
  await page.waitForFunction(()=>{const s=window.__game.scene.getScene('BattleScene');return s.scene.isActive()&&s.playerUnits?.[1]?._animSprite?.active&&!s.load.isLoading();},{timeout:60000});
  const applied=await page.evaluate(()=>{const s=window.__game.scene.getScene('BattleScene'),h=s.playerUnits.find(u=>u.id==='hero_duelist'),b=s.playerUnits.find(u=>u.id==='companion_brawler');b._animSprite.emit('pointerover');return {hero:h.effects,brawler:b.effects,pending:window.__game.registry.get('next_battle_buffs')};});
  assert.equal(applied.hero.some(e=>e.type==='enraged'),false);assert.equal(applied.brawler.find(e=>e.type==='enraged')?.value,1);assert.deepEqual(applied.pending,[]);
  await page.screenshot({path:path.join(out,'beer-recipient.png')});
  const expired=await page.evaluate(()=>{const s=window.__game.scene.getScene('BattleScene'),b=s.playerUnits.find(u=>u.id==='companion_brawler');b.endTurn();const first=b.getEffect('enraged')?.duration;b.endTurn();return {first,expired:!b.hasEffect('enraged')};});
  assert.deepEqual(expired,{first:1,expired:true});
  assert.deepEqual(errors,[]);const results={used,applied,expired,errors};fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
