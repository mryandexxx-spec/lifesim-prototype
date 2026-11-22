/** P4 real PlayCanvas four-size Chromium touch integration.
 * Headless 7/30 days live in life-integration-qa.test.js.
 * Chromium SwiftShader is NOT physical Safari/iPhone device acceptance.
 */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdirSync,writeFileSync} from 'node:fs';
import {newHousehold} from '../src/household.js';
import {hireCareer} from '../src/career-state.js';
import {proposeReadyMealPurchase} from '../src/ready-food.js';
import {READY_MEAL_IDS} from '../src/ready-meal-catalog.js';
import {finishKitchenRecipe} from '../src/kitchen.js';
import {SAVE_KEY} from '../src/simulation.js';
import {UI_TOUR_STORAGE_KEY} from '../src/ui-onboarding.js';

let seed=newHousehold('2026-11-22');
seed.shop.credits=4000;
seed.autonomy.enabled=false;
seed.otherSim.autonomy.enabled=false;
seed.careerSystem=hireCareer(seed.careerSystem,'alex','editorial',seed.minutes);
seed.careerSystem=hireCareer(seed.careerSystem,'mira','business-center',seed.minutes);
for(const [recipeId,channel,actor] of [
  [READY_MEAL_IDS[0],'fridge','alex'],
  [READY_MEAL_IDS[1],'phone','mira']]){
  const tx=proposeReadyMealPurchase(seed,recipeId,channel,actor);
  assert.equal(tx.ok,true,tx.reason);
  seed.kitchen=tx.kitchen;
  seed.shop=tx.shop;
  seed.financialHistory=tx.financialHistory;
}
assert.equal(finishKitchenRecipe(seed.kitchen,'cook.soup',0),true);
const expected={
  credits:seed.shop.credits,
  entries:structuredClone(seed.financialHistory.entries),
  packed:seed.kitchen.prepared.reduce((n,x)=>n+x.portions,0)+
    seed.kitchen.deliveries.length
};
const snapshot=(page)=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY);
function verify(root,label){
  assert.equal(root.version,1,label+' root v1');
  assert.equal(root.otherSim.minutes,root.minutes,label+' shared clock');
  assert.equal(root.shop.credits,expected.credits,label+' conserved wallet');
  assert.deepEqual(root.financialHistory.entries,expected.entries,label+' no double debit');
  assert.ok(root.careerSystem.byResident.alex&&root.careerSystem.byResident.mira,
    label+' two employed residents');
  const stock=root.kitchen.prepared.reduce((n,x)=>n+x.portions,0)+
    root.kitchen.deliveries.length;
  assert.equal(stock,expected.packed,label+' cooked and paid stock persisted');
  assert.equal(new Set(root.financialHistory.entries.map(e=>e.id)).size,
    root.financialHistory.entries.length);
}
const browser=await chromium.launch({headless:true,args:[
  '--enable-webgl','--use-gl=angle','--use-angle=swiftshader',
  '--enable-unsafe-swiftshader','--disable-dev-shm-usage'
]});
mkdirSync('artifacts/integration-qa',{recursive:true});
const passed=[],failures=[];
try{
  for(const [width,height] of [[390,844],[375,667],[320,568],[844,390]]){
    const name=width+'x'+height,errors=[];
    const context=await browser.newContext({
      viewport:{width,height},deviceScaleFactor:1,
      isMobile:true,hasTouch:true,reducedMotion:'reduce'
    });
    await context.addInitScript(({key,record,tour})=>{
      if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(record));
      localStorage.setItem(tour,'done');
    },{key:SAVE_KEY,record:seed,tour:UI_TOUR_STORAGE_KEY});
    const page=await context.newPage();
    page.on('pageerror',e=>errors.push(e.message));
    page.on('crash',()=>errors.push('renderer crashed'));
    page.on('requestfailed',r=>{
      if(/\/src\/|\/vendor\//.test(r.url()))errors.push('module '+r.url());
    });
    try{
      await page.goto('http://127.0.0.1:8765/?integration-qa=p4',
        {waitUntil:'domcontentloaded'});
      await page.locator('#loading').waitFor({state:'hidden',timeout:80000});
      const canvas=page.locator('#game-canvas');
      const gl=await page.evaluate(()=>{
        const c=document.querySelector('#game-canvas');
        const b=c.getBoundingClientRect();
        return {webgl:!!(c.getContext('webgl2')||c.getContext('webgl')),
          width:b.width,height:b.height,
          scrollWidth:document.documentElement.scrollWidth,viewport:innerWidth};
      });
      assert.ok(gl.webgl&&gl.width>100&&gl.height>100,name+' actual WebGL canvas');
      assert.ok(gl.scrollWidth<=gl.viewport+2,name+' no horizontal overflow');
      assert.ok((await canvas.screenshot()).length>2000,'visible rendered 3D');
      // Suspend gameplay before comparing semantic state, as in LOT-E5.
      await page.locator('#pause-btn').tap();
      await page.locator('#pick-mira').tap();
      const root=await snapshot(page);
      verify(root,name+' first boot');
      assert.equal(root.selectedSim,'mira');
      // Exercise the actual selected resident's phone and finance UI.
      await page.locator('#career-phone-toggle').tap();
      assert.match(await page.locator('#career-phone-title').innerText(),/Мира/);
      await page.locator('.career-phone-app-tab[data-app="finance"]').tap();
      assert.match(await page.locator('#career-phone-title').innerText(),/Финансы/);
      await page.locator('#career-phone-panel .career-phone-header .career-phone-x').tap();
      // Two speed settings should be operable without multiplying game minutes
      // in the pure headless tick; Node P4 covers ledger and time scaling.
      await page.locator('#speed-btn').tap();
      assert.equal((await page.locator('#speed-btn').innerText()).trim(),'3×');
      await page.locator('#speed-btn').tap();
      assert.equal((await page.locator('#speed-btn').innerText()).trim(),'1×');
      await page.locator('#view-toggle').tap();
      await page.locator('#save-btn').tap();
      await page.locator('#view-panel').waitFor({state:'hidden'});
      const before=await snapshot(page);
      verify(before,name+' explicit save');
      await page.screenshot({path:'artifacts/integration-qa/before-'+name+'.png'});
      await page.reload({waitUntil:'domcontentloaded'});
      await page.locator('#loading').waitFor({state:'hidden',timeout:80000});
      const after=await snapshot(page);
      verify(after,name+' reload');
      assert.equal(after.selectedSim,'mira',name+' selected resident survives reload');
      assert.deepEqual(errors,[],name+' no JS failures');
      await page.screenshot({path:'artifacts/integration-qa/after-'+name+'.png'});
      passed.push({viewport:name,webgl:gl.webgl,
        residents:2,careers:2,paidMeals:true,homeCooking:true,
        financeReceipts:after.financialHistory.entries.length,
        speeds:['1×','3×'],rootVersion:after.version,errors:errors.length});
    }catch(e){
      failures.push({viewport:name,error:e.stack||String(e),browserErrors:errors});
    }finally{await context.close();}
  }
}finally{
  await browser.close();
  writeFileSync('artifacts/integration-qa/report.json',JSON.stringify({
    test:'Life Systems P4 integration QA',engine:'real PlayCanvas Chromium/SwiftShader',
    physicalSafariIPhone:'DEFERRED — NOT TESTED',passed,failures
  },null,2)+'\n');
}
assert.deepEqual(failures,[],'P4 WebGL failures — see report.json');
assert.equal(passed.length,4,'four real WebGL viewport sizes required');
console.log('Life Systems P4 real WebGL 4-size PASS:',JSON.stringify(passed));