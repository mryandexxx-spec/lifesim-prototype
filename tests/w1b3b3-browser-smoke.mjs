/** W1-B.3b.3: iPhone-sized PlayCanvas/WebGL real touch journal + new scenario. */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {newHousehold} from '../src/household.js';
import {hireCareer} from '../src/career-state.js';
import {plannedCareerShift} from '../src/career-scheduler.js';
import {progressCareerWork,arriveCareerPortal} from '../src/career-work.js';
import {startWorkIncident,decideWorkIncident,workScenario} from '../src/career-incidents.js';
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
for(const id of ['alex','mira'])assert.equal(startWorkIncident(seed,id,seed.minutes),true);
assert.ok(decideWorkIncident(seed,'alex','rewrite').ok);
assert.ok(decideWorkIncident(seed,'mira','compare').ok);
for(const id of ['alex','mira']){
  const contract=seed.careerSystem.byResident[id];
  const next=plannedCareerShift(seed.calendar,contract,1);
  contract.workedShifts=1;
  contract.currentShift={...next,phase:'working',departedAt:next.start,
    readiness:70,incident:null,warn60:false,warn15:false};
}
seed.minutes=2221;seed.otherSim.minutes=2221;
for(const id of ['alex','mira']){
  assert.equal(startWorkIncident(seed,id,seed.minutes),true);
  assert.notEqual(seed.careerSystem.byResident[id].currentShift.incident.scenarioId,'legacy');
}
const alexScenario=workScenario('editorial',
  seed.careerSystem.byResident.alex.currentShift.incident.scenarioId);

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
  const phone=page.locator('#career-phone-panel');
  async function boot(){await page.locator('#loading').waitFor({state:'hidden',timeout:45000});}
  await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
  await boot();
  assert.match(await page.locator('#career-work-hud').innerText(),/Рабочая ситуация/);
  await page.locator('#career-phone-toggle').tap();
  await phone.getByText(alexScenario.title,{exact:false}).waitFor();
  assert.equal(await phone.locator('button.career-work-option').count(),3);
  await page.screenshot({path:'w1b3b3-new-scenario-iphone.png'});
  await phone.locator('.career-phone-x').tap();
  await page.reload({waitUntil:'domcontentloaded'});
  await boot();
  await page.locator('#career-phone-toggle').tap();
  assert.equal(await phone.locator('button.career-work-option').count(),3);
  await phone.locator('button.career-work-option').nth(0).tap();
  let record=await saved();
  assert.equal(record.careerSystem.incidentHistory.alex.length,2);
  assert.equal(record.careerSystem.incidentHistory.mira.length,1);
  assert.equal(record.careerSystem.byResident.mira.currentShift.incident.choiceId,null);
  assert.equal(record.careerSystem.incidentIds.length,3);
  assert.equal(record.shop.credits,5000);
  await phone.getByRole('button',{name:'История рабочих ситуаций'}).tap();
  const story=phone.locator('.career-work-story');
  assert.equal(await story.count(),2);
  await story.first().getByText(alexScenario.title,{exact:false}).waitFor();
  assert.match(await story.first().innerText(),/Выбор игрока/);
  assert.match(await story.first().innerText(),/Карьера: рейтинг/);
  await page.screenshot({path:'w1b3b3-story-journal-iphone.png'});
  await phone.locator('.career-phone-x').tap();
  await page.locator('#pick-mira').tap();
  await page.locator('#career-phone-toggle').tap();
  assert.equal(await phone.locator('button.career-work-option').count(),3);
  await phone.getByRole('button',{name:'История рабочих ситуаций'}).tap();
  assert.equal(await story.count(),1,'Mira must not see Alex story');
  await phone.locator('.career-phone-x').tap();
  await page.reload({waitUntil:'domcontentloaded'});
  await boot();
  record=await saved();
  assert.equal(record.careerSystem.incidentHistory.alex.length,2);
  assert.equal(record.careerSystem.incidentHistory.mira.length,1);
  assert.equal(record.careerSystem.incidentIds.length,3);
  assert.equal(errors.length,0,errors.join('\n'));
  console.log('W1-B.3b.3 390x844 WebGL touch: new scenarios, stored choices, journal and two residents PASS');
}finally{await browser.close();}
