/** CAREER-SHIFTS-R1: real PlayCanvas Chromium/WebGL, 390/320 touch,
 * phone career facts, Sunday→Monday overnight calendar, v1 reload.
 * Physical iPhone Safari acceptance remains deferred.
 */
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'playwright';
import {newHousehold} from '../src/household.js';
import {acceptCareerOffer} from '../src/career-job-board.js';
import {SAVE_KEY} from '../src/simulation.js';
import {UI_TOUR_STORAGE_KEY} from '../src/ui-onboarding.js';

const seed=newHousehold('2026-11-16');
seed.calendar.anchorConfirmed=true;
seed.paused=true;seed.otherSim.paused=true;
seed.autonomy.enabled=false;seed.otherSim.autonomy.enabled=false;
seed.careerSystem=acceptCareerOffer(seed,'alex','civic-service').careerSystem;
seed.careerSystem=acceptCareerOffer(seed,'mira','kitchen-studio').careerSystem;
assert.equal(seed.careerSystem.byResident.alex.shiftSchedule.effectiveDayIndex,0);
assert.equal(seed.careerSystem.byResident.mira.shiftSchedule.effectiveDayIndex,0);
const browser=await chromium.launch({headless:true,args:[
  '--enable-webgl','--use-gl=angle','--use-angle=swiftshader',
  '--enable-unsafe-swiftshader','--disable-dev-shm-usage'
]});
mkdirSync('artifacts/career-shifts-r1',{recursive:true});
try{
  for(const [width,height] of [[390,844],[320,568]]){
    const context=await browser.newContext({viewport:{width,height},
      deviceScaleFactor:1,hasTouch:true,isMobile:true,serviceWorkers:'block'});
    await context.addInitScript(({key,record,tour})=>{
      localStorage.setItem(key,JSON.stringify(record));
      localStorage.setItem(tour,'done');
    },{key:SAVE_KEY,record:seed,tour:UI_TOUR_STORAGE_KEY});
    const page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('crash',()=>errors.push('renderer crashed'));
    await page.goto('http://127.0.0.1:8765/?career-shifts-r1',
      {waitUntil:'domcontentloaded'});
    await page.locator('#loading').waitFor({state:'hidden',timeout:80000});
    assert.ok((await page.locator('#game-canvas').screenshot()).length>2000,
      'actual PlayCanvas scene rendered');
    const hasGl=await page.evaluate(async()=>{
      const {Application}=await import('playcanvas');
      return Boolean(Application.getApplication()?.graphicsDevice?.canvas);
    });
    assert.equal(hasGl,true,'real WebGL graphics device');
    await page.locator('#career-phone-toggle').tap();
    const body=await page.locator('#career-phone-panel').innerText();
    assert.match(body,/20:00–05:00 \(\+1 день\)/,
      'civic helper shift is displayed as real overnight shift');
    assert.match(body,/Ориентир полной недели: 855 кр\./);
    await page.screenshot({path:'artifacts/career-shifts-r1/phone-'+width+'.png'});
    await page.locator('#career-phone-panel .career-phone-header .career-phone-x').tap();
    await page.locator('#calendar-anchor-toggle').tap();
    await page.locator('#life-calendar').waitFor({state:'visible'});
    await page.locator('#lc-jump-date').fill('2026-11-22');
    const agenda=await page.locator('#lc-agenda').innerText();
    assert.match(agenda,/20:00–05:00 \(\+1 день\)/,
      'Sunday-origin civic overnight ends Monday without a second event');
    assert.match(agenda,/Помощник службы/);
    await page.screenshot({path:'artifacts/career-shifts-r1/calendar-'+width+'.png'});
    await page.locator('#lc-close').tap();
    const root=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY);
    assert.equal(root.version,1,'save key and root version intact');
    assert.equal(root.careerSystem.byResident.alex.shiftSchedule.schema,1);
    assert.equal(root.careerSystem.byResident.mira.shiftSchedule.schema,1);
    assert.equal(root.shop.credits,seed.shop.credits,'no fictional wages');
    assert.deepEqual(errors,[],width+' viewport JS errors');
    await context.close();
  }
  console.log('CAREER-SHIFTS-R1 PlayCanvas/WebGL 390x844 + 320x568 phone, calendar and save PASS; real Safari QA deferred');
}finally {await browser.close();}
