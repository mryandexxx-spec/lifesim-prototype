/** HUD-R1: actual mobile PlayCanvas/WebGL + six trend arrows on two people.
 * Device emulator only; not physical iPhone Safari/VoiceOver acceptance.
 */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {newHousehold} from '../src/household.js';
import {SAVE_KEY} from '../src/simulation.js';
import {UI_TOUR_STORAGE_KEY} from '../src/ui-onboarding.js';
const sizes=[[390,844],[375,667],[320,568],[844,390]];
const root=newHousehold('2026-11-21');
root.paused=false;root.otherSim.paused=false;
root.autonomy.enabled=false;root.otherSim.autonomy.enabled=false;
const browser=await chromium.launch({headless:true,args:[
 '--enable-webgl','--use-gl=angle','--use-angle=swiftshader',
 '--enable-unsafe-swiftshader','--disable-dev-shm-usage'
]});
try{
 for(const [width,height] of sizes){
  const ctx=await browser.newContext({viewport:{width,height},isMobile:true,
   hasTouch:true,deviceScaleFactor:1,reducedMotion:'reduce'});
  await ctx.addInitScript(({key,record,tour})=>{
    localStorage.setItem(key,JSON.stringify(record));
    localStorage.setItem(tour,'done');
  },{key:SAVE_KEY,record:root,tour:UI_TOUR_STORAGE_KEY});
  const page=await ctx.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('requestfailed',e=>{if(/\/src\/|\/vendor\//.test(e.url()))
    errors.push(e.url());});
  try{
   await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
   await page.locator('#loading').waitFor({state:'hidden',timeout:65000});
   assert.ok((await page.locator('#game-canvas').screenshot()).length>2000);
   await page.locator('#hud-toggle').tap();
   await page.waitForFunction(()=>document.querySelector('#trend-hunger')?.dataset.direction==='down',null,{timeout:25000});
   for(const id of ['hunger','energy','hygiene','fun','social','bladder']){
    assert.ok(await page.locator('#trend-'+id).count(),id);
    assert.equal(await page.locator('#trend-'+id).getAttribute('aria-hidden'),'true');
    assert.match(await page.locator('.need[data-need="'+id+'"]').getAttribute('aria-label'),
      /из 100\. (Снижается|Повышается|Без изменений)/);
   }
   await page.locator('#pick-mira').tap();
   assert.equal(await page.locator('#pick-mira').getAttribute('aria-pressed'),'true');
   assert.match(await page.locator('.need[data-need="hunger"]').getAttribute('aria-label'),/Сытость/);
   await page.locator('#pause-btn').tap();
   await page.waitForFunction(()=>document.querySelector('#trend-hunger')?.dataset.direction==='paused',null,{timeout:8000});
   assert.equal(await page.locator('#trend-hunger').getAttribute('title'),'Время остановлено');
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
   assert.ok(overflow<=2,width+'x'+height+' horizontal overflow '+overflow);
   assert.deepEqual(errors,[],width+'x'+height+' browser errors');
   console.log('HUD-R1 WebGL '+width+'x'+height+' pass');
  }finally{await ctx.close();}
 }
}finally{await browser.close();}
