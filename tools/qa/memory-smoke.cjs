const puppeteer=require(process.env.MORTIS_PUPPETEER||'puppeteer-core');
const fs=require('node:fs'),assert=require('node:assert/strict');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--enable-unsafe-swiftshader'],defaultViewport:{width:1280,height:720}});
 const errors=[],samples=[];
 try{
  const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.stack));
  await page.goto(process.env.MORTIS_URL||'http://127.0.0.1:5178/dark-fantasy-rpg/');
  await page.waitForFunction(()=>window.__game?.scene.getScene('BootScene')._enter&&window.__game.scene.getScene('BootScene').time.now>1900,{timeout:60000});await page.keyboard.press('Enter');
  await page.waitForFunction(()=>window.__game?.scene.getScene('MapScene')._runner,{timeout:60000});await pause(900);
  const cdp=await page.createCDPSession();await cdp.send('Performance.enable');
  for(let cycle=0;cycle<4;cycle++){
   // Transition hooks stress scene/cache cleanup; this is not a navigation/playability test.
   for(const map of ['map1','tavern_map','tavern_inside']){
    await page.evaluate(map=>window.__game.scene.getScene('MapScene')._transitionTo(map,'default'),map);
    await page.waitForFunction(map=>{const s=window.__game.scene.getScene('MapScene');return s.scene.isActive()&&s.mapKey===map&&!s._transitioning&&!s.load.isLoading();},{timeout:60000},map);await pause(1000);
   }
   await cdp.send('HeapProfiler.collectGarbage');
   const {metrics}=await cdp.send('Performance.getMetrics');
   const sample=await page.evaluate(()=>{const g=window.__game,images=new Set();Object.values(g.textures.list).forEach(t=>t.source?.forEach(s=>{if(s.image)images.add(s.image)}));return {map:g.scene.getScene('MapScene').mapKey,activeScenes:g.scene.getScenes(true).map(s=>s.scene.key),textures:Object.keys(g.textures.list).length,sourceMegapixels:+([...images].reduce((n,i)=>n+(i.width||0)*(i.height||0),0)/1e6).toFixed(2)};});
   samples.push({...sample,cycle,heapMiB:+(metrics.find(m=>m.name==='JSHeapUsedSize').value/1024**2).toFixed(2)});console.log(samples.at(-1));
  }
  assert.deepEqual(errors,[]);assert.ok(samples.every(s=>s.activeScenes.length===1));
  assert.ok(samples.at(-1).sourceMegapixels<=samples[0].sourceMegapixels+1,'Texture surface grows across identical routes');
  assert.ok(samples.at(-1).heapMiB<=samples[0].heapMiB*1.25+5,'Heap grows substantially after repeated routes');
  fs.writeFileSync('assets/generated/_qa/codex-2026-10-29/memory-results.json',JSON.stringify({samples,errors},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
