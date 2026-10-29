const puppeteer=require(process.env.MORTIS_PUPPETEER||'puppeteer-core');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const out=path.resolve('assets/generated/_qa/codex-2026-10-29');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--enable-unsafe-swiftshader'],defaultViewport:{width:1280,height:720}});
 const errors=[],results=[];let page;
 try{
  page=await browser.newPage();page.on('pageerror',e=>errors.push(e.stack));page.on('response',r=>{if(r.status()>=400&&!r.url().endsWith('favicon.ico'))errors.push(`${r.status()} ${r.url()}`)});
  await page.evaluateOnNewDocument(()=>performance.setResourceTimingBufferSize(5000));
  await page.goto(process.env.MORTIS_URL||'http://127.0.0.1:5179/dark-fantasy-rpg/');await page.waitForSelector('canvas');await page.waitForNetworkIdle({idleTime:800,timeout:60000});await pause(2200);
  assert.equal(await page.evaluate(()=>typeof window.__game),'undefined');
  await page.keyboard.press('Enter');await page.waitForNetworkIdle({idleTime:1500,timeout:60000});await pause(1500);
  await page.screenshot({path:path.join(out,'production-map.png')});
  // Click the marauder's visible body on the initial map, then the Attack dialogue choice.
  await page.mouse.click(699,395);await pause(300);await page.keyboard.press('4');
  await page.waitForNetworkIdle({idleTime:1500,timeout:60000});await pause(1500);
  await page.screenshot({path:path.join(out,'production-battle.png')});
  await page.mouse.move(362,660);await pause(250);await page.screenshot({path:path.join(out,'production-skill-tooltip.png')});await page.mouse.move(640,100);
  const assets=await page.evaluate(()=>performance.getEntriesByType('resource').map(e=>({url:e.name,bytes:e.transferSize,duration:Math.round(e.duration)})));
  assert.ok(assets.some(e=>/sprites\/battle\//.test(e.url)),'Battle assets never requested: dialogue/entry failed');
  results.push({viewport:'1280x720',resources:assets.length,transferMiB:+(assets.reduce((s,e)=>s+e.bytes,0)/1024**2).toFixed(1),slowestLocalRequests:assets.sort((a,b)=>b.duration-a.duration).slice(0,5)});
  await page.setViewport({width:1920,height:1080,deviceScaleFactor:2});await pause(300);
  results.push(await page.evaluate(()=>{const c=document.querySelector('canvas'),r=c.getBoundingClientRect();return {viewport:'1920x1080 @2x',buffer:[c.width,c.height],css:[r.width,r.height],dpr:devicePixelRatio};}));
  await page.screenshot({path:path.join(out,'production-battle-1920-dpr2.png')});
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'production-results.json'),JSON.stringify({results,errors},null,2));console.log(JSON.stringify({results,errors},null,2));
 }catch(e){if(page)await page.screenshot({path:path.join(out,'production-failure.png')});throw e;}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
