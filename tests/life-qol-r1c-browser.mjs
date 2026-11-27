import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium,webkit} from 'playwright';
import {newHousehold} from '../src/household.js';
import {SAVE_KEY} from '../src/simulation.js';
import {furnitureActionApproach} from '../src/furniture-catalog.js';
import {UI_TOUR_STORAGE_KEY} from '../src/ui-onboarding.js';
const out='artifacts/life-qol-r1c';mkdirSync(out,{recursive:true});const report=[];
for(const [engineName,engine] of [['chromium',chromium],['webkit',webkit]]){
 const browser=await engine.launch(engineName==='chromium'?{headless:true,args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']}:{headless:true});
 try{for(const [width,height,id] of [[390,844,'alex'],[320,568,'mira']]){
  const label=engineName+'-'+width,result={label,id};report.push(result);
  const seed=newHousehold('2026-11-27');seed.calendar.anchorConfirmed=true;
  seed.paused=true;seed.otherSim.paused=true;seed.autonomy.enabled=false;seed.otherSim.autonomy.enabled=false;
  const a=id==='alex'?seed:seed.otherSim;a.needs.hygiene=30;a.needs.fun=30;
  a.position=furnitureActionApproach(seed.world,'shower');
  const ctx=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,isMobile:true,hasTouch:true,serviceWorkers:'block'});
  try{
   await ctx.addInitScript(({seed,key,tour})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(seed));localStorage.setItem(tour,'done');localStorage.setItem('lifesim.ui.itemLabels.v1','visible');},{seed,key:SAVE_KEY,tour:UI_TOUR_STORAGE_KEY});
   const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('crash',()=>errors.push('crash'));
   const ready=()=>page.locator('#loading').waitFor({state:'hidden',timeout:100000});
   await page.goto('http://127.0.0.1:8765/?furniture=qa&garden-start-paused=1',{waitUntil:'domcontentloaded'});await ready();
   if(id==='mira')await page.locator('#pick-mira').tap();
   // Existing labeled world interaction opens the ordinary fixture sheet.
   // The singing action itself is a genuine mobile touch, not a synthetic dispatch.
   const marker=page.locator('#hotspots .hotspot[data-action-id="shower"]').first();
   await marker.waitFor({state:'attached',timeout:15000});
   result.marker={instance:await marker.getAttribute('data-instance-id'),text:await marker.textContent()};
   await marker.evaluate(el=>el.click());
   const button=page.locator('#shower-sing-button');
   assert.ok(await button.isVisible());assert.ok(await page.locator('#action-button').isVisible());
   const box=await button.boundingBox();assert.ok(box&&box.height>=44&&box.x>=0&&box.y>=0&&box.y+box.height<=height);
   await page.screenshot({path:out+'/'+label+'-menu.png'});
   await button.tap();
   await page.waitForFunction(({key,id})=>JSON.parse(localStorage.getItem(key)).actionQueues.byResident[id].some(x=>x.actionId==='shower'&&x.showerSinging===true),{key:SAVE_KEY,id});
   await page.locator('#pause-btn').tap();
   await page.waitForFunction(({key,id})=>{const r=JSON.parse(localStorage.getItem(key)),a=id==='alex'?r:r.otherSim;return a.action?.id==='shower'&&a.action.showerSinging===true&&a.action.phase==='using'&&a.skills.xpById.music>0;},{key:SAVE_KEY,id},{timeout:90000});
   await page.screenshot({path:out+'/'+label+'-practice.png'});
   await page.waitForFunction(({key,id})=>{const r=JSON.parse(localStorage.getItem(key)),a=id==='alex'?r:r.otherSim;return !a.action&&a.skills.xpById.music>2.6;},{key:SAVE_KEY,id},{timeout:90000});
   await page.locator('#pause-btn').tap();
   await page.reload({waitUntil:'domcontentloaded'});await ready();
   const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY);
   const actor=id==='alex'?saved:saved.otherSim,other=id==='alex'?saved.otherSim:saved;
   assert.equal(saved.version,1);assert.ok(Math.abs(actor.skills.xpById.music-2.7)<.001);assert.ok(actor.needs.hygiene>60);
   assert.equal(other.skills.xpById.music??0,0);assert.equal(saved.shop.credits,seed.shop.credits);
   assert.deepEqual(errors,[]);Object.assign(result,{passed:true,xp:actor.skills.xpById.music,hygiene:actor.needs.hygiene});
  }catch(e){result.error=String(e.stack||e);throw e;}finally{writeFileSync(out+'/report.json',JSON.stringify(report,null,2));await ctx.close();}
 }}finally{await browser.close();}
}
