/** W2-A.2 real PlayCanvas/WebGL 390x844 touch recognition and incident persistence. */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {newHousehold} from '../src/household.js';
import {hireCareer} from '../src/career-state.js';
import {plannedCareerShift} from '../src/career-scheduler.js';
import {startWorkIncident,decideWorkIncident} from '../src/career-incidents.js';
import {progressCareerWork,finishCareerReturn} from '../src/career-work.js';
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
function payOnce(root,id,day,choice){
  const c=root.careerSystem.byResident[id];
  const shift=plannedCareerShift(root.calendar,c,day);
  assert.ok(shift);
  c.currentShift={...shift,phase:'working',departedAt:shift.start,
    readiness:80,incident:null};
  root.minutes=shift.start+shift.duration/2+1;root.otherSim.minutes=root.minutes;
  if(choice){
    assert.equal(startWorkIncident(root,id,root.minutes),true);
    // The first scenario is legacy; the real incident settlement validates choice.
    assert.equal(decideWorkIncident(root,id,choice).ok,true);
  }
  progressCareerWork(root,shift.end-1,shift.end);
  assert.equal(finishCareerReturn(root,id),true);
  root.minutes=shift.end;root.otherSim.minutes=root.minutes;
}
try{
  const root=newHousehold('2026-11-16');
  root.careerSystem=hireCareer(root.careerSystem,'alex','city-services',480);
  root.careerSystem=hireCareer(root.careerSystem,'mira','editorial',480);
  payOnce(root,'alex',0,'coordinate');
  payOnce(root,'alex',1,null);
  root.minutes=6*1440+400;root.otherSim.minutes=root.minutes;
  const {context,page,phone,saved}=await scene(root);
  await page.locator('#career-phone-toggle').tap();
  await phone.locator('.career-professional-summary').tap();
  await phone.locator('.career-professional-awards').getByText(/Точный адрес/).waitFor();
  assert.equal(await phone.locator('.career-ladder-step').count(),5);
  assert.equal(await phone.locator('.career-professional-awards li').count(),1);
  await page.screenshot({path:'w2a2-career-recognition-iphone.png'});
  await phone.locator('.career-phone-x').tap();
  await page.locator('#pick-mira').tap();
  await page.locator('#career-phone-toggle').tap();
  await phone.locator('.career-professional-summary').tap();
  assert.equal(await phone.locator('.career-professional-awards li').count(),0);
  await phone.getByText('Проверенные факты',{exact:true}).waitFor();
  assert.equal((await saved()).shop.credits,root.shop.credits);
  await phone.locator('.career-phone-x').tap();
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('#loading').waitFor({state:'hidden',timeout:45000});
  assert.equal((await saved()).careerSystem.professionalGoals.byResident.alex['city-services'].shifts,2);
  await context.close();

  // Real finger choice from saved pending incident is one time and personal.
  const work=newHousehold('2026-11-16');
  work.careerSystem=hireCareer(work.careerSystem,'alex','city-services',480);
  work.careerSystem=hireCareer(work.careerSystem,'mira','editorial',480);
  const first=plannedCareerShift(work.calendar,work.careerSystem.byResident.alex,0);
  const second=plannedCareerShift(work.calendar,work.careerSystem.byResident.mira,0);
  for(const [id,shift] of [['alex',first],['mira',second]]){
    const c=work.careerSystem.byResident[id];
    c.currentShift={...shift,phase:'working',departedAt:shift.start,
      warn15:false,warn60:false,readiness:75,incident:null};
  }
  work.minutes=Math.max(first.start+first.duration/2,second.start+second.duration/2)+1;
  work.otherSim.minutes=work.minutes;
  assert.equal(startWorkIncident(work,'alex',work.minutes),true);
  assert.equal(startWorkIncident(work,'mira',work.minutes),true);
  const {context:ct,page:pg,phone:ph,saved:saveWork}=await scene(work);
  await pg.locator('#career-phone-toggle').tap();
  assert.equal(await ph.locator('button.career-work-option').count(),3);
  await ph.locator('button.career-work-option').nth(1).tap();
  let data=await saveWork();
  assert.ok(data.careerSystem.professionalGoals.byResident.alex['city-services'].scenes.legacy);
  assert.equal(data.careerSystem.professionalGoals.byResident.mira.editorial,undefined);
  assert.equal(data.careerSystem.incidentIds.length,1);
  await ph.locator('.career-professional-summary').tap();
  await ph.getByText('Успешное решение тематической рабочей ситуации').waitFor();
  await pg.screenshot({path:'w2a2-work-decision-iphone.png'});
  await ph.locator('.career-phone-x').tap();
  await pg.reload({waitUntil:'domcontentloaded'});
  await pg.locator('#loading').waitFor({state:'hidden',timeout:45000});
  data=await saveWork();
  assert.equal(data.careerSystem.incidentIds.length,1);
  assert.ok(data.careerSystem.professionalGoals.byResident.alex['city-services'].scenes.legacy);
  assert.equal(data.shop.credits,5000);
  assert.equal(errors.length,0,errors.join('\n'));
  await ct.close();
  console.log('W2-A.2: 390x844 PlayCanvas/WebGL touch, personal goals, actual work decisions, reload PASS');
}finally{await browser.close();}
