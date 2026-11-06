// Длинная сессия: бои подряд, после каждого текстуры, JS heap, видеопамять по оценке. Падение вкладки ловится.
// MORTIS_PUPPETEER=... AUDIT_OUT=/tmp/x [SOAK_N=60] node tools/qa/battle-soak.cjs
const puppeteer=require(process.env.MORTIS_PUPPETEER||'puppeteer-core');
const fs=require('node:fs'),path=require('node:path');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const OUT=process.env.AUDIT_OUT,N=+process.env.SOAK_N||60;
const ids=require(path.resolve('src/data/battles.json')).map(b=>b.id);
(async()=>{
 const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new',args:['--use-angle=metal','--ignore-gpu-blocklist'],defaultViewport:{width:1280,height:720}});
 const page=await browser.newPage(),rows=[];let crashed=null,last='';
 page.on('error',e=>{crashed=e.message;});page.on('close',()=>{crashed=crashed||'page closed';});
 page.on('pageerror',e=>rows.push({err:e.message.slice(0,200),last}));
 page.on('console',m=>{const t=m.text();if(/context|lost|memory/i.test(t))rows.push({console:t.slice(0,200),last});});
 const cdp=await page.createCDPSession();await cdp.send('Performance.enable');
 await page.goto('http://127.0.0.1:5178/dark-fantasy-rpg/',{waitUntil:'domcontentloaded',timeout:120000});
 await page.waitForFunction(()=>window.__game?.scene?.isActive('BootScene'),{timeout:120000});await pause(3000);
 await page.evaluate(()=>{localStorage.clear();});await page.mouse.click(640,590);
 await page.waitForFunction(()=>{const s=window.__game.scene.getScene('MapScene');return s?.scene.isActive()&&s.hero;},{timeout:180000});await pause(1500);
 const snap=()=>page.evaluate(()=>{const g=window.__game;let mp=0,n=0;const seen=new Set();Object.values(g.textures.list).forEach(t=>{n++;t.source?.forEach(s=>{if(s.width&&!seen.has(s)){seen.add(s);mp+=s.width*s.height/1e6;}});});return {tex:n,mp:+mp.toFixed(0),cacheJson:g.cache.json.entries.size,anims:g.anims.anims.size};});
 for(let i=0;i<N;i++){
  const id=ids[i%ids.length];last=id;
  try{
   await page.evaluate(id=>{const g=window.__game,r=g.registry,p=['hero_duelist','companion_brawler','companion_healer'];r.set('party',p);r.set('roster',p);r.set('partySlots',3);g.scene.getScenes(true)[0].scene.start('LoadingScene',{destination:'BattleScene',destinationData:{battleId:id,fromMapKey:'village',fromSpawnId:'default'}});},id);
   await page.waitForFunction(()=>{const s=window.__game.scene.getScene('BattleScene');return s?.scene.isActive()&&s.turnManager?.active;},{timeout:90000});await pause(1500);
   await cdp.send('HeapProfiler.collectGarbage');const {metrics}=await cdp.send('Performance.getMetrics');
   const s=await snap();rows.push({i,id,...s,heap:+(metrics.find(m=>m.name==='JSHeapUsedSize').value/1048576).toFixed(0)});console.log(JSON.stringify(rows.at(-1)));
   // Как в игре: с боя через LoadingScene, там выгрузка листов
   await page.evaluate(()=>window.__game.scene.getScene('BattleScene').scene.start('LoadingScene',{destination:'MapScene',destinationData:{mapKey:'village',spawnId:'default'}}));
   await page.waitForFunction(()=>{const s=window.__game.scene.getScene('MapScene');return s?.scene.isActive()&&s.mapKey==='village'&&s.hero;},{timeout:60000});await pause(600);
  }catch(e){rows.push({i,id,fail:e.message.slice(0,160),crashed});console.log('FAIL',i,id,e.message.slice(0,120));break;}
  fs.writeFileSync(`${OUT}/soak.json`,JSON.stringify(rows));
 }
 await browser.close().catch(()=>{});
})().catch(e=>{console.error(e);process.exitCode=1;});
