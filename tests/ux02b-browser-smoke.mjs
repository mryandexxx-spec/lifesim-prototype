/** UX-02b: actual PlayCanvas/WebGL + touch-emulated Chromium, four mobile sizes.
 * NOT physical iPhone Safari acceptance.
 */
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium} from 'playwright';
import {newHousehold} from '../src/household.js';
import {SAVE_KEY} from '../src/simulation.js';
import {UI_TOUR_STORAGE_KEY} from '../src/ui-onboarding.js';

const sizes=[[390,844],[375,667],[320,568],[844,390]];
const browser=await chromium.launch({headless:true,args:[
 '--enable-webgl','--use-gl=angle','--use-angle=swiftshader',
 '--enable-unsafe-swiftshader','--disable-dev-shm-usage'
]});
mkdirSync('ux02b-artifacts',{recursive:true});
const report=[],errors=[];
const snap=(page)=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY);
try{
 for(const [w,h] of sizes){
  const seed=newHousehold('2026-11-20');
  seed.paused=true;seed.autonomy.enabled=false;seed.otherSim.autonomy.enabled=false;
  const context=await browser.newContext({
   viewport:{width:w,height:h},isMobile:true,hasTouch:true,deviceScaleFactor:1
  });
  await context.addInitScript(({key,record,tourKey})=>{
   localStorage.setItem(key,JSON.stringify(record));
   localStorage.setItem(tourKey,'done');
  },{key:SAVE_KEY,record:seed,tourKey:UI_TOUR_STORAGE_KEY});
  const page=await context.newPage();
  page.on('pageerror',error=>errors.push(w+'x'+h+' JS '+error.message));
  page.on('requestfailed',request=>{
   if(request.url().includes('/src/')||request.url().includes('/vendor/'))
    errors.push(w+'x'+h+' '+request.url()+' '+request.failure()?.errorText);
  });
  try{
   await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
   await page.locator('#loading').waitFor({state:'hidden',timeout:65000});
   assert.ok((await page.locator('#game-canvas').screenshot()).length>2000,'WebGL rendered');
   await page.locator('#home-open').tap();
   await page.locator('#home-furnish').tap();
   await page.locator('#furnish-item-select').selectOption('home-plant-1');
   const before=await snap(page);
   await page.locator('#furnish-move').tap();
   assert.equal(await page.locator('#furnish-owned-preview').isVisible(),true);
   const panel=await page.evaluate(()=>{
    const outer=document.querySelector('#furniture-editor').getBoundingClientRect();
    const confirm=document.querySelector('#furnish-owned-confirm').getBoundingClientRect();
    const cancel=document.querySelector('#furnish-owned-cancel').getBoundingClientRect();
    return {outer:{top:outer.top,bottom:outer.bottom},
      confirm:{top:confirm.top,bottom:confirm.bottom,height:confirm.height},
      cancel:{top:cancel.top,bottom:cancel.bottom,height:cancel.height}};
   });
   assert.ok(panel.confirm.height>=44&&panel.cancel.height>=44,'44px CTA targets');
   assert.ok(panel.confirm.top>=panel.outer.top-1&&panel.confirm.bottom<=panel.outer.bottom+1,
     'confirm CTA must not require scrolling '+JSON.stringify(panel));
   await page.locator('#furnish-owned-auto').tap();
   assert.equal(await page.locator('#furnish-owned-confirm').isEnabled(),true);
   await page.screenshot({path:'ux02b-artifacts/move-preview-'+w+'x'+h+'.png'});
   await page.locator('#furnish-owned-cancel').tap();
   const cancelled=await snap(page);
   assert.deepEqual(cancelled.world.furniture.instances,before.world.furniture.instances);
   assert.equal(cancelled.shop.credits,before.shop.credits);
   await page.locator('#furnish-move').tap();
   await page.locator('#furnish-owned-auto').tap();
   await page.locator('#furnish-owned-confirm').tap();
   const moved=await snap(page);
   const prev=before.world.furniture.instances.find(i=>i.instanceId==='home-plant-1');
   const next=moved.world.furniture.instances.find(i=>i.instanceId==='home-plant-1');
   assert.ok(prev.x!==next.x||prev.z!==next.z,'move committed after confirmation');
   assert.equal(moved.shop.credits,5000);
   await page.locator('#furnish-store').tap();
   const warehoused=await snap(page);
   assert.equal(warehoused.world.furniture.instances.find(i=>i.instanceId==='home-plant-1').location,'storage');
   await page.locator('#furnish-warehouse-toggle').tap();
   await page.locator('#furnish-storage-list .furnish-storage-card button').first().tap();
   assert.equal(await page.locator('#furnish-owned-preview').isVisible(),true);
   await page.locator('#furnish-owned-cancel').tap();
   assert.equal((await snap(page)).world.furniture.instances.find(i=>i.instanceId==='home-plant-1').location,'storage');
   await page.locator('#furnish-storage-list .furnish-storage-card button').first().tap();
   await page.locator('#furnish-owned-auto').tap();
   await page.locator('#furnish-owned-confirm').tap();
   const restored=await snap(page);
   assert.equal(restored.world.furniture.instances.find(i=>i.instanceId==='home-plant-1').location,'home');
   assert.equal(restored.shop.credits,5000);
   await page.screenshot({path:'ux02b-artifacts/restored-'+w+'x'+h+'.png'});
   page.once('dialog',dialog=>dialog.accept());
   await page.locator('#furnish-sell').tap();
   const sold=await snap(page);
   assert.equal(sold.shop.credits,5039);
   assert.equal(sold.world.furniture.instances.some(i=>i.instanceId==='home-plant-1'),false);
   assert.equal(sold.financialHistory.entries.filter(e=>e.kind==='sale'&&e.sourceId==='home-plant-1').length,1);
   assert.equal(sold.version,1);
   report.push({w,h,panel,credits:sold.shop.credits,items:sold.world.furniture.instances.length});
   await page.screenshot({path:'ux02b-artifacts/sold-'+w+'x'+h+'.png'});
  }catch(error){errors.push(w+'x'+h+' '+(error.stack||error));}
  finally{await context.close();}
 }
}finally{await browser.close();}
writeFileSync('ux02b-artifacts/measurements.json',JSON.stringify({report,errors},null,2));
console.log(JSON.stringify({report,errors},null,2));
assert.deepEqual(errors,[],'four real WebGL mobile UX-02b workflows');
