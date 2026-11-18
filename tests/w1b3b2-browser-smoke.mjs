/** W1-B.3b.2: real touch controls in PlayCanvas/WebGL at 390x844. */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {newHousehold} from '../src/household.js';
import {hireCareer} from '../src/career-state.js';
import {progressCareerWork,arriveCareerPortal} from '../src/career-work.js';
import {startWorkIncident} from '../src/career-incidents.js';
import {SAVE_KEY} from '../src/simulation.js';
import {UI_TOUR_STORAGE_KEY} from '../src/ui-onboarding.js';

const seed=newHousehold('2026-11-16');
seed.careerSystem=hireCareer(seed.careerSystem,'alex','editorial',480);
seed.careerSystem=hireCareer(seed.careerSystem,'mira','business-center',480);
seed.minutes=540;seed.otherSim.minutes=540;
progressCareerWork(seed,539,540);
assert.equal(arriveCareerPortal(seed,'alex',540),true);
assert.equal(arriveCareerPortal(seed,'mira',540),true);
seed.minutes=781;seed.otherSim.minutes=781;
assert.equal(startWorkIncident(seed,'alex',781),true);
assert.equal(startWorkIncident(seed,'mira',781),true);

const browser=await chromium.launch({headless:true,args:[
  '--enable-webgl','--use-gl=angle','--use-angle=swiftshader',
  '--enable-unsafe-swiftshader','--disable-dev-shm-usage'
]});
const errors=[];
try{
  const context=await browser.newContext({viewport:{width:390,height:844},
    deviceScaleFactor:1,hasTouch:true,isMobile:true});
  await context.addInitScript(({key,record,tourKey})=>{
    if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(record));
    localStorage.setItem(tourKey,'done');
  },{key:SAVE_KEY,record:seed,tourKey:UI_TOUR_STORAGE_KEY});
  const page=await context.newPage();
  page.on('pageerror',error=>errors.push('PAGE '+error.stack));
  page.on('crash',()=>errors.push('CRASH'));
  const saved=()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)||'null'),SAVE_KEY);
  async function boot(){
    await page.locator('#loading').waitFor({state:'hidden',timeout:45000});
  }
  await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
  await boot();
  assert.match(await page.locator('#career-work-hud').innerText(),/Рабочая ситуация/);
  await page.locator('#career-phone-toggle').tap();
  const phone=page.locator('#career-phone-panel');
  await phone.getByText('Спорная цитата',{exact:false}).waitFor();
  assert.equal(await phone.locator('button.career-work-option').count(),3);
  assert.ok((await phone.locator('button.career-work-option').first().innerText()).includes('Рейтинг'));
  await page.screenshot({path:'w1b3b2-work-choice-iphone.png'});
  await phone.locator('.career-phone-x').tap();
  await page.reload({waitUntil:'domcontentloaded'});
  await boot();
  await page.locator('#career-phone-toggle').tap();
  assert.equal(await phone.locator('button.career-work-option').count(),3,
    'Pending incident must survive Safari refresh and phone closure');
  await phone.locator('button.career-work-option').nth(1).tap();
  const result=await saved();
  assert.equal(result.careerSystem.byResident.alex.currentShift.incident.choiceId,'rewrite');
  assert.equal(result.careerSystem.byResident.mira.currentShift.incident.choiceId,null);
  assert.equal(result.careerSystem.incidentIds.length,1);
  assert.equal(result.shop.credits,5000,'work choice cannot mint wages');
  assert.equal(await phone.locator('button.career-work-option').count(),0);
  await page.screenshot({path:'w1b3b2-work-outcome-iphone.png'});
  await phone.locator('.career-phone-x').tap();
  await page.locator('#pick-mira').tap();
  await page.locator('#career-phone-toggle').tap();
  await phone.getByText('Несовпадение в отчёте',{exact:false}).waitFor();
  assert.equal(await phone.locator('button.career-work-option').count(),3);
  await phone.locator('.career-phone-x').tap();
  await page.locator('#pick-alex').tap();
  await page.locator('#career-phone-toggle').tap();
  assert.equal(await phone.locator('button.career-work-option').count(),0);
  await phone.locator('.career-phone-x').tap();
  await page.reload({waitUntil:'domcontentloaded'});
  await boot();
  const again=await saved();
  assert.equal(again.careerSystem.incidentIds.length,1);
  assert.equal(again.careerSystem.byResident.alex.currentShift.incident.choiceId,'rewrite');
  assert.equal(again.careerSystem.byResident.mira.currentShift.incident.choiceId,null);
  assert.equal(errors.length,0,errors.join('\n'));
  console.log('W1-B.3b.2 mobile PlayCanvas WebGL 390x844: touch, pending reload, independent dual work, once-only decisions PASS');
}finally{await browser.close();}
