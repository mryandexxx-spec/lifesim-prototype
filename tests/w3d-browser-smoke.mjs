/** W3-D: genuine PlayCanvas mobile work-life panel, conflict choice, reload. */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {newHousehold} from '../src/household.js';
import {hireCareer} from '../src/career-state.js';
import {nextCareerShift} from '../src/career-scheduler.js';
import {progressCareerWork} from '../src/career-work.js';
import {SAVE_KEY} from '../src/simulation.js';
import {UI_TOUR_STORAGE_KEY} from '../src/ui-onboarding.js';
const seed=newHousehold('2026-11-16');
seed.careerSystem=hireCareer(seed.careerSystem,'alex','editorial',seed.minutes);
const contract=seed.careerSystem.byResident.alex;
const shift=nextCareerShift(seed.calendar,contract,seed.minutes);
seed.minutes=shift.start-8;seed.otherSim.minutes=seed.minutes;
seed.action={id:'sofa',phase:'using',elapsed:5,automatic:false};
progressCareerWork(seed,shift.start-61,seed.minutes);
assert.equal(contract.currentShift?.phase,'pending');
seed.autonomy.enabled=false;seed.otherSim.autonomy.enabled=false;
seed.paused=true;seed.otherSim.paused=true;
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
    page.on('pageerror',e=>errors.push(w+'x'+h+': '+e.message));
    page.on('requestfailed',r=>{
      if(/\/src\/|\/vendor\//.test(r.url()))
        errors.push(w+'x'+h+': '+r.failure()?.errorText);
    });
    await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
    await page.locator('#loading').waitFor({state:'hidden',timeout:60000});
    assert.ok((await page.locator('#game-canvas').screenshot()).length>2000);
    await page.locator('#career-phone-toggle').tap();
    const phone=page.locator('#career-phone-panel');
    assert.match(await phone.innerText(),/Баланс работы и жизни/);
    const life=phone.locator('.career-phone-worklife');
    await life.locator('summary').tap();
    assert.match(await life.innerText(),/Удовлетворённость/);
    const conflict=phone.locator('.career-phone-worklife-conflict');
    assert.ok(await conflict.isVisible(),'Real ongoing home manual action conflicts with shift');
    assert.match(await conflict.innerText(),/Закончить дело/);
    const depart=conflict.getByRole('button',{name:'Выйти на работу'});
    assert.ok((await depart.boundingBox())?.height>=40);
    await depart.tap();
    const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY);
    assert.equal(saved.careerSystem.byResident.alex.currentShift.phase,'departing');
    assert.equal(saved.action,null);
    assert.equal(saved.careerSystem.byResident.alex.workLife.choiceShiftId,shift.id);
    assert.equal(saved.shop.credits,seed.shop.credits);
    const geometry=await page.evaluate(()=>({
      width:window.innerWidth,scroll:document.documentElement.scrollWidth}));
    assert.ok(geometry.scroll<=geometry.width+2,'No horizontal page overflow');
    await phone.locator('.career-phone-x').tap();
    await page.reload({waitUntil:'domcontentloaded'});
    await page.locator('#loading').waitFor({state:'hidden',timeout:60000});
    await page.locator('#career-phone-toggle').tap();
    assert.match(await phone.innerText(),/Баланс работы и жизни/);
    await page.screenshot({path:'w3d-worklife-'+w+'x'+h+'.png'});
    await context.close();
  }
  assert.deepEqual(errors,[],'No module load/renderer/runtime exceptions');
  console.log('W3-D genuine WebGL phone/choice/save/reload PASS at four sizes');
}finally{await browser.close();}
