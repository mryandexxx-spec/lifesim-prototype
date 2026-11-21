/** HUD-R1 v2: arrows ONLY at visible value steps, animated meter.
 * Four real WebGL mobile viewports, original visuals, no owner iPhone claim.
 */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {newHousehold} from '../src/household.js';
import {SAVE_KEY} from '../src/simulation.js';
import {UI_TOUR_STORAGE_KEY} from '../src/ui-onboarding.js';
const sizes=[[390,844],[375,667],[320,568],[844,390]];
const seed=newHousehold('2026-11-21');
seed.paused=true;seed.otherSim.paused=true;
seed.needs.hunger=82.62;
seed.otherSim.needs.hunger=95;
seed.autonomy.enabled=false;seed.otherSim.autonomy.enabled=false;
const browser=await chromium.launch({headless:true,args:[
 '--enable-webgl','--use-gl=angle','--use-angle=swiftshader',
 '--enable-unsafe-swiftshader','--disable-dev-shm-usage'
]});
try{
 for(const [width,height] of sizes){
  const ctx=await browser.newContext({viewport:{width,height},isMobile:true,
   hasTouch:true,deviceScaleFactor:1,reducedMotion:'reduce'});
  await ctx.addInitScript(({key,record,tour})=>{
   localStorage.setItem(key,JSON.stringify(record));localStorage.setItem(tour,'done');
  },{key:SAVE_KEY,record:seed,tour:UI_TOUR_STORAGE_KEY});
  const page=await ctx.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('requestfailed',e=>{if(/\/src\/|\/vendor\//.test(e.url()))errors.push(e.url());});
  try{
   await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
   await page.locator('#loading').waitFor({state:'hidden',timeout:65000});
   assert.ok((await page.locator('#game-canvas').screenshot()).length>2000);
   // loadHousehold intentionally does not restore persisted paused=true.
   // Pause via the real UI before asserting initial/no-step presentation.
   if((await page.locator('#pause-btn').getAttribute('aria-label'))==='Пауза')
     await page.locator('#pause-btn').tap();
   assert.equal(await page.locator('#pause-btn').getAttribute('aria-label'),'Продолжить');
   await page.locator('#hud-toggle').tap();
   assert.equal(await page.locator('#dashboard').getAttribute('data-collapsed'),'false');
   await page.waitForFunction(()=>document.querySelector('#trend-hunger')?.dataset.direction==='idle');
   for(const id of ['hunger','energy','hygiene','fun','social','bladder']){
    assert.equal(await page.locator('#trend-'+id).getAttribute('data-direction'),'idle');
    assert.equal(await page.locator('#trend-'+id).textContent(),'');
   }
   // 3x only accelerates the browser smoke: logic is also tested at 1x.
   await page.locator('#speed-btn').tap();
   assert.equal(await page.locator('#speed-btn').textContent(),'3×');
   await page.locator('#pause-btn').tap();
   await page.waitForFunction(()=>document.querySelector('#trend-hunger')?.dataset.direction==='down',
     null,{timeout:25000,polling:50});
   assert.match(await page.locator('.need[data-need="hunger"]').getAttribute('aria-label'),
     /Сытость \d+ из 100\. Снижается/);
   // Freeze during a flashing step and verify immediate disappearance.
   await page.locator('#pause-btn').tap();
   await page.waitForFunction(()=>document.querySelector('#trend-hunger')?.dataset.direction==='idle',
     null,{timeout:8000});
   assert.equal(await page.locator('#trend-hunger').textContent(),'');
   assert.doesNotMatch(await page.locator('.need[data-need="hunger"]').getAttribute('aria-label'),/Снижается/);
   await page.locator('#pick-mira').tap();
   assert.equal(await page.locator('#pick-mira').getAttribute('aria-pressed'),'true');
   // Save pause flags do not persist; check independent high need rather
   // than assuming exactly 95 after legitimate pre-pause game ticks.
   const miraShown=Number(await page.locator('#value-hunger').textContent());
   assert.ok(miraShown>=85,'Mira needs remain independently high: '+miraShown);
   assert.match(await page.locator('.need[data-need="hunger"]').getAttribute('aria-label'),/Сытость \d+ из 100/);
   assert.equal(await page.locator('#trend-hunger').getAttribute('data-direction'),'idle');
   const reduced=await page.evaluate(()=>{
    const i=document.querySelector('.need[data-need="hunger"] .meter i');
    return {animation:getComputedStyle(i).animationName,
      transition:getComputedStyle(i).transitionDuration};
   });
   assert.equal(reduced.animation,'none','respects reduced motion');
   assert.equal(reduced.transition,'0s','respects reduced-motion no transition');
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
   assert.ok(overflow<=2,width+'x'+height+' horizontal overflow '+overflow);
   assert.deepEqual(errors,[],width+'x'+height+' browser errors');
   console.log('HUD-R1 v2 WebGL '+width+'x'+height+' pass');
  }finally{await ctx.close();}
 }
}finally{await browser.close();}
