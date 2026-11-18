/** W3-A: real PlayCanvas/WebGL iPhone touch smoke and v1 save reload. */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {newHousehold} from '../src/household.js';
import {acceptCareerOffer} from '../src/career-job-board.js';
import {upcomingCareerTimeOff} from '../src/career-timeoff.js';
import {SAVE_KEY} from '../src/simulation.js';
import {UI_TOUR_STORAGE_KEY} from '../src/ui-onboarding.js';

const seed=newHousehold('2026-11-17');
seed.careerSystem=acceptCareerOffer(seed,'alex','city-services').careerSystem;
seed.careerSystem.byResident.alex.timeOff.balance=1;
seed.paused=true;seed.otherSim.paused=true;
seed.autonomy.enabled=false;seed.otherSim.autonomy.enabled=false;
const selected=upcomingCareerTimeOff(seed,'alex')[0].shift;
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
    page.on('pageerror',err=>errors.push(w+'×'+h+': '+err.message));
    page.on('requestfailed',r=>{
      if(/\/src\/|\/vendor\//.test(r.url()))
        errors.push(w+'×'+h+' request '+r.url()+' '+r.failure()?.errorText);
    });
    await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
    await page.locator('#loading').waitFor({state:'hidden',timeout:60000});
    assert.ok((await page.locator('#game-canvas').screenshot()).length>2000);
    await page.locator('#career-phone-toggle').tap();
    const phone=page.locator('#career-phone-panel');
    assert.ok(await phone.isVisible());
    assert.match(await phone.innerText(),/Отдых от работы/);
    assert.match(await phone.innerText(),/Оплачиваемых дней: 1\/3/);
    await phone.locator('.career-phone-leave summary').tap();
    const book=phone.getByRole('button',{name:'Оплачиваемый отпуск · '+selected.iso});
    const bounds=await book.boundingBox();
    assert.ok(bounds?.height>=40,'Booking button is touch-sized');
    page.once('dialog',d=>d.accept());
    await book.tap();
    const getSave=()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY);
    let saved=await getSave();
    assert.equal(saved.careerSystem.byResident.alex.timeOff.balance,0);
    assert.equal(saved.careerSystem.byResident.alex.timeOff.bookings[0].id,selected.id);
    assert.equal(saved.shop.credits,seed.shop.credits,'Booking is not a premature payout');
    assert.equal(saved.careerSystem.byResident.alex.missedShifts,0);
    await phone.locator('.career-phone-x').tap();
    await page.reload({waitUntil:'domcontentloaded'});
    await page.locator('#loading').waitFor({state:'hidden',timeout:60000});
    await page.locator('#career-phone-toggle').tap();
    await phone.locator('.career-phone-leave summary').tap();
    const cancel=phone.getByRole('button',{name:'Отменить отдых '+selected.iso});
    assert.ok(await cancel.isVisible());
    await cancel.tap();
    saved=await getSave();
    assert.equal(saved.careerSystem.byResident.alex.timeOff.balance,1);
    assert.equal(saved.careerSystem.byResident.alex.timeOff.bookings.length,0);
    assert.equal(saved.shop.credits,seed.shop.credits);
    const geometry=await page.evaluate(()=>({
      width:window.innerWidth,scroll:document.documentElement.scrollWidth}));
    assert.ok(geometry.scroll<=geometry.width+2,'No viewport horizontal overflow');
    await page.screenshot({path:'w3a-timeoff-'+w+'x'+h+'.png'});
    await context.close();
  }
  assert.deepEqual(errors,[],'No failed module imports or page exceptions');
  console.log('W3-A real WebGL touch time-off smoke passed on four viewports');
}finally{await browser.close();}
