/** W1-B.3a: actual PlayCanvas/WebGL at iPhone 390x844, midshift Safari reload and one wage. */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {newHousehold} from '../src/household.js';
import {hireCareer} from '../src/career-state.js';
import {progressCareerWork,arriveCareerPortal} from '../src/career-work.js';
import {SAVE_KEY} from '../src/simulation.js';
import {UI_TOUR_STORAGE_KEY} from '../src/ui-onboarding.js';

const seed=newHousehold('2026-11-16');
seed.careerSystem=hireCareer(seed.careerSystem,'alex','editorial',480);
seed.minutes=540;seed.otherSim.minutes=540;
progressCareerWork(seed,539,540);
assert.equal(arriveCareerPortal(seed,'alex',540),true);
seed.minutes=1000;seed.otherSim.minutes=1000;
seed.paused=true;seed.otherSim.paused=true;
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
  page.on('pageerror',e=>errors.push('PAGE '+e.stack));
  page.on('crash',()=>errors.push('CRASH'));
  const state=()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)||'null'),SAVE_KEY);
  await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
  await page.locator('#loading').waitFor({state:'hidden',timeout:35000});
  const chip=page.locator('#career-work-hud');
  assert.match(await chip.innerText(),/На работе/);
  await page.locator('#career-phone-toggle').click();
  await page.locator('#career-phone-panel').locator('span').filter({hasText:/Статус: На работе/}).first().waitFor();
  await page.locator('#career-phone-panel').getByText(/Повышение: Обозреватель/).waitFor();
  await page.screenshot({path:'w1b3a-working-iphone.png'});
  await page.locator('#career-phone-panel .career-phone-x').click();
  const before=await state();
  assert.equal(before.careerSystem.byResident.alex.currentShift.phase,'working');
  assert.equal(before.shop.credits,5000);
  // v1 loadGame intentionally restores the simulation running (paused is not
  // persisted); tapping Pause here would freeze the salary forever.
  assert.equal(await page.locator('#pause-btn').getAttribute('aria-label'),'Пауза');
  await page.locator('#speed-btn').click();
  await page.waitForFunction(key=>{
    const data=JSON.parse(localStorage.getItem(key)||'null');
    return data?.careerSystem?.settlementIds?.length===1&&
      data?.shop?.credits===5112;
  },SAVE_KEY,{timeout:30000});
  const paid=await state();
  assert.equal(paid.shop.credits,5112);
  assert.equal(paid.careerSystem.byResident.alex.lastShift.salary,112);
  assert.equal(paid.careerSystem.byResident.alex.workedShifts,1);
  assert.ok(paid.careerSystem.byResident.alex.performance>50);
  assert.ok(paid.needs.energy<seed.needs.energy,'Real post-shift fatigue');
  const results=page.locator('#career-shift-summary');
  await results.waitFor({state:'visible',timeout:10000});
  assert.match(await results.locator('.career-shift-summary-title').innerText(),/Смена завершена/);
  assert.match(await results.locator('.career-shift-summary-subtitle').innerText(),/Алекс/);
  assert.equal(await results.locator('.career-shift-summary-money').innerText(),'+112 кр.');
  assert.match(await results.locator('.career-shift-summary-details').innerText(),/Отработано/);
  await page.screenshot({path:'w1b3a-shift-results-iphone.png'});
  await results.locator('.career-shift-summary-done').tap();
  await results.waitFor({state:'hidden'});
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('#loading').waitFor({state:'hidden',timeout:35000});
  await page.waitForTimeout(1800);
  const stable=await state();
  assert.equal(stable.shop.credits,5112,'No duplicated salary after reload');
  assert.equal(stable.careerSystem.settlementIds.length,1);
  assert.equal(stable.careerSystem.byResident.alex.workedShifts,1);
  await page.locator('#career-phone-toggle').click();
  await page.locator('#career-phone-panel').getByText(/Смен на должности/).waitFor();
  await page.locator('#career-phone-panel .career-phone-x').click();
  // The touch screen promotion action is exercised after a saved eligible
  // career snapshot; earning those requirements is covered by pure tests.
  // Inject at document startup: the live game intentionally writes an
  // on-unload save, which otherwise replaces a manually seeded localStorage.
  await page.addInitScript(key=>{
    const saved=JSON.parse(localStorage.getItem(key)||'null');
    if(!saved?.careerSystem?.byResident?.alex)return;
    const contract=saved.careerSystem.byResident.alex;
    if(contract.level!==0||contract.workedShifts!==1)return;
    contract.currentShift=null;contract.performance=82;contract.rankShifts=3;
    saved.skills.xpById.literature=35;
    localStorage.setItem(key,JSON.stringify(saved));
  },SAVE_KEY);
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('#loading').waitFor({state:'hidden',timeout:35000});
  await page.locator('#career-phone-toggle').click();
  await page.locator('#career-phone-panel').getByRole('button',{name:'Получить повышение'}).click();
  const advanced=await state();
  assert.equal(advanced.careerSystem.byResident.alex.level,1);
  assert.equal(advanced.careerSystem.byResident.alex.rankShifts,0);
  assert.equal(advanced.shop.credits,5112);
  await page.locator('#career-phone-panel .career-phone-x').click();
  assert.equal(errors.length,0,errors.join('\n'));
  console.log('W1-B.3a WebGL 390x844: work status, hidden-presence model, payroll and reload: passed');
}finally{await browser.close();}
