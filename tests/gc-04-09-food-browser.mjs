import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium,webkit} from 'playwright';
import {newHousehold} from '../src/household.js';
import {SAVE_KEY} from '../src/simulation.js';
import {UI_TOUR_STORAGE_KEY} from '../src/ui-onboarding.js';
import {openFridgeByTouch} from './helpers/fridge-browser-touch.mjs';
const out='artifacts/gc-04-09-food-ui';mkdirSync(out,{recursive:true});
const seed=newHousehold('2026-11-26');
seed.paused=seed.otherSim.paused=true;seed.autonomy.enabled=seed.otherSim.autonomy.enabled=false;
seed.kitchen.prepared=[{recipeId:'cook.soup',quality:'good',portions:1},{recipeId:'ready.gold-roast',portions:1}];
const report=[];
for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){
 const browser=await engine.launch(name==='chromium'?{headless:true,args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']}:{headless:true});
 try{for(const [width,height] of [[390,844],[320,568]]){
  const label=name+'-'+width,row={label};report.push(row);
  const ctx=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,hasTouch:true,isMobile:true,serviceWorkers:'block'});
  try{
   await ctx.addInitScript(({key,seed,tour})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(seed));localStorage.setItem(tour,'done');localStorage.setItem('lifesim.ui.itemLabels.v1','hidden');},{key:SAVE_KEY,seed,tour:UI_TOUR_STORAGE_KEY});
   const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('crash',()=>errors.push('crash'));page.on('dialog',d=>d.accept());
   const ready=()=>page.locator('#loading').waitFor({state:'hidden',timeout:100000});
   await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});await ready();
   assert.ok(await page.evaluate(async()=>Boolean((await import('playcanvas')).Application.getApplication()?.graphicsDevice?.canvas)));
   const read=()=>page.evaluate(k=>JSON.parse(localStorage.getItem(k)),SAVE_KEY);
   const fridge=seed.world.furniture.instances.find(x=>x.prefabId==='fridge');
   assert.ok(fridge);
   await openFridgeByTouch(page,fridge,{captureFailure:async attempts=>{row.attempts=attempts;await page.screenshot({path:out+'/'+label+'-fridge-failed.png'});}});
   const panel=page.locator('#fridge-r2');await panel.waitFor({state:'visible'});
   const soup=panel.locator('[data-fridge-action="eat"][data-id="cook.soup"]');
   assert.ok((await soup.innerText()).includes('Досуг до +5'));
   assert.ok((await panel.locator('[data-fridge-action="eat"][data-id="ready.gold-roast"]').innerText()).includes('Досуг до +8'));
   assert.ok((await soup.boundingBox()).height>=44);
   await page.screenshot({path:out+'/'+label+'-eat.png'});
   await page.locator('#fridge-r2-tab-buy').tap();
   const option=panel.locator('[data-fridge-action="select-ready"][data-id="ready.sunny-grains"]');
   assert.ok((await option.innerText()).includes('Досуг до +4'));
   assert.ok((await option.boundingBox()).height>=44);
   await option.tap();await page.screenshot({path:out+'/'+label+'-buy.png'});
   await page.locator('#fridge-r2-ready-button').tap();
   await page.waitForFunction(({k,cash})=>JSON.parse(localStorage.getItem(k)).shop.credits===cash-18,{k:SAVE_KEY,cash:seed.shop.credits});
   const bought=await read();assert.equal(bought.kitchen.prepared.find(x=>x.recipeId==='ready.sunny-grains').portions,1);
   await page.locator('#career-phone-toggle').tap();
   const phone=page.locator('#career-phone-panel');await phone.waitFor({state:'visible'});
   await phone.locator('[data-phone-app="food"]').tap();
   const cards=phone.locator('.ready-food-card');assert.equal(await cards.count(),3);
   for(const [i,n] of [4,6,8].entries())assert.ok((await cards.nth(i).innerText()).includes('Досуг до +'+n));
   const buy=cards.first().locator('.ready-food-buy');assert.ok((await buy.boundingBox()).height>=44);
   await buy.scrollIntoViewIfNeeded();await page.screenshot({path:out+'/'+label+'-phone.png'});
   await buy.tap();
   await page.waitForFunction(({k,cash})=>JSON.parse(localStorage.getItem(k)).shop.credits===cash-47,{k:SAVE_KEY,cash:seed.shop.credits});
   const ordered=await read();assert.equal(ordered.kitchen.deliveries.length,1);assert.equal(ordered.needs.fun,seed.needs.fun);
   await page.reload({waitUntil:'domcontentloaded'});await ready();
   const saved=await read();assert.equal(saved.version,1);assert.equal(saved.shop.credits,seed.shop.credits-47);assert.equal(saved.kitchen.deliveries.length,1);
   assert.equal(saved.kitchen.prepared.find(x=>x.recipeId==='ready.sunny-grains').portions,1);
   assert.deepEqual(errors,[]);row.passed=true;
  }catch(e){row.error=String(e.stack||e);throw e;}finally{writeFileSync(out+'/report.json',JSON.stringify(report,null,2));await ctx.close();}
 }}finally{await browser.close();}
}
