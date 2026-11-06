// Обход игры для визуального аудита: все карты, все бои, окна. Снимки и метрики (FPS, ошибки, 404) в AUDIT_OUT.
// npm run dev -- --host 127.0.0.1 --port 5178 --strictPort
// MORTIS_PUPPETEER=.../puppeteer-core AUDIT_OUT=/tmp/x node tools/qa/visual-tour.cjs
const puppeteer=require(process.env.MORTIS_PUPPETEER||'puppeteer-core');
const fs=require('node:fs'),path=require('node:path');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const OUT=process.env.AUDIT_OUT;
const maps=process.env.TOUR_BATTLES?[]:Object.keys(require(path.resolve('src/data/maps.json')));
const battles=require(path.resolve('src/data/battles.json'));
const battleIds=(process.env.TOUR_BATTLES?process.env.TOUR_BATTLES.split(','):Array.isArray(battles)?battles.map(b=>b.id):Object.keys(battles));
(async()=>{
 const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new',args:['--use-angle=metal','--ignore-gpu-blocklist','--enable-gpu-rasterization'],defaultViewport:{width:1280,height:720}});
 const log={errors:[],http:[],maps:{},battles:{},windows:{}};
 const page=await browser.newPage();
 let where='boot';
 page.on('pageerror',e=>log.errors.push({where,msg:e.message.slice(0,300)}));
 page.on('console',m=>{if(m.type()==='error')log.errors.push({where,msg:m.text().slice(0,200)});});
 page.on('response',r=>{if(r.status()>=400)log.http.push({where,s:r.status(),u:r.url().slice(-90)});});
 const fps=()=>page.evaluate(()=>new Promise(res=>{let n=0,t0=performance.now(),max=0,last=t0;const f=t=>{n++;max=Math.max(max,t-last);last=t;if(t-t0<2000)requestAnimationFrame(f);else res({fps:+(n/((t-t0)/1000)).toFixed(1),maxFrameMs:Math.round(max)});};requestAnimationFrame(f);}));
 await page.goto(process.env.MORTIS_URL||'http://127.0.0.1:5178/dark-fantasy-rpg/',{waitUntil:'domcontentloaded',timeout:120000});
 await page.evaluate(()=>localStorage.clear());await page.reload({waitUntil:'domcontentloaded',timeout:120000});
 await page.waitForFunction(()=>window.__game?.scene?.isActive('BootScene'),{timeout:120000});await pause(3000);
 await page.screenshot({path:`${OUT}/title.png`});
 await page.mouse.click(640,590);
 await page.waitForFunction(()=>{const s=window.__game.scene.getScene('MapScene');return s?.scene.isActive()&&s.hero;},{timeout:180000});await pause(2000);
 log.renderer=await page.evaluate(()=>{const g=window.__game.renderer.gl,e=g?.getExtension('WEBGL_debug_renderer_info');return e?g.getParameter(e.UNMASKED_RENDERER_WEBGL):'?';});
 for(const m of maps){
  where='map:'+m;const t0=Date.now();
  try{
   await page.evaluate(m=>{const r=window.__game.scene;r.getScene('MapScene')._transitionTo(m,'default');},m);
   await page.waitForFunction(m=>{const s=window.__game.scene.getScene('MapScene');return s.scene.isActive()&&s.mapKey===m&&!s._transitioning&&!s.load.isLoading()&&s.hero;},{timeout:60000},m);
   const load=Date.now()-t0;await pause(1500);await page.screenshot({path:`${OUT}/map_${m}.jpg`,type:'jpeg',quality:82});
   log.maps[m]={load,...await fps()};
  }catch(e){log.maps[m]={fail:e.message.slice(0,160)};await page.screenshot({path:`${OUT}/map_${m}_FAIL.jpg`,type:'jpeg'}).catch(()=>{});}
 }
 where='windows';
 await page.evaluate(()=>window.__game.scene.getScene('MapScene')._transitionTo('tavern_inside','default'));
 await page.waitForFunction(()=>{const s=window.__game.scene.getScene('MapScene');return s.scene.isActive()&&s.mapKey==='tavern_inside'&&!s._transitioning&&!s.load.isLoading();},{timeout:60000});await pause(1500);
 for(const [n,x] of [['purse',543],['journal',592],['party',641],['map',690],['menu',747]]){
  await page.mouse.click(x,672);await pause(900);await page.screenshot({path:`${OUT}/win_${n}.jpg`,type:'jpeg',quality:85});
  await page.keyboard.press('Escape');await pause(400);await page.evaluate(()=>{});
 }
 for(const shop of ['vorn']){await page.evaluate(id=>window.__game.scene.getScene('MapScene')._openShop(id),shop).catch(()=>{});await pause(900);await page.screenshot({path:`${OUT}/win_shop.jpg`,type:'jpeg',quality:85});await page.keyboard.press('Escape');await pause(400);}
 // Первый NPC карты: окно диалога
 const n=await page.evaluate(()=>{const s=window.__game.scene.getScene('MapScene');return (s._npcs||[]).length;});
 for(let i=0;i<Math.min(n,3);i++){await page.evaluate(i=>{const s=window.__game.scene.getScene('MapScene');const o=s._npcs[i];(o.sprite||o.img||o).emit?.('pointerdown',{x:0,y:0,leftButtonDown:()=>true});},i).catch(()=>{});await pause(2500);await page.screenshot({path:`${OUT}/win_dialog${i}.jpg`,type:'jpeg',quality:85});await page.keyboard.press('Escape');await pause(600);}
 for(const id of battleIds){
  where='battle:'+id;const t0=Date.now();
  try{
   await page.evaluate(id=>{const g=window.__game,r=g.registry,p=['hero_duelist','companion_brawler','companion_healer'];r.set('party',p);r.set('roster',p);r.set('partySlots',3);g.scene.getScenes(true)[0].scene.start('LoadingScene',{destination:'BattleScene',destinationData:{battleId:id,fromMapKey:'village',fromSpawnId:'default'}});},id);
   await page.waitForFunction(()=>{const s=window.__game.scene.getScene('BattleScene');return s?.scene.isActive()&&s.turnManager?.active;},{timeout:25000});
   const load=Date.now()-t0;await pause(2200);await page.screenshot({path:`${OUT}/battle_${id}.jpg`,type:'jpeg',quality:82});
   log.battles[id]={load,...await fps()};
  }catch(e){log.battles[id]={fail:e.message.slice(0,160)};await page.screenshot({path:`${OUT}/battle_${id}_FAIL.jpg`,type:'jpeg'}).catch(()=>{});}
  fs.writeFileSync(`${OUT}/tour.json`,JSON.stringify(log,null,1));
  await page.evaluate(()=>{const g=window.__game;g.scene.getScene('BattleScene').scene.start('LoadingScene',{destination:'MapScene',destinationData:{mapKey:'village',spawnId:'default'}});}).catch(()=>{});
  await pause(2000);
 }
 fs.writeFileSync(`${OUT}/tour.json`,JSON.stringify(log,null,1));
 await browser.close();
})().catch(e=>{console.error(e);process.exitCode=1;});
