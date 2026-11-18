/** W2-A.1: real touch/PlayCanvas WebGL 390x844 career routes and senior incidents. */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {newHousehold} from '../src/household.js';
import {hireCareer} from '../src/career-state.js';
import {plannedCareerShift} from '../src/career-scheduler.js';
import {startWorkIncident} from '../src/career-incidents.js';
import {SAVE_KEY} from '../src/simulation.js';
import {UI_TOUR_STORAGE_KEY} from '../src/ui-onboarding.js';

const browser=await chromium.launch({headless:true,args:[
  '--enable-webgl','--use-gl=angle','--use-angle=swiftshader',
  '--enable-unsafe-swiftshader','--disable-dev-shm-usage'
]});
const errors=[];
async function scene(seed){
  const context=await browser.newContext({viewport:{width:390,height:844},
    deviceScaleFactor:1,hasTouch:true,isMobile:true});
  await context.addInitScript(({key,record,tourKey})=>{
    if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(record));
    localStorage.setItem(tourKey,'done');
  },{key:SAVE_KEY,record:seed,tourKey:UI_TOUR_STORAGE_KEY});
  const page=await context.newPage();
  page.on('pageerror',err=>errors.push(err.stack||String(err)));
  page.on('crash',()=>errors.push('PAGE CRASH'));
  await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
  await page.locator('#loading').waitFor({state:'hidden',timeout:45000});
  return {context,page,phone:page.locator('#career-phone-panel'),
    saved:()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)||'null'),SAVE_KEY)};
}
try{
  // Sunday: no shift has started; actual game remains free to run during UI test.
  const root=newHousehold('2026-11-16');
  root.careerSystem=hireCareer(root.careerSystem,'alex','city-services',480);
  root.careerSystem=hireCareer(root.careerSystem,'mira','editorial',480);
  root.minutes=6*1440+400;root.otherSim.minutes=root.minutes;
  Object.assign(root.careerSystem.byResident.alex,{level:2,rankShifts:7,workedShifts:18,performance:83});
  Object.assign(root.careerSystem.byResident.mira,{level:3,rankShifts:9,workedShifts:30,performance:88});
  root.otherSim.skills.xpById.literature=3000;
  const {context,page,phone,saved}=await scene(root);
  await page.locator('#career-phone-toggle').tap();
  assert.equal(await phone.locator('.career-ladder-step').count(),5);
  await phone.getByText('Руководитель службы',{exact:false}).waitFor();
  await phone.getByText('Директор городских сервисов',{exact:false}).first().waitFor();
  await phone.getByText(/Новая ставка: 91 кр.\/час/).waitFor();
  assert.equal(await phone.locator('.career-goal-progress').count(),2);
  await phone.getByRole('button',{name:'Получить повышение'}).tap();
  let state=await saved();
  assert.equal(state.careerSystem.byResident.alex.level,3);
  assert.equal(state.careerSystem.byResident.alex.rankShifts,0);
  assert.equal(state.shop.credits,5000);
  await page.screenshot({path:'w2a1-five-ranks-iphone.png'});
  await phone.locator('.career-phone-x').tap();
  await page.locator('#pick-mira').tap();
  await page.locator('#career-phone-toggle').tap();
  assert.equal(await phone.locator('.career-ladder-step').count(),5);
  await phone.getByText(/Новая ставка: 118 кр.\/час/).waitFor();
  assert.equal(await phone.locator('.career-goal-progress').count(),3);
  await phone.getByRole('button',{name:'Получить повышение'}).tap();
  state=await saved();
  assert.equal(state.careerSystem.byResident.mira.level,4);
  assert.equal(state.careerSystem.byResident.alex.level,3);
  assert.equal(state.shop.credits,5000);
  await phone.locator('.career-phone-x').tap();
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('#loading').waitFor({state:'hidden',timeout:45000});
  state=await saved();
  assert.equal(state.careerSystem.byResident.alex.level,3);
  assert.equal(state.careerSystem.byResident.mira.level,4);
  assert.equal(state.careerSystem.settlementIds.length,0);
  await context.close();

  // Seniors retain different pending scene choices and rank-specific histories.
  const stories=newHousehold('2026-11-16');
  stories.careerSystem=hireCareer(stories.careerSystem,'alex','city-services',480);
  stories.careerSystem=hireCareer(stories.careerSystem,'mira','editorial',480);
  for(const [id,rank] of [['alex',3],['mira',4]]){
    const c=stories.careerSystem.byResident[id];
    c.level=rank;c.workedShifts=10;
    const shift=plannedCareerShift(stories.calendar,c,0);
    assert.ok(shift);
    c.currentShift={...shift,phase:'working',departedAt:shift.start,
      readiness:70,warn15:false,warn60:false,incident:null};
  }
  stories.minutes=781;stories.otherSim.minutes=781;
  assert.equal(startWorkIncident(stories,'alex',781),true);
  assert.equal(startWorkIncident(stories,'mira',781),true);
  const {context:ct,page:pg,phone:ph,saved:saveWork}=await scene(stories);
  await pg.locator('#career-phone-toggle').tap();
  assert.equal(await ph.locator('button.career-work-option').count(),3);
  await ph.locator('button.career-work-option').nth(0).tap();
  let work=await saveWork();
  assert.deepEqual(work.careerSystem.incidentHistory.alex.map(s=>s.rank),[3]);
  assert.equal(work.careerSystem.incidentHistory.mira.length,0);
  await ph.getByRole('button',{name:'История рабочих ситуаций'}).tap();
  assert.equal(await ph.locator('.career-work-story').count(),1);
  await pg.screenshot({path:'w2a1-senior-work-story-iphone.png'});
  await ph.locator('.career-phone-x').tap();
  await pg.locator('#pick-mira').tap();
  await pg.locator('#career-phone-toggle').tap();
  assert.equal(await ph.locator('button.career-work-option').count(),3);
  await ph.locator('button.career-work-option').nth(1).tap();
  work=await saveWork();
  assert.deepEqual(work.careerSystem.incidentHistory.mira.map(s=>s.rank),[4]);
  assert.equal(work.careerSystem.incidentIds.length,2);
  assert.equal(work.shop.credits,5000);
  await ph.locator('.career-phone-x').tap();
  await pg.reload({waitUntil:'domcontentloaded'});
  await pg.locator('#loading').waitFor({state:'hidden',timeout:45000});
  work=await saveWork();
  assert.equal(work.careerSystem.incidentHistory.alex[0].rank,3);
  assert.equal(work.careerSystem.incidentHistory.mira[0].rank,4);
  assert.equal(work.careerSystem.incidentIds.length,2);
  assert.equal(errors.length,0,errors.join('\n'));
  await ct.close();
  console.log('W2-A.1 390x844 PlayCanvas/WebGL: Alex and Mira senior promotions, path, salary, work choices, reload PASS');
}finally{await browser.close();}
