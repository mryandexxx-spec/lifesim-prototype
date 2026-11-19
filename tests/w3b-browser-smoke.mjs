/** W3-B: real PlayCanvas/WebGL touch mode selection and persisted live work needs. */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {newHousehold,tickHousehold} from '../src/household.js';
import {hireCareer} from '../src/career-state.js';
import {progressCareerWork,arriveCareerPortal} from '../src/career-work.js';
import {nextCareerShift} from '../src/career-scheduler.js';
import {SAVE_KEY} from '../src/simulation.js';
import {UI_TOUR_STORAGE_KEY} from '../src/ui-onboarding.js';

const seed=newHousehold('2026-11-16');
seed.careerSystem=hireCareer(seed.careerSystem,'alex','editorial',seed.minutes);
const planned=nextCareerShift(seed.calendar,seed.careerSystem.byResident.alex,seed.minutes);
seed.minutes=planned.start;seed.otherSim.minutes=planned.start;
progressCareerWork(seed,planned.start-1,planned.start);
assert.equal(arriveCareerPortal(seed,'alex',seed.minutes),true);
seed.needs.hunger=38;seed.needs.bladder=28;seed.needs.social=40;
tickHousehold(seed,240);
seed.paused=true;seed.otherSim.paused=true;
seed.autonomy.enabled=false;seed.otherSim.autonomy.enabled=false;
const browser=await chromium.launch({headless:true,args:[
  '--enable-webgl','--use-gl=angle','--use-angle=swiftshader',
  '--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
const errors=[];
try{
  for(const [w,h] of [[390,844],[375,667],[320,568],[844,390]]){
    const context=await browser.newContext({viewport:{width:w,height:h},
      deviceScaleFactor:1,hasTouch:true,isMobile:true});
    await context.addInitScript(({key,record,tourKey})=>{
      if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(record));
      localStorage.setItem(tourKey,'done');
    },{key:SAVE_KEY,record:seed,tourKey:UI_TOUR_STORAGE_KEY});
    const page=await context.newPage();
    page.on('pageerror',err=>errors.push(w+'x'+h+': '+err.message));
    page.on('requestfailed',r=>{
      if(/\/src\/|\/vendor\//.test(r.url()))
        errors.push(w+'x'+h+': '+r.failure()?.errorText);
    });
    await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
    await page.locator('#loading').waitFor({state:'hidden',timeout:60000});
    assert.ok((await page.locator('#game-canvas').screenshot()).length>2000);
    await page.locator('#career-phone-toggle').tap();
    const phone=page.locator('#career-phone-panel');
    assert.ok(await phone.isVisible());
    assert.match(await phone.innerText(),/Режим работы/);
    const modes=phone.locator('.career-work-modes');
    assert.ok(await modes.isVisible());
    const network=modes.getByRole('button',{name:'Налаживать связи'});
    assert.ok((await network.boundingBox())?.height>=40);
    await network.tap();
    let saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY);
    assert.equal(saved.careerSystem.byResident.alex.currentShift.workMode,'network');
    assert.equal(saved.careerSystem.byResident.alex.workMode,'network');
    const earned=saved.careerSystem.byResident.alex.currentShift.workNeeds;
    assert.ok(earned.mealUsed&&earned.appliedThrough>planned.start);
    await phone.locator('.career-phone-x').tap();
    await page.reload({waitUntil:'domcontentloaded'});
    await page.locator('#loading').waitFor({state:'hidden',timeout:60000});
    await page.locator('#career-phone-toggle').tap();
    assert.match(await phone.innerText(),/Налаживать связи/);
    const conserve=phone.locator('.career-work-modes').getByRole('button',{name:'Беречь силы'});
    await conserve.tap();
    saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY);
    assert.equal(saved.careerSystem.byResident.alex.currentShift.workMode,'conserve');
    assert.ok(saved.careerSystem.byResident.alex.currentShift.workNeeds.appliedThrough>=earned.appliedThrough,'Reload may advance live work minutes but must never rewind the saved watermark');
    const geometry=await page.evaluate(()=>({
      width:window.innerWidth,scroll:document.documentElement.scrollWidth}));
    assert.ok(geometry.scroll<=geometry.width+2,'No horizontal viewport overflow');
    await page.screenshot({path:'w3b-work-'+w+'x'+h+'.png'});
    await context.close();
  }
  assert.deepEqual(errors,[]);
  console.log('W3-B genuine WebGL work phone and mode persistence PASS in four viewports');
}finally{await browser.close();}
