/** MICRO-UX-R1: actual mobile Chromium touch, real PlayCanvas/WebGL. */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {newHousehold} from '../src/household.js';
import {SAVE_KEY} from '../src/simulation.js';
import {UI_TOUR_STORAGE_KEY} from '../src/ui-onboarding.js';

const browser=await chromium.launch({headless:true,args:[
  '--enable-webgl','--use-gl=angle','--use-angle=swiftshader',
  '--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
try{
 for(const [width,height] of [[390,844],[320,568]]){
  const seed=newHousehold('2026-11-22');
  seed.paused=true;seed.otherSim.paused=true;
  seed.autonomy.enabled=false;seed.otherSim.autonomy.enabled=false;
  const context=await browser.newContext({viewport:{width,height},
    deviceScaleFactor:1,hasTouch:true,isMobile:true});
  await context.addInitScript(({key,root,tour})=>{
    localStorage.setItem(key,JSON.stringify(root));
    localStorage.setItem(tour,'done');
  },{key:SAVE_KEY,root:seed,tour:UI_TOUR_STORAGE_KEY});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('requestfailed',request=>{
    if(request.url().includes('/src/'))errors.push('missing '+request.url());
  });
  await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
  await page.locator('#loading').waitFor({state:'hidden',timeout:65000});
  assert.ok((await page.locator('#game-canvas').screenshot()).length>2000);
  await page.locator('#pick-mira').tap();
  assert.equal(await page.locator('#pick-mira').getAttribute('aria-pressed'),'true');
  // The two always-visible resident-name buttons are the mobile tap targets.
  // In compact HUD layouts the nested descriptive label can have no tap box.
  assert.match(await page.locator('#pick-mira').textContent(),/Мира/);
  const displayName=page.locator('#resident-name');
  if(await displayName.isVisible())await displayName.tap();
  assert.equal(await page.locator('#mind-panel').isHidden(),true,
    'resident picker or visible name tap never opens the mind panel');
  await page.evaluate(()=>{
    const tv=[...document.querySelectorAll('#hotspots .hotspot')]
      .find(el=>el.textContent.includes('Телевизор'));
    if(!tv)throw Error('TV hotspot missing');
    tv.click();
  });
  assert.equal(await page.locator('#tv-talk-button').isVisible(),true);
  assert.equal(await page.locator('#mirror-speech-button').isHidden(),true);
  await page.locator('#tv-talk-button').tap();
  const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY);
  assert.equal(saved.version,1);
  assert.ok(saved.actionQueues.byResident.mira.some(task=>
    task.actionId==='tv'&&task.tvTalk===true&&task.targetInstanceId==='home-tv-1'));
  assert.equal(saved.actionQueues.byResident.alex.length,0,
    'solo TV must not queue another resident');
  await page.evaluate(()=>{
    const tv=[...document.querySelectorAll('#hotspots .hotspot')]
      .find(el=>el.textContent.includes('Телевизор'));
    tv.click();
  });
  assert.equal(await page.locator('#action-sheet').isVisible(),true);
  const oldTitle=await page.locator('#action-title').textContent();
  await page.touchscreen.tap(12,Math.round(height*.35));
  const previousContextClosed=await page.locator('#action-sheet').isHidden()||
    (await page.locator('#action-title').textContent())!==oldTitle;
  assert.equal(previousContextClosed,true,
    'outside tap must close old context or switch to a different scene object');
  assert.deepEqual(errors,[],'no WebGL startup or JavaScript errors');
  await context.close();
 }
 console.log('MICRO-UX-R1 390x844 and 320x568 PlayCanvas mobile touch smoke PASS');
}finally{await browser.close();}
