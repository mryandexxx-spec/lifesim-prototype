/** W2-A.4 PlayCanvas/WebGL touch at iPhone 390×844: rank7/8 and old save. */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {newHousehold} from '../src/household.js';
import {hireCareer} from '../src/career-state.js';
import {chooseCareerSpecialization} from '../src/career-specializations.js';
import {resetSeniorProof} from '../src/career-seniority.js';
import {plannedCareerShift} from '../src/career-scheduler.js';
import {startWorkIncident,decideWorkIncident,workScenario} from '../src/career-incidents.js';
import {finishCareerReturn,progressCareerWork} from '../src/career-work.js';
import {SAVE_KEY} from '../src/simulation.js';
import {UI_TOUR_STORAGE_KEY} from '../src/ui-onboarding.js';

const family=newHousehold('2026-11-16');
family.minutes=0;family.otherSim.minutes=0;
family.careerSystem=hireCareer(family.careerSystem,'alex','city-services',0);
family.careerSystem=hireCareer(family.careerSystem,'mira','editorial',0);
const c=family.careerSystem.byResident.alex;
c.level=4;c.workedShifts=30;c.rankShifts=10;c.performance=95;
assert.equal(chooseCareerSpecialization(family,'alex','logistics').ok,true);
c.level=6;c.rankShifts=9;c.performance=100;c.seniorProofs=resetSeniorProof(c,0);
let lastDay=0;
for(let i=0;i<2;i++){
  let shift,day;
  for(day=lastDay;day<lastDay+20;day++){
    const possible=plannedCareerShift(family.calendar,c,day);
    if(possible&&possible.id!==c.lastShift?.id){shift=possible;break;}
  }
  assert.ok(shift);
  lastDay=day+1;
  c.currentShift={...shift,phase:'working',departedAt:shift.start,
    readiness:90,warn15:false,warn60:false,incident:null};
  family.minutes=shift.start+shift.duration/2+1;
  family.otherSim.minutes=family.minutes;
  assert.equal(startWorkIncident(family,'alex',family.minutes),true);
  const inc=c.currentShift.incident;
  assert.equal(decideWorkIncident(family,'alex',workScenario(c.careerId,inc.scenarioId).options[0].id).ok,true);
  progressCareerWork(family,shift.end-1,shift.end);
  assert.equal(finishCareerReturn(family,'alex'),true);
  family.minutes=shift.end;family.otherSim.minutes=family.minutes;
}
assert.equal(c.seniorProofs.positiveReceipts.length,2);
const funds=family.shop.credits;
const browser=await chromium.launch({headless:true,args:[
  '--enable-webgl','--use-gl=angle','--use-angle=swiftshader',
  '--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
const errs=[];
try{
  const ctx=await browser.newContext({viewport:{width:390,height:844},
    deviceScaleFactor:1,isMobile:true,hasTouch:true});
  await ctx.addInitScript(({key,record,tourKey})=>{
    if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(record));
    localStorage.setItem(tourKey,'done');
  },{key:SAVE_KEY,record:family,tourKey:UI_TOUR_STORAGE_KEY});
  const page=await ctx.newPage();
  page.on('pageerror',e=>errs.push(String(e)));
  page.on('crash',()=>errs.push('crashed'));
  await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
  await page.locator('#loading').waitFor({state:'hidden',timeout:45000});
  await page.locator('#career-phone-toggle').tap();
  const phone=page.locator('#career-phone-panel');
  assert.equal(await phone.locator('.career-ladder-step').count(),8);
  assert.equal(await phone.locator('details.career-ladder-details').evaluate(n=>n.open),false);
  await phone.locator('.career-ladder-summary').tap();
  assert.equal(await phone.locator('details.career-ladder-details').evaluate(n=>n.open),true);
  assert.equal(await phone.getByRole('button',{name:'Получить повышение'}).count(),1);
  await phone.getByRole('button',{name:'Получить повышение'}).tap();
  const save=()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY);
  let data=await save();
  assert.equal(data.careerSystem.byResident.alex.level,7);
  assert.equal(data.careerSystem.byResident.mira.level,0);
  assert.equal(data.shop.credits,funds);
  assert.equal(data.careerSystem.byResident.alex.seniorProofs.rank,7);
  await page.screenshot({path:'w2a4-eight-ranks-iphone.png'});
  await phone.locator('.career-phone-x').tap();
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('#loading').waitFor({state:'hidden',timeout:45000});
  data=await save();
  assert.equal(data.careerSystem.byResident.alex.level,7);
  assert.equal(data.shop.credits,funds);
  await page.locator('#career-phone-toggle').tap();
  assert.equal(await page.locator('#career-phone-panel .career-ladder-step').count(),8);
  assert.equal(errs.length,0,errs.join('\n'));
  await ctx.close();
  console.log('W2-A.4 390x844 WebGL touch: 8-stage UI, canonically earned rank8, reload, money and Mira PASS');
}finally{await browser.close();}
