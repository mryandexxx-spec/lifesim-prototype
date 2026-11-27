import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'playwright';
import {newHousehold} from '../src/household.js';
import {findMarketPlacement,buyMarketItem} from '../src/furniture-shop.js';
import {SAVE_KEY} from '../src/simulation.js';
import {UI_TOUR_STORAGE_KEY} from '../src/ui-onboarding.js';
const seed=newHousehold('2026-11-26');
seed.paused=seed.otherSim.paused=true;seed.autonomy.enabled=seed.otherSim.autonomy.enabled=false;
const pose=findMarketPlacement(seed.world.furniture,seed.shop,'easel.starter');
assert.ok(pose);const bought=buyMarketItem(seed.world.furniture,seed.shop,'easel.starter',pose);
assert.ok(bought.ok);seed.world.furniture=bought.world;seed.shop=bought.shop;
seed.createdWorks=[{id:'work:gc-market-smoke',ownerId:'alex',easelInstanceId:bought.instanceId,contentId:'painting.hills',seed:123,quality:50,createdAt:seed.minutes,kind:'artwork',location:'inventory'}];
const cash=seed.shop.credits;
const browser=await chromium.launch({headless:true,args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
try{
 const ctx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,hasTouch:true,isMobile:true});
 await ctx.addInitScript(({key,record,tour})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(record));localStorage.setItem(tour,'done');},{key:SAVE_KEY,record:seed,tour:UI_TOUR_STORAGE_KEY});
 const page=await ctx.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('crash',()=>errors.push('crash'));
 page.on('dialog',d=>d.accept());
 await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
 await page.locator('#loading').waitFor({state:'hidden',timeout:65000});
 const state=()=>page.evaluate(k=>JSON.parse(localStorage.getItem(k)),SAVE_KEY);
 assert.ok((await state()).artMarket);
 await page.locator('#mind-toggle').tap();
 await page.locator('#mind-tab-skills').tap();
 const sale=page.locator('#mind-painting-works button').filter({hasText:'Продать · +175 кр.'});
 await sale.tap();
 await page.waitForFunction(({k,cash})=>JSON.parse(localStorage.getItem(k)).shop.credits===cash+175,{k:SAVE_KEY,cash});
 assert.equal((await state()).createdWorks.length,0);
 assert.equal((await state()).financialHistory.entries.filter(e=>e.kind==='art-sale').length,1);
 mkdirSync('artifacts/gc-04-09-ui',{recursive:true});await page.screenshot({path:'artifacts/gc-04-09-ui/portfolio.png'});
 await page.locator('#mind-close').tap();
 // Furniture label nodes are deliberately not created until this setting is enabled.
 await page.locator('#view-toggle').tap();
 await page.locator('#item-labels-btn').tap();
 assert.equal(await page.locator('#item-labels-btn').getAttribute('aria-pressed'),'true');
 await page.locator('#view-close').tap();
 const marker=page.locator('[data-action-id="paint"][data-instance-id="'+bought.instanceId+'"]');
 // Real DOM button, not a direct domain invocation. Its visibility may depend
 // on scene camera, so the first action is a DOM dispatch; mode/action use touch.
 await marker.waitFor({state:'attached'});
 if(await marker.isVisible())await marker.tap();
 else await marker.dispatchEvent('click');
 await page.locator('#painting-mode-select').selectOption('commission');
 assert.match(await page.locator('#painting-mode-note').innerText(),/20 кр./);
 await page.screenshot({path:'artifacts/gc-04-09-ui/commission.png'});
 await page.locator('#action-button').tap();
 await page.waitForFunction(k=>JSON.parse(localStorage.getItem(k)).actionQueues.byResident.alex.some(c=>c.paintMode==='commission'),SAVE_KEY);
 const queued=await state();
 assert.equal(queued.shop.credits,cash+175);assert.equal(queued.actionQueues.byResident.alex[0].paintExpectedPrice,20);
 await page.reload({waitUntil:'domcontentloaded'});await page.locator('#loading').waitFor({state:'hidden',timeout:65000});
 assert.equal((await state()).actionQueues.byResident.alex[0].paintMode,'commission');
 assert.equal((await state()).shop.credits,cash+175);
 assert.deepEqual(errors,[]);console.log('GC-04/09 UI 390x844 portfolio sale, quote, queue and reload PASS; physical Safari deferred');
}finally{await browser.close();}
