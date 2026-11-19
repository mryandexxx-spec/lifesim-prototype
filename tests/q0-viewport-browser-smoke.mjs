/** Q0: real Chromium/SwiftShader WebGL boot at four iPhone-sized viewports.
 * Exercises independent 3D heartbeat, DOM-only recovery, persisted household.
 * Synthetic context event tests the UI; real Safari recovery awaits iPhone QA.
 */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {newHousehold} from '../src/household.js';
import {SAVE_KEY} from '../src/simulation.js';
import {UI_TOUR_STORAGE_KEY} from '../src/ui-onboarding.js';

const seed=newHousehold('2026-11-19');
seed.autonomy.enabled=false;seed.otherSim.autonomy.enabled=false;
seed.paused=true;seed.otherSim.paused=true;
const browser=await chromium.launch({headless:true,args:[
  '--enable-webgl','--use-gl=angle','--use-angle=swiftshader',
  '--enable-unsafe-swiftshader','--disable-dev-shm-usage'
]});
const problems=[];
try{
  for(const [w,h] of [[390,844],[375,667],[320,568],[844,390]]){
    const context=await browser.newContext({viewport:{width:w,height:h},
      deviceScaleFactor:1,hasTouch:true,isMobile:true});
    await context.addInitScript(({key,record,tourKey})=>{
      if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(record));
      localStorage.setItem(tourKey,'done');
    },{key:SAVE_KEY,record:seed,tourKey:UI_TOUR_STORAGE_KEY});
    const page=await context.newPage();
    page.on('pageerror',error=>problems.push(`${w}×${h}: ${error.message}`));
    page.on('crash',()=>problems.push(`${w}×${h}: renderer crash`));
    await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
    await page.locator('#loading').waitFor({state:'hidden',timeout:65000});

    // Diagnostics must open while simulation is intentionally paused; no false
    // 'frozen game' warning from the pause button itself.
    await page.locator('#view-toggle').click();
    await page.locator('#viewport-health-open').click();
    await page.locator('#viewport-recovery').waitFor({state:'visible',timeout:5000});
    await page.waitForFunction(()=>{
      const d=document.querySelector('#viewport-health-details')?.textContent||'';
      return /кадров [1-9]/.test(d);
    },null,{timeout:9000});
    const first=await page.locator('#viewport-health-details').innerText();
    assert.match(first,/Режим: play · пауза: да/);
    assert.match(first,/Экран:/);
    assert.match(first,/Контекст потерян: нет/);
    // Wait only for the first viewport to graduate out of startup grace;
    // all other sizes still validate rendering and explicit recovery.
    if(w===390){
      await page.waitForTimeout(14500);
      const healthy=await page.locator('#viewport-health-details').innerText();
      assert.match(healthy,/3D: healthy/,'Paused game still produces real 3D frames');
    }
    await page.locator('#viewport-health-close').click();
    assert.equal(await page.locator('#viewport-recovery').isVisible(),false);

    // Simulated canvas event validates both the browser-safe event handler and
    // recovery affordance. Never auto-reload on WebGL loss.
    const cancelled=await page.locator('#game-canvas').evaluate(canvas=>{
      const event=new Event('webglcontextlost',{cancelable:true});
      return !canvas.dispatchEvent(event);
    });
    assert.equal(cancelled,true,'WebGL context loss must be preventDefault-ed');
    await page.locator('#viewport-recovery').waitFor({state:'visible',timeout:8000});
    assert.match(await page.locator('#viewport-health-details').innerText(),/3D: webgl-lost/);
    assert.match(await page.locator('#viewport-health-message').innerText(),/не будет перезагружена/);
    const before=JSON.parse(await page.evaluate(k=>localStorage.getItem(k),SAVE_KEY));
    await Promise.all([
      page.waitForNavigation({waitUntil:'domcontentloaded',timeout:30000}),
      page.locator('#viewport-health-reload').click()
    ]);
    await page.locator('#loading').waitFor({state:'hidden',timeout:65000});
    const after=JSON.parse(await page.evaluate(k=>localStorage.getItem(k),SAVE_KEY));
    assert.equal(after.selectedSim,before.selectedSim);
    assert.equal(after.shop.credits,before.shop.credits);
    assert.equal(after.calendar.startCivilDate,before.calendar.startCivilDate);
    assert.equal(after.paused,true,'Recovery keeps the original pause and resident state');
    assert.equal(await page.locator('#viewport-recovery').isVisible(),false,
      'After a fresh WebGL boot the warning is not permanently latched');
    await page.screenshot({path:`q0-viewport-${w}x${h}.png`});
    await context.close();
  }
  assert.deepEqual(problems,[],'No page runtime errors on mobile WebGL recovery');
  console.log('Q0 WebGL heartbeat, context-loss UI, safe save/reload PASS (four viewports)');
}finally{
  await browser.close();
}
