/** UX06 real mobile WebGL: phone entry, resident-specific career, Q5, two pending decisions. */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdirSync} from 'node:fs';
import {newHousehold} from '../src/household.js';
import {hireCareer} from '../src/career-state.js';
import {progressCareerWork,arriveCareerPortal} from '../src/career-work.js';
import {startWorkIncident} from '../src/career-incidents.js';
import {SAVE_KEY} from '../src/simulation.js';
import {UI_TOUR_STORAGE_KEY} from '../src/ui-onboarding.js';
const fresh=newHousehold('2026-11-20');
fresh.paused=true;fresh.otherSim.paused=true;fresh.autonomy.enabled=false;
const incident=newHousehold('2026-11-16');
incident.careerSystem=hireCareer(incident.careerSystem,'alex','editorial',480);
incident.careerSystem=hireCareer(incident.careerSystem,'mira','business-center',480);
incident.minutes=540;incident.otherSim.minutes=540;
progressCareerWork(incident,539,540);
assert.equal(arriveCareerPortal(incident,'alex',540),true);
assert.equal(arriveCareerPortal(incident,'mira',540),true);
incident.minutes=781;incident.otherSim.minutes=781;
assert.equal(startWorkIncident(incident,'alex',781),true);
assert.equal(startWorkIncident(incident,'mira',781),true);
incident.paused=true;incident.otherSim.paused=true;incident.autonomy.enabled=false;
mkdirSync('ux06-artifacts',{recursive:true});
const browser=await chromium.launch({headless:true,args:[
 '--enable-webgl','--use-gl=angle','--use-angle=swiftshader',
 '--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
try{
 for(const [width,height] of [[390,844],[375,667],[320,568],[844,390]]){
  for(const [scenario,seed] of [['looking',fresh],['incident',incident]]){
   const context=await browser.newContext({viewport:{width,height},
    deviceScaleFactor:1,hasTouch:true,isMobile:true});
   await context.addInitScript(({key,root,tour})=>{
    if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(root));
    localStorage.setItem(tour,'done');
   },{key:SAVE_KEY,root:seed,tour:UI_TOUR_STORAGE_KEY});
   const page=await context.newPage(),errors=[];
   page.on('pageerror',error=>errors.push(error.message));
   page.on('requestfailed',request=>{
    if(request.url().includes('/src/'))errors.push(request.url());
   });
   await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
   await page.locator('#loading').waitFor({state:'hidden',timeout:65000});
   assert.ok(await page.locator('#game-canvas').evaluate(c=>
    Boolean(c.getContext('webgl2')||c.getContext('webgl'))));
   assert.match(await page.locator('#career-phone-toggle').innerText(),/Телефон/);
   const panel=page.locator('#career-phone-panel');
   await page.locator('#career-phone-toggle').tap();
   assert.ok(await panel.isVisible());
   assert.equal(await panel.locator('#career-phone-title').innerText(),'Работа · Алекс');
   assert.equal(await panel.locator('.career-phone-header .career-phone-x')
    .evaluate(el=>el.getBoundingClientRect().width>=44),true);
   if(scenario==='looking'){
    assert.match(await panel.locator('.career-phone-hero').innerText(),/Поиск работы/);
    assert.equal(await panel.getByRole('button',{name:/^Вакансия /}).count(),6);
    await panel.locator('.career-phone-app-tab[data-app="finance"]').tap();
    assert.equal(await panel.locator('#career-phone-title').innerText(),'Финансы · Семья');
    await panel.locator('.career-phone-app-tab[data-app="work"]').tap();
    assert.ok(await panel.locator('.career-phone-hero').isVisible());
   }else{
    assert.ok(await panel.locator('.career-phone-hero').isVisible());
    assert.match(await panel.locator('.career-phone-hero').innerText(),/Требуется решение/);
    assert.equal(await panel.locator('.career-incident-open').count(),1);
    assert.equal(await panel.locator('.career-incident-other').count(),1);
    await panel.locator('.career-phone-app-tab[data-app="finance"]').tap();
    await panel.locator('.career-incident-other').tap();
    assert.equal(await page.locator('#pick-mira').getAttribute('aria-pressed'),'true');
    assert.equal(await page.evaluate(()=>document.activeElement?.id),
      'career-pending-incident-title');
    await panel.locator('.career-incident-later').tap();
    assert.equal(await panel.isVisible(),false);
    await page.reload({waitUntil:'domcontentloaded'});
    await page.locator('#loading').waitFor({state:'hidden',timeout:65000});
    assert.equal(await page.locator('#career-incident-badge').innerText(),'2');
    await page.locator('#career-phone-toggle').tap();
    await panel.locator('.career-phone-shortcut[data-target="map"]').tap();
    assert.ok(await panel.locator('#career-map-title').isVisible());
   }
   await page.screenshot({path:'ux06-artifacts/'+scenario+'-'+width+'x'+height+'.png'});
   const current=JSON.parse(await page.evaluate(k=>localStorage.getItem(k),SAVE_KEY));
   assert.equal(current.version,1);
   assert.equal(current.careerSystem.byResident.alex?.currentShift?.incident?.choiceId??null,null);
   assert.equal(current.careerSystem.byResident.mira?.currentShift?.incident?.choiceId??null,null);
   assert.deepEqual(errors,[]);
   await context.close();
  }
 }
}finally{await browser.close();}
