const puppeteer=require(process.env.MORTIS_PUPPETEER||'puppeteer-core');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const out=path.resolve('assets/generated/_qa/codex-2026-10-30');fs.mkdirSync(out,{recursive:true});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--enable-unsafe-swiftshader'],defaultViewport:{width:1280,height:720}});
 const page=await browser.newPage(),errors=[],results=[];
 page.on('pageerror',e=>{errors.push(e.stack);console.log(e.stack)});
 page.on('response',r=>{if(r.status()>=400&&!r.url().endsWith('favicon.ico'))errors.push(`${r.status()} ${r.url()}`)});
 const mapReady=async id=>{await page.waitForFunction(id=>{const s=window.__game?.scene.getScene('MapScene');return s?.scene.isActive()&&s.mapKey===id&&s._runner&&!s._transitioning;},{timeout:60000},id);await pause(900);};
 const boot=async()=>{await page.waitForFunction(()=>window.__game?.scene.getScene('BootScene')._enter&&window.__game.scene.getScene('BootScene').time.now>1900,{timeout:60000});await page.keyboard.press('Enter');};
 const choose=async n=>{await page.keyboard.press(String(n));await pause(250);};
 const talk=async id=>{await page.evaluate(id=>{const s=window.__game.scene.getScene('MapScene');const n=s._npcs.find(n=>n.cfg.id===id||n.cfg.name===id);if(!n)throw Error(`NPC missing ${id}`);n.sprite.emit('pointerdown');},id);await pause(100);};
 async function walk(to){
  const started=await page.evaluate(async to=>{const s=window.__game.scene.getScene('MapScene'),m=(await import('/dark-fantasy-rpg/src/data/maps.json?import')).default[s.mapKey];const exit=(m.exits||[]).find(e=>e.toMap===to)||(m.tavernEntry?.toMap===to?m.tavernEntry:null);if(!exit)throw Error(`No exit ${s.mapKey} -> ${to}`);return s._walkToExit(exit);},to);
  assert.equal(started,true);await mapReady(to);console.log('Walked to',to);results.push({walk:to});await page.screenshot({path:path.join(out,`route-${to}.png`)});
 }
 async function clickChoice(text){
  const p=await page.evaluate(text=>{const s=window.__game.scene.getScene('MapScene');const t=s.children.list.find(o=>o.visible&&typeof o.text==='string'&&o.text.includes(text));if(!t)throw Error('Choice missing '+text);const b=t.getBounds();return{x:b.centerX*s.cameras.main.zoom,y:b.centerY*s.cameras.main.zoom};},text);
  await page.mouse.click(p.x,p.y);await pause(250);
 }
 async function closeWindows(){await page.evaluate(async()=>{const s=window.__game.scene.getScene('MapScene');s._dialogue.hide();const {Frame}=await import('/dark-fantasy-rpg/src/ui/Frame.js');Frame.closeCurrent(s);});await pause(150);}
 try{
  await page.goto(process.env.MORTIS_URL||'http://127.0.0.1:5178/dark-fantasy-rpg/');await boot();await mapReady('south_post');
  // Dialogue keyboard choices use the same callbacks as clicking the visible buttons.
  await talk('marauder');await choose(3);await choose(1);
  assert.equal(await page.evaluate(()=>window.__game.registry.get('road_looters_done')),true);
  assert.equal(await page.evaluate(()=>window.__game.registry.get('partyXp')),25);
  await talk('vornag_post');await choose(4);await choose(1);
  const reserve=await page.evaluate(()=>({party:window.__game.registry.get('party'),roster:window.__game.registry.get('roster')}));
  assert.equal(reserve.party.length,1);assert.ok(reserve.roster.includes('companion_brawler'));
  results.push({name:'peaceful opening gives 25 XP; Vornag recruited into reserve'});
  await walk('three_pillars');await walk('three_pillars_inside');
  await talk('agna');await choose(2);await choose(1);await closeWindows();
  assert.equal(await page.evaluate(()=>window.__game.registry.get('courier_buried')),true);
  assert.equal(await page.evaluate(()=>window.__game.registry.get('partyXp')),35);
  results.push({name:'peaceful courier burial accessible, XP 35'});
  await walk('three_pillars');await walk('map1');await walk('tavern_map');await walk('tavern_inside');
  await talk('Ворн');
  await clickChoice('Можно почитать устав');await closeWindows();
  await talk('Мира');await clickChoice('Чью грязь');await clickChoice('Я никому');await closeWindows();
  assert.equal(await page.evaluate(()=>window.__game.registry.get('partyXp')),65);
  await page.evaluate(()=>window.__game.scene.getScene('MapScene')._toggleJournal());await pause(200);
  await page.screenshot({path:path.join(out,'journal-hints.png')});await closeWindows();
  // Shop and rest operate on the real route state, not invented inventory.
  await page.evaluate(()=>window.__game.scene.getScene('MapScene')._openShop('vorn'));await pause(250);
  await page.screenshot({path:path.join(out,'shop-vorn.png')});
  const trade=await page.evaluate(async()=>{const s=window.__game.scene.getScene('MapScene');const E=await import('/dark-fantasy-rpg/src/systems/Economy.js');const gold=s._ws.registry.get('playerGold');return {gold,items:s._ws.registry.get('items'),shop:!!s._shopWindow};});
  const bread=await page.evaluate(()=>{const s=window.__game.scene.getScene('MapScene'),t=s._shopWindow.parts.find(o=>o.text?.startsWith('Ржаной хлеб'));if(!t)throw Error('Bread row missing');const b=t.getBounds(),c=s.cameras.main;return {x:b.centerX*c.zoom,y:b.centerY*c.zoom};});
  await page.mouse.click(bread.x,bread.y);await pause(150);
  const bought=await page.evaluate(()=>({gold:window.__game.registry.get('playerGold'),bread:window.__game.registry.get('items').bread}));
  assert.ok(bought.gold<trade.gold);assert.equal(bought.bread,(trade.items.bread||0)+1);
  results.push({name:'Vorn shop: actual bread purchase',...bought});await closeWindows();
  await page.evaluate(()=>window.__game.scene.getScene('MapScene')._rest());
  const checkpoint=await page.evaluate(()=>JSON.parse(localStorage.getItem('darkfantasy_rest_v3')));assert.equal(checkpoint.mapKey,'tavern_inside');
  await page.reload();await boot();await mapReady('tavern_inside');
  assert.ok((await page.evaluate(()=>window.__game.registry.get('roster'))).includes('companion_brawler'));
  results.push({name:'rest and reload preserve reserve and location'});
  // Existing dialogue rewards only: no registry XP grants, no stat overrides.
  await walk('tavern_map');await walk('forest1');
  await page.evaluate(()=>{const s=window.__game.scene.getScene('MapScene'),b=s._bandits[0];s.hero.moveTo(b.unit.x,b.unit.y);});
  await page.waitForFunction(()=>window.__game.scene.getScene('MapScene')._dialogue.active,{timeout:30000});
  await pause(150);await clickChoice('встречное предложение');await clickChoice('кто были люди в плащах');
  await page.waitForFunction(()=>window.__game.scene.getScene('LevelUpScene')._current);
  await page.screenshot({path:path.join(out,'level2-before-reload.png')});
  await page.reload();await boot();await mapReady('forest1');
  await page.waitForFunction(()=>window.__game.scene.isActive('LevelUpScene'),{timeout:10000});
  assert.equal(await page.evaluate(()=>window.__game.scene.getScene('MapScene').input.enabled),false);
  await page.screenshot({path:path.join(out,'level2-recovered.png')});
  // Click real improvement cards in order until the level screen closes.
  for(let i=0;i<8;i++){
   if(!await page.evaluate(()=>window.__game.scene.isActive('LevelUpScene')))break;
   const point=await page.evaluate(()=>{const s=window.__game.scene.getScene('LevelUpScene');const label=s._current?.choices?.[0]?.label;const t=s.children.list.find(t=>t.text===label&&t.visible);if(!t)throw Error(`Missing card ${label}`);const b=t.getBounds();return{x:b.centerX,y:b.centerY};});
   await page.mouse.click(point.x,point.y);await pause(200);
  }
  assert.equal(await page.evaluate(()=>window.__game.scene.isActive('LevelUpScene')),false);
  const leveled=await page.evaluate(()=>JSON.parse(localStorage.getItem('darkfantasy_ironman_v1')));
  assert.equal(leveled.world.partyXp,133);assert.ok(leveled.units.every(u=>u.level===2));
  assert.ok(leveled.units.find(u=>u.id==='hero_duelist').commanderTraits.length);
  await page.reload();await boot();await mapReady('forest1');
  assert.equal(await page.evaluate(()=>window.__game.scene.isActive('LevelUpScene')),false);
  results.push({name:'F5 recovers level choices for hero and reserve; completed level never repeats',units:leveled.units.map(u=>({id:u.id,level:u.level}))});
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'route-results.json'),JSON.stringify({results,errors},null,2));console.log(JSON.stringify({results,errors},null,2));
 }catch(e){console.log('Diagnostics',await page.evaluate(()=>({scenes:window.__game?.scene.getScenes(true).map(s=>s.scene.key),map:window.__game?.scene.getScene('MapScene').mapKey,texts:window.__game?.scene.getScenes(true).flatMap(s=>s.children.list.filter(o=>o.text&&o.visible).map(o=>o.text))})));await page.screenshot({path:path.join(out,'route-failure.png')});throw e;}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
