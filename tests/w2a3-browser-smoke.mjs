/** W2-A.3: 390x844 genuine touch/PlayCanvas/WebGL branch paths, save and pay. */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {newHousehold} from '../src/household.js';
import {hireCareer} from '../src/career-state.js';
import {plannedCareerShift} from '../src/career-scheduler.js';
import {startWorkIncident,decideWorkIncident,workScenario} from '../src/career-incidents.js';
import {chooseCareerSpecialization} from '../src/career-specializations.js';
import {progressCareerWork,finishCareerReturn} from '../src/career-work.js';
import {SAVE_KEY} from '../src/simulation.js';
import {UI_TOUR_STORAGE_KEY} from '../src/ui-onboarding.js';

const browser=await chromium.launch({headless:true,args:[
  '--enable-webgl','--use-gl=angle','--use-angle=swiftshader',
  '--enable-unsafe-swiftshader','--disable-dev-shm-usage'
]});
const errors=[];
async function open(seed){
  const context=await browser.newContext({viewport:{width:390,height:844},
    deviceScaleFactor:1,isMobile:true,hasTouch:true});
  await context.addInitScript(({key,record,tourKey})=>{
    if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(record));
    localStorage.setItem(tourKey,'done');
  },{key:SAVE_KEY,record:seed,tourKey:UI_TOUR_STORAGE_KEY});
  const page=await context.newPage();
  page.on('pageerror',error=>errors.push(error.stack||String(error)));
  page.on('crash',()=>errors.push('PAGE CRASH'));
  await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
  await page.locator('#loading').waitFor({state:'hidden',timeout:45000});
  return {context,page,phone:page.locator('#career-phone-panel'),
    saved:()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)||'null'),SAVE_KEY)};
}
try{
  const family=newHousehold('2026-11-16');
  family.careerSystem=hireCareer(family.careerSystem,'alex','city-services',480);
  family.careerSystem=hireCareer(family.careerSystem,'mira','editorial',480);
  for(const id of ['alex','mira']){
    const c=family.careerSystem.byResident[id];
    c.level=4;c.workedShifts=22;c.rankShifts=5;c.performance=98;
  }
  const {context,page,phone,saved}=await open(family);
  await page.locator('#career-phone-toggle').tap();
  await phone.locator('.career-specialization-summary').waitFor();
  assert.equal(await phone.locator('.career-specialization-card').count(),2);
  assert.equal(await phone.locator('.career-ladder-step').count(),5);
  page.once('dialog',dialog=>dialog.accept());
  await phone.locator('button.career-specialization-select').first().tap();
  let root=await saved();
  assert.equal(root.careerSystem.byResident.alex.specialization.id,'logistics');
  assert.equal(root.careerSystem.byResident.mira.specialization,undefined);
  assert.equal(await phone.locator('.career-ladder-step').count(),6);
  assert.equal(await phone.locator('.career-specialization-chosen').count(),1);
  await page.screenshot({path:'w2a3-branch-choice-iphone.png'});
  await phone.locator('.career-phone-x').tap();
  await page.locator('#pick-mira').tap();
  await page.locator('#career-phone-toggle').tap();
  assert.equal(await phone.locator('.career-specialization-chosen').count(),0);
  page.once('dialog',dialog=>dialog.accept());
  await phone.locator('button.career-specialization-select').nth(1).tap();
  root=await saved();
  assert.equal(root.careerSystem.byResident.mira.specialization.id,'leadership');
  assert.equal(root.careerSystem.byResident.alex.specialization.id,'logistics');
  await phone.locator('.career-phone-x').tap();
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('#loading').waitFor({state:'hidden',timeout:45000});
  root=await saved();
  assert.equal(root.careerSystem.byResident.alex.specialization.id,'logistics');
  assert.equal(root.careerSystem.byResident.mira.specialization.id,'leadership');
  await context.close();

  // A completely canonical positive professional case, plus settled shift, allows
  // the manual sixth-rank promotion. No fake professional XP or instant salary.
  const earned=newHousehold('2026-11-16');
  earned.careerSystem=hireCareer(earned.careerSystem,'alex','city-services',480);
  const c=earned.careerSystem.byResident.alex;
  c.level=4;c.workedShifts=30;c.rankShifts=4;c.performance=98;
  assert.equal(chooseCareerSpecialization(earned,'alex','logistics').ok,true);
  const shift=plannedCareerShift(earned.calendar,c,0);
  c.currentShift={...shift,phase:'working',departedAt:shift.start,
    readiness:80,warn15:false,warn60:false,incident:null};
  earned.minutes=shift.start+shift.duration/2+1;earned.otherSim.minutes=earned.minutes;
  assert.equal(startWorkIncident(earned,'alex',earned.minutes),true);
  assert.equal(c.currentShift.incident.scenarioId,'city-missing');
  assert.equal(decideWorkIncident(earned,'alex',
    workScenario(c.careerId,'city-missing').options[0].id).ok,true);
  progressCareerWork(earned,shift.end-1,shift.end);
  assert.equal(finishCareerReturn(earned,'alex'),true);
  earned.minutes=shift.end;earned.otherSim.minutes=earned.minutes;
  assert.equal(c.rankShifts,5);
  const originalCredits=earned.shop.credits;
  const {context:cc,page:pg,phone:ph,saved:read}=await open(earned);
  await pg.locator('#career-phone-toggle').tap();
  await ph.getByRole('button',{name:'Получить повышение'}).tap();
  let data=await read();
  assert.equal(data.careerSystem.byResident.alex.level,5);
  assert.equal(data.shop.credits,originalCredits);
  assert.equal(data.careerSystem.settlementIds.length,1);
  assert.equal(await ph.locator('.career-ladder-step').count(),6);
  await pg.screenshot({path:'w2a3-sixth-rank-iphone.png'});
  await ph.locator('.career-phone-x').tap();
  await pg.reload({waitUntil:'domcontentloaded'});
  await pg.locator('#loading').waitFor({state:'hidden',timeout:45000});
  data=await read();
  assert.equal(data.careerSystem.byResident.alex.level,5);
  assert.equal(data.careerSystem.byResident.alex.specialization.id,'logistics');
  assert.equal(data.shop.credits,originalCredits);
  assert.equal(errors.length,0,errors.join('\n'));
  await cc.close();
  console.log('W2-A.3 390x844 PlayCanvas/WebGL true touch, two branches, real case, rank5, reload PASS');
}finally{await browser.close();}
