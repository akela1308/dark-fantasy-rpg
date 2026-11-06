// Резкость: окно 1920×1080 при DPR 2, размер буфера, клики в окнах, снимки. AUDIT_OUT, MORTIS_PUPPETEER
const puppeteer=require(process.env.MORTIS_PUPPETEER||'puppeteer-core');
const pause=ms=>new Promise(r=>setTimeout(r,ms));const OUT=process.env.AUDIT_OUT;
(async()=>{
 const b=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new',args:['--use-angle=metal','--ignore-gpu-blocklist'],defaultViewport:{width:1920,height:1080,deviceScaleFactor:2}});
 const p=await b.newPage(),err=[];p.on('pageerror',e=>err.push(e.message.slice(0,200)));p.on('console',m=>{if(m.type()==='error')err.push(m.text().slice(0,160));});
 await p.goto('http://127.0.0.1:5178/dark-fantasy-rpg/',{waitUntil:'domcontentloaded'});await p.evaluate(()=>localStorage.clear());await p.reload({waitUntil:'domcontentloaded'});
 await p.waitForFunction(()=>window.__game?.scene?.isActive('BootScene'),{timeout:60000});await pause(3000);
 console.log(await p.evaluate(()=>({buf:[window.__game.canvas.width,window.__game.canvas.height],css:[window.__game.canvas.clientWidth,window.__game.canvas.clientHeight],game:[window.__game.config.width,window.__game.config.height]})));
 await p.screenshot({path:`${OUT}/hd_title.png`});
 await p.mouse.click(960,885);
 await p.waitForFunction(()=>{const s=window.__game.scene.getScene('MapScene');return s?.scene.isActive()&&s.hero;},{timeout:60000});await pause(2500);
 await p.screenshot({path:`${OUT}/hd_map.png`});
 const before=await p.evaluate(()=>{const h=window.__game.scene.getScene('MapScene').hero;return [h.x,h.y];});
 await p.mouse.click(1200,600);await pause(1800);
 console.log('hero',before,await p.evaluate(()=>{const h=window.__game.scene.getScene('MapScene').hero;return [h.x,h.y];}));
 await p.mouse.click(888,1008);await pause(900);await p.screenshot({path:`${OUT}/hd_journal.png`});await p.keyboard.press('Escape');await pause(300);
 await p.evaluate(()=>{const g=window.__game,r=g.registry,q=['hero_duelist','companion_brawler','companion_healer'];r.set('party',q);r.set('roster',q);r.set('partySlots',3);g.scene.getScenes(true)[0].scene.start('LoadingScene',{destination:'BattleScene',destinationData:{battleId:'korvin_gang',fromMapKey:'village',fromSpawnId:'default'}});});
 await p.waitForFunction(()=>{const s=window.__game.scene.getScene('BattleScene');return s?.scene.isActive()&&s.turnManager?.active;},{timeout:30000});await pause(2500);
 await p.screenshot({path:`${OUT}/hd_battle.png`});console.log('err',err);await b.close();
})().catch(e=>{console.error(e);process.exit(1);});
