/** W1-B.2a compatibility: 390x844 touch PlayCanvas/WebGL phone, true vacancy
 * preview and historical contracts. Recruitment signing is exercised separately
 * by the W1-B.2b browser tests; no deprecated instant-offer UI assumptions.
 */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {newHousehold} from '../src/household.js';
import {acceptCareerOffer} from '../src/career-job-board.js';
import {SAVE_KEY} from '../src/simulation.js';
import {UI_TOUR_STORAGE_KEY} from '../src/ui-onboarding.js';

const browser=await chromium.launch({headless:true,args:[
  '--enable-webgl','--use-gl=angle','--use-angle=swiftshader',
  '--enable-unsafe-swiftshader','--disable-dev-shm-usage'
]});
const errors=[];
async function boot(seed){
  const context=await browser.newContext({viewport:{width:390,height:844},
    deviceScaleFactor:1,hasTouch:true,isMobile:true});
  await context.addInitScript(({key,record,tourKey})=>{
    if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(record));
    localStorage.setItem(tourKey,'done');
  },{key:SAVE_KEY,record:seed,tourKey:UI_TOUR_STORAGE_KEY});
  const page=await context.newPage();
  page.on('pageerror',e=>errors.push('PAGE '+e.stack));
  page.on('crash',()=>errors.push('CRASH'));
  page.on('requestfailed',req=>{
    if(req.url().includes('/src/')||req.url().includes('/vendor/'))
      errors.push('REQUEST '+req.url()+' '+req.failure()?.errorText);
  });
  await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
  try{await page.locator('#loading').waitFor({state:'hidden',timeout:45000});}
  catch(error){
    console.error('W1-B.2a boot did not finish:',await page.locator('#loading').innerText());
    console.error('Browser errors:',JSON.stringify(errors));
    throw error;
  }
  return {context,page};
}
const read=page=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)||'null'),SAVE_KEY);
try{
  const fresh=newHousehold('2026-11-17');
  fresh.autonomy.enabled=false;fresh.otherSim.autonomy.enabled=false;
  const first=await boot(fresh);
  const {page}=first;
  await page.locator('#pause-btn').tap();
  const initial=await read(page);
  assert.equal(initial.careerSystem.byResident.alex,null);
  assert.equal(initial.careerSystem.byResident.mira,null);
  await page.locator('#career-phone-toggle').tap();
  const phone=page.locator('#career-phone-panel');
  assert.ok(await phone.isVisible());
  assert.equal(await phone.getAttribute('aria-label'),'Смартфон: работа Блин’С');
  assert.equal(await phone.getByRole('button',{name:/^Вакансия /}).count(),6);
  await phone.getByRole('button',{name:/Вакансия Арт-студия/}).tap();
  assert.ok(await phone.getByText('Ассистент галереи').isVisible());
  assert.ok(await phone.getByText(/Первая смена:/).isVisible());
  assert.equal((await read(page)).careerSystem.byResident.alex,null,'Preview cannot hire');
  assert.equal(await phone.getByRole('button',{name:'Получить предложение'}).count(),0,
    'Instant hire was intentionally retired');
  await phone.getByRole('button',{name:'Отправить отклик'}).tap();
  const applied=await read(page);
  assert.equal(applied.recruitmentSystem.byResident.alex.careerId,'art-studio');
  assert.equal(applied.recruitmentSystem.byResident.alex.phase,'waiting_reply');
  assert.equal(applied.shop.credits,initial.shop.credits);
  assert.equal(applied.careerSystem.byResident.alex,null);
  await phone.locator('.career-phone-x').tap();
  await first.context.close();

  // Historical W1-B.2a signed contracts load without requiring an invented
  // retrospective interview, and the same phone still shows real work status.
  const old=newHousehold('2026-11-17');
  old.careerSystem=acceptCareerOffer(old,'alex','art-studio').careerSystem;
  old.careerSystem=acceptCareerOffer(old,'mira','civic-service').careerSystem;
  old.paused=true;
  const second=await boot(old);
  const savedInitial=await read(second.page);
  const panel=second.page.locator('#career-phone-panel');
  await second.page.locator('#career-phone-toggle').tap();
  assert.ok(await panel.getByText(/Результативность:/).isVisible());
  assert.ok(await panel.getByText(/Следующая смена:/).isVisible());
  await second.page.screenshot({path:'w1b2a-phone-smoke.png'});
  await panel.locator('.career-phone-x').tap();
  await second.page.locator('#pick-mira').tap();
  await second.page.locator('#career-phone-toggle').tap();
  assert.ok(await panel.getByText(/Общественная служба/).isVisible());
  assert.ok(await panel.getByText(/Результативность:/).isVisible());
  await panel.locator('.career-phone-x').tap();

  const dual=await read(second.page);
  assert.equal(dual.careerSystem.byResident.mira.careerId,'civic-service');
  assert.equal(dual.careerSystem.byResident.alex.careerId,'art-studio');
  assert.notEqual(dual.careerSystem.byResident.alex.employmentId,
    dual.careerSystem.byResident.mira.employmentId);
  assert.equal(dual.shop.credits,savedInitial.shop.credits);
  await second.page.reload({waitUntil:'domcontentloaded'});
  await second.page.locator('#loading').waitFor({state:'hidden',timeout:45000});
  const restored=await read(second.page);
  assert.deepEqual(restored.careerSystem,dual.careerSystem);
  assert.equal(restored.shop.credits,savedInitial.shop.credits);
  await second.page.locator('#career-phone-toggle').tap();
  assert.ok(await second.page.locator('#career-phone-panel')
    .getByText(/Результативность:/).isVisible());
  await second.page.locator('#career-phone-panel .career-phone-x').tap();
  await second.page.locator('#calendar-anchor-toggle').tap();
  assert.ok(await second.page.locator('#lc-agenda').getByText(/Работа: Арт-студия/).isVisible(),
    'Existing calendar shows actual signed career shift');
  await second.page.locator('#lc-close').tap();
  assert.equal(errors.length,0,errors.join('\n'));
  await second.context.close();
  console.log('W1-B.2a 390x844 PlayCanvas/WebGL: all 6 vacancies, new apply, old contracts, Mira, calendar, reload, no wages PASS');
}finally{await browser.close();}
