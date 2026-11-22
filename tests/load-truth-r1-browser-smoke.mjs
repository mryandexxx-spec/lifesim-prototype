/** LOAD-TRUTH-R1: real mobile Chromium + PlayCanvas WebGL, two narrow widths. */
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'playwright';
import {newHousehold} from '../src/household.js';
import {SAVE_KEY} from '../src/simulation.js';
import {UI_TOUR_STORAGE_KEY} from '../src/ui-onboarding.js';

const browser=await chromium.launch({headless:true,args:[
  '--enable-webgl','--use-gl=angle','--use-angle=swiftshader',
  '--enable-unsafe-swiftshader','--disable-dev-shm-usage'
]});
const household=newHousehold('2026-11-21');
household.paused=true;
household.otherSim.paused=true;
household.autonomy.enabled=false;
household.otherSim.autonomy.enabled=false;
const stages=['cache','engine','scene','interface','frame','alex','mira'];
try {
  mkdirSync('artifacts/load-truth-r1',{recursive:true});
  for(const width of [390,320]){
    const height=width===390?844:568;
    const context=await browser.newContext({
      viewport:{width,height},deviceScaleFactor:1,hasTouch:true,isMobile:true,
      serviceWorkers:'block'
    });
    await context.addInitScript(({key,seed,tour})=>{
      localStorage.setItem(key,JSON.stringify(seed));
      localStorage.setItem(tour,'done');
    },{key:SAVE_KEY,seed:household,tour:UI_TOUR_STORAGE_KEY});
    // Delay both real GLBs to observe a legitimate nonterminal overlay.
    await context.route('**/assets/characters/*.glb*',async route=>{
      await new Promise(resolve=>setTimeout(resolve,1800));
      await route.continue();
    });
    const page=await context.newPage();
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('crash',()=>errors.push('renderer crashed'));
    await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
    await page.locator('#loading-stages li').first().waitFor({timeout:30000});
    assert.equal(await page.locator('#loading-stages li').count(),7);
    assert.deepEqual(await page.locator('#loading-stages li').evaluateAll(items=>
      items.map(el=>el.dataset.stage)),stages);
    await page.screenshot({path:'artifacts/load-truth-r1/loading-'+width+'.png'});
    await page.locator('#loading').waitFor({state:'hidden',timeout:65000});
    const final=await page.evaluate(async()=>{
      const list=[...document.querySelectorAll('#loading-stages li')];
      return {
        count:document.getElementById('loading-count').textContent,
        stageStatuses:Object.fromEntries(list.map(el=>[el.dataset.stage,el.dataset.status])),
        hasWebGL:Boolean((await import('playcanvas')).Application.getApplication()?.graphicsDevice?.canvas)
      };
    });
    assert.equal(final.count,'7 / 7');
    for(const id of stages)assert.notEqual(final.stageStatuses[id],'pending',id);
    for(const id of ['engine','scene','interface','frame'])
      assert.equal(final.stageStatuses[id],'ready',id);
    assert.equal(final.hasWebGL,true,'real WebGL context remains available');
    assert.deepEqual(errors,[]);
    assert.equal(await page.evaluate(key=>
      JSON.parse(localStorage.getItem(key)).version,SAVE_KEY),1);
    await page.screenshot({path:'artifacts/load-truth-r1/ready-'+width+'.png'});
    await context.close();
  }
  console.log('LOAD-TRUTH-R1 390x844 + 320x568 PlayCanvas/WebGL and stage smoke PASS');
}finally {
  await browser.close();
}
